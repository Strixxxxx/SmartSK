import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface FPUsernameProps {
  onSubmit: (username: string) => void;
}

const FPUsername: React.FC<FPUsernameProps> = ({ onSubmit }) => {
  const [username, setUsername] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent multiple submissions
    if (isSubmitting) return;
    
    if (!username.trim()) {
      setError('Please enter your username');
      return;
    }
    
    // Set loading state
    setIsSubmitting(true);
    setError('');
    
    // Disable the button immediately
    if (submitButtonRef.current) {
      submitButtonRef.current.disabled = true;
    }
    
    try {
      // Call the onSubmit function passed from parent
      await onSubmit(username);
    } catch (error) {
      console.error('Error:', error);
      setError('An error occurred. Please try again later.');
    } finally {
      // Only reset if we're still mounted (component might navigate away)
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fp-step">
      <p>Please enter your username to recover your password</p>
      <form onSubmit={handleSubmit}>
        <div className="fp-form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            disabled={isSubmitting}
            className={isSubmitting ? "fp-input-disabled" : ""}
          />
          {error && <div className="fp-error-message">{error}</div>}
        </div>
        <div className="fp-form-actions">
          <button 
            ref={submitButtonRef}
            type="submit" 
            className="fp-continue-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Sending...' : 'Continue'}
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