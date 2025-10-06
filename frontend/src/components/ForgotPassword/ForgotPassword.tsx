import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FPUsername from './FPUsername';
import FPOTP from './FPOTP';
import FPChange from './FPChange';
import FPSuccess from './FPSuccess';
import './ForgotPassword.css';
import axiosInstance from '../../backend connection/axiosConfig';
import { AxiosError } from 'axios';

const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState<string>('');
  const [otp, setOtp] = useState<string>('');
  const [, setNewPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const navigate = useNavigate();

  const handleUsernameSubmit = async (submittedUsername: string) => {
    try {
      setError('');
      const response = await axiosInstance.post('/api/forgotpassword/request', { username: submittedUsername });

      if (response.data.success) {
        setUsername(submittedUsername);
        setStep(2); // Move to OTP step
      } else {
        setError(response.data.message || 'Failed to send OTP. Please try again.');
      }
    } catch (err) {
      console.error('Error requesting password reset:', err);
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'An error occurred. Please try again later.');
    }
  };

  const handleOTPSubmit = async (submittedOTP: string) => {
    try {
      setError('');
      const response = await axiosInstance.post('/api/forgotpassword/verify-otp', { username, otp: submittedOTP });

      if (response.data.success) {
        setOtp(submittedOTP);
        setStep(3); // Move to change password step
      } else {
        setError(response.data.message || 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      console.error('Error verifying OTP:', err);
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'An error occurred. Please try again later.');
    }
  };

  const handlePasswordChange = async (password: string) => {
    try {
      setError('');
      const response = await axiosInstance.post('/api/forgotpassword/reset', { username, otp, newPassword: password });

      if (response.data.success) {
        setNewPassword(password);
        setStep(4); // Move to success step
      } else {
        setError(response.data.message || 'Failed to reset password. Please try again.');
      }
    } catch (err) {
      console.error('Error resetting password:', err);
      const axiosError = err as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'An error occurred. Please try again later.');
    }
  };

  const handleBackToLogin = () => {
    navigate('/home');
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