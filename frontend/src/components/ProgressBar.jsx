import React from 'react';

const ProgressBar = ({ current, total, label }) => {
  const percentage = total > 0 ? Math.min(((current || 0) / total) * 100, 100) : 0;

  return (
    <div className="bg-white border-b px-6 py-3">
      <div className="flex justify-between text-sm mb-1">
        <span>{label || 'Progress'}</span>
        <span>{current || 0} / {total || 0} files</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
};

export default ProgressBar;
