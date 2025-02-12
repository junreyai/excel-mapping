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
  const [nameOption, setNameOption] = useState('source');
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
    if (!selectedFile) {
      toast.error('Please select a file to process');
      return;
    }

    if (!templateFile) {
      toast.error('Please upload a template file first');
      return;
    }

    try {
      // Convert base64/stored data to format XLSX can read
      const data = selectedFile.data;
      const workbook = XLSX.read(data, { type: 'array' });
      
      const sheets = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        // Read the first row to get headers
        const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
        
        // Convert headers to strings and filter out empty ones
        const validHeaders = headerRow
          .map(header => header?.toString() || '')
          .filter(header => header.trim() !== '');

        // Get all data including empty cells
        const jsonData = XLSX.utils.sheet_to_json(sheet, { 
          defval: '', // Set default value for empty cells
          raw: false, // Convert all values to string
          header: validHeaders // Use the processed headers
        });

        return {
          name,
          headers: validHeaders,
          data: jsonData
        };
      }).filter(sheet => sheet.headers.length > 0);

      if (sheets.length === 0) {
        toast.error('No valid data found in the file');
        return;
      }

      setWorkbookData({ sheets });
      setShowMapping(true);
      setMappings({}); // Reset mappings when processing new file
      toast.success('File processed successfully');
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Error processing file');
      setWorkbookData(null);
      setShowMapping(false);
    }
  }, [selectedFile, templateFile]);

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

  const handleGenerateTemplate = () => {
    if (!templateFile) {
      toast.error('Please upload a template file first');
      return;
    }

    console.log('Current mappings:', mappings);
    console.log('Template data:', templateData);
    console.log('Workbook data:', workbookData);

    try {
      // Create a new workbook
      const wb = XLSX.utils.book_new();
      
      // Create a map of source sheet data for quick access
      const sourceSheetData = {};
      if (workbookData?.sheets) {
        workbookData.sheets.forEach(sheet => {
          sourceSheetData[sheet.name] = sheet.data;
        });
      }

      console.log('Source sheet data:', sourceSheetData);

      // Process each template sheet
      templateData.forEach(templateSheet => {
        const templateSheetName = templateSheet.name;
        
        // Get all template fields for this sheet
        const templateFields = templateSheet.headers.map(header => header.field);
        
        // Create header row with all template fields
        const headerRow = {};
        templateFields.forEach(field => {
          headerRow[field] = field;
        });

        // Initialize mappedData with header row
        const mappedData = [headerRow];

        // If we have source data and mappings, add the mapped data
        if (Object.keys(sourceSheetData).length > 0) {
          // Create mapping lookup for this template sheet
          const sheetMappings = {};
          Object.entries(mappings).forEach(([templateField, sourceValue]) => {
            const [tSheet, tField] = templateField.split('|');
            if (tSheet === templateSheetName && sourceValue) {
              const [sSheet, sField] = sourceValue.split('|');
              sheetMappings[tField] = { sourceSheet: sSheet, sourceField: sField };
            }
          });

          // Process source data if we have mappings
          if (Object.keys(sheetMappings).length > 0) {
            // Get unique source sheets used in mappings
            const sourceSheets = new Set(Object.values(sheetMappings).map(m => m.sourceSheet));
            
            // Process each source sheet's data
            sourceSheets.forEach(sourceSheetName => {
              const sourceData = sourceSheetData[sourceSheetName];
              if (sourceData && sourceData.length > 1) { // Skip header row
                const dataRows = sourceData.slice(1).map(row => {
                  const newRow = {};
                  // Process all template fields
                  templateFields.forEach(templateField => {
                    const mapping = sheetMappings[templateField];
                    if (mapping && mapping.sourceSheet === sourceSheetName) {
                      // If field is mapped and from current source sheet, get the value
                      newRow[templateField] = row[mapping.sourceField];
                    } else {
                      // If field is not mapped or from different sheet, leave empty
                      newRow[templateField] = '';
                    }
                  });
                  return newRow;
                });
                mappedData.push(...dataRows);
              }
            });
          } else {
            // Add an empty row with all template fields
            mappedData.push(templateFields.reduce((row, field) => {
              row[field] = '';
              return row;
            }, {}));
          }
        } else {
          // Add an empty row with all template fields
          mappedData.push(templateFields.reduce((row, field) => {
            row[field] = '';
            return row;
          }, {}));
        }

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(mappedData, { skipHeader: true });
        XLSX.utils.book_append_sheet(wb, ws, templateSheetName);
        console.log(`Created sheet ${templateSheetName} with data:`, mappedData);
      });

      // Generate buffer
      const wbout = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      
      // Create blob and URL
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      
      setGeneratedTemplate({
        url,
        filename: `mapped_template_${new Date().getTime()}.xlsx`
      });

      toast.success('Template generated successfully!');
    } catch (error) {
      console.error('Error generating template:', error);
      toast.error(`Failed to generate template: ${error.message}`);
    }
  };

  const handleDownloadTemplate = () => {
    if (!generatedTemplate) return;

    // Use source file name + "_mapped" as the default naming convention
    const fileName = `${selectedFile.name.split('.').slice(0, -1).join('.')}_mapped.xlsx`;
    
    // Convert the template to a blob
    const blob = new Blob([generatedTemplate], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Create download link and trigger download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    // Reset states after download
    setGeneratedTemplate(null);
    setSelectedFile(null);
    setWorkbookData(null);
    setShowMapping(false);
    setMappings({});
    toast.success('Template downloaded successfully! Ready for new mapping.');
  };

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
                      className={`flex items-center gap-4 p-4 hover:bg-gray-100 cursor-pointer transition-colors ${
                        selectedFile === file ? 'bg-blue-100' : ''
                      }`}
                      onClick={() => handleSelectFile(file)}
                    >
                      <span className="flex-1 truncate text-gray-800">{file.name}</span>
                      <button 
                        className="p-2 transition-colors"
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
                      selectedFile && templateFile
                        ? 'bg-[#64afec] hover:bg-[#5193c7] text-white' 
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    onClick={handleProcess}
                    disabled={!selectedFile || !templateFile}
                  >
                    Process File
                  </button>
                </div>
              )}
            </div>

            {/* Template Section */}
            <div className="mt-6">
              <h3 className="text-lg font-medium mb-4 text-gray-700">Template Files</h3>
              {templateFile ? (
                <div className="w-full border rounded-lg p-4 bg-gray-50">
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
                      className="p-2 transition-colors"
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
                  className={`w-full border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-300
                    ${isTemplateDragActive ? 'border-[#64afec] bg-blue-100' : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'}`}
                >
                  <input {...getTemplateInputProps()} />
                  <div className="space-y-2">
                    <div className="mx-auto text-center text-gray-400 text-2xl mb-2">📄</div>
                    <p className="text-sm text-gray-500">
                      {isTemplateDragActive ? 
                        "Drop the template file here..." : 
                        "Drag and drop template file, or click to select"}
                    </p>
                  </div>
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
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="flex flex-col space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-green-700">Template ready!</span>
                        <button
                          onClick={handleDownloadTemplate}
                          className="px-4 py-2 transition-colors text-sm"
                        >
                          <Image 
                            src="/download.png"
                            alt="Download template"
                            width={20}
                            height={20}
                          />
                        </button>
                      </div>
                      
                      {/* File Name Options */}
                      <div className="mt-2 border-t pt-3">
                        <p className="text-sm font-medium text-gray-700 mb-2">File Name Options:</p>
                        <div className="space-y-2">
                          <label className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="nameOption"
                              value="original"
                              checked={nameOption === 'original'}
                              onChange={(e) => setNameOption(e.target.value)}
                              className="text-custom-blue focus:ring-custom-blue"
                            />
                            <span className="text-sm text-gray-600">Use original name</span>
                          </label>
                          <label className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="nameOption"
                              value="source"
                              checked={nameOption === 'source'}
                              onChange={(e) => setNameOption(e.target.value)}
                              className="text-custom-blue focus:ring-custom-blue"
                            />
                            <span className="text-sm text-gray-600">Use source file name + "_mapped"</span>
                          </label>
                        </div>
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
                  className="px-4 py-2 transition-colors text-sm flex items-center gap-2"
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
              <div className="flex items-center justify-center h-[200px] text-sm text-gray-500">
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
