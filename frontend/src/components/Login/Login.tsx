import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Login.css';
import { toast } from 'react-toastify';
import NewAccount from './NewAccount';
import { Modal, Box } from '@mui/material';



interface NewAccountData {
  userID: number;
  currentUsername: string;
}

interface LoginProps {
  open: boolean;
  onClose: () => void;
  barangay: string;
}

const style = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 'auto',
  bgcolor: 'background.paper',
  boxShadow: 24,
  p:20,
  borderRadius: 2,
  zIndex: 1300,
};

const Login: React.FC<LoginProps> = ({ open, onClose, barangay }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [newAccountData, setNewAccountData] = useState<NewAccountData | null>(null);
  const navigate = useNavigate();
  const { login, logout } = useAuth();

  useEffect(() => {
    if (!open) {
      setUsername('');
      setPassword('');
      setShowPassword(false);
      setLoading(false);
    }
  }, [open]);

  const validateInput = () => {
    if (!username.trim()) {
      toast.error('Username is required');
      return false;
    }
    if (!password.trim()) {
      toast.error('Password is required');
      return false;
    }
    if (!barangay) {
      toast.error('Barangay is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateInput()) {
      return;
    }

    setLoading(true);

    try {
      const result = await login(username.trim(), password.trim(), barangay);

      if (result.success && result.user) {
        if (result.user.isDefaultPassword) {
          setNewAccountData({ userID: result.user.id, currentUsername: result.user.username });
          setIsNewAccountModalOpen(true);
        }
        else {
          const userPosition = result.user.position;
          const userRole = result.user.role;
          const isAdmin = userPosition === 'MA' || 
                          userPosition === 'SA' || 
                          userRole === 'MA' || 
                          userRole === 'SA' ||
                          userPosition?.toLowerCase().includes('admin');
          
          if (isAdmin) {
            navigate('/admin/dashboard');
          } else {
            navigate('/dashboard');
          }
          onClose(); // Close login modal on success
        }
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally { 
      setLoading(false);
    }
  };

  const handleNewAccountClose = () => {
    setIsNewAccountModalOpen(false);
    setNewAccountData(null);
    logout();
    onClose(); // Close login modal after new account setup
  };

  return (
    <Modal 
      open={open} 
      onClose={onClose}
      slotProps={{
        backdrop: {
          style: {
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            zIndex: 1100,
          },
        },
      }}
    >
      <Box sx={style}>
        <div className="login-form-container">
          <div className="login-header">
            <h1>Welcome Back</h1>
            <p>Sign in to your account to continue</p>
            {barangay && <p className="barangay-display">Logging in to: <strong>{barangay}</strong></p>}
          </div>

          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                autoComplete="off"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="toggle-password"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <span className="material-icons">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <div className="form-links">
              <Link to="/forgot-password">Forgot Password?</Link>
            </div>

            <button 
              type="submit" 
              className="login-button"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
        
        {newAccountData && (
          <NewAccount 
            open={isNewAccountModalOpen} 
            onClose={handleNewAccountClose} 
            userID={newAccountData.userID} 
            currentUsername={newAccountData.currentUsername} 
          />
        )}
      </Box>
    </Modal>
  );
};

export default Login;
