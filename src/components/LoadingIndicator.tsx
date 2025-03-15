import React from 'react';

interface LoadingIndicatorProps {
  progress: number;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ progress }) => {
  return (
    <div className="w-full">
      <div className="w-full h-2 bg-gray-200 rounded-full">
        <div 
          className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-in-out" 
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      <div className="text-xs text-gray-500 mt-1 text-right">
        {Math.round(progress)}%
      </div>
    </div>
  );
};