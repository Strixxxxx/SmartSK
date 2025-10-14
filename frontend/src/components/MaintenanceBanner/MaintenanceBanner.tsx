import React, { useEffect, useState } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import './MaintenanceBanner.css';

const MaintenanceBanner: React.FC = () => {
  const { maintenanceMessage } = useWebSocket();
  const { logout } = useAuth();
  const [visible, setVisible] = useState(false);
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (maintenanceMessage) {
      setVisible(true);
      if (maintenanceMessage.type === 'maintenance_starting') {
        toast.warn(`Server is restarting for maintenance. You will be logged out in 10 seconds.`, {
          position: "top-center",
          autoClose: 10000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
        });
        setCountdown(10);
        const countdownInterval = setInterval(() => {
          setCountdown(prev => prev - 1);
        }, 1000);

        const logoutTimer = setTimeout(() => {
          logout();
        }, 10000);

        return () => {
          clearInterval(countdownInterval);
          clearTimeout(logoutTimer);
        };
      } else if (maintenanceMessage.type === 'maintenance_ended') {
        toast.success('Server maintenance is complete. You may log in now.', {
          position: "top-center",
          autoClose: 15000,
        });
      }
    } else {
      setVisible(false);
    }
  }, [maintenanceMessage, logout]);

  if (!maintenanceMessage) {
    return null;
  }

  const getMessage = () => {
    if (maintenanceMessage.type === 'maintenance_starting') {
      return `Server is restarting for maintenance. You will be logged out in ${countdown} seconds.`;
    }
    if (maintenanceMessage.type === 'maintenance_ended') {
      return 'Server maintenance is complete. You may log in now.';
    }
    return '';
  };

  return (
    <div className={`maintenance-banner ${maintenanceMessage.type} ${visible ? 'visible' : ''}`}>
      <p>{getMessage()}</p>
    </div>
  );
};

export default MaintenanceBanner;
