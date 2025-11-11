import React, { useState, useEffect, useRef } from 'react';
import './ProjectReview.css';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { toast } from 'react-toastify';
import axiosInstance from '../../backend connection/axiosConfig';
import StatusLegend from './StatusLegend';
import { FaInfoCircle } from 'react-icons/fa';
import Loading from '../Loading/Loading';

interface Project {
  id: number;
  referenceNumber: string;
  title: string;
  description: string;
  status: string;
  submittedDate: string;
  fileUrl?: string;
  fileName?: string;
  proposerName: string;
  userId: number;
  remarks?: string;
}

interface ProjectReviewProps {
  userId: number;
  userFullName: string;
  userRole?: string;
}

interface Status {
    StatusName: string;
    description: string;
}

const ProjectReview: React.FC<ProjectReviewProps> = ({ userFullName, userRole }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [reviewComment, setReviewComment] = useState<string>('');
  
  const [reviewStatus, setReviewStatus] = useState<string>('');

  const [showFileViewer, setShowFileViewer] = useState<boolean>(false);
  const [viewingFileUrl, setViewingFileUrl] = useState<string>('');
  const [viewingFileName, setViewingFileName] = useState<string>('');
  const [showStatusLegend, setShowStatusLegend] = useState<boolean>(false);
  const [statusList, setStatusList] = useState<Status[]>([]);
  const infoIconRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/api/projectreview/all');
      const data = response.data;
      if (data.success) {
        setProjects(data.projects);
      } else {
        throw new Error(data.message || 'An unknown error occurred.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewClick = (project: Project) => {
    setEditingProjectId(project.id);
    setReviewComment(project.remarks || '');
    setReviewStatus(project.status || (statusList.length > 0 ? statusList[0].StatusName : ''));
  };
  
  const handleCancelClick = () => {
    setEditingProjectId(null);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProjectId) return;

    try {
      const response = await axiosInstance.put(`/api/projectreview/status/${editingProjectId}`, {
        status: reviewStatus,
        remarks: reviewComment,
        reviewerName: userFullName
      });
      
      const data = response.data;
      if (data.success) {
        toast.success('Project status updated successfully!');
        setEditingProjectId(null);
        fetchProjects();
      } else {
        throw new Error(data.message || 'Failed to update project status.');
      }
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    }
  };
  
  const handleDownloadFile = async (fileUrl = '', fileName = '') => {
    if (!fileUrl) return;
    const filename = fileUrl.split(/[\/]/).pop();
    if (!filename) return;

    try {
      const response = await axiosInstance.get(`/api/projects/download/${filename}`);
      if (response.data.success && response.data.url) {
        const link = document.createElement('a');
        link.href = response.data.url;
        link.setAttribute('download', fileName || filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        toast.error(response.data.message || 'Could not get file URL for download.');
      }
    } catch(err) {
      toast.error('Could not download the file.');
    }
  };

  const handleViewFile = async (fileUrl = '', fileName = '') => {
    if (!fileUrl) return;
    const filename = fileUrl.split(/[\/]/).pop();
    if (!filename) return;

    try {
      const response = await axiosInstance.get(`/api/projects/download/${filename}`);
      if (response.data.success && response.data.url) {
        setViewingFileUrl(response.data.url);
        setViewingFileName(fileName || filename);
        setShowFileViewer(true);
      } else {
        toast.error(response.data.message || 'Could not get file URL for viewing.');
      }
    } catch (err) {
      toast.error('Could not view the file.');
    }
  };

  const handleCloseFileViewer = () => {
    setShowFileViewer(false);
    if (viewingFileUrl) {
      URL.revokeObjectURL(viewingFileUrl);
      setViewingFileUrl(''); // Clear the URL after revoking
    }
  };

  const getStatusClassName = (status: string) => {
    if (typeof status !== 'string') return '';
    return `status-badge status-${status.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
  };

  return (
    <div className="project-review-container">
      <h3>Project Review</h3>
      <p>Review and evaluate submitted project proposals.</p>
      
      <div className="projects-table-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button ref={infoIconRef} onClick={() => setShowStatusLegend(!showStatusLegend)} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#646cff', padding: '0 10px'}}>
            <FaInfoCircle />
          </button>
        </div>
        <table className="projects-table">
          <thead>
            <tr>
              <th>Reference Number</th>
              <th>Title & Description</th>
              <th>Proposer's Name</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Documents & Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (<tr><td colSpan={5}><Loading /></td></tr>)  
            : error ? (<tr><td colSpan={5} className="error-message">{error}</td></tr>) 
            : projects.map(project => (
                <React.Fragment key={project.id}>
                  <tr>
                    <td>{project.referenceNumber}</td>
                    <td>
                      <strong>{project.title}</strong>
                      <p className="project-description">{project.description}</p>
                    </td>
                    <td>{project.proposerName}</td>
                    <td>
                      <span className={getStatusClassName(project.status)}>
                        {project.status}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                        {project.fileUrl ? (
                          <>
                            {project.fileName?.toLowerCase().endsWith('.pdf') ? (
                              <Tooltip title="View Document">
                                <IconButton onClick={() => handleViewFile(project.fileUrl, project.fileName)}>
                                  <VisibilityIcon />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              <Tooltip title="Download Document">
                                <IconButton onClick={() => handleDownloadFile(project.fileUrl, project.fileName)}>
                                  <FileDownloadIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                          </>
                        ) : (
                          <div style={{ width: '40px' }} /> // Placeholder for alignment
                        )}

                        {userRole === 'SKC' && (
                          <button 
                            className="review-button"
                            onClick={() => handleReviewClick(project)}
                          >
                            Update Status
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingProjectId === project.id && (
                    <tr>
                      <td colSpan={5}>
                        <form onSubmit={handleSubmitReview} className="review-form">
                          <div className="form-group">
                            <label htmlFor="reviewStatus">New Status:</label>
                            <select 
                              id="reviewStatus" 
                              value={reviewStatus}
                              onChange={(e) => setReviewStatus(e.target.value)}
                              required
                            >
                              {statusList.map(status => (
                                  <option key={status.StatusName} value={status.StatusName}>{status.StatusName}</option>
                              ))}
                            </select>
                          </div>
                          
                          <div className="form-group">
                            <label htmlFor="reviewComment">Remarks:</label>
                            <textarea 
                              id="reviewComment"
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              rows={4}
                              placeholder="Enter remarks to justify the status change..."
                            ></textarea>
                          </div>
                          
                          <div className="form-actions">
                            <button type="button" className="cancel-btn" onClick={handleCancelClick}>Cancel</button>
                            <button type="submit" className="submit-btn">Submit Update</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
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

export default ProjectReview;
