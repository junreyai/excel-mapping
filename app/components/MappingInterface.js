'use client';

import { useState, useEffect } from 'react';

export default function MappingInterface({ workbookData, templateData = [], onGenerateTemplate }) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [mappings, setMappings] = useState({});

  useEffect(() => {
    if (templateData && templateData.length > 0) {
      onGenerateTemplate(mappings);
    }
  }, [mappings, onGenerateTemplate, templateData]);

  const handleMapping = (templateField, value) => {
    if (!templateData || !templateData[activeSheet]) return;

    const templateSheetName = templateData[activeSheet].name;
    const templateKey = `${templateSheetName}|${templateField}`;

    if (!value) {
      const newMappings = { ...mappings };
      delete newMappings[templateKey];
      setMappings(newMappings);
    } else {
      setMappings(prev => ({
        ...prev,
        [templateKey]: value
      }));
    }
  };

  const getSelectedSourceFields = () => {
    const selectedFields = new Set();
    Object.values(mappings).forEach(value => {
      if (value) {
        selectedFields.add(value);
      }
    });
    return selectedFields;
  };

  if (!templateData || templateData.length === 0) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 rounded-lg overflow-hidden">
      {/* Sheet Tabs Section */}
      <div className="flex-shrink-0 bg-gray-50 border-b border-gray-200">
        <div className="max-w-full">
          <nav className="flex overflow-x-auto whitespace-nowrap py-2 px-6 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent no-scrollbar">
            <div className="inline-flex min-w-0">
              {templateData.map((sheet, index) => (
                <button
                  key={sheet.name}
                  onClick={() => setActiveSheet(index)}
                  className={`py-2 px-4 text-sm font-medium transition-colors duration-300 rounded-t-lg mr-2 flex-shrink-0 ${
                    activeSheet === index
                      ? 'bg-[#64afec] text-white'
                      : 'text-gray-600 hover:bg-[#64afec] hover:bg-opacity-10 hover:text-[#64afec]'
                  }`}
                >
                  <span className="truncate block max-w-[150px]">
                    {sheet.name || `Tab ${index + 1}`}
                  </span>
                </button>
              ))}
            </div>
          </nav>
        </div>
      </div>

      {/* Mapping Content */}
      <div className="flex-grow overflow-auto">
        <div className="sticky top-0 bg-gray-50 z-10 px-6 py-4 border-b border-gray-200 w-full">
          <div className="grid grid-cols-2 gap-8 min-w-0 max-w-full">
            <h3 className="text-lg font-medium text-gray-700 truncate">Template Field</h3>
            <h3 className="text-lg font-medium text-gray-700 truncate">Source Field</h3>
          </div>
        </div>

        <div className="px-6 py-4 w-full">
          <div className="space-y-4 min-w-0 max-w-full">
            {templateData[activeSheet]?.headers?.map((header, index) => {
              const currentMapping = mappings[`${templateData[activeSheet].name}|${header.field}`];
              const selectedFields = getSelectedSourceFields();

              return (
                <div key={index} className="grid grid-cols-2 gap-8 items-center min-w-0 w-full">
                  <div className="text-sm text-gray-800 truncate pr-2 min-w-0" title={header.field}>
                    {header.field}
                  </div>
                  <div className="relative min-w-0">
                    <select
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white truncate"
                      value={currentMapping || ''}
                      onChange={(e) => {
                        handleMapping(header.field, e.target.value);
                      }}
                    >
                      <option value="">Select source field</option>
                      {workbookData?.sheets.map((sheet) => {
                        const availableFields = sheet.headers.filter(sourceHeader => {
                          const sourceKey = `${sheet.name}|${sourceHeader}`;
                          return !selectedFields.has(sourceKey) || sourceKey === currentMapping;
                        });

                        if (availableFields.length === 0) return null;

                        return (
                          <optgroup key={sheet.name} label={sheet.name}>
                            {availableFields.map((sourceHeader, idx) => (
                              <option 
                                key={`${sheet.name}-${idx}`} 
                                value={`${sheet.name}|${sourceHeader}`}
                                className="truncate"
                              >
                                {sourceHeader}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}