import axios from 'axios';

const API_URL = 'http://localhost:3000/api';

export const useApi = () => {
  const getJobs = () => axios.get(`${API_URL}/jobs`);
  const getJob = (id) => axios.get(`${API_URL}/jobs/${id}`);
  const getProgress = (id) => axios.get(`${API_URL}/jobs/${id}/progress`);
  const getTree = (id) => axios.get(`${API_URL}/jobs/${id}/tree`);
  const createJob = (data) => axios.post(`${API_URL}/jobs`, data);
  const scanJob = (id) => axios.post(`${API_URL}/jobs/${id}/scan`);
  const startJob = (id) => axios.post(`${API_URL}/jobs/${id}/start`);
  const selectFolder = (id, folderUrl, selected) => 
    axios.post(`${API_URL}/jobs/${id}/items/select`, { folderUrl, selected });

  const clearJobs = () => axios.delete(`${API_URL}/jobs/clear`);

  return {
    getJobs,
    getJob,
    getProgress,
    getTree,
    createJob,
    scanJob,
    startJob,
    selectFolder,
    clearJobs
  };
};
