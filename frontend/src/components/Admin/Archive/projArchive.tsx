import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import { AxiosError } from 'axios';
import { FaEye, FaDownload, FaSpinner, FaInfoCircle } from 'react-icons/fa';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from '@mui/material';
import StatusLegend from '../../Projects/StatusLegend';

interface Project {
  projectID: number;
  reference_number: string;
  title: string;
  description: string;
  status: number;
  submittedDate: string;
  file_path: string;
  file_name: string;
  remarks: string | null;
  reviewedBy: string | null;
  submittedBy: string;
  statusName: string;
}

interface Status {
  StatusName: string;
  description: string;
}

const ProjArchive: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState<number | null>(null);
  const navigate = useNavigate();

  const [showFileViewer, setShowFileViewer] = useState<boolean>(false);
  const [viewingFileUrl, setViewingFileUrl] = useState<string>('');
  const [viewingFileName, setViewingFileName] = useState<string>('');

  const [showRestoreConfirm, setShowRestoreConfirm] = useState<boolean>(false);
  const [projectToRestore, setProjectToRestore] = useState<Project | null>(null);

  const [statusList, setStatusList] = useState<Status[]>([]);
  const [showStatusLegend, setShowStatusLegend] = useState<boolean>(false);
  const infoIconRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch archived projects
        const response = await axiosInstance.get('/api/admin/proj-archive');
        if (response.data.success) {
          setProjects(response.data.data || []);
        } else {
          throw new Error(response.data.message || 'Failed to fetch archived projects');
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 401) {
          toast.error('Your session has expired. Please log in again.');
          navigate('/home', { replace: true });
          return;
        }
        if (axiosError.response?.status === 403) {
          toast.error('You are not authorized to view this page.');
          navigate('/unauthorized', { replace: true });
          return;
        }
        const errorMessage = (axiosError.response?.data as any)?.message || 'An error occurred while fetching archived projects.';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [navigate]);

  useEffect(() => {
    const fetchStatuses = async () => {
        try {
            const response = await axiosInstance.get('/api/projects/statuses');
            if (response.data.success) {
                setStatusList(response.data.statuses);
            }
        } catch (error) {
            if (import.meta.env.DEV) console.error('Failed to fetch statuses', error);
        }
    };
    fetchStatuses();
  }, []);

  const openFileViewer = (url: string, fileName: string) => {
    setViewingFileUrl(url);
    setViewingFileName(fileName);
    setShowFileViewer(true);
  };

  const handleCloseFileViewer = () => {
    setShowFileViewer(false);
    setViewingFileUrl('');
    setViewingFileName('');
  };

  const handleViewPdf = async (project: Project) => {
    if (!project.file_name) {
        toast.error('No file associated with this project.');
        return;
    }

    setFileLoading(project.projectID);
    try {
        const response = await axiosInstance.get(`/api/admin/proj-archive/file-url/${project.projectID}`);
        if (response.data.success && response.data.url) {
            openFileViewer(response.data.url, project.file_name);
        } else {
            throw new Error(response.data.message || 'Could not retrieve file URL.');
        }
    } catch (error) {
        if (import.meta.env.DEV) console.error("Error getting file URL:", error);
        toast.error("Could not retrieve the file. Please try again.");
    } finally {
        setFileLoading(null);
    }
  };

  const handleDownloadFile = async (project: Project) => {
    if (!project.file_name) {
        toast.error('No file associated with this project.');
        return;
    }

    setFileLoading(project.projectID);
    try {
        const response = await axiosInstance.get(`/api/admin/proj-archive/file-url/${project.projectID}`);
        if (response.data.success && response.data.url) {
            const link = document.createElement('a');
            link.href = response.data.url;
            link.setAttribute('download', project.file_name);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } else {
            throw new Error(response.data.message || 'Could not retrieve file URL.');
        }
    } catch (error) {
        if (import.meta.env.DEV) console.error("Error getting file URL:", error);
        toast.error("Could not retrieve the file. Please try again.");
    } finally {
        setFileLoading(null);
    }
  };

  const handleRestore = (project: Project) => {
    setProjectToRestore(project);
    setShowRestoreConfirm(true);
  };

  const handleCancelRestore = () => {
    setProjectToRestore(null);
    setShowRestoreConfirm(false);
  };

  const handleConfirmRestore = async () => {
    if (!projectToRestore) return;

    try {
      const response = await axiosInstance.post(`/api/admin/proj-archive/restore/${projectToRestore.projectID}`);
      if (response.data.success) {
        toast.success('Project restored successfully!');
        setProjects(prevProjects => prevProjects.filter(p => p.projectID !== projectToRestore.projectID));
      } else {
        throw new Error(response.data.message || 'Failed to restore project');
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error restoring project:', error);
      const axiosError = error as AxiosError;
      toast.error((axiosError.response?.data as any)?.message || 'An error occurred while restoring the project.');
    } finally {
      handleCancelRestore();
    }
  };

  const getStatusClassName = (status: string) => {
    if (!status) return 'status-default';
    return 'status-' + status.toLowerCase().replace(/[^a-z0-9]/g, '-');
  };

  const iconButtonStyle = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '5px',
    color: '#555'
  };

  if (loading) {
    return <p className="loading-message">Loading archived projects...</p>;
  }

  if (error) {
    return <p className="error-message">{error}</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Archived Projects</h3>
        <button ref={infoIconRef} onClick={() => setShowStatusLegend(!showStatusLegend)} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#646cff'}}>
            <FaInfoCircle />
        </button>
      </div>
      {(!projects || projects.length === 0) ? (
        <p>No archived projects found.</p>
      ) : (
        <table className="archive-table">
          <thead>
            <tr>
              <th>Reference Number</th>
              <th>Proposer</th>
              <th>Title</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Reviewed By</th>
              <th>Remarks</th>
              <th>Check Files</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((proj) => (
              <tr key={proj.projectID}>
                <td>{proj.reference_number}</td>
                <td>{proj.submittedBy}</td>
                <td>{proj.title}</td>
                <td>
                  <span className={`status-badge ${getStatusClassName(proj.statusName)}`}>
                    {proj.statusName}
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
                      proj.file_name && (
                        proj.file_name.toLowerCase().endsWith('.pdf') ? (
                          <button onClick={() => handleViewPdf(proj)} style={iconButtonStyle} title="View PDF">
                            <FaEye />
                          </button>
                        ) : (
                          <button onClick={() => handleDownloadFile(proj)} style={iconButtonStyle} title="Download Document">
                            <FaDownload />
                          </button>
                        )
                      )
                    )}
                  </div>
                </td>
                <td>
                  <button
                    onClick={() => handleRestore(proj)}
                    className="restore-btn"
                  >
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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

      <Dialog
        open={showRestoreConfirm}
        onClose={handleCancelRestore}
        PaperProps={{
          style: {
            borderRadius: '20px',
            padding: '10px'
          }
        }}
      >
        <DialogTitle sx={{ 
          fontSize: '1.5rem', 
          fontWeight: 600,
          background: 'linear-gradient(135deg, #646cff, #747bff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Restore Project
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to restore the project "{projectToRestore?.title}"?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button 
            onClick={handleCancelRestore} 
            sx={{ 
              borderRadius: '12px', 
              px: 3, 
              color: '#64748b', 
              border: '1px solid #e2e8f0' 
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleConfirmRestore} 
            variant="contained" 
            sx={{ 
              borderRadius: '12px',
              px: 3,
              background: 'linear-gradient(135deg, #646cff, #747bff)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a63f0, #6b73f0)',
                transform: 'translateY(-1px)',
                boxShadow: '0 8px 25px rgba(100, 108, 255, 0.4)'
              }
            }}
          >
            Restore
          </Button>
        </DialogActions>
      </Dialog>

      {showStatusLegend && (
        <StatusLegend 
          statusList={statusList} 
          onClose={() => setShowStatusLegend(false)} 
          triggerRef={infoIconRef} 
        />
      )}
    </div>
  );
};

export default ProjArchive;