import React, { useState, useEffect } from 'react';
import { publicAxiosInstance } from '../../backend connection/axiosConfig';
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
                const response = await publicAxiosInstance.get('/api/maintenance-status');
                setMaintenanceMode(response.data.maintenance);
            } catch (error) {
                console.error('Failed to check maintenance status:', error);
                setMaintenanceMode(false);
            } finally {
                setCheckingMaintenance(false);
            }
        };

        checkMaintenanceStatus();
        const interval = setInterval(checkMaintenanceStatus, 10000); // Poll every 10 seconds
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (maintenanceMessage?.type === 'maintenance_ended') {
            setMaintenanceMode(false);
            window.location.reload();
        }
        if (maintenanceMessage?.type === 'maintenance_starting') {
            setMaintenanceMode(true);
        }
    }, [maintenanceMessage]);

    if (checkingMaintenance) {
        return <div>Loading...</div>;
    }

    if (maintenanceMode) {
        return <Maintenance />;
    }

    return <>{children}</>;
};

export default MaintenanceHandler;
