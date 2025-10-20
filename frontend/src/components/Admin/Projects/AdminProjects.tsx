import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import { AxiosError } from 'axios';
import { FaEye, FaDownload, FaSpinner, FaInfoCircle } from 'react-icons/fa';
import './AdminProjects.css';
import StatusLegend from '../../Projects/StatusLegend';

interface OutletContextType {
  sidebarCollapsed: boolean;
}

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

interface Status {
  StatusName: string;
  description: string;
}

const AdminProjects: React.FC = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fileLoading, setFileLoading] = useState<number | null>(null);
  const navigate = useNavigate();

  const [showFileViewer, setShowFileViewer] = useState<boolean>(false);
  const [viewingFileUrl, setViewingFileUrl] = useState<string>('');
  const [viewingFileName, setViewingFileName] = useState<string>('');

  const [showArchiveConfirm, setShowArchiveConfirm] = useState<boolean>(false);
  const [archivingProjectId, setArchivingProjectId] = useState<number | null>(null);

  const [statusList, setStatusList] = useState<Status[]>([]);
  const [showStatusLegend, setShowStatusLegend] = useState<boolean>(false);
  const infoIconRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      setLoading(true);
      try {
        const response = await axiosInstance.get('/api/admin/project-list');
        if (response.data.success) {
          setProjects(response.data.projects);
        } else {
          throw new Error(response.data.message || 'Failed to fetch projects');
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
        toast.error((axiosError.response?.data as any)?.message || 'An error occurred while fetching projects.');
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
    if (!project.fileName) {
        toast.error('No file associated with this project.');
        return;
    }

    setFileLoading(project.projectID);
    try {
        const response = await axiosInstance.get(`/api/admin/project-list/file-url/${project.projectID}`);
        if (response.data.success && response.data.url) {
            openFileViewer(response.data.url, project.fileName);
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
    if (!project.fileName) {
        toast.error('No file associated with this project.');
        return;
    }

    setFileLoading(project.projectID);
    try {
        const response = await axiosInstance.get(`/api/admin/project-list/file-url/${project.projectID}`);
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
        if (import.meta.env.DEV) console.error("Error getting file URL:", error);
        toast.error("Could not retrieve the file. Please try again.");
    } finally {
        setFileLoading(null);
    }
  };

  const handleArchive = (projectId: number) => {
    setArchivingProjectId(projectId);
    setShowArchiveConfirm(true);
  };

  const confirmArchive = async () => {
    if (!archivingProjectId) return;

    try {
      const response = await axiosInstance.post(`/api/admin/proj-archive/${archivingProjectId}`);
      if (response.data.success) {
        toast.success('Project archived successfully.');
        setProjects(prevProjects => prevProjects.filter(p => p.projectID !== archivingProjectId));
      } else {
        toast.error(response.data.message || 'Failed to archive project.');
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error archiving project:', error);
      const axiosError = error as AxiosError;
      toast.error((axiosError.response?.data as any)?.message || 'An error occurred while archiving the project.');
    } finally {
      setShowArchiveConfirm(false);
      setArchivingProjectId(null);
    }
  };

  const cancelArchive = () => {
    setShowArchiveConfirm(false);
    setArchivingProjectId(null);
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

  return (
    <div className={`projects-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="projects-content">
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Project List</h1>
            <p className="page-subtitle">List of all submitted projects</p>
          </div>
        </div>
        <div className="table-card">
          {loading ? (
            <div className="loading">Loading projects...</div>
          ) : (
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
                    <th>Proposer</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Reviewed By</th>
                    <th>Remarks</th>
                    <th>Check Files</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center' }}>No projects found for your barangay.</td>
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
                            onClick={() => handleArchive(proj.projectID)}
                            className="archive-btn"
                          >
                            Archive
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

      {showArchiveConfirm && (
        <div className="modal-overlay">
          <div className="file-viewer-modal" style={{ height: 'auto', maxWidth: '400px' }}>
            <div className="file-viewer-header">
              <h3 className="file-viewer-title">Confirm Archive</h3>
              <button className="file-viewer-close" onClick={cancelArchive}>×</button>
            </div>
            <div className="file-viewer-content" style={{ padding: '20px' }}>
              <p>Are you sure you want to archive this project?</p>
            </div>
            <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={cancelArchive} className="archive-btn" style={{ backgroundColor: '#6c757d' }}>Cancel</button>
              <button onClick={confirmArchive} className="archive-btn">Archive</button>
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

export default AdminProjects;
