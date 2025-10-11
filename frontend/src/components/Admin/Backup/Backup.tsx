import React, { useState, useRef, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from '../../../backend connection/axiosConfig';
import { useAuth } from '../../../context/AuthContext'; // Import useAuth
import './Backup.css';

interface CloudBackup {
  name: string;
  url: string;
  lastModified: string;
  size: number;
}

interface Job {
  JobID: string;
  Status: 'pending' | 'processing' | 'completed' | 'failed';
  Message: string;
  BackupType: 'hybrid' | 'cloud-only';
  ErrorMessage?: string;
  FileName?: string;
  FilePath?: string;
}

interface OutletContextType {
  sidebarCollapsed: boolean;
  showFlashMessage: (message: string, type: 'success' | 'error' | 'info') => void;
}

const Backup: React.FC = () => {
  const { showFlashMessage, sidebarCollapsed } = useOutletContext<OutletContextType>();
  const { logout } = useAuth(); // Get logout function
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>([]);
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [cloudRestoreModalOpen, setCloudRestoreModalOpen] = useState(false);
  const [selectedCloudBackup, setSelectedCloudBackup] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);

  const fetchCloudBackups = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/backup');
      setCloudBackups(response.data);
    } catch (error) {
      showFlashMessage('Failed to fetch cloud backups.', 'error');
      console.error('Failed to fetch cloud backups:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCloudBackups();
    // Clear interval on component unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const pollJobStatus = (jobId: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const response = await axios.get<Job>(`/api/admin/backup/status/${jobId}`);
        const job = response.data;
        setStatus(`Status: ${job.Message}`); // Update status message

        if (job.Status === 'completed' || job.Status === 'failed') {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setActiveJobId(null); // Re-enable buttons
          setLoading(false);
          fetchCloudBackups(); // Refresh the list of backups

          if (job.Status === 'completed') {
            showFlashMessage(`Backup (${job.BackupType}) completed successfully!`, 'success');
            if (job.BackupType === 'hybrid') {
              // Trigger download for hybrid backups
              showFlashMessage('Starting download...', 'info');
              try {
                const downloadResponse = await axios.get(`/api/admin/backup/download/${jobId}`, {
                  responseType: 'blob',
                });
                const url = window.URL.createObjectURL(new Blob([downloadResponse.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', (job.FileName || `backup-${jobId}`).replace('.bacpac', '.zip')); 
                document.body.appendChild(link);
                link.click();
                link.remove();
              } catch (downloadError) {
                console.error('Download failed:', downloadError);
                showFlashMessage('Failed to download backup file.', 'error');
              }
            }
          } else { // Failed
            showFlashMessage(`Backup failed: ${job.ErrorMessage || job.Message}`, 'error');
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        showFlashMessage('Error checking backup status.', 'error');
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
        }
        setActiveJobId(null);
        setLoading(false);
      }
    }, 3000); // Poll every 3 seconds
  };

  const handleBackup = async (backupType: 'hybrid' | 'cloud-only') => {
    setLoading(true);
    setStatus(`Initiating ${backupType} backup...`);

    try {
      const response = await axios.post<{ jobId: string }>('/api/admin/backup', { backupType });
      const { jobId } = response.data;
      setActiveJobId(jobId);
      setStatus('Backup process started. Polling for status updates...');
      showFlashMessage('Backup process initiated. You will be notified upon completion.', 'info');
      pollJobStatus(jobId);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to initiate backup.';
      setStatus(`Error: ${errorMessage}`);
      showFlashMessage(errorMessage, 'error');
      setLoading(false);
    }
  };

  const handleRestore = async (restoreType: 'cloud' | 'local') => {
    setLoading(true);
    setStatus(`Starting ${restoreType} restore... This may take several minutes.`);
    showFlashMessage('Restore process initiated. Please do not navigate away.', 'info');

    const formData = new FormData();
    formData.append('restoreType', restoreType);

    if (restoreType === 'local' && selectedFile) {
        formData.append('backupFile', selectedFile);
    } else if (restoreType === 'cloud' && selectedCloudBackup) {
      formData.append('fileName', selectedCloudBackup);
    } else {
      showFlashMessage('No file selected for restore.', 'error');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post('/api/admin/backup/restore', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 600000, // 10 minute timeout for restore
      });
      showFlashMessage(response.data.message, 'success');
      setStatus('Restore completed successfully.');
      showFlashMessage('You will be logged out in 10 seconds for security reasons.', 'info');
      setTimeout(() => {
        logout();
      }, 10000);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Restore failed.';
      showFlashMessage(errorMessage, 'error');
      setStatus(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
      closeRestoreModal();
      closeCloudRestoreModal();
      setSelectedFile(null);
      setSelectedCloudBackup(null);
    }
  };

  const openRestoreModal = () => setRestoreModalOpen(true);
  const closeRestoreModal = () => {
    setRestoreModalOpen(false);
    setSelectedFile(null);
  };

  const openCloudRestoreModal = async () => {
    closeRestoreModal();
    await fetchCloudBackups();
    setCloudRestoreModalOpen(true);
  };
  const closeCloudRestoreModal = () => setCloudRestoreModalOpen(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.name.toLowerCase().endsWith('.zip')) {
            setSelectedFile(file);
        } else {
            showFlashMessage('Invalid file type. Please select a .zip backup file.', 'error');
            setSelectedFile(null);
        }
    }
  };

  return (
    <div className={`backup-page-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="backup-container">
        <h2>Database Backup and Restore</h2>
        <div className="status-box">{status || 'Ready'}</div>

        <div className="backup-section">
          <h3>Create Backup</h3>
          <div className="button-group">
            <button onClick={() => handleBackup('hybrid')} disabled={!!activeJobId || loading}>
              Hybrid Backup (Cloud + Local)
            </button>
            <button onClick={() => handleBackup('cloud-only')} disabled={!!activeJobId || loading}>
              Cloud-Only Backup
            </button>
          </div>
        </div>

        <div className="restore-section">
          <h3>Restore Database</h3>
          <div className="button-group">
            <button onClick={openRestoreModal} disabled={!!activeJobId || loading} className="restore-btn">
              Restore from Backup
            </button>
          </div>
        </div>

        {/* Main Restore Modal */}
        {restoreModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Choose Restore Source</h3>
              <div className="restore-options">
                <button onClick={openCloudRestoreModal}>Restore from Cloud</button>
                <input type="file" accept=".zip" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
                <button onClick={() => fileInputRef.current?.click()}>Restore from Local File</button>
              </div>
              {selectedFile && (
                <div className="local-restore-confirm">
                  <p>Selected file: {selectedFile.name}</p>
                  <button onClick={() => handleRestore('local')} disabled={loading}>Confirm & Restore Local</button>
                </div>
              )}
              <button onClick={closeRestoreModal} className="close-button">Cancel</button>
            </div>
          </div>
        )}

        {/* Cloud Restore Modal */}
        {cloudRestoreModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Select a Cloud Backup to Restore</h3>
              <div className="cloud-backup-list">
                {cloudBackups.length > 0 ? (
                  cloudBackups.map((backup) => (
                    <label key={backup.name} className={`backup-item ${selectedCloudBackup === backup.name ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="cloudBackup"
                        value={backup.name}
                        checked={selectedCloudBackup === backup.name}
                        onChange={() => setSelectedCloudBackup(backup.name)}
                      />
                      <div className="backup-item-details">
                        <span className="backup-name">{backup.name}</span>
                        <span className="backup-metadata">
                          {new Date(backup.lastModified).toLocaleString()} - ({(backup.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                    </label>
                  ))
                ) : (
                  <p>No cloud backups found.</p>
                )}
              </div>
              <div className="restore-actions">
                <button onClick={() => handleRestore('cloud')} disabled={!selectedCloudBackup || loading}>Confirm & Restore Cloud</button>
                <button onClick={closeCloudRestoreModal} className="close-button">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Backup;