import React, { useState, useEffect } from 'react';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import { AxiosError } from 'axios';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from '@mui/material';
import Loading from '../../Loading/Loading';

interface ArchivedCycle {
  cycleID: number;
  displayName: string;
  targetFiscalYear: string;
  termStartYear: string;
  termEndYear: string;
  createdAt: string;
}

const CycleArchive: React.FC = () => {
  const [cycles, setCycles] = useState<ArchivedCycle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [showRestoreConfirm, setShowRestoreConfirm] = useState<boolean>(false);
  const [cycleToRestore, setCycleToRestore] = useState<ArchivedCycle | null>(null);

  useEffect(() => {
    const fetchCycles = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axiosInstance.get('/api/admin/proj-archive/archived-cycles');
        if (response.data.success) {
          setCycles(response.data.cycles || []);
        } else {
          throw new Error(response.data.message || 'Failed to fetch archived cycles');
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        const errorMessage = (axiosError.response?.data as any)?.message || 'An error occurred while fetching archived cycles.';
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchCycles();
  }, []);

  const handleRestore = (cycle: ArchivedCycle) => {
    setCycleToRestore(cycle);
    setShowRestoreConfirm(true);
  };

  const handleCancelRestore = () => {
    setCycleToRestore(null);
    setShowRestoreConfirm(false);
  };

  const handleConfirmRestore = async () => {
    if (!cycleToRestore) return;

    try {
      const response = await axiosInstance.post(`/api/admin/proj-archive/restore/cycles/${cycleToRestore.cycleID}`);
      if (response.data.success) {
        toast.success('Project cycle restored successfully!');
        setCycles(prev => prev.filter(c => c.cycleID !== cycleToRestore.cycleID));
      } else {
        throw new Error(response.data.message || 'Failed to restore project cycle');
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error restoring project cycle:', error);
      const axiosError = error as AxiosError;
      toast.error((axiosError.response?.data as any)?.message || 'An error occurred while restoring the project cycle.');
    } finally {
      handleCancelRestore();
    }
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
        <h3>Archived Project Cycles</h3>
      </div>
      {(!cycles || cycles.length === 0) ? (
        <p>No archived project cycles found.</p>
      ) : (
        <table className="archive-table">
          <thead>
            <tr>
              <th>Project Cycle Name</th>
              <th>Target Fiscal Year</th>
              <th>Term Started</th>
              <th>Term Ended</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {cycles.map((cycle) => (
              <tr key={cycle.cycleID}>
                <td style={{ fontWeight: 'bold' }}>{cycle.displayName}</td>
                <td>{cycle.targetFiscalYear}</td>
                <td>{cycle.termStartYear}</td>
                <td>{cycle.termEndYear}</td>
                <td>
                  <button
                    onClick={() => handleRestore(cycle)}
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
          Restore Project Cycle
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to restore the project cycle "{cycleToRestore?.displayName}"?
            This will also automatically restore all its associated projects and submissions.
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
    </div>
  );
};

export default CycleArchive;
