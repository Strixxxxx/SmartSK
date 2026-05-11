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
  Typography,
  Grid,
  InputAdornment,
  Divider,
  IconButton,
} from '@mui/material';
import {
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Badge as BadgeIcon,
  Close as CloseIcon,
  AddCircleOutline as AddIcon,
} from '@mui/icons-material';
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
    position: '',
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
  // Archive state
  const [userToArchive, setUserToArchive] = useState<User | null>(null);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState<boolean>(false);
  const [archiveLoading, setArchiveLoading] = useState<boolean>(false);
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
      position: '',
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
        position: formData.position,
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

  // --- Archive Handlers ---
  const handleArchiveClick = (targetUser: User) => {
    setUserToArchive(targetUser);
    setIsArchiveConfirmOpen(true);
  };

  const handleCancelArchive = () => {
    setUserToArchive(null);
    setIsArchiveConfirmOpen(false);
  };

  const handleConfirmArchive = async () => {
    if (!userToArchive) return;
    setArchiveLoading(true);
    try {
      const response = await axiosInstance.post('/api/admin/acc-archive/by-username', {
        userName: userToArchive.userName
      });
      if (response.data.success) {
        toast.success(`Account for ${userToArchive.fullName} archived successfully.`);
        fetchUsers();
        handleCancelArchive();
      } else {
        throw new Error(response.data.message || 'Failed to archive account');
      }
    } catch (error) {
      const axiosError = error as AxiosError<{ message: string }>;
      if (axiosError.response?.status === 401) {
        navigate('/home', { replace: true });
        return;
      }
      if (axiosError.response?.status === 403) {
        toast.error('You cannot archive your own account.');
        handleCancelArchive();
        return;
      }
      toast.error(axiosError.response?.data?.message || axiosError.message || 'Failed to archive account');
    } finally {
      setArchiveLoading(false);
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((tableUser) => (
                  <tr key={tableUser.userName}>
                    <td>{tableUser.userName}</td>
                    <td>{tableUser.fullName}</td>
                    <td>{tableUser.emailAddress}</td>
                    <td>{tableUser.phoneNumber}</td>
                    <td>
                      <span className={`status ${tableUser.isArchived ? 'inactive' : 'active'}`}>
                        {tableUser.isArchived ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td>
                      {/* Hide archive button for the currently logged-in admin */}
                      {tableUser.userName !== user?.username && (
                        <button
                          onClick={() => handleArchiveClick(tableUser)}
                          className="action-btn archive-btn"
                        >
                          Archive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog 
        open={isModalOpen} 
        onClose={handleCloseModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ 
          pb: 1, 
          pt: 3, 
          px: 4,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: 'linear-gradient(to right, #ffffff, #f8f9fa)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AddIcon sx={{ color: '#1a237e', fontSize: 28 }} />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a237e', lineHeight: 1.2 }}>
                Register Official
              </Typography>
              <Typography variant="caption" sx={{ color: '#666', fontWeight: 500 }}>
                Sangguniang Kabataan Management System
              </Typography>
            </Box>
          </Box>
        </DialogTitle>

        <Divider sx={{ mx: 4, opacity: 0.6 }} />

        <Box component="form" onSubmit={handleOpenConfirmModal}>
          <DialogContent sx={{ px: 4, py: 3 }}>
            <DialogContentText sx={{ mb: 3, color: '#555', fontSize: '0.9rem' }}>
              Ensure all information is accurate. New officials will receive their credentials via the provided email address.
            </DialogContentText>
            
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.8, fontWeight: 600, color: '#333' }}>Username</Typography>
                <TextField
                  autoFocus
                  id="username"
                  name="username"
                  placeholder="e.g. juan.delacruz"
                  type="text"
                  fullWidth
                  value={formData.username}
                  onChange={handleChange}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonIcon sx={{ color: '#999', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                  }}
                />
              </Grid>
              
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.8, fontWeight: 600, color: '#333' }}>Full Name</Typography>
                <TextField
                  id="fullName"
                  name="fullName"
                  placeholder="First M. Last"
                  type="text"
                  fullWidth
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonIcon sx={{ color: '#999', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                  }}
                />
              </Grid>

              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mb: 0.8, fontWeight: 600, color: '#333' }}>Official Position</Typography>
                <TextField
                  id="position"
                  name="position"
                  select
                  fullWidth
                  value={formData.position}
                  onChange={handleChange}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <BadgeIcon sx={{ color: '#999', fontSize: 20, mr: 1 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                  }}
                >
                  <MenuItem value="SKC">SK Chairperson</MenuItem>
                  <MenuItem value="SKS">SK Secretary</MenuItem>
                  <MenuItem value="SKT">SK Treasurer</MenuItem>
                  <Divider sx={{ my: 1 }} />
                  <MenuItem value="SKK1">SK Kagawad 1</MenuItem>
                  <MenuItem value="SKK2">SK Kagawad 2</MenuItem>
                  <MenuItem value="SKK3">SK Kagawad 3</MenuItem>
                  <MenuItem value="SKK4">SK Kagawad 4</MenuItem>
                  <MenuItem value="SKK5">SK Kagawad 5</MenuItem>
                  <MenuItem value="SKK6">SK Kagawad 6</MenuItem>
                  <MenuItem value="SKK7">SK Kagawad 7</MenuItem>
                </TextField>
              </Grid>

              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mb: 0.8, fontWeight: 600, color: '#333' }}>Email Address</Typography>
                <TextField
                  id="emailAddress"
                  name="emailAddress"
                  placeholder="official@example.com"
                  type="email"
                  fullWidth
                  value={formData.emailAddress}
                  onChange={handleChange}
                  required
                  error={!!emailError}
                  helperText={emailError}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailIcon sx={{ color: '#999', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                  }}
                />
              </Grid>

              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mb: 0.8, fontWeight: 600, color: '#333' }}>Phone Number</Typography>
                <TextField
                  id="phoneNumber"
                  name="phoneNumber"
                  placeholder="09123456789"
                  type="tel"
                  fullWidth
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <PhoneIcon sx={{ color: '#999', fontSize: 20 }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': { borderRadius: '8px' }
                  }}
                />
              </Grid>
            </Grid>
          </DialogContent>
          
          <DialogActions sx={{ px: 4, py: 3, bgcolor: '#fcfcfc', borderTop: '1px solid #eee' }}>
            <Button 
              onClick={handleCloseModal} 
              sx={{ 
                color: '#666', 
                fontWeight: 600,
                textTransform: 'none',
                '&:hover': { bgcolor: '#f5f5f5' }
              }}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="contained" 
              disabled={formLoading || !isEmailValid}
              sx={{ 
                bgcolor: '#1a237e',
                color: 'white',
                fontWeight: 600,
                px: 4,
                borderRadius: '8px',
                textTransform: 'none',
                '&:hover': { bgcolor: '#0d47a1' },
                '&.Mui-disabled': { bgcolor: '#e0e0e0' }
              }}
            >
              {formLoading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : 'Register Account'}
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

      {/* Archive Confirmation Dialog */}
      <Dialog
        open={isArchiveConfirmOpen}
        onClose={handleCancelArchive}
        aria-labelledby="archive-dialog-title"
        aria-describedby="archive-dialog-description"
      >
        <DialogTitle id="archive-dialog-title">
          {"Confirm Archive Account"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="archive-dialog-description">
            Are you sure you want to archive the account for <strong>{userToArchive?.fullName}</strong>? This will also archive all their associated posts.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelArchive} color="primary" disabled={archiveLoading}>
            Cancel
          </Button>
          <Button onClick={handleConfirmArchive} color="error" variant="contained" autoFocus disabled={archiveLoading}>
            {archiveLoading ? <CircularProgress size={24} /> : 'Archive'}
          </Button>
        </DialogActions>
      </Dialog>
    </React.Fragment>
  );
};

export default UserAccounts;