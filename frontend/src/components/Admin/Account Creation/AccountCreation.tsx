import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
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
  userName: string;
  fullName: string;
  emailAddress: string;
  phoneNumber: string;
  isArchived: boolean;
}

interface AccountCreationProps {}

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const AccountCreation: React.FC<AccountCreationProps> = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [users, setUsers] = useState<User[]>([]);
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    barangay: '',
    emailAddress: '',
    phoneNumber: ''
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [formLoading, setFormLoading] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [emailError, setEmailError] = useState<string>('');
  const [isEmailValid, setIsEmailValid] = useState<boolean>(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!authChecked) {
      if (user) {
        // The AdminGuard has already verified the user's role.
        // It's safe to fetch the user data now.
        fetchUsers();
      } else {
        // This is a fallback in case the auth state is lost.
        // The AdminGuard should handle this, but this makes it more robust.
        navigate('/login', { replace: true });
      }
      setAuthChecked(true);
    }
  }, [authChecked, navigate, user]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/api/admin/users'); // Changed from fetch to axiosInstance

      if (response.data.success) {
        setUsers(response.data.users);
      } else {
        throw new Error(response.data.message || 'Failed to fetch users');
      }
    } catch (error) {
      const axiosError = error as AxiosError; // Added type assertion
      if (axiosError.response?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (axiosError.response?.status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      toast.error(axiosError.message || 'Failed to fetch users');
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

  const handleChange = (e: React.ChangeEvent<{ name?: string; value: unknown }>) => {
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

      const response = await axiosInstance.post('/api/admin/create-account', { // Changed from fetch to axiosInstance
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
      const axiosError = error as AxiosError; // Added type assertion
      if (axiosError.response?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (axiosError.response?.status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      toast.error(axiosError.message || 'Failed to create account');
    } finally {
      setFormLoading(false);
    }
  };

  if (loading && !users.length) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className={`account-creation-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="account-creation-content">
        <div className="page-header">
          <div className="header-content">
            <h1 className="page-title">Account Creation</h1>
            <p className="page-subtitle">Create and manage user accounts in the system.</p>
          </div>
          <button onClick={handleOpenModal} className="create-account-btn">
            <span className="btn-icon">+</span> Create Account
          </button>
        </div>

        <div className="table-card">
          <div className="table-header">
            <h3>Existing Accounts</h3>
            <p>List of all registered users</p>
          </div>
          <div className="users-table-container">
            {loading ? <div className="loading">Refreshing...</div> : (
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Full Name</th>
                    <th>Email Address</th>
                    <th>Phone Number</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.userName}>
                      <td>{user.userName}</td>
                      <td>{user.fullName}</td>
                      <td>{user.emailAddress}</td>
                      <td>{user.phoneNumber}</td>
                      <td>
                        <span className={`status ${user.isArchived ? 'inactive' : 'active'}`}>
                          {user.isArchived ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isModalOpen} onClose={handleCloseModal}>
        <DialogTitle>Create New Account</DialogTitle>
        <Box component="form" onSubmit={handleOpenConfirmModal}>
          <DialogContent>
            <DialogContentText>
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
              sx={{ mb: 2 }} // Adds spacing below the TextField
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
            >
              <MenuItem value="San Bartolome">San Bartolome</MenuItem>
              <MenuItem value="Nagkaisang Ngayon">Nagkaisang Ngayon</MenuItem>
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
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseModal}>Cancel</Button>
            <Button type="submit" variant="contained" className="create-account-btn" disabled={formLoading || !isEmailValid}>
              {formLoading ? <CircularProgress size={24} /> : 'Create'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={isConfirmModalOpen}
        onClose={handleCloseConfirmModal}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">
          {"Confirm Account Creation"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to create an account for {formData.fullName}?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfirmModal} color="primary">
            Cancel
          </Button>
          <Button onClick={handleConfirmSubmit} color="primary" autoFocus disabled={formLoading}>
            {formLoading ? <CircularProgress size={24} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default AccountCreation;
