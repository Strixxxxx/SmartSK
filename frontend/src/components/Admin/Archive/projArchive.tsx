import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import { AxiosError } from 'axios';
import { FaInfoCircle } from 'react-icons/fa';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from '@mui/material';
import CheckpointModal from '../../Projects/CheckpointModal';
import Loading from '../../Loading/Loading';

interface ArchivedBatch {
  batchID: number;
  title: string;
  projType: string;
  targetYear: string;
  budget: number;
  submittedDate: string;
  barangayName: string;
  statusName: string;
  currentStatusID: number;
}

interface Status {
  StatusName: string;
  description: string;
}

const ProjArchive: React.FC = () => {
  const [projects, setProjects] = useState<ArchivedBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [showRestoreConfirm, setShowRestoreConfirm] = useState<boolean>(false);
  const [batchToRestore, setBatchToRestore] = useState<ArchivedBatch | null>(null);

  const [statusList, setStatusList] = useState<Status[]>([]);
  const [showCheckpointModal, setShowCheckpointModal] = useState<boolean>(false);

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
            const response = await axiosInstance.get('/api/admin/proj-archive/statuses');
            if (response.data.success) {
                setStatusList(response.data.statuses);
            }
        } catch (error) {
            if (import.meta.env.DEV) console.error('Failed to fetch statuses', error);
        }
    };
    fetchStatuses();
  }, []);

  const handleRestore = (batch: ArchivedBatch) => {
    setBatchToRestore(batch);
    setShowRestoreConfirm(true);
  };

  const handleCancelRestore = () => {
    setBatchToRestore(null);
    setShowRestoreConfirm(false);
  };

  const handleConfirmRestore = async () => {
    if (!batchToRestore) return;

    try {
      const response = await axiosInstance.post(`/api/admin/proj-archive/restore/batch/${batchToRestore.batchID}`);
      if (response.data.success) {
        toast.success('Project batch restored successfully!');
        setProjects(prevProjects => prevProjects.filter(p => p.batchID !== batchToRestore.batchID));
      } else {
        throw new Error(response.data.message || 'Failed to restore project batch');
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error restoring project batch:', error);
      const axiosError = error as AxiosError;
      toast.error((axiosError.response?.data as any)?.message || 'An error occurred while restoring the project batch.');
    } finally {
      handleCancelRestore();
    }
  };

  const getStatusClassName = (status: string) => {
    if (!status) return 'status-default';
    return 'status-' + status.toLowerCase().replace(/[^a-z0-9]/g, '-');
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return <p className="error-message">{error}</p>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Archived Projects</h3>
        <button onClick={() => setShowCheckpointModal(true)} style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: '#646cff'}}>
            <FaInfoCircle />
        </button>
      </div>
      {(!projects || projects.length === 0) ? (
        <p>No archived projects found.</p>
      ) : (
        <table className="archive-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Target Year</th>
              <th>Budget</th>
              <th>Status</th>
              <th>Submitted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((batch) => (
              <tr key={batch.batchID}>
                <td>{batch.title}</td>
                <td>{batch.projType}</td>
                <td>{batch.targetYear}</td>
                <td>{Number(batch.budget).toLocaleString()}</td>
                <td>
                  <span className={`status-badge ${getStatusClassName(batch.statusName)}`}>
                    {batch.statusName}
                  </span>
                </td>
                <td>{new Date(batch.submittedDate).toLocaleDateString()}</td>
                <td>
                  <button
                    onClick={() => handleRestore(batch)}
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
            Are you sure you want to restore the project "{batchToRestore?.title}"?
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

      {showCheckpointModal && (
        <CheckpointModal 
          statusList={statusList} 
          onClose={() => setShowCheckpointModal(false)}
        />
      )}
    </div>
  );
};

export default ProjArchive;