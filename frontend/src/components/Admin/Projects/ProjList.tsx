import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import { AxiosError } from 'axios';
import { FaEye, FaDownload, FaSpinner } from 'react-icons/fa';

interface Project {
  projectID: number;
  referenceNumber: string;
  proposerName: string;
  title: string;
  status: string;
  submittedDate: string;
  reviewedBy: string | null;
  remarks: string | null;
  fileName: string;
}

const ProjList: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fileLoading, setFileLoading] = useState<number | null>(null);
  const navigate = useNavigate();

  const [showFileViewer, setShowFileViewer] = useState<boolean>(false);
  const [viewingFileUrl, setViewingFileUrl] = useState<string>('');
  const [viewingFileName, setViewingFileName] = useState<string>('');

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

  const handleViewPdf = async (project: Project) => {
    if (!project.fileName) {
        toast.error('No file associated with this project.');
        return;
    }

    setFileLoading(project.projectID);
    try {
        const response = await axiosInstance.get(`/api/admin/projects/file-url/${project.projectID}`);
        if (response.data.success && response.data.url) {
            setViewingFileUrl(response.data.url);
            setViewingFileName(project.fileName);
            setShowFileViewer(true);
        } else {
            throw new Error(response.data.message || 'Could not retrieve file URL.');
        }
    } catch (error) {
        console.error("Error getting file URL:", error);
        toast.error("Could not retrieve the file. Please try again.");
    } finally {
        setFileLoading(null);
    }
  };

  const handleDownloadFile = async (project: Project) => {
    if (!project.fileName) {
        toast.error('No file associated with this project.');
        return;
    }

    setFileLoading(project.projectID);
    try {
        const response = await axiosInstance.get(`/api/admin/projects/file-url/${project.projectID}`);
        if (response.data.success && response.data.url) {
            const link = document.createElement('a');
            link.href = response.data.url;
            link.setAttribute('download', project.fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } else {
            throw new Error(response.data.message || 'Could not retrieve file URL.');
        }
    } catch (error) {
        console.error("Error getting file URL:", error);
        toast.error("Could not retrieve the file. Please try again.");
    } finally {
        setFileLoading(null);
    }
  };

  const handleCloseFileViewer = () => {
    setShowFileViewer(false);
    setViewingFileUrl('');
    setViewingFileName('');
  };

  const getStatusClassName = (status: string) => {
    if (!status) return 'status-default';
    return 'status-' + status.toLowerCase().replace(/[^a-z0-9]/g, '-');
  };

  if (loading) {
    return <div className="loading">Loading projects...</div>;
  }

  return (
    <>
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
                  <td>{proj.referenceNumber}</td>
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
                      {fileLoading === proj.projectID ? (
                        <FaSpinner className="animate-spin" />
                      ) : (
                        proj.fileName && (
                          proj.fileName.toLowerCase().endsWith('.pdf') ? (
                            <button onClick={() => handleViewPdf(proj)} className="action-btn" title="View PDF">
                              <FaEye />
                            </button>
                          ) : (
                            <button onClick={() => handleDownloadFile(proj)} className="action-btn" title="Download Document">
                              <FaDownload />
                            </button>
                          )
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showFileViewer && (
        <div className="modal-overlay">
            <div className="file-viewer-modal">
                <div className="file-viewer-header">
                    <h3 className="file-viewer-title">{viewingFileName}</h3>
                    <button className="file-viewer-close" onClick={handleCloseFileViewer}>×</button>
                </div>
                <div className="file-viewer-content">
                    <iframe className="file-viewer-iframe" src={viewingFileUrl} title="File Viewer" allowFullScreen></iframe>
                </div>
            </div>
        </div>
      )}
    </>
  );
};

export default ProjList;
