import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './AppRoutes';
import './App.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './backend connection/axiosConfig'; // Import axios config for interceptors
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

const App: React.FC = () => {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Router>
        <AuthProvider>
          <AppRoutes />
          <ToastContainer />
        </AuthProvider>
      </Router>
    </LocalizationProvider>
  );
};

export default App;
