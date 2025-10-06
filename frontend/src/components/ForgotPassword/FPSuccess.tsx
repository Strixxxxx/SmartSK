import React, { useEffect } from 'react';
import { FaCheckCircle } from 'react-icons/fa';

interface FPSuccessProps {
  onBackToLogin: () => void;
}

const FPSuccess: React.FC<FPSuccessProps> = ({ onBackToLogin }) => {
  useEffect(() => {
    // Add animation class after component mounts
    const successIcon = document.querySelector('.success-icon');
    if (successIcon) {
      setTimeout(() => {
        successIcon.classList.add('animate');
      }, 100);
    }
  }, []);

  return (
    <div className="fp-step success-step">
      <div className="success-icon-container">
        <div className="success-icon">
          <FaCheckCircle />
        </div>
      </div>
      <h3>Password Reset Successful!</h3>
      <p>Your password has been updated successfully. You can now log in with your new password.</p>
      <button onClick={onBackToLogin} className="login-button">
        Back to Homepage
      </button>
    </div>
  );
};

export default FPSuccess;