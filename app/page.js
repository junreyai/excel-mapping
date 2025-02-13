'use client';

import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import Image from 'next/image';
import toast from 'react-hot-toast';
import Header from './components/Header';
import MappingInterface from './components/MappingInterface';
import Footer from './components/Footer';
import FileDropzone from './components/FileDropzone';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [templateFile, setTemplateFile] = useState(null);
  const [workbookData, setWorkbookData] = useState(null);
  const [templateData, setTemplateData] = useState([]);
  const [showMapping, setShowMapping] = useState(false);
  const [mappings, setMappings] = useState({});
  const [generatedTemplate, setGeneratedTemplate] = useState(null);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const handleFileSelect = useCallback((files) => {
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        setSelectedFile({ name: file.name, data });
        setShowMapping(false);
        setWorkbookData(null);
        setMappings({});
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const handleTemplateSelect = useCallback((files) => {
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          const sheets = workbook.SheetNames.map(name => {
            const sheet = workbook.Sheets[name];
            const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
            
            return {
              name,
              headers: headerRow.map(header => ({ field: header?.toString() || '' }))
                .filter(header => header.field.trim() !== '')
            };
          }).filter(sheet => sheet.headers.length > 0);

          if (sheets.length === 0) {
            toast.error('No valid headers found in template');
            return;
          }

          setTemplateFile({ name: file.name, data });
          setTemplateData(sheets);
          toast.success('Template loaded successfully');
        } catch (error) {
          console.error('Error reading template:', error);
          toast.error('Error reading template file');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (!selectedFile || !templateFile) return;

    try {
      // Read the source file data
      const sourceWorkbook = XLSX.read(selectedFile.data, { type: 'array' });
      
      // Process all sheets
      const processedSheets = sourceWorkbook.SheetNames.map(sheetName => {
        const sourceSheet = sourceWorkbook.Sheets[sheetName];
        const sourceData = XLSX.utils.sheet_to_json(sourceSheet, { header: 1 });
        
        if (sourceData.length === 0) {
          return null;
        }

        // Get headers from first row
        const headers = sourceData[0].map(header => header?.toString() || '').filter(Boolean);
        
        return {
          name: sheetName,
          headers: headers,
          data: sourceData.slice(1)
        };
      }).filter(sheet => sheet !== null && sheet.headers.length > 0);
      
      if (processedSheets.length === 0) {
        toast.error('No valid data found in source file');
        return;
      }

      setWorkbookData({
        sheets: processedSheets
      });
      
      setShowMapping(true);
      toast.success('Files processed successfully.');
    } catch (error) {
      console.error('Processing error:', error);
      toast.error('Error processing files. Please try again.');
    }
  }, [selectedFile, templateFile]);

  const handleGenerateTemplate = useCallback(async () => {
    if (!selectedFile || !templateFile || !workbookData) {
      toast.error('Please upload both source and template files');
      return;
    }

    try {
      // Read template file
      const templateWorkbook = XLSX.read(templateFile.data, { type: 'array' });
      const sourceWorkbook = XLSX.read(selectedFile.data, { type: 'array' });

      // Create a map of source data by sheet name for quick lookup
      const sourceDataBySheet = {};
      workbookData.sheets.forEach(sheet => {
        sourceDataBySheet[sheet.name] = {
          headers: sheet.headers,
          data: sheet.data
        };
      });

      // Create new workbook for mapped data
      const newWorkbook = XLSX.utils.book_new();

      // Process each template sheet
      templateData.forEach(templateSheet => {
        // Create a new sheet
        const newSheet = XLSX.utils.aoa_to_sheet([[]]);

        // Get template headers for this sheet
        const templateHeaders = templateSheet.headers.map(header => 
          `${templateSheet.name}|${header.field}`
        );
        const headerRow = templateHeaders.map(header => header.split('|')[1]);
        XLSX.utils.sheet_add_aoa(newSheet, [headerRow], { origin: 0 });

        // Create a set of unique source sheets used in mappings for this template sheet
        const usedSourceSheets = new Set();
        templateHeaders.forEach(templateField => {
          const sourceField = mappings[templateField];
          if (sourceField) {
            const [sourceSheet] = sourceField.split('|');
            usedSourceSheets.add(sourceSheet);
          }
        });

        // Get the first source sheet that has mappings, or use first available if none
        const primarySourceSheet = usedSourceSheets.size > 0 
          ? Array.from(usedSourceSheets)[0]
          : workbookData.sheets[0].name;

        // Use the data from primary source sheet for row count
        const sourceSheetData = sourceDataBySheet[primarySourceSheet];
        if (!sourceSheetData) {
          console.error(`Source sheet ${primarySourceSheet} not found`);
          return;
        }

        // Map data according to mappings, using empty string for unmapped fields
        const mappedData = sourceSheetData.data.map(row => {
          return templateHeaders.map(templateField => {
            const sourceField = mappings[templateField];
            if (!sourceField) return ''; // Return empty string for unmapped fields

            const [sourceSheet, sourceHeader] = sourceField.split('|');
            const sourceSheetData = sourceDataBySheet[sourceSheet];
            if (!sourceSheetData) return '';

            const sourceIndex = sourceSheetData.headers.indexOf(sourceHeader);
            if (sourceIndex === -1) return '';

            // If mapping is from a different sheet, find matching row by index
            const rowIndex = sourceSheet === primarySourceSheet 
              ? sourceSheetData.data.indexOf(row)
              : sourceSheetData.data.length > sourceSheetData.data.indexOf(row)
                ? sourceSheetData.data.indexOf(row)
                : -1;

            return rowIndex >= 0 && rowIndex < sourceSheetData.data.length 
              ? sourceSheetData.data[rowIndex][sourceIndex] 
              : '';
          });
        });

        // Add mapped data to sheet
        XLSX.utils.sheet_add_aoa(newSheet, mappedData, { origin: 'A2' });
        
        // Add the sheet to workbook with original template sheet name
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, templateSheet.name);
      });

      // Generate Excel file
      const excelBuffer = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      setGeneratedTemplate(blob);
      toast.success('Template generated successfully!');
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Error generating template. Please try again.');
    }
  }, [selectedFile, templateFile, workbookData, mappings, templateData]);

  const handleFilesUpload = useCallback((newFiles) => {
    setUploadedFiles(newFiles);
  }, []);

  const handleRemoveFile = (indexToRemove) => {
    setUploadedFiles(files => files.filter((_, index) => index !== indexToRemove));
    if (selectedFile && uploadedFiles[indexToRemove]?.name === selectedFile.name) {
      setSelectedFile(null);
      setShowMapping(false);
      setWorkbookData(null);
    }
  };

  const handleSelectFile = (file) => {
    setSelectedFile(file === selectedFile ? null : file);
    setShowMapping(false);
    setWorkbookData(null);
  };

  const handleMappingChange = useCallback((newMappings) => {
    setMappings(newMappings);
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    if (!generatedTemplate) return;

    try {
      const url = window.URL.createObjectURL(generatedTemplate);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename
      const baseFileName = selectedFile 
        ? selectedFile.name.split('.').slice(0, -1).join('.')
        : 'template';
      const fileName = `${baseFileName}_mapped.xlsx`;
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 0);

      // Reset only the generated template to show generate button again
      setGeneratedTemplate(null);
      toast.success('Template downloaded successfully!');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Error downloading template. Please try again.');
    }
  }, [generatedTemplate, selectedFile]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setWorkbookData(null);
    setTemplateFile(null);
    setTemplateData(null);
    setGeneratedTemplate(null);
    setShowMapping(false);
    setMappings({});
    setUploadedFiles([]); // Clear the uploaded files
    localStorage.removeItem('uploadedFiles'); // Remove files from localStorage
    toast.success('All data has been reset successfully');
  }, []);

  const { getRootProps: getTemplateRootProps, getInputProps: getTemplateInputProps, isDragActive: isTemplateDragActive } = useDropzone({
    onDrop: handleTemplateSelect,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    maxFiles: 1,
    multiple: false
  });

  return (
    <>
      <Header/>
      <main className="flex-1 p-8">
        <div className="grid grid-cols-[400px,1fr] gap-8 h-[calc(100vh-200px)]">
          {/* Left Panel - Files */}
          <div className="bg-white rounded-lg shadow-lg p-6 overflow-auto">
            <h2 className="text-2xl font-semibold mb-6 text-gray-800">Files</h2>
            
            {/* Source Files Section */}
            <div>
              <h3 className="text-lg font-medium mb-4 text-gray-700">Source Files</h3>
              <FileDropzone 
                onFilesUpload={handleFilesUpload}
                existingFiles={uploadedFiles}
              />
              
              {/* File List */}
              {uploadedFiles.length > 0 && (
                <div className="border rounded-lg divide-y divide-gray-200">
                  {uploadedFiles.map((file, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center gap-4 p-4 hover:bg-gray-100 cursor-pointer transition-colors group ${
                        selectedFile === file ? 'bg-blue-100' : ''
                      }`}
                      onClick={() => handleSelectFile(file)}
                    >
                      <span className="flex-1 truncate text-gray-800">{file.name}</span>
                      <button 
                        className="p-2 transition-opacity opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(index);
                        }}
                        title="Remove file"
                      >
                        <Image 
                          src="/close.png"
                          alt="Remove file"
                          width={20}
                          height={20}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Process Button */}
              {uploadedFiles.length > 0 && (
                <div className="flex justify-center mt-6">
                  <button 
                    className={`px-6 py-3 rounded-lg transition-colors ${
                      !templateFile
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : selectedFile && templateFile
                          ? 'bg-[#64afec] hover:bg-[#5193c7] text-white' 
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    onClick={handleProcess}
                    disabled={!selectedFile || !templateFile}
                  >
                    {!templateFile 
                      ? 'Missing Template File' 
                      : !selectedFile 
                        ? 'Select Source File'
                        : 'Process File'
                    }
                  </button>
                </div>
              )}
            </div>

            {/* Template Section */}
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-4 text-gray-700">Template Files</h3>
              {templateFile ? (
                <div className="w-full border rounded-lg p-4 bg-gray-50 group hover:bg-gray-100 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Image
                        src="/check.png"
                        alt="Checked file"
                        width={18}
                        height={18}
                      />
                      <span className="text-sm text-gray-600">{templateFile.name}</span>
                    </div>
                    <button
                      onClick={() => {
                        setTemplateFile(null);
                        setTemplateData(null);
                        setGeneratedTemplate(null);
                        setShowMapping(false);
                        setMappings({});
                        toast.success('Template file removed');
                      }}
                      className="p-2 transition-opacity opacity-0 group-hover:opacity-100"
                      title="Remove template"
                    >
                      <Image 
                        src="/close.png"
                        alt="Remove template file"
                        width={20}
                        height={20}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  {...getTemplateRootProps()}
                  className={`w-full border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-300 group
                    ${isTemplateDragActive ? 'border-[#64afec] bg-blue-100' : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'}`}
                >
                  <input {...getTemplateInputProps()} />
                  <div className="space-y-2">
                    <div className="mx-auto text-center text-gray-400 text-2xl mb-2">📄</div>
                    <p className="text-sm text-gray-500">
                      {isTemplateDragActive ? "Drop the template here..." : "Drag and drop template file, or click to select"}
                    </p>
                  </div>
                  {templateFile && (
                    <div className="mt-4 border-t pt-4">
                      <div className="flex items-center justify-between group">
                        <div className="flex items-center space-x-3">
                          <Image
                            src="/check.png"
                            alt="Checked file"
                            width={18}
                            height={18}
                          />
                          <span className="text-gray-800">{templateFile.name}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setTemplateFile(null);
                            setTemplateData(null);
                            setGeneratedTemplate(null);
                            setShowMapping(false);
                            setMappings({});
                            toast.success('Template file removed');
                          }}
                          className="p-2 transition-opacity opacity-0 group-hover:opacity-100"
                          title="Remove template"
                        >
                          <Image 
                            src="/close.png"
                            alt="Remove template file"
                            width={20}
                            height={20}
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Template Actions */}
              <div>
                {!generatedTemplate ? (
                  showMapping && (
                    <div className="flex justify-center mt-6">
                      <button
                        onClick={handleGenerateTemplate}
                        disabled={!selectedFile || Object.keys(mappings).length === 0}
                        className={`px-6 py-3 rounded-lg transition-colors ${
                          selectedFile && Object.keys(mappings).length > 0
                            ? 'bg-[#64afec] hover:bg-[#5193c7] text-white' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        Generate Template
                      </button>
                    </div>
                  )
                ) : (
                  <div className="p-4 bg-green-50 rounded-lg mt-6">
                    <div className="flex flex-col space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-700">Click the ICON to download.</span>
                        <button
                          onClick={handleDownloadTemplate}
                          className="px-4 py-2 transition-colors text-sm hover:bg-green-100 rounded-lg"
                          title="Download template"
                        >
                          <Image 
                            src="/download.png"
                            alt="Download template"
                            width={20}
                            height={20}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Mapping */}
          <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col h-full">
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
              <h2 className="text-2xl font-semibold text-gray-800">Mapping</h2>
              {showMapping && (
                <button
                  onClick={handleReset}
                  className="px-4 py-2 transition-colors text-sm flex items-center gap-2 hover:bg-blue-300 hover:text-white rounded-md"
                >
                  <Image 
                    src="/reset.png"
                    alt="Reset"
                    width={20}
                    height={20}
                  />
                  Reset
                </button>
              )}
            </div>
          
            {showMapping && workbookData ? (
              <div className="flex flex-col flex-grow min-h-0">
                <div className="mb-4 p-4 bg-blue-100 text-[#64afec] rounded-md flex-shrink-0">
                  {selectedFile?.name}
                </div>
                <div className="flex-grow overflow-hidden">
                  <MappingInterface 
                    workbookData={workbookData} 
                    templateData={templateData}
                    onGenerateTemplate={handleMappingChange}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-lg text-gray-500">
                {selectedFile 
                  ? "Click Process to start mapping" 
                  : "Select a file to process"}
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer/>
    </>
  );
}
