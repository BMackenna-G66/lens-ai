
import React from 'react';

interface LoadingSpinnerProps {
  mini?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ mini = false }) => {
  const sizeClasses = mini ? "w-5 h-5 border-2" : "w-8 h-8 border-4";
  return (
    <div className={`${sizeClasses} border-primary-500 border-t-transparent rounded-full animate-spin`} role="status">
      <span className="sr-only">Cargando...</span>
    </div>
  );
};
