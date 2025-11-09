import React, { useState, useEffect } from 'react';
import { Box, TextField, Typography, List, ListItem, ListItemIcon, ListItemText, InputAdornment, IconButton } from '@mui/material';
import { CheckCircle, Cancel, Visibility, VisibilityOff } from '@mui/icons-material';
import './steps.css';

interface PasswordStepProps {
  password: any;
  confirmPassword: any;
  setFormData: (data: any) => void;
  criteria: any;
  setCriteria: (criteria: any) => void;
}

const PasswordStep: React.FC<PasswordStepProps> = ({ password, confirmPassword, setFormData, criteria, setCriteria }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const newCriteria = {
      length: password.length >= 8 && password.length <= 16,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      match: password && password === confirmPassword,
    };
    setCriteria(newCriteria);
  }, [password, confirmPassword, setCriteria]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const Requirement: React.FC<{ text: string; valid: boolean }> = ({ text, valid }) => (
    <ListItem className={`requirement ${valid ? 'valid' : ''}`} sx={{ p: 0 }}>
      <ListItemIcon sx={{ minWidth: '30px' }}>
        {valid ? <CheckCircle fontSize="small" color="success" /> : <Cancel fontSize="small" color="error" />}
      </ListItemIcon>
      <ListItemText primary={text} sx={{ m: 0 }} />
    </ListItem>
  );

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Set Your Password</Typography>
      <TextField
        label="Password"
        name="password"
        type={showPassword ? 'text' : 'password'}
        value={password}
        onChange={handleChange}
        fullWidth
        margin="normal"
        required
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle password visibility"
                onClick={() => setShowPassword(!showPassword)}
                edge="end"
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <TextField
        label="Confirm Password"
        name="confirmPassword"
        type={showConfirmPassword ? 'text' : 'password'}
        value={confirmPassword}
        onChange={handleChange}
        fullWidth
        margin="normal"
        required
        error={password && confirmPassword && !criteria.match}
        helperText={password && confirmPassword && !criteria.match ? "Passwords do not match." : ""}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle confirm password visibility"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                edge="end"
              >
                {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <List className="password-requirements">
        <Requirement text="8-16 characters long" valid={criteria.length} />
        <Requirement text="Contains an uppercase letter" valid={criteria.uppercase} />
        <Requirement text="Contains a lowercase letter" valid={criteria.lowercase} />
        <Requirement text="Contains a number" valid={criteria.number} />
        <Requirement text="Contains a special character" valid={criteria.specialChar} />
        <Requirement text="Passwords match" valid={criteria.match} />
      </List>
    </Box>
  );
};

export default PasswordStep;