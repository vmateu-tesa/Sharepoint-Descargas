import React, { useState, useEffect } from 'react';
import { useApi } from './hooks/useApi';
import JobList from './components/JobList';
import JobDetail from './components/JobDetail';

function App() {
  const api = useApi();
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);

  const fetchJobs = async () => {
    try {
      const res = await api.getJobs();
      setJobs(res.data);
    } catch (err) {
      console.error('Error fetching jobs', err);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleCreateJob = async (jobData) => {
    try {
      const res = await api.createJob(jobData);
      await fetchJobs();
      setSelectedJobId(res.data.jobId);
    } catch (err) {
      alert('Error creating job: ' + (err.response?.data?.error || err.message));
    }
  };

  if (selectedJobId) {
    return (
      <JobDetail 
        jobId={selectedJobId} 
        onBack={() => {
          setSelectedJobId(null);
          fetchJobs();
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <JobList 
        jobs={jobs} 
        onSelectJob={(job) => setSelectedJobId(job.id)} 
        onCreateJob={handleCreateJob} 
      />
    </div>
  );
}

export default App;
