import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import './AccountCreation.css';
import { toast } from 'react-toastify';
import axiosInstance from '../../../backend connection/axiosConfig';
import { AxiosError } from 'axios';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  CircularProgress,
  TextField,
  Box,
  MenuItem,
} from '@mui/material';

interface User {
  userID: number; // Assuming userID is available from the API
  userName: string;
  fullName: string;
  emailAddress: string;
  phoneNumber: string;
  actualStatus: 'active' | 'inactive';
}

interface AccountCreationProps {
  sidebarCollapsed?: boolean;
}

const AccountCreation: React.FC<AccountCreationProps> = ({ sidebarCollapsed = false }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    barangay: '',
    emailAddress: '',
    phoneNumber: ''
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [emailError, setEmailError] = useState<string>('');
  const [isEmailValid, setIsEmailValid] = useState<boolean>(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  useEffect(() => {
    if (!authChecked) {
      if (user) {
        fetchUsers();
      } else {
        navigate('/login', { replace: true });
      }
      setAuthChecked(true);
    }
  }, [authChecked, navigate, user]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/api/admin/users');
      if (response.data.success) {
        setUsers(response.data.users);
      } else {
        throw new Error(response.data.message || 'Failed to fetch users');
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (axiosError.response?.status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      toast.error((axiosError.response?.data as any)?.message || axiosError.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@(gmail\.com|outlook\.com|yahoo\.com)$/i;
    if (!email) {
      setEmailError('Email address is required');
      setIsEmailValid(false);
    } else if (!emailRegex.test(email)) {
      setEmailError('Invalid email domain. Only @gmail.com, @outlook.com, and @yahoo.com are allowed.');
      setIsEmailValid(false);
    } else {
      setEmailError('');
      setIsEmailValid(true);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const name = e.target.name as string;
    const value = e.target.value as string;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'emailAddress') {
      validateEmail(value);
    }
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData({
      username: '',
      fullName: '',
      barangay: '',
      emailAddress: '',
      phoneNumber: ''
    });
    setEmailError('');
    setIsEmailValid(false);
  };

  const handleOpenConfirmModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailValid) {
        toast.error('Please enter a valid email address.');
        return;
    }
    setIsConfirmModalOpen(true);
  };

  const handleCloseConfirmModal = () => {
    setIsConfirmModalOpen(false);
  };

  const handleConfirmSubmit = async () => {
    handleCloseConfirmModal();
    setFormLoading(true);

    try {
      const defaultPassword = `${formData.username}.SmartSK2025`;

      const response = await axiosInstance.post('/api/admin/create-account', {
        username: formData.username,
        fullName: formData.fullName,
        barangay: formData.barangay,
        emailAddress: formData.emailAddress,
        phoneNumber: formData.phoneNumber,
        password: defaultPassword
      });

      if (response.data.success) {
        toast.success('Account created successfully! An email has been sent with the account details.');
        fetchUsers();
        handleCloseModal();
      } else {
        throw new Error(response.data.message || 'Failed to create account');
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (axiosError.response?.status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      toast.error((axiosError.response?.data as any)?.message || axiosError.message || 'Failed to create account');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`account-creation-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="loading-section">
          <div className="loading-spinner"></div>
          <p>Loading accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`account-creation-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="account-creation-content">
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Account Management</h1>
            <p className="page-subtitle">Create and manage user accounts in the system</p>
          </div>
          <button className="create-account-btn" onClick={handleOpenModal}>
            <span className="btn-icon">+</span>
            Create Account
          </button>
        </div>

        <div className="users-section">
          <div className="section-header">
            <h2>Existing Accounts</h2>
            <div className="account-stats">
              <span className="stat-item">
                <span className="stat-number">{users.length}</span>
                <span className="stat-label">Total Users</span>
              </span>
              <span className="stat-item">
                <span className="stat-number">{users.filter(u => u.actualStatus === 'active').length}</span>
                <span className="stat-label">Active</span>
              </span>
              <span className="stat-item">
                <span className="stat-number">{users.filter(u => u.actualStatus === 'inactive').length}</span>
                <span className="stat-label">Inactive</span>
              </span>
            </div>
          </div>

          <div className="table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>UserID</th>
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Email Address</th>
                  <th>Phone Number</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userID}>
                    <td>
                      <span className="user-id">#{user.userID}</span>
                    </td>
                    <td>
                      <span className="username">{user.userName}</span>
                    </td>
                    <td>
                      <span className="full-name">{user.fullName}</span>
                    </td>
                    <td>
                      <span className="email">{user.emailAddress}</span>
                    </td>
                    <td>
                      <span className="phone">{user.phoneNumber}</span>
                    </td>
                    <td>
                      <span className={`status ${user.actualStatus}`}>
                        <span className="status-dot"></span>
                        {user.actualStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog open={isModalOpen} onClose={handleCloseModal} className="modern-dialog">
        <DialogTitle className="dialog-title">Create New Account</DialogTitle>
        <Box component="form" onSubmit={handleOpenConfirmModal}>
          <DialogContent className="dialog-content">
            <DialogContentText className="dialog-description">
              Please fill out the form to create a new user account.
            </DialogContentText>
            <TextField
              autoFocus
              margin="dense"
              id="username"
              name="username"
              label="Username"
              type="text"
              fullWidth
              value={formData.username}
              onChange={handleChange}
              required
              sx={{ mb: 2 }}
              className="modern-input"
            />
            <TextField
              margin="dense"
              id="fullName"
              name="fullName"
              label="Full Name"
              type="text"
              fullWidth
              value={formData.fullName}
              onChange={handleChange}
              required
              sx={{ mb: 2 }}
              className="modern-input"
            />
            <TextField
              margin="dense"
              id="barangay"
              name="barangay"
              label="Barangay"
              select
              fullWidth
              value={formData.barangay}
              onChange={handleChange}
              required
              sx={{ mb: 2 }}
              className="modern-input"
            >
              <MenuItem value="San Bartolome">San Bartolome</MenuItem>
              <MenuItem value="Nagkaisang Nayon">Nagkaisang Nayon</MenuItem>
            </TextField>
            <TextField
              margin="dense"
              id="emailAddress"
              name="emailAddress"
              label="Email Address"
              type="email"
              fullWidth
              value={formData.emailAddress}
              onChange={handleChange}
              required
              sx={{ mb: 2 }}
              error={!!emailError}
              helperText={emailError}
              className="modern-input"
            />
            <TextField
              margin="dense"
              id="phoneNumber"
              name="phoneNumber"
              label="Phone Number"
              type="tel"
              fullWidth
              value={formData.phoneNumber}
              onChange={handleChange}
              required
              sx={{ mb: 2 }}
              className="modern-input"
            />
          </DialogContent>
          <DialogActions className="dialog-actions">
            <Button onClick={handleCloseModal} className="cancel-btn">Cancel</Button>
            <Button type="submit" variant="contained" className="submit-btn" disabled={formLoading || !isEmailValid}>
              {formLoading ? <CircularProgress size={24} /> : 'Create Account'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={isConfirmModalOpen}
        onClose={handleCloseConfirmModal}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        className="modern-dialog"
      >
        <DialogTitle id="alert-dialog-title" className="dialog-title">
          Confirm Account Creation
        </DialogTitle>
        <DialogContent className="dialog-content">
          <DialogContentText id="alert-dialog-description" className="dialog-description">
            Are you sure you want to create an account for {formData.fullName}?
          </DialogContentText>
        </DialogContent>
        <DialogActions className="dialog-actions">
          <Button onClick={handleCloseConfirmModal} className="cancel-btn">
            Cancel
          </Button>
          <Button onClick={handleConfirmSubmit} variant="contained" className="submit-btn" autoFocus disabled={formLoading}>
            {formLoading ? <CircularProgress size={24} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default AccountCreation;
