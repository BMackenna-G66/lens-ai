
import React, { useState, useCallback } from 'react';
import { IconUpload } from './IconComponents';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  analysisMode: 'single' | 'consolidated'; // New prop
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFilesSelected, disabled, analysisMode }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        e.dataTransfer.dropEffect = 'copy';
    } else {
        e.dataTransfer.dropEffect = 'none';
    }
  }, [disabled]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      let filesArray = Array.from(e.dataTransfer.files);
      
      if (analysisMode === 'single' && filesArray.length > 1) {
        console.warn("Modo individual: Se arrastraron múltiples archivos, solo se procesará el primero.");
        filesArray = [filesArray[0]];
      }

      const acceptedFiles = filesArray.filter(file => 
        file.type === "application/pdf" || 
        file.type === "text/plain" ||
        file.type === "image/png" 
      );

      if (acceptedFiles.length !== filesArray.length) {
        // This message might appear if the single selected file (after potentially filtering down to 1) is not accepted.
        // Or if in consolidated mode, some of the multiple files are not accepted.
        console.warn("Algunos archivos fueron omitidos debido a su tipo no soportado o porque se excedió el límite para el modo individual.");
      }
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles);
      }
      e.dataTransfer.clearData();
    }
  }, [onFilesSelected, disabled, analysisMode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      let filesArray = Array.from(e.target.files);

      // Note: If input `multiple` is false, `e.target.files` should only contain one file.
      // This check is more a safeguard.
      if (analysisMode === 'single' && filesArray.length > 1) {
         console.warn("Modo individual: Múltiples archivos seleccionados a través del diálogo (inesperado si 'multiple' es false), solo se procesará el primero.");
         filesArray = [filesArray[0]];
      }

      const acceptedFiles = filesArray.filter(file => 
        file.type === "application/pdf" || 
        file.type === "text/plain" ||
        file.type === "image/png"
      );

       if (acceptedFiles.length !== filesArray.length) {
        console.warn("Algunos archivos fueron omitidos debido a su tipo no soportado.");
      }
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles);
      }
      e.target.value = ''; // Reset input
    }
  };

  const baseClasses = "border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center transition-colors duration-200 ease-in-out cursor-pointer";
  const activeClasses = isDragging ? "border-primary-500 bg-indigo-50" : "border-slate-300 hover:border-primary-400";
  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed" : "";
  
  const instructionTextStart = analysisMode === 'single'
    ? "Arrastra y suelta un archivo aquí, o "
    : "Arrastra y suelta los archivos relacionados aquí, o ";
  const instructionTextLink = "haz clic para seleccionar";
  
  const supportedFilesText = "PDF, DOC, DOCX, TXT. (Max. 10MB)";

  return (
    <div 
      className={`${baseClasses} ${activeClasses} ${disabledClasses}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => !disabled && document.getElementById('fileInput')?.click()}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Área de carga de archivos. ${instructionTextStart} ${instructionTextLink}`}
    >
      <input
        id="fileInput"
        type="file"
        multiple={analysisMode === 'consolidated'} // Dynamically set multiple attribute
        accept=".pdf,.txt,.png,.doc,.docx"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      <IconUpload className={`w-12 h-12 mb-4 text-primary-500`} />
      <p className={`text-lg font-medium ${isDragging ? 'text-primary-600' : 'text-slate-500'}`}>
        {instructionTextStart}
        <span className="text-primary-500 font-semibold">{instructionTextLink}</span>
      </p>
      <p className="text-sm text-slate-400 mt-1">{supportedFilesText}</p>
      {disabled && <p className="text-xs text-amber-500 mt-2">La carga está deshabilitada mientras se procesa un archivo/análisis o falta la API Key.</p>}
    </div>
  );
};