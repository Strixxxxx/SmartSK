import React, { useState, useEffect } from 'react';
import axiosInstance from '../../backend connection/axiosConfig';
import { useWebSocket } from '../../context/WebSocketContext';
import Maintenance from './Maintenance';

interface MaintenanceHandlerProps {
    children: React.ReactNode;
}

const MaintenanceHandler: React.FC<MaintenanceHandlerProps> = ({ children }) => {
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [checkingMaintenance, setCheckingMaintenance] = useState(true);
    const { maintenanceMessage } = useWebSocket();

    useEffect(() => {
        const checkMaintenanceStatus = async () => {
            try {
                const response = await axiosInstance.get('/api/maintenance-status');
                if (response.data.maintenance) {
                    setMaintenanceMode(true);
                } else {
                    setMaintenanceMode(false);
                }
            } catch (error) {
                console.error('Failed to check maintenance status:', error);
                setMaintenanceMode(false);
            } finally {
                setCheckingMaintenance(false);
            }
        };

        checkMaintenanceStatus();
        const interval = setInterval(checkMaintenanceStatus, 30000); // Poll every 30 seconds as a fallback
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (maintenanceMessage?.type === 'maintenance_ended') {
            setMaintenanceMode(false);
            // Reload to clear state and force re-authentication.
            window.location.reload();
        }
        if (maintenanceMessage?.type === 'maintenance_starting') {
            setMaintenanceMode(true);
        }
    }, [maintenanceMessage]);

    if (checkingMaintenance) {
        return <div>Loading...</div>; // Or a global spinner
    }

    if (maintenanceMode) {
        return <Maintenance />;
    }

    return <>{children}</>;
};

export default MaintenanceHandler;
