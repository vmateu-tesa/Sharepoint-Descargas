import React, { useState } from 'react';
import { FolderTree, Search } from 'lucide-react';

const JobList = ({ jobs, onSelectJob, onCreateJob }) => {
  const [showModal, setShowModal] = useState(false);
  const [targetPath, setTargetPath] = useState('C:\\sharepoint-mirror');
  const [siteUrl, setSiteUrl] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreateJob({ target_path: targetPath, url: siteUrl || undefined });
    setShowModal(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto relative">
      <h1 className="text-3xl font-bold mb-6">SharePoint Mirror Manager</h1>
      <button 
        onClick={() => setShowModal(true)} 
        className="bg-blue-600 text-white px-4 py-2 rounded mb-6 flex items-center gap-2 hover:bg-blue-700 transition-colors"
      >
        <FolderTree size={20} /> Create New Mirror Job
      </button>
      
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
            <h2 className="text-xl font-bold mb-4">Create New Job</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Local Target Path</label>
                <input 
                  required 
                  type="text" 
                  value={targetPath} 
                  onChange={e => setTargetPath(e.target.value)} 
                  className="w-full border rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">SharePoint URL (Optional)</label>
                <input 
                  type="text" 
                  value={siteUrl} 
                  onChange={e => setSiteUrl(e.target.value)} 
                  placeholder="Leave blank to auto-detect active tab" 
                  className="w-full border rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <div className="flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)} 
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4">ID</th>
              <th className="p-4">Site</th>
              <th className="p-4">Status</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-mono text-sm text-gray-500">#{job.id}</td>
                <td className="p-4 truncate max-w-xs" title={job.site_url}>{job.site_url}</td>
                <td className="p-4">
                  <span className="px-2 py-1 bg-gray-100 rounded text-xs font-semibold text-gray-600 uppercase">
                    {job.status}
                  </span>
                </td>
                <td className="p-4">
                  <button 
                    onClick={() => onSelectJob(job)} 
                    className="text-blue-600 hover:underline font-medium"
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan="4" className="p-8 text-center text-gray-400">No jobs found. Create one to get started!</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default JobList;
