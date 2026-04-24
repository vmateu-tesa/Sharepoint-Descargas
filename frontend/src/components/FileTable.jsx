import React from 'react';
import { File as FileIcon } from 'lucide-react';

const FileTable = ({ files }) => {
  const getStatusStyle = (status) => {
    switch (status) {
      case 'SUCCESS': return 'bg-green-100 text-green-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      case 'RUNNING': return 'bg-blue-100 text-blue-800';
      case 'SELECTED': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="w-2/3 bg-gray-50 overflow-y-auto p-4">
      <h2 className="font-semibold mb-4 text-gray-700">Files</h2>
      <div className="bg-white rounded shadow overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Status</th>
              <th className="p-3">Size</th>
            </tr>
          </thead>
          <tbody>
            {files.map(f => (
              <tr key={f.id} className="border-b hover:bg-gray-50">
                <td className="p-3 flex items-center gap-2">
                  <FileIcon size={16} className="text-gray-400" />
                  <span className="truncate max-w-xs" title={f.name}>{f.name}</span>
                </td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusStyle(f.status)}`}>
                    {f.status}
                  </span>
                </td>
                <td className="p-3 text-gray-500">{(f.size_bytes / 1024).toFixed(1)} KB</td>
              </tr>
            ))}
            {files.length === 0 && (
              <tr>
                <td colSpan="3" className="p-8 text-center text-gray-400">No files discovered yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FileTable;
