import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import './Login.css';
import { Modal, Box, Typography } from '@mui/material';
import axiosInstance from '../../backend connection/axiosConfig';
import Loading from '../Loading/Loading';

interface PasswordRequirement {
  met: boolean;
  label: string;
}

interface NewAccountProps {
  open: boolean;
  onClose: () => void;
  userID: number;
  currentUsername: string;
}

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 600,
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
};

const NewAccount: React.FC<NewAccountProps> = ({ open, onClose, userID, currentUsername }) => {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUsername) {
      setNewUsername(currentUsername);
    }
  }, [currentUsername]);

  const passwordRequirements: PasswordRequirement[] = [
    { met: /[A-Z]/.test(newPassword), label: 'At least one uppercase letter' },
    { met: /[a-z]/.test(newPassword), label: 'At least one lowercase letter' },
    { met: /[0-9]/.test(newPassword), label: 'At least one number' },
    { met: /[!@#$%^&*(),.?":{}|<>]/ .test(newPassword), label: 'At least one special character' },
    { met: newPassword.length >= 8 && newPassword.length <= 16, label: '8-16 characters long' },
    { met: confirmPassword.length > 0 && newPassword === confirmPassword, label: 'Passwords match' }
  ];

  const allRequirementsMet = passwordRequirements.every(req => req.met);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>, isConfirm: boolean = false) => {
    const value = e.target.value;
    if (value.length <= 16) {
      if (isConfirm) {
        setConfirmPassword(value);
      } else {
        setNewPassword(value);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allRequirementsMet) {
      toast.error('Please meet all password requirements');
      return;
    }

    if (!newUsername.trim()) {
      toast.error('Username cannot be empty');
      return;
    }

    setLoading(true);
    try {
      const response = await axiosInstance.post('/api/login/change-credentials', {
        newUsername: newUsername.trim(),
        newPassword: newPassword.trim(),
        currentUsername: currentUsername,
        userID: userID
      });

      const data = response.data;

      if (data.success) {
        toast.success('Credentials successfully changed. Please log in again.');
        onClose();
      } else {
        throw new Error(data.message || 'Failed to change credentials');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
    >
      <Box sx={style}>
        <div className="change-password-form">
          <Typography id="modal-modal-title" variant="h6" component="h2" sx={{ marginBottom: 2 }}>
            Change Default Credentials
          </Typography>
          <p className="password-instruction">
            Please change your default credentials to continue.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="newUsername">New Username</label>
              <input
                type="text"
                id="newUsername"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter new username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showNewPassword ? "text" : "password"}
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => handlePasswordChange(e)}
                  placeholder="Enter new password"
                  minLength={8}
                  maxLength={16}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="toggle-password"
                  tabIndex={-1}
                  aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                >
                  <span className="material-icons">
                    {showNewPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => handlePasswordChange(e, true)}
                  placeholder="Confirm new password"
                  minLength={8}
                  maxLength={16}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="toggle-password"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  <span className="material-icons">
                    {showConfirmPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <div className="password-requirements">
              <p>Your new password must meet the following requirements:</p>
              <div className="requirements-list">
                {passwordRequirements.map((req, index) => (
                  <div 
                    key={index} 
                    className={`requirement ${req.met ? 'valid' : ''}`}
                  >
                    {req.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button 
                type="submit" 
                className="submit-btn"
                disabled={loading || !allRequirementsMet}
              >
                {loading ? <Loading /> : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      </Box>
    </Modal>
  );
};

export default NewAccount;