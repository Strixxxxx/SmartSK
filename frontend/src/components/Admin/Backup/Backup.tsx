import React, { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from '../../../backend connection/axiosConfig';
import './Backup.css';

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const Backup = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [backupStatus, setBackupStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setLoading(true);
    setBackupStatus('Backing up...');
    setProgress(0);

    const interval = setInterval(() => {
      setProgress(oldProgress => {
        if (oldProgress >= 90) {
          return oldProgress;
        }
        return oldProgress + 10;
      });
    }, 500);

    try {
      const response = await axios.post(`/api/backup`);
      setProgress(100);
      setBackupStatus(response.data.message);
    } catch (error) {
      setBackupStatus('Backup failed. Please try again.');
      console.error('Backup failed:', error);
      setProgress(0);
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleInstall = async () => {
    if (!selectedFile) {
      setBackupStatus('Please select a backup file to install.');
      return;
    }

    setLoading(true);
    setBackupStatus('Installing backup...');
    setProgress(0);

    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = async () => {
      const base64File = reader.result?.toString().split(',')[1];

      const interval = setInterval(() => {
          setProgress(oldProgress => {
            if (oldProgress >= 90) {
              return oldProgress;
            }
            return oldProgress + 10;
          });
        }, 500);

      try {
        const response = await axios.post(`/api/backup/install`, { file: base64File });
        setProgress(100);
        setBackupStatus(response.data.message);
      } catch (error) {
        setBackupStatus('Installation failed. Please try again.');
        console.error('Installation failed:', error);
        setProgress(0);
      } finally {
          clearInterval(interval);
          setLoading(false);
      }
    };
    reader.onerror = (error) => {
        console.error('Error reading file:', error);
        setBackupStatus('Error reading file.');
        setLoading(false);
    };
  };

  return (
    <div className={`backup-page-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="backup-container">
        <h2>Database Backup</h2>
        <p>Create a backup of the database and send it to the designated email addresses.</p>
        <button onClick={handleBackup} disabled={loading}>
            {loading ? 'Backing up...' : 'Create Backup'}
        </button>

        <h2 className="install-title">Install Backup</h2>
        <p>Upload a backup file to restore the database.</p>
        <input type="file" onChange={handleFileChange} ref={fileInputRef} style={{ display: 'none' }} accept=".bak"/>
        <button onClick={() => fileInputRef.current?.click()} disabled={loading}>Select Backup File</button>
        {selectedFile && <p className="selected-file">Selected file: {selectedFile.name}</p>}
        <button onClick={handleInstall} disabled={loading || !selectedFile}>
            {loading ? 'Restoring...' : 'Run Restore'}
        </button>

        {loading && (
            <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${progress}%` }}>
                {progress}%
            </div>
            </div>
        )}
        {backupStatus && <p className="backup-status">{backupStatus}</p>}
        </div>
    </div>
  );
};

export default Backup;