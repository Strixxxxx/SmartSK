import React, { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from '../../../backend connection/axiosConfig';
import './Backup.css';

interface OutletContextType {
  sidebarCollapsed: boolean;
}

interface CloudBackup {
  name: string;
  url: string;
  lastModified: string;
  size: number;
}

const Backup = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRestoreModalOpen, setRestoreModalOpen] = useState(false);
  const [isCloudRestoreModalOpen, setCloudRestoreModalOpen] = useState(false);
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async (backupType: 'hybrid' | 'cloud-only') => {
    setLoading(true);
    setStatus(`Creating ${backupType} backup... This may take a few minutes.`);
    
    try {
      const response = await axios.post('/api/admin/backup', 
        { backupType },
        { responseType: backupType === 'hybrid' ? 'blob' : 'json' }
      );

      if (backupType === 'hybrid') {
        const disposition = response.headers['content-disposition'];
        let filename = 'backup.zip';
        if (disposition && disposition.indexOf('attachment') !== -1) {
          const filenameRegex = /filename[^;=\n]*=((['"])(.*?)\2|[^;\n]*)/;
          const matches = filenameRegex.exec(disposition);
          if (matches != null && matches[3]) {
            filename = matches[3];
          }
        }
        
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        setStatus('Hybrid backup created and download started.');
      } else {
        setStatus(response.data.message);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Backup failed. Please try again.';
      setStatus(`Error: ${errorMessage}`);
      console.error('Backup failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const openRestoreModal = () => setRestoreModalOpen(true);
  const closeRestoreModal = () => setRestoreModalOpen(false);

  const openCloudRestoreModal = async () => {
    closeRestoreModal();
    setLoading(true);
    setStatus('Fetching cloud backups...');
    try {
      const response = await axios.get('/api/admin/backup');
      setCloudBackups(response.data);
      setCloudRestoreModalOpen(true);
      setStatus('');
    } catch (error) {
      setStatus('Failed to fetch cloud backups.');
      console.error('Failed to fetch cloud backups:', error);
    } finally {
      setLoading(false);
    }
  };
  const closeCloudRestoreModal = () => setCloudRestoreModalOpen(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.name.endsWith('.bacpac')) {
        setSelectedFile(file);
        setStatus(`Selected file: ${file.name}`);
      } else {
        setStatus('Invalid file type. Please select a .bacpac file.');
        setSelectedFile(null);
      }
    }
  };

  const handleLocalRestore = async () => {
    if (!selectedFile) {
      setStatus('Please select a .bacpac file to restore.');
      return;
    }

    setLoading(true);
    setStatus('Restoring from local backup... This may take several minutes.');
    closeRestoreModal();

    const formData = new FormData();
    formData.append('restoreType', 'local');
    formData.append('backupFile', selectedFile);

    try {
      const response = await axios.post('/api/admin/backup/restore', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setStatus(response.data.message);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Restore failed. Please try again.';
      setStatus(`Error: ${errorMessage}`);
      console.error('Local restore failed:', error);
    } finally {
      setLoading(false);
      setSelectedFile(null);
      if(fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  
  const handleCloudRestore = async (fileName: string) => {
    setLoading(true);
    setStatus(`Restoring from ${fileName}... This may take several minutes.`);
    closeCloudRestoreModal();

    try {
      const response = await axios.post('/api/admin/backup/restore', {
        restoreType: 'cloud',
        fileName: fileName,
      });
      setStatus(response.data.message);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Restore failed. Please try again.';
      setStatus(`Error: ${errorMessage}`);
      console.error('Cloud restore failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`backup-page-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="backup-container">
        <h2>Database Backup & Restore</h2>
        <p>Create a cloud-only backup or a hybrid backup (cloud + local download). Restore from a local file or a cloud copy.</p>
        
        <div className="button-group">
          <button onClick={() => handleBackup('cloud-only')} disabled={loading}>Cloud-Only Backup</button>
          <button onClick={() => handleBackup('hybrid')} disabled={loading}>Hybrid Backup</button>
        </div>
        <button onClick={openRestoreModal} disabled={loading} className="restore-btn">Restore Database</button>

        {status && <p className="backup-status">{status}</p>}
      </div>

      {isRestoreModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Choose Restore Option</h3>
              <button onClick={closeRestoreModal} className="modal-close-button">&times;</button>
            </div>
            <div className="modal-body">
              <input type="file" onChange={handleFileChange} ref={fileInputRef} style={{ display: 'none' }} accept=".bacpac"/>
              <button onClick={() => fileInputRef.current?.click()} disabled={loading}>Select Local .bacpac File</button>
              {selectedFile && <p className="selected-file">Selected: {selectedFile.name}</p>}
              <button onClick={handleLocalRestore} disabled={loading || !selectedFile}>Restore from Local Copy</button>
              <hr style={{margin: '20px 0'}}/>
              <button onClick={openCloudRestoreModal} disabled={loading}>Restore from Cloud Copy</button>
            </div>
          </div>
        </div>
      )}

      {isCloudRestoreModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Restore from Cloud Backup</h3>
              <button onClick={closeCloudRestoreModal} className="modal-close-button">&times;</button>
            </div>
            <div className="modal-body">
              {loading ? <p>Loading backups...</p> : (
                <ul className="cloud-backup-list">
                  {cloudBackups.length > 0 ? cloudBackups.map(backup => (
                    <li key={backup.name}>
                      <span>
                        {backup.name} ({Math.round(backup.size / 1024 / 1024)} MB)
                        <br/>
                        <small>{new Date(backup.lastModified).toLocaleString()}</small>
                      </span>
                      <button onClick={() => handleCloudRestore(backup.name)} disabled={loading}>Restore</button>
                    </li>
                  )) : <p>No cloud backups found.</p>}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Backup;
