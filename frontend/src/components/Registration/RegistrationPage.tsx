import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import axiosInstance from '../../backend connection/axiosConfig';
import {
  Container,
  Paper,
  Typography,
  Box,
  CircularProgress,
  Stepper,
  Step,
  StepLabel,
  Button
} from '@mui/material';
import './RegistrationPage.css';

// Import step components
import UsernameStep from './steps/UsernameStep';
import PasswordStep from './steps/PasswordStep';
import InfoStep from './steps/InfoStep';
import TermsStep from './steps/TermsStep';

const steps = ['Choose Username', 'Set Password', 'Your Information', 'Terms & Conditions'];

const RegistrationPage: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    barangay: '',
    emailAddress: '',
    phoneNumber: '',
    dateOfBirth: '',
  });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<any>({});
  
  // State for password validation checklist
  const [passwordCriteria, setPasswordCriteria] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    specialChar: false,
    match: false,
  });

  // State for terms and conditions
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const navigate = useNavigate();

  const handleNext = async () => {
    setLoading(true);
    let isValid = false;

    if (activeStep === 0) { // Username Step
      if (!formData.username) {
        setErrors({ username: 'Username is required.' });
        setLoading(false);
        return;
      }
      try {
        const response = await axiosInstance.post('/api/register/validate-field', { field: 'username', value: formData.username });
        if (response.data.exists) {
          setErrors({ username: 'Username Already Exists, Please Try Again.' });
        } else {
          setErrors({});
          isValid = true;
        }
      } catch (error) {
        toast.error('Could not verify username. Please try again later.');
      }
    } else if (activeStep === 1) { // Password Step
        // Validation is handled by disabling the button, so if we get here, it's valid.
        isValid = Object.values(passwordCriteria).every(Boolean);
    } else if (activeStep === 2) { // Info Step
        const piiErrors: any = {};
        if (!formData.fullName) piiErrors.fullName = 'Full name is required.';
        if (!formData.barangay) piiErrors.barangay = 'Barangay is required.';
        if (!formData.emailAddress) piiErrors.emailAddress = 'Email address is required.';
        if (!formData.phoneNumber) piiErrors.phoneNumber = 'Phone number is required.';
        if (!formData.dateOfBirth) piiErrors.dateOfBirth = 'Date of birth is required.';
        if (!attachment) piiErrors.attachment = 'ID attachment is required.';
        
        setErrors(piiErrors);
        isValid = Object.keys(piiErrors).length === 0;
    }

    setLoading(false);
    if (isValid) {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    const data = new FormData();
    Object.keys(formData).forEach(key => {
      data.append(key, formData[key as keyof typeof formData]);
    });
    if (attachment) {
      data.append('attachment', attachment);
    }

    try {
      const response = await axiosInstance.post('/api/register', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.status === 202) {
        toast.success('Registration submitted! Please check your email for updates.');
        navigate('/home');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'An unexpected error occurred.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getStepContent = (step: number) => {
    switch (step) {
      case 0:
        return <UsernameStep 
                    username={formData.username} 
                    setUsername={(username) => setFormData({...formData, username})}
                    error={errors.username} 
                />;
      case 1:
        return <PasswordStep 
                    password={formData.password}
                    confirmPassword={formData.confirmPassword}
                    setFormData={setFormData}
                    criteria={passwordCriteria}
                    setCriteria={setPasswordCriteria}
                />;
      case 2:
        return <InfoStep 
                    formData={formData}
                    setFormData={setFormData}
                    attachment={attachment}
                    setAttachment={setAttachment}
                    errors={errors}
                    setErrors={setErrors}
                />;
      case 3:
        return <TermsStep 
                    termsAccepted={termsAccepted}
                    setTermsAccepted={setTermsAccepted}
                    policyAccepted={policyAccepted}
                    setPolicyAccepted={setPolicyAccepted}
                />;
      default:
        return 'Unknown step';
    }
  };

  const isNextDisabled = () => {
      if (activeStep === 1) {
          return !Object.values(passwordCriteria).every(Boolean);
      }
      // Add logic for other steps if needed
      return false;
  }

  const isSubmitDisabled = () => {
      // Final submission disabled until all fields are valid and terms are accepted
      return !termsAccepted || !policyAccepted || loading;
  }

  return (
    <div className="registration-page-container">
      <Container maxWidth="md">
        <Paper elevation={6} className="registration-paper">
          <Typography variant="h4" component="h1" className="registration-title">
            Create Your SmartSK Account
          </Typography>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          
          <Box>
            {getStepContent(activeStep)}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 4 }}>
            <Typography variant="body2">
              <Link to="/" style={{ textDecoration: 'none', color: '#1976d2' }}>
                Already have an account?
              </Link>
            </Typography>
            <div>
              <Button
                disabled={activeStep === 0}
                onClick={handleBack}
                sx={{ mr: 1 }}
              >
                Back
              </Button>
              {activeStep === steps.length - 1 ? (
                <Button variant="contained" color="primary" onClick={handleSubmit} disabled={isSubmitDisabled()}>
                  {loading ? <CircularProgress size={24} /> : 'Submit Registration'}
                </Button>
              ) : (
                <Button variant="contained" onClick={handleNext} disabled={loading || isNextDisabled()}>
                  {loading ? <CircularProgress size={24} /> : 'Next'}
                </Button>
              )}
            </div>
          </Box>
        </Paper>
      </Container>
    </div>
  );
};

export default RegistrationPage;