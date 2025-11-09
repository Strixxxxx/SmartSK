import React, { useState } from 'react';
import { termsAndConditionsText, privacyPolicyText } from '../../Legal/LegalText';
import LegalTextViewer from './LegalTextViewer';
import { Box, Typography, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormGroup, FormControlLabel, Checkbox } from '@mui/material';

interface TermsStepProps {
  termsAccepted: boolean;
  setTermsAccepted: (accepted: boolean) => void;
  policyAccepted: boolean;
  setPolicyAccepted: (accepted: boolean) => void;
}

const TermsStep: React.FC<TermsStepProps> = ({ termsAccepted, setTermsAccepted, policyAccepted, setPolicyAccepted }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState({ title: '', content: '', type: '' });
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  const handleOpen = (type: 'terms' | 'policy') => {
    if (type === 'terms') {
      setModalContent({ title: 'Terms and Conditions', content: termsAndConditionsText, type: 'terms' });
    } else {
      setModalContent({ title: 'Privacy Policy', content: privacyPolicyText, type: 'policy' });
    }
    setScrolledToEnd(false); // Reset scroll state when opening a new modal
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    // Check if scrolled to the bottom (with a small buffer for precision issues)
    if (scrollHeight - scrollTop <= clientHeight + 1) {
      setScrolledToEnd(true);
    }
  };

  const handleAccept = () => {
    if (modalContent.type === 'terms') {
      setTermsAccepted(true);
    } else if (modalContent.type === 'policy') {
      setPolicyAccepted(true);
    }
    handleClose();
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Legal Agreements</Typography>
      <Typography variant="body1" color="textSecondary" sx={{ mb: 2 }}>
        Please read and accept our terms and policies to complete your registration.
      </Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
        <Button variant="outlined" onClick={() => handleOpen('terms')}>
          Read Terms and Conditions
        </Button>
        <Button variant="outlined" onClick={() => handleOpen('policy')}>
          Read Privacy Policy
        </Button>
      </Box>

      <FormGroup>
        <FormControlLabel 
          control={<Checkbox checked={termsAccepted} disabled />} 
          label="I have read and agree to the Terms and Conditions." 
        />
        <FormControlLabel 
          control={<Checkbox checked={policyAccepted} disabled />} 
          label="I have read and agree to the Privacy Policy." 
        />
      </FormGroup>

      <Dialog open={modalOpen} onClose={handleClose} scroll="paper" fullWidth={true} maxWidth="lg">
        <DialogTitle>{modalContent.title}</DialogTitle>
        <DialogContent dividers onScroll={handleScroll}>
          <LegalTextViewer text={modalContent.content} />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button onClick={handleAccept} disabled={!scrolledToEnd} variant="contained">
            Accept
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TermsStep;
