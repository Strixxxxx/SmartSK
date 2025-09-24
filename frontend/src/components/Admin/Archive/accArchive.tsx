import React, { useState, useEffect } from 'react';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';

interface ArchivedAccount {
  userID: number;
  fullName: string;
  username: string;
  emailAddress: string;
  phoneNumber: string;
}

const AccArchive: React.FC = () => {
  const [archivedAccounts, setArchivedAccounts] = useState<ArchivedAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleRestore = async (userId: number) => {
    if (!window.confirm('Are you sure you want to restore this account?')) {
      return;
    }

    try {
      const response = await axiosInstance.post(`/api/admin/archive/accounts/restore/${userId}`);
      if (response.data.success) {
        toast.success('Account restored successfully!');
        setArchivedAccounts(prev => prev.filter(acc => acc.userID !== userId));
      } else {
        throw new Error(response.data.message || 'Failed to restore account');
      }
    } catch (err: any) {
      toast.error(err.message || 'An error occurred during restoration.');
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
                  <button 
                    className="restore-btn" 
                    onClick={() => handleRestore(acc.userID)}
                  >
                    Restore
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AccArchive;
