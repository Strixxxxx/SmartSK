import React, { useState, useEffect, useRef } from 'react';
import './ProjectSubmission.css';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { toast } from 'react-toastify';
import axiosInstance from '../../backend connection/axiosConfig';
import StatusLegend from './StatusLegend';
import { FaInfoCircle } from 'react-icons/fa';

interface Project {
  id: string;
  referenceNumber: string;
  title: string;
  description: string;
  status: string;
  submittedDate: string;
  fileUrl?: string;
  fileName?: string;
  remarks?: string;
  reviewedBy?: string;
}

interface Status {
  StatusName: string;
  description: string;
}

interface ProjectSubmissionProps {
  userId?: number;
  userRole?: string;
}

const ProjectSubmission: React.FC<ProjectSubmissionProps> = ({ userId, userRole }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showSubmitForm, setShowSubmitForm] = useState<boolean>(false);

  const [projectTitle, setProjectTitle] = useState<string>('');
  const [projectDescription, setProjectDescription] = useState<string>('');
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

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
            console.error('Failed to fetch statuses', error);
        }
    };
    fetchStatuses();
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!userId) {
        setError('User ID not found. Cannot fetch projects.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const response = await axiosInstance.get(`/api/projects/user/${userId}`);
        const data = response.data;
        if (data.success) {
          setProjects(Array.isArray(data.projects) ? data.projects : []);
        } else {
          throw new Error(data.message || 'An unknown error occurred');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, [userId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const allowedExtensions = ['.pdf', '.doc', '.docx'];
      const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

      if (allowedExtensions.includes(fileExtension)) {
        setProjectFile(file);
        setFileError(null);
      } else {
        setProjectFile(null);
        setFileError('Invalid file type. Only PDF, DOC, and DOCX are allowed.');
      }
    }
  };

  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fileError) {
      toast.error(fileError);
      return;
    }
    if (!userId) {
        toast.error('Authentication error. Please log in again.');
        return;
    }

    const formData = new FormData();
    formData.append('title', projectTitle);
    formData.append('description', projectDescription);
    formData.append('userId', String(userId));
    if (projectFile) {
      formData.append('projectFile', projectFile);
    }

    try {
      const response = await axiosInstance.post('/api/projects/submit', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      const data = response.data;
      if (data.success && data.project) {
        setProjects(prevProjects => [...prevProjects, data.project]);
        setShowSubmitForm(false);
        setProjectTitle('');
        setProjectDescription('');
        setProjectFile(null);
        setFileError(null);
        toast.success('Proposal submitted successfully!');
      } else {
        throw new Error(data.message || 'Failed to submit project.');
      }
    } catch (err: any) {
      toast.error(`Submission Error: ${err.message}`);
    }
  };
  
  const handleViewRemarks = (project: Project) => {
    const remarks = project.remarks || 'No remarks provided.';
    const reviewedBy = project.reviewedBy || 'N/A';
    toast.info(<div><h4>{project.title}</h4><p>{remarks}</p><p>Reviewed By: {reviewedBy}</p></div>, { autoClose: false });
  };
  
  const handleCloseFileViewer = () => {
    setShowFileViewer(false);
    if (viewingFileUrl) {
      URL.revokeObjectURL(viewingFileUrl);
    }
    setViewingFileUrl('');
    setViewingFileName('');
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
      toast.error('Could not load file for viewing.');
    }
  };

  return (
    <div className="project-submission-container">
      <h3>Proposed Project Submissions</h3>
      <p>Track and manage newly proposed projects.</p>
      
      <div className="project-actions">
        {userRole !== 'MA' && (
          <button 
            className="submit-project-btn" 
            onClick={() => setShowSubmitForm(true)}
          >
            Propose New Project
          </button>
        )}
      </div>

      {showSubmitForm && (
        <div className="modal-overlay">
          <div className="modal-content project-form-modal">
            <div className="modal-header">
              <h3>Submit New Project</h3>
              <button className="close-btn" onClick={() => setShowSubmitForm(false)}>×</button>
            </div>
            <form onSubmit={handleSubmitProject} className="modal-body">
                <div className="form-group">
                  <label htmlFor="projectTitle">Project Title</label>
                  <input type="text" id="projectTitle" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label htmlFor="projectDescription">Project Description</label>
                  <textarea id="projectDescription" value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} rows={5} required></textarea>
                </div>
                <div className="form-group">
                  <label htmlFor="projectFile">Project Document (PDF, DOC, DOCX only)</label>
                   <div className="file-input-container">
                    <input type="file" id="projectFile" onChange={handleFileChange} accept=".pdf,.doc,.docx" className="file-input"/>
                     <label htmlFor="projectFile" className="file-input-label">
                       {projectFile ? projectFile.name : 'Choose File'}
                     </label>
                  </div>
                  {fileError && <p className="error-message" style={{ color: '#d32f2f', fontSize: '0.8rem', marginTop: '5px' }}>{fileError}</p>}
                </div>
                <div className="form-actions">
                  <button type="button" className="cancel-btn" onClick={() => setShowSubmitForm(false)}>Cancel</button>
                  <button type="submit" className="submit-btn" disabled={!!fileError}>Submit Proposal</button>
                </div>
            </form>
          </div>
        </div>
      )}

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
                <th>Status</th>
                <th>Documents</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {loading ? ( <tr><td colSpan={5} className="loading-message">Loading...</td></tr>)
              : error ? (<tr><td colSpan={5} className="error-message">{error}</td></tr>)
              : projects.length === 0 ? (<tr><td colSpan={5} className="no-projects-message">No projects submitted yet.</td></tr>)
              : (
                projects.map(project => (
                  <tr key={project.id}>
                    <td>{project.referenceNumber}</td>
                    <td>
                      <strong>{project.title}</strong>
                      <p className="project-description">{project.description}</p>
                    </td>
                    <td>
                      <span className={`status-badge status-${project.status.replace(/\s+/g, '-').toLowerCase()}`}>
                        {project.status}
                      </span>
                      {project.status !== 'Pending Review' && (
                        <div className="reviewer-name">By: {project.reviewedBy || 'N/A'}</div>
                      )}
                    </td>
                    <td className="document-actions-cell">
                      {project.fileUrl && (
                        <>
                          {project.fileName?.toLowerCase().endsWith('.pdf') ? (
                            <Tooltip title="View File">
                              <IconButton onClick={() => handleViewFile(project.fileUrl, project.fileName)}>
                                <VisibilityIcon />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <Tooltip title="Download File">
                              <IconButton onClick={() => handleDownloadFile(project.fileUrl, project.fileName)}>
                                <FileDownloadIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </td>
                    <td>
                      {project.remarks ? (
                        <button className="view-remarks-btn" onClick={() => handleViewRemarks(project)}>View</button>
                      ) : (
                        <span className="no-remarks">No remarks</span>
                      )}
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
                    <iframe className="file-viewer-iframe" src={viewingFileUrl} title="File Viewer"></iframe>
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

export default ProjectSubmission;