
import React from 'react';
import { IconInfoCircle, IconXCircleSolid, IconAlertTriangleSolid } from './IconComponents';

interface AlertProps {
  type: 'info' | 'error' | 'warning';
  message: string;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ type, message, onClose }) => {
  let bgColor, textColor, borderColor, Icon, closeBtnHoverBg;

  switch (type) {
    case 'info':
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-800';
      borderColor = 'border-blue-500';
      Icon = IconInfoCircle;
      closeBtnHoverBg = 'hover:bg-blue-200';
      break;
    case 'error':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      borderColor = 'border-red-500';
      Icon = IconXCircleSolid;
      closeBtnHoverBg = 'hover:bg-red-200';
      break;
    case 'warning':
      bgColor = 'bg-yellow-100';
      textColor = 'text-yellow-800';
      borderColor = 'border-yellow-500';
      Icon = IconAlertTriangleSolid;
      closeBtnHoverBg = 'hover:bg-yellow-200';
      break;
    default:
      bgColor = 'bg-gray-100';
      textColor = 'text-gray-800';
      borderColor = 'border-gray-500';
      Icon = IconInfoCircle;
      closeBtnHoverBg = 'hover:bg-gray-200';
  }

  return (
    <div className={`p-4 mb-4 border-l-4 ${borderColor} ${bgColor} ${textColor} rounded-r-lg shadow-md`} role="alert">
      <div className="flex items-center">
        <Icon className="w-6 h-6 mr-3 flex-shrink-0" />
        <p className="flex-grow">{message}</p>
        {onClose && (
          <button
            onClick={onClose}
            className={`ml-4 -mx-1.5 -my-1.5 ${bgColor} ${textColor} rounded-lg focus:ring-2 focus:ring-gray-400 p-1.5 ${closeBtnHoverBg} inline-flex h-8 w-8`}
            aria-label="Cerrar"
          >
            <span className="sr-only">Cerrar</span>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              ></path>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};