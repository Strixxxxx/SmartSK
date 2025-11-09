import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import './Login.css';
import { Modal, Box, Typography, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormGroup, FormControlLabel, Checkbox } from '@mui/material';
import axiosInstance from '../../backend connection/axiosConfig';
import Loading from '../Loading/Loading';
import LegalTextViewer from '../Registration/steps/LegalTextViewer';
import { termsAndConditionsText, privacyPolicyText } from '../Legal/LegalText';

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
  maxHeight: '90vh',
  overflowY: 'auto',
};

const NewAccount: React.FC<NewAccountProps> = ({ open, onClose, userID, currentUsername }) => {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // State for legal modals
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: '', type: '' });
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  useEffect(() => {
    if (currentUsername) {
      setNewUsername(currentUsername);
    }
    // Reset acceptance when modal opens for a new user
    if (open) {
        setTermsAccepted(false);
        setPolicyAccepted(false);
    }
  }, [currentUsername, open]);

  const passwordRequirements: PasswordRequirement[] = [
    { met: /[A-Z]/.test(newPassword), label: 'At least one uppercase letter' },
    { met: /[a-z]/.test(newPassword), label: 'At least one lowercase letter' },
    { met: /[0-9]/.test(newPassword), label: 'At least one number' },
    { met: /[!@#$%^&*(),.?":{}|<>]/ .test(newPassword), label: 'At least one special character' },
    { met: newPassword.length >= 8 && newPassword.length <= 16, label: '8-16 characters long' },
    { met: confirmPassword.length > 0 && newPassword === confirmPassword, label: 'Passwords match' }
  ];

  const allPasswordRequirementsMet = passwordRequirements.every(req => req.met);
  const allAgreementsAccepted = termsAccepted && policyAccepted;

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

    if (!allPasswordRequirementsMet) {
      toast.error('Please meet all password requirements');
      return;
    }
    if (!allAgreementsAccepted) {
        toast.error('Please accept the Terms and Conditions and Privacy Policy');
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

      if (response.data.success) {
        toast.success('Credentials successfully changed. Please log in again.');
        onClose();
      } else {
        throw new Error(response.data.message || 'Failed to change credentials');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- Legal Modal Handlers ---
  const handleOpenLegalModal = (type: 'terms' | 'policy') => {
    if (type === 'terms') {
      setModalContent({ title: 'Terms and Conditions', content: termsAndConditionsText, type: 'terms' });
    } else {
      setModalContent({ title: 'Privacy Policy', content: privacyPolicyText, type: 'policy' });
    }
    setScrolledToEnd(false);
    setLegalModalOpen(true);
  };

  const handleCloseLegalModal = () => {
    setLegalModalOpen(false);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 1) {
      setScrolledToEnd(true);
    }
  };

  const handleAcceptLegal = () => {
    if (modalContent.type === 'terms') {
      setTermsAccepted(true);
    } else if (modalContent.type === 'policy') {
      setPolicyAccepted(true);
    }
    handleCloseLegalModal();
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
      >
        <Box sx={style}>
          <div className="change-password-form">
            <Typography id="modal-modal-title" variant="h6" component="h2" sx={{ marginBottom: 2 }}>
              Setup Your New Account
            </Typography>
            <p className="password-instruction">
              Please change your default credentials and accept the terms to continue.
            </p>

            <form onSubmit={handleSubmit}>
              {/* Password Fields */}
              <div className="form-group">
                <label htmlFor="newUsername">New Username</label>
                <input type="text" id="newUsername" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <div className="password-input-wrapper">
                  <input type={showNewPassword ? "text" : "password"} id="newPassword" value={newPassword} onChange={(e) => handlePasswordChange(e)} minLength={8} maxLength={16} required />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="toggle-password" tabIndex={-1}>
                    <span className="material-icons">{showNewPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <div className="password-input-wrapper">
                  <input type={showConfirmPassword ? "text" : "password"} id="confirmPassword" value={confirmPassword} onChange={(e) => handlePasswordChange(e, true)} minLength={8} maxLength={16} required />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="toggle-password" tabIndex={-1}>
                    <span className="material-icons">{showConfirmPassword ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>
              <div className="password-requirements">
                <p>Your new password must meet the following requirements:</p>
                <div className="requirements-list">
                  {passwordRequirements.map((req, index) => (<div key={index} className={`requirement ${req.met ? 'valid' : ''}`}>{req.label}</div>))}
                </div>
              </div>

              {/* Legal Agreements Section */}
              <div className="legal-agreements-section" style={{ marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '16px' }}>
                <Typography variant="h6" gutterBottom sx={{ fontSize: '1.1rem' }}>Legal Agreements</Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  Please read and accept our terms and policies to activate your account.
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  <Button variant="outlined" onClick={() => handleOpenLegalModal('terms')}>Read Terms and Conditions</Button>
                  <Button variant="outlined" onClick={() => handleOpenLegalModal('policy')}>Read Privacy Policy</Button>
                </Box>
                <FormGroup>
                  <FormControlLabel control={<Checkbox checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />} label="I have read and agree to the Terms and Conditions." />
                  <FormControlLabel control={<Checkbox checked={policyAccepted} onChange={(e) => setPolicyAccepted(e.target.checked)} />} label="I have read and agree to the Privacy Policy." />
                </FormGroup>
              </div>

              <div className="form-actions">
                <button type="submit" className="submit-btn" disabled={loading || !allPasswordRequirementsMet || !allAgreementsAccepted}>
                  {loading ? <Loading /> : 'Confirm and Finish Setup'}
                </button>
              </div>
            </form>
          </div>
        </Box>
      </Modal>

      {/* Legal Text Modal */}
      <Dialog open={legalModalOpen} onClose={handleCloseLegalModal} scroll="paper" fullWidth={true} maxWidth="lg">
        <DialogTitle>{modalContent.title}</DialogTitle>
        <DialogContent dividers onScroll={handleScroll}>
          <LegalTextViewer text={modalContent.content} />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseLegalModal}>Close</Button>
          <Button onClick={handleAcceptLegal} disabled={!scrolledToEnd} variant="contained">Accept</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default NewAccount;
