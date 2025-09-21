import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FPUsername from './FPUsername';
import FPOTP from './FPOTP';
import FPChange from './FPChange';
import FPSuccess from './FPSuccess';
import './ForgotPassword.css';

const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  const handleUsernameSubmit = async (submittedUsername: string) => {
    try {
      setError('');
      const response = await fetch('http://localhost:3000/api/forgotpassword/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: submittedUsername }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setUsername(submittedUsername);
        setStep(2); // Move to OTP step
      } else {
        setError(data.message || 'Failed to send OTP. Please try again.');
      }
    } catch (error) {
      console.error('Error requesting password reset:', error);
      setError('An error occurred. Please try again later.');
    }
  };

  const handleOTPSubmit = async (submittedOTP: string) => {
    try {
      setError('');
      const response = await fetch('http://localhost:3000/api/forgotpassword/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, otp: submittedOTP }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setOtp(submittedOTP);
        setStep(3); // Move to change password step
      } else {
        setError(data.message || 'Invalid OTP. Please try again.');
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      setError('An error occurred. Please try again later.');
    }
  };

  const handlePasswordChange = async (password: string) => {
    try {
      setError('');
      const response = await fetch('http://localhost:3000/api/forgotpassword/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, otp, newPassword: password }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setNewPassword(password);
        setStep(4); // Move to success step
      } else {
        setError(data.message || 'Failed to reset password. Please try again.');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      setError('An error occurred. Please try again later.');
    }
  };

  const handleBackToLogin = () => {
    navigate('/login');
  };

  return (
    <div className="forgot-password-container">
      <div className="forgot-password-card">
        <h2>Password Recovery</h2>
        {error && <div className="error-message">{error}</div>}
        
        {step === 1 && <FPUsername onSubmit={handleUsernameSubmit} />}
        {step === 2 && <FPOTP onSubmit={handleOTPSubmit} username={username} />}
        {step === 3 && <FPChange onSubmit={handlePasswordChange} />}
        {step === 4 && <FPSuccess onBackToLogin={handleBackToLogin} />}
      </div>
    </div>
  );
};

export default ForgotPassword;