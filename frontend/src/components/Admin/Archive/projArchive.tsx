import React, { useState, useEffect } from 'react';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';

interface ArchivedProject {
  projectID: number;
  reference_number: string;
  title: string;
  submittedDate: string;
  submittedBy: string;
}

const ProjArchive: React.FC = () => {
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchArchivedProjects();
  }, []);

  const fetchArchivedProjects = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/api/admin/archive/projects');
      if (response.data.success) {
        setArchivedProjects(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to fetch archived projects');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (projectId: number) => {
    if (!window.confirm('Are you sure you want to restore this project?')) {
      return;
    }

    try {
      const response = await axiosInstance.post(`/api/admin/archive/projects/restore/${projectId}`);
      if (response.data.success) {
        toast.success('Project restored successfully!');
        setArchivedProjects(prev => prev.filter(p => p.projectID !== projectId));
      } else {
        throw new Error(response.data.message || 'Failed to restore project');
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred during restoration.');
    }
  };

  if (loading) {
    return <p className="loading-message">Loading archived projects...</p>;
  }

  if (error) {
    return <p className="error-message">{error}</p>;
  }

  return (
    <div>
      <h3>Archived Projects</h3>
      {archivedProjects.length === 0 ? (
        <p>No archived projects found.</p>
      ) : (
        <table className="archive-table">
          <thead>
            <tr>
              <th>Reference Number</th>
              <th>Title</th>
              <th>Submitted By</th>
              <th>Submitted Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {archivedProjects.map(proj => (
              <tr key={proj.projectID}>
                <td>{proj.reference_number}</td>
                <td>{proj.title}</td>
                <td>{proj.submittedBy}</td>
                <td>{new Date(proj.submittedDate).toLocaleDateString()}</td>
                <td>
                  <button 
                    className="restore-btn" 
                    onClick={() => handleRestore(proj.projectID)}
                  >
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ProjArchive;
