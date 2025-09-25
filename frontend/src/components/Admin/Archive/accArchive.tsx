import React, { useState, useEffect } from 'react';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
} from '@mui/material';

interface ArchivedAccount {
  userID: number;
  fullName: string;
  username: string;
  emailAddress: string;
  phoneNumber: string;
  isArchived: boolean;
}

const AccArchive: React.FC = () => {
  const [archivedAccounts, setArchivedAccounts] = useState<ArchivedAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [userToRestore, setUserToRestore] = useState<ArchivedAccount | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<boolean>(false);

  useEffect(() => {
    fetchArchivedAccounts();
  }, []);

  const fetchArchivedAccounts = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/api/admin/archive/accounts');
      if (response.data.success) {
        setArchivedAccounts(response.data.data);
      } else {
        throw new Error(response.data.message || 'Failed to fetch archived accounts');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = (account: ArchivedAccount) => {
    setUserToRestore(account);
    setShowRestoreConfirm(true);
  };

  const handleCancelRestore = () => {
    setUserToRestore(null);
    setShowRestoreConfirm(false);
  };

  const handleConfirmRestore = async () => {
    if (!userToRestore) return;

    try {
      const response = await axiosInstance.post(`/api/admin/archive/accounts/restore/${userToRestore.userID}`);
      if (response.data.success) {
        toast.success('Account restored successfully!');
        setArchivedAccounts(prev => prev.filter(acc => acc.userID !== userToRestore.userID));
      } else {
        throw new Error(response.data.message || 'Failed to restore account');
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred during restoration.');
    } finally {
      handleCancelRestore();
    }
  };

  if (loading) {
    return <p className="loading-message">Loading archived accounts...</p>;
  }

  if (error) {
    return <p className="error-message">{error}</p>;
  }

  return (
    <div>
      <h3>Archived Accounts</h3>
      {archivedAccounts.length === 0 ? (
        <p>No archived accounts found.</p>
      ) : (
        <table className="archive-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Phone Number</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {archivedAccounts.map(acc => (
              <tr key={acc.userID}>
                <td>{acc.fullName}</td>
                <td>{acc.username}</td>
                <td>{acc.emailAddress}</td>
                <td>{acc.phoneNumber}</td>
                <td>
                  <span className={`status ${acc.isArchived ? 'inactive' : 'active'}`}>
                    {acc.isArchived ? 'Inactive' : 'Active'}
                  </span>
                </td>
                <td>
                  <button 
                    className="restore-btn" 
                    onClick={() => handleRestore(acc)}
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
          Restore Account
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to restore the account for "{userToRestore?.fullName}"?
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 3, gap: 1 }}>
          <Button onClick={handleCancelRestore} sx={{ borderRadius: '12px', px: 3, color: '#64748b', border: '1px solid #e2e8f0' }}>
            Cancel
          </Button>
          <Button onClick={handleConfirmRestore} variant="contained" sx={{ 
              borderRadius: '12px',
              px: 3,
              background: 'linear-gradient(135deg, #646cff, #747bff)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a63f0, #6b73f0)',
                transform: 'translateY(-1px)',
                boxShadow: '0 8px 25px rgba(100, 108, 255, 0.4)'
              }
          }}>
            Restore
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default AccArchive;