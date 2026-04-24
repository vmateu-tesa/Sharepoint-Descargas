import React, { useState, useEffect } from 'react';
import { Play, Search, ArrowLeft } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import ProgressBar from './ProgressBar';
import FolderTree from './FolderTree';
import FileTable from './FileTable';

const JobDetail = ({ jobId, onBack }) => {
  const api = useApi();
  const [data, setData] = useState({ job: null, folders: [], files: [], stats: {} });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [progRes, treeRes] = await Promise.all([
        api.getProgress(jobId),
        api.getTree(jobId)
      ]);
      setData({
        job: progRes.data.job,
        stats: progRes.data.stats,
        folders: treeRes.data.folders,
        files: treeRes.data.files
      });
      setLoading(false);
    } catch (e) {
      console.error('Error fetching job details', e);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  const handleScan = async () => {
    await api.scanJob(jobId);
    fetchData();
  };

  const handleStart = async () => {
    await api.startJob(jobId);
    fetchData();
  };

  const handleToggleFolder = async (folderUrl, selected) => {
    await api.selectFolder(jobId, folderUrl, selected);
    // Optimistic or immediate update
    const treeRes = await api.getTree(jobId);
    setData(prev => ({ ...prev, folders: treeRes.data.folders, files: treeRes.data.files }));
  };

  if (loading && !data.job) {
    return <div className="flex-1 flex items-center justify-center">Loading job details...</div>;
  }

  const { job, folders, files, stats } = data;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b p-4 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <button onClick={onBack} className="text-gray-400 hover:text-black transition-colors">
              <ArrowLeft size={20} />
            </button>
            Job #{jobId}
          </h1>
          <p className="text-xs font-semibold text-gray-500 mt-1 uppercase tracking-wider">{job?.status}</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleScan} 
            disabled={job?.status === 'SCANNING'} 
            className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded text-gray-700 font-medium transition-colors disabled:opacity-50"
          >
            <Search size={16} /> Scan
          </button>
          <button 
            onClick={handleStart} 
            disabled={job?.status === 'DOWNLOADING' || job?.status === 'SCANNING'} 
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors disabled:opacity-50"
          >
            <Play size={16} /> Download
          </button>
        </div>
      </header>

      <ProgressBar 
        current={stats.SUCCESS || 0} 
        total={(stats.SUCCESS || 0) + (stats.PENDING || 0) + (stats.SELECTED || 0) + (stats.RUNNING || 0) + (stats.FAILED || 0)} 
        label="Download Progress"
      />

      <div className="flex flex-1 overflow-hidden">
        <FolderTree folders={folders} onToggleSelection={handleToggleFolder} />
        <FileTable files={files} />
      </div>
    </div>
  );
};

export default JobDetail;
