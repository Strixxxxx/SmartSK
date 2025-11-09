import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
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
import Loading from '../../Loading/Loading';

interface User {
  userName: string;
  fullName: string;
  emailAddress: string;
  phoneNumber: string;
  isArchived: boolean;
}

const UserAccounts: React.FC = () => {
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
        fetchUsers();
      } else {
        navigate('/home', { replace: true });
      }
      setAuthChecked(true);
    }
  }, [authChecked, navigate, user]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/api/admin/user-list');
      if (response.data.success) {
        setUsers(response.data.users);
      } else {
        throw new Error(response.data.message || 'Failed to fetch users');
      }
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        navigate('/home', { replace: true });
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

      const response = await axiosInstance.post('/api/admin/user-list/create-account', {
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
      const axiosError = error as AxiosError<{ message: string }>;
      if (axiosError.response?.status === 401) {
        navigate('/home', { replace: true });
        return;
      }
      if (axiosError.response?.status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      if (axiosError.response?.status === 409) {
        const serverMessage = axiosError.response.data.message;
        let displayMessage = 'A conflict occurred. Please try again.'; // Default
        if (serverMessage === 'Username already exists') {
          displayMessage = 'The username already exists, please try again.';
        } else if (serverMessage === 'Email address already exists') {
          displayMessage = 'The email address already exists, please try again.';
        } else if (serverMessage === 'Phone number already exists') {
          displayMessage = 'The phone number already exists, please try again.';
        }
        toast.error(displayMessage);
      } else {
        const message = axiosError.response?.data?.message || axiosError.message || 'Failed to create account';
        toast.error(message);
      }
    } finally {
      setFormLoading(false);
    }
  };

  if (loading && !users.length) {
    return <Loading />;
  }

  return (
    <React.Fragment>
      <div className="table-card">
        <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Existing Accounts</h3>
            <p>List of all registered users</p>
          </div>
          <button onClick={handleOpenModal} className="create-account-btn">
            <span className="btn-icon">+</span> Create Account
          </button>
        </div>
        <div className="users-table-container">
          {loading ? <Loading /> : (
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
              sx={{ mb: 2 }}
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
    </React.Fragment>
  );
};

export default UserAccounts;