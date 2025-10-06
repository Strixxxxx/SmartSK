import React, { useState, useEffect, useRef, useCallback } from 'react';
import axiosInstance from '../../backend connection/axiosConfig';
import { AxiosError } from 'axios';

interface FPOTPProps {
  onSubmit: (otp: string) => void;
  username: string;
}

const FPOTP: React.FC<FPOTPProps> = ({ onSubmit, username }) => {
  const [otpValues, setOtpValues] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(60); // 1 minute in seconds
  const [canResend, setCanResend] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));
  
  // Create a stable ref callback using useCallback
  const setInputRef = useCallback((index: number) => (el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  }, []);

  useEffect(() => {
    // Initialize refs array
    inputRefs.current = inputRefs.current.slice(0, 6);
    
    // Focus the first input on component mount
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timer);
          setCanResend(true);
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleInputChange = (index: number, value: string) => {
    // Only allow numbers
    if (!/^\d*$/.test(value)) return;

    // Update the OTP values array
    const newOtpValues = [...otpValues];
    newOtpValues[index] = value;
    setOtpValues(newOtpValues);

    // If a digit was entered and there's a next input, focus it
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // No auto-submission - let user click the verify button
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (!otpValues[index] && index > 0) {
        // If current input is empty and backspace is pressed, focus previous input
        inputRefs.current[index - 1]?.focus();
      }
    }
    
    // Handle left arrow key
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    
    // Handle right arrow key
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    
    // Check if pasted content is a 6-digit number
    if (/^\d{6}$/.test(pastedData)) {
      const digits = pastedData.split('');
      setOtpValues(digits);
      
      // Focus the last input
      inputRefs.current[5]?.focus();
    }
  };

  const handleSubmit = () => {
    const otp = otpValues.join('');
    
    try {
      setIsSubmitting(true);
      setError('');
      
      onSubmit(otp);
    } catch (error) {
      console.error('Error submitting OTP:', error);
      setError('An error occurred. Please try again.');
    }
    finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      setIsResending(true);
      const response = await axiosInstance.post('/api/forgotpassword/request', { username });

      if (response.data.success) {
        setTimeLeft(60); // Reset timer to 1 minute
        setCanResend(false);
        setError('');
        setOtpValues(Array(6).fill('')); // Clear OTP fields
        
        // Focus the first input
        if (inputRefs.current[0]) {
          inputRefs.current[0].focus();
        }
        
        alert('A new verification code has been sent to your email.');
      } else {
        setError(response.data.message || 'Failed to resend verification code. Please try again.');
      }
    } catch (error) {
      console.error('Error resending OTP:', error);
      const axiosError = error as AxiosError<{ message?: string }>;
      setError(axiosError.response?.data?.message || 'An error occurred. Please try again later.');
    }
    finally {
      setIsResending(false);
    }
  };

  return (
    <div className="fp-step">
      <p>We've sent a verification code to your email. Please enter it below.</p>
      
      <div className="otp-container">
        {Array(6).fill(0).map((_, index) => (
          <input
            key={index}
            type="text"
            maxLength={1}
            value={otpValues[index]}
            onChange={(e) => handleInputChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            ref={setInputRef(index)}
            className="otp-input"
            autoComplete="off"
          />
        ))}
      </div>
      
      {error && <div className="input-error">{error}</div>}
      
      <div className="timer">
        {timeLeft > 0 ? (
          <>Time remaining: {formatTime(timeLeft)}</>
        ) : (
          <>Verification code expired. Please request a new one.</>
        )}
      </div>
      
      <button type="button" className="fp-continue-btn" onClick={handleSubmit}>
        {isSubmitting ? 'Verifying...' : 'Verify Code'}
      </button>
      
      <button 
        type="button" 
        className={`resend-button ${!canResend ? 'disabled' : ''}`} 
        onClick={handleResendOTP}
        disabled={!canResend || isResending}
      >
        {isResending ? 'Sending...' : 'Resend Code'}
      </button>
    </div>
  );
};

export default FPOTP;