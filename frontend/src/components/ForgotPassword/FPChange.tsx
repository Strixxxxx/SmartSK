import React, { useState, useRef } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { toast } from 'react-toastify';

interface FPChangeProps {
  onSubmit: (password: string) => void;
}

const FPChange: React.FC<FPChangeProps> = ({ onSubmit }) => {
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const validatePassword = (password: string): boolean => {
    const validationErrors: { [key: string]: string } = {};
    
    if (password.length < 8 || password.length > 16) {
      validationErrors.length = 'Password must be 8-16 characters long';
    }
    
    if (!/[A-Z]/.test(password)) {
      validationErrors.uppercase = 'Password must contain at least one uppercase letter';
    }
    
    if (!/[a-z]/.test(password)) {
      validationErrors.lowercase = 'Password must contain at least one lowercase letter';
    }
    
    if (!/[0-9]/.test(password)) {
      validationErrors.number = 'Password must contain at least one number';
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      validationErrors.special = 'Password must contain at least one special character';
    }
    
    return Object.keys(validationErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    if (!validatePassword(newPassword)) {
      toast.error('Please ensure your password meets all requirements.');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    setIsSubmitting(true);
    
    if (submitButtonRef.current) {
      submitButtonRef.current.disabled = true;
    }
    
    try {
      await onSubmit(newPassword);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error updating password:', error);
      toast.error('Failed to update password. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fp-step">
      <p>Create a new password for your account</p>
      <form onSubmit={handleSubmit}>
        <div className="fp-form-group">
          <label htmlFor="newPassword">New Password</label>
          <div className="fp-password-input-container">
            <input
              type={showNewPassword ? "text" : "password"}
              id="newPassword"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                validatePassword(e.target.value);
              }}
              placeholder="Enter new password"
              disabled={isSubmitting}
              className={isSubmitting ? "fp-input-disabled" : ""}
            />
            <button 
              type="button" 
              className="fp-toggle-password"
              onClick={() => setShowNewPassword(!showNewPassword)}
              disabled={isSubmitting}
            >
              {showNewPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
          <div className="fp-password-requirements">
            <p>Password must:</p>
            <ul>
              <li className={newPassword.length >= 8 && newPassword.length <= 16 ? 'fp-valid' : 'fp-invalid'}>
                Be 8-16 characters long
              </li>
              <li className={/[A-Z]/.test(newPassword) ? 'fp-valid' : 'fp-invalid'}>
                Contain at least one uppercase letter
              </li>
              <li className={/[a-z]/.test(newPassword) ? 'fp-valid' : 'fp-invalid'}>
                Contain at least one lowercase letter
              </li>
              <li className={/[0-9]/.test(newPassword) ? 'fp-valid' : 'fp-invalid'}>
                Contain at least one number
              </li>
              <li className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword) ? 'fp-valid' : 'fp-invalid'}>
                Contain at least one special character
              </li>
            </ul>
          </div>
        </div>
        <div className="fp-form-group">
          <label htmlFor="confirmPassword">Confirm New Password</label>
          <div className="fp-password-input-container">
            <input
              type={showConfirmPassword ? "text" : "password"}
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              disabled={isSubmitting}
              className={isSubmitting ? "fp-input-disabled" : ""}
            />
            <button 
              type="button" 
              className="fp-toggle-password"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isSubmitting}
            >
              {showConfirmPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>
        </div>
        <div className="fp-form-actions">
          <button 
            ref={submitButtonRef}
            type="submit" 
            className="fp-continue-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FPChange;