import React from 'react';
import { TextField, Box } from '@mui/material';

interface UsernameStepProps {
  username: string;
  setUsername: (username: string) => void;
  error: string;
}

const UsernameStep: React.FC<UsernameStepProps> = ({ username, setUsername, error }) => {
  return (
    <Box>
      <TextField
        label="Username"
        name="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        error={!!error}
        helperText={error || "Choose a unique username for your account."}
        fullWidth
        margin="normal"
        required
        autoFocus
      />
    </Box>
  );
};

export default UsernameStep;
