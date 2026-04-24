import React from 'react';
import { Folder, CheckSquare, Square } from 'lucide-react';

const FolderTree = ({ folders, onToggleSelection }) => {
  return (
    <div className="w-1/3 bg-white border-r overflow-y-auto p-4">
      <h2 className="font-semibold mb-4 text-gray-700">Structure</h2>
      {folders.map(f => (
        <div 
          key={f.id} 
          className="flex items-center gap-2 py-1 hover:bg-gray-50" 
          style={{ paddingLeft: `${f.depth * 16}px` }}
        >
          <button onClick={() => onToggleSelection(f.server_relative_url, f.selected === 0)}>
            {f.selected ? (
              <CheckSquare size={16} className="text-blue-600" />
            ) : (
              <Square size={16} className="text-gray-400" />
            )}
          </button>
          <Folder size={16} className="text-yellow-500" />
          <span className="text-sm truncate" title={f.server_relative_url}>{f.name}</span>
        </div>
      ))}
    </div>
  );
};

export default FolderTree;
