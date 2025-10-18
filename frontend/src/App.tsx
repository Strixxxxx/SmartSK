import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext'; // Import WebSocketProvider
import MaintenanceBanner from './components/MaintenanceBanner/MaintenanceBanner'; // Import MaintenanceBanner
import AppRoutes from './AppRoutes';
import './App.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './backend connection/axiosConfig'; // Import axios config for interceptors
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import MaintenanceHandler from './components/MaintenanceBanner/MaintenanceHandler';

const App: React.FC = () => {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Router>
        <WebSocketProvider>
          {/* MaintenanceHandler should be at the TOP LEVEL */}
          <MaintenanceHandler>
            <AuthProvider>
              <MaintenanceBanner />
              <AppRoutes />
              <ToastContainer />
            </AuthProvider>
          </MaintenanceHandler>
        </WebSocketProvider>
      </Router>
    </LocalizationProvider>
  );
};

export default App;
