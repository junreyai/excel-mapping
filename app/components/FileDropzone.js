'use client';
import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';

export default function FileDropzone({ onFilesUpload, existingFiles }) {
  const onDrop = useCallback((acceptedFiles) => {
    // Filter out duplicates first
    const newFiles = acceptedFiles.filter(file => {
      const isDuplicate = existingFiles.some(existingFile => existingFile.name === file.name);
      if (isDuplicate) {
        toast.error(`File "${file.name}" already exists. Please rename the file or choose a different one.`, {
          id: `duplicate-${file.name}`,
        });
        return false;
      }
      return true;
    });

    // Process only non-duplicate files
    const processFiles = newFiles.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            name: file.name,
            type: file.type,
            data: reader.result,
            lastModified: file.lastModified
          });
        };
        reader.readAsArrayBuffer(file);
      });
    });

    // Update state only when all files are processed
    Promise.all(processFiles).then(fileDataArray => {
      if (fileDataArray.length > 0) {
        onFilesUpload(prev => [...prev, ...fileDataArray]);
        toast.success(`Successfully uploaded ${fileDataArray.length} file(s)`);
      }
    });
  }, [onFilesUpload, existingFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    onDrop
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-300 mb-4
        ${isDragActive ? 'border-[#64afec] bg-blue-100' : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'}`}
    >
      <input {...getInputProps()} />
      <div className="space-y-2">
        <div className="mx-auto text-center text-gray-400 text-2xl mb-2">📄</div>
        <p className="text-sm text-gray-500">
          {isDragActive ? "Drop the files here..." : "Drag and drop source file, or click to select"}
        </p>
      </div>
    </div>
  );
}
