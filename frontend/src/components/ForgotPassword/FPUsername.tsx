import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import Loading from '../Loading/Loading';

interface FPUsernameProps {
  onSubmit: (username: string) => void;
}

const FPUsername: React.FC<FPUsernameProps> = ({ onSubmit }) => {
  const [username, setUsername] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    if (!username.trim()) {
      toast.error('Please enter your username or email');
      return;
    }
    
    setIsSubmitting(true);
    
    if (submitButtonRef.current) {
      submitButtonRef.current.disabled = true;
    }
    
    try {
      await onSubmit(username);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error:', error);
      toast.error('An error occurred. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fp-step">
      <p>Please enter your username or email to recover your password</p>
      <form onSubmit={handleSubmit}>
        <div className="fp-form-group">
          <label htmlFor="username">Username or Email</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username or email"
            disabled={isSubmitting}
            className={isSubmitting ? "fp-input-disabled" : ""}
          />
        </div>
        <div className="fp-form-actions">
          <button 
            ref={submitButtonRef}
            type="submit" 
            className="fp-continue-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loading /> : 'Continue'}
          </button>
        </div>
      </form>
      <div className="fp-back-link">
        <button 
          type="button"
          className="fp-cancel-btn"
          onClick={() => navigate('/home')}
          disabled={isSubmitting}
        >
          Back to Login
        </button>
      </div>
    </div>
  );
};

export default FPUsername;