import React, { useState, useEffect } from 'react';
import './ProjectReview.css';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { toast } from 'react-toastify';
import axiosInstance from '../../backend connection/axiosConfig';

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

const ProjectReview: React.FC<ProjectReviewProps> = ({ userFullName, userRole }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [reviewComment, setReviewComment] = useState<string>('');
  
  const statusOptions = [
    'Pending Review', 'Revision Requested', 'Proposal Accepted', 'Proposal Rejected',
    'In Compilation', "Brgy. Captain's Review", 'Submitted to LGU', 'LGU Revision Requested',
    'LGU Approval', 'LGU Rejected'
  ];
  const [reviewStatus, setReviewStatus] = useState<string>(statusOptions[0]);

  const [showFileViewer, setShowFileViewer] = useState<boolean>(false);
  const [viewingFileUrl, setViewingFileUrl] = useState<string>('');
  const [viewingFileName, setViewingFileName] = useState<string>('');

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
    setReviewStatus(project.status || statusOptions[0]);
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
      const response = await axiosInstance.get(`/api/projects/download/${filename}`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch(err) {
      toast.error('Could not download the file.');
    }
  };

  const handleViewFile = async (fileUrl = '', fileName = '') => {
    if (!fileUrl) return;
    const filename = fileUrl.split(/[\/]/).pop();
    if (!filename) return;

    try {
      const response = await axiosInstance.get(`/api/projects/download/${filename}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: response.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);
      setViewingFileUrl(url);
      setViewingFileName(fileName || filename);
      setShowFileViewer(true);
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
        <table className="projects-table">
          <thead>
            <tr>
              <th>Reference Number</th>
              <th>Title & Description</th>
              <th>Proposer's Name</th>
              <th>Status</th>
              <th>Documents</th>
              {userRole === 'SKC' && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (<tr><td colSpan={userRole === 'SKC' ? 6 : 5} className="loading-message">Loading...</td></tr>) 
            : error ? (<tr><td colSpan={userRole === 'SKC' ? 6 : 5} className="error-message">{error}</td></tr>) 
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
                    <td className="document-actions-cell">
                      {project.fileUrl && (
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
                      )}
                    </td>
                    {userRole === 'SKC' && (
                      <td className="document-actions-cell">
                        <button 
                          className="review-button"
                          onClick={() => handleReviewClick(project)}
                        >
                          Update Status
                        </button>
                      </td>
                    )}
                  </tr>
                  {editingProjectId === project.id && (
                    <tr>
                      <td colSpan={userRole === 'SKC' ? 6 : 5}>
                        <form onSubmit={handleSubmitReview} className="review-form">
                          <div className="form-group">
                            <label htmlFor="reviewStatus">New Status:</label>
                            <select 
                              id="reviewStatus" 
                              value={reviewStatus}
                              onChange={(e) => setReviewStatus(e.target.value)}
                              required
                            >
                              {statusOptions.map(status => (
                                  <option key={status} value={status}>{status}</option>
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
              ))
            }
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
    </div>
  );
};

export default ProjectReview;