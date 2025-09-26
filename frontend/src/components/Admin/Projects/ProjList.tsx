import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import { AxiosError } from 'axios';
import { FaRegFilePdf, FaRegFileWord } from 'react-icons/fa';

interface Project {
  projectID: number;
  reference_number: string;
  proposerName: string;
  title: string;
  status: string;
  submittedDate: string;
  reviewedBy: string | null;
  remarks: string | null;
  file_name: string;
}

const ProjList: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProjects = async () => {
      setLoading(true);
      try {
        const response = await axiosInstance.get('/api/admin/projects');
        if (response.data.success) {
          setProjects(response.data.projects);
        } else {
          throw new Error(response.data.message || 'Failed to fetch projects');
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 401) {
          toast.error('Your session has expired. Please log in again.');
          navigate('/login', { replace: true });
          return;
        }
        if (axiosError.response?.status === 403) {
          toast.error('You are not authorized to view this page.');
          navigate('/unauthorized', { replace: true });
          return;
        }
        toast.error((axiosError.response?.data as any)?.message || 'An error occurred while fetching projects.');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [navigate]);

  const handleViewFile = (project: Project) => {
    const fileUrl = `${axiosInstance.defaults.baseURL}/admin/projects/file/${project.projectID}`;
    
    axiosInstance.get(fileUrl, { responseType: 'blob' })
      .then(response => {
        const file = new Blob([response.data], { type: response.headers['content-type'] });
        const fileURL = URL.createObjectURL(file);
        window.open(fileURL, '_blank');
        // Delay revoking the object URL to ensure the file can be opened.
        setTimeout(() => URL.revokeObjectURL(fileURL), 100);
      })
      .catch(error => {
        console.error("Error downloading file:", error);
        toast.error("Could not download or open the file.");
      });
  };

  const getStatusClassName = (status: string) => {
    if (!status) return 'status-default';
    return 'status-' + status.toLowerCase().replace(/[^a-z0-9]/g, '-');
  };

  if (loading) {
    return <div className="loading">Loading projects...</div>;
  }

  return (
    <div className="projects-table-container">
      <table className="projects-table">
        <thead>
          <tr>
            <th>Reference #</th>
            <th>Proposer</th>
            <th>Title</th>
            <th>Status</th>
            <th>Submitted</th>
            <th>Reviewed By</th>
            <th>Remarks</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center' }}>No projects found for your barangay.</td>
            </tr>
          ) : (
            projects.map((proj) => (
              <tr key={proj.projectID}>
                <td>{proj.reference_number}</td>
                <td>{proj.proposerName}</td>
                <td>{proj.title}</td>
                <td>
                  <span className={`status-badge ${getStatusClassName(proj.status)}`}>
                    {proj.status}
                  </span>
                </td>
                <td>{new Date(proj.submittedDate).toLocaleDateString()}</td>
                <td>{proj.reviewedBy || 'N/A'}</td>
                <td>{proj.remarks || 'N/A'}</td>
                <td>
                  <div className="action-btn-group">
                    <button onClick={() => handleViewFile(proj)} className="action-btn">
                      {proj.file_name.toLowerCase().endsWith('.pdf') ? <FaRegFilePdf /> : <FaRegFileWord />}
                      View File
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ProjList;