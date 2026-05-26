import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import styles from './newAccount.module.css';
import { Modal, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
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
  width: '100%',
  maxWidth: 600,
  outline: 'none',
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
    { met: /[A-Z]/.test(newPassword), label: 'One uppercase letter' },
    { met: /[a-z]/.test(newPassword), label: 'One lowercase letter' },
    { met: /[0-9]/.test(newPassword), label: 'One number' },
    { met: /[!@#$%^&*(),.?":{}|<>]/ .test(newPassword), label: 'One special character' },
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
        toast.success('Your Account is fully Active! Please Login again.');
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
        <Box sx={style} className={styles.backdrop}>
          <h2 className={styles.title} id="modal-modal-title">
            Setup Your New Account
          </h2>
          <p className={styles.instruction}>
            Please change your default credentials and accept the terms to continue.
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Username field */}
            <div className={styles.formGroup}>
              <label htmlFor="newUsername" className={styles.label}>New Username</label>
              <input 
                type="text" 
                id="newUsername" 
                className={styles.input} 
                value={newUsername} 
                onChange={(e) => setNewUsername(e.target.value)} 
                required 
              />
            </div>

            {/* New Password field */}
            <div className={styles.formGroup}>
              <label htmlFor="newPassword" className={styles.label}>New Password</label>
              <div className={styles.passwordWrapper}>
                <input 
                  type={showNewPassword ? "text" : "password"} 
                  id="newPassword" 
                  className={`${styles.input} ${styles.passwordInput}`} 
                  value={newPassword} 
                  onChange={(e) => handlePasswordChange(e)} 
                  minLength={8} 
                  maxLength={16} 
                  required 
                />
                <button 
                  type="button" 
                  onClick={() => setShowNewPassword(!showNewPassword)} 
                  className={styles.toggleBtn} 
                  tabIndex={-1}
                >
                  <span className="material-icons">{showNewPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {/* Confirm Password field */}
            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword" className={styles.label}>Confirm Password</label>
              <div className={styles.passwordWrapper}>
                <input 
                  type={showConfirmPassword ? "text" : "password"} 
                  id="confirmPassword" 
                  className={`${styles.input} ${styles.passwordInput}`} 
                  value={confirmPassword} 
                  onChange={(e) => handlePasswordChange(e, true)} 
                  minLength={8} 
                  maxLength={16} 
                  required 
                />
                <button 
                  type="button" 
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)} 
                  className={styles.toggleBtn} 
                  tabIndex={-1}
                >
                  <span className="material-icons">{showConfirmPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {/* Password Requirements Badges */}
            <div className={styles.requirementsBox}>
              <p className={styles.requirementsTitle}>Password Requirements</p>
              <div className={styles.requirementsGrid}>
                {passwordRequirements.map((req, index) => (
                  <div 
                    key={index} 
                    className={`${styles.requirementPill} ${req.met ? styles.requirementPillActive : ''}`}
                  >
                    <span className={styles.icon}>{req.met ? '✓' : '✕'}</span>
                    {req.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Legal Agreements Section */}
            <div className={styles.legalSection}>
              <h3 className={styles.legalTitle}>Legal Agreements</h3>
              <p className={styles.legalInstruction}>
                Please read and accept our terms and policies to activate your account.
              </p>
              
              <div className={styles.legalButtons}>
                <button type="button" onClick={() => handleOpenLegalModal('terms')}>
                  Read Terms and Conditions
                </button>
                <button type="button" onClick={() => handleOpenLegalModal('policy')}>
                  Read Privacy Policy
                </button>
              </div>

              <div className={styles.checkboxContainer}>
                <label className={styles.checkboxLabel}>
                  <input 
                    type="checkbox" 
                    className={styles.checkboxInput} 
                    checked={termsAccepted} 
                    onChange={(e) => setTermsAccepted(e.target.checked)} 
                  />
                  I have read and agree to the Terms and Conditions.
                </label>
                <label className={styles.checkboxLabel}>
                  <input 
                    type="checkbox" 
                    className={styles.checkboxInput} 
                    checked={policyAccepted} 
                    onChange={(e) => setPolicyAccepted(e.target.checked)} 
                  />
                  I have read and agree to the Privacy Policy.
                </label>
              </div>
            </div>

            <button 
              type="submit" 
              className={styles.submitBtn} 
              disabled={loading || !allPasswordRequirementsMet || !allAgreementsAccepted}
            >
              {loading ? <Loading /> : 'Confirm and Finish Setup'}
            </button>
          </form>
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
