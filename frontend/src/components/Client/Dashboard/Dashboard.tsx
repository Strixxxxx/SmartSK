import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import ProjectNotificationBell from './ProjectNotificationBell';
import ProjectTrackerList from './ProjectTrackerList';
import InitializeCycleModal from './InitializeCycleModal';
import axiosInstance from '../../../backend connection/axiosConfig';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isInitModalOpen, setIsInitModalOpen] = useState(false);
    const [hasActiveCycle, setHasActiveCycle] = useState<boolean>(true); // Default to true to prevent flash

    useEffect(() => {
        if (!user) {
            navigate('/home', { replace: true });
            return;
        }

        const checkActiveCycle = async () => {
            try {
                const res = await axiosInstance.get('/api/project-tracker/active-cycle');
                setHasActiveCycle(!!res.data.data);
            } catch (err) {
                console.error("Failed to check active cycle", err);
            }
        };

        checkActiveCycle();
        const interval = setInterval(checkActiveCycle, 5000);
        return () => clearInterval(interval);
    }, [user, navigate]);

    // Only the SK Chairperson (SKC) may initialize a project cycle
    const isSKC =
        user?.role === 'SKC' ||
        user?.position?.toUpperCase() === 'SKC' ||
        user?.position?.toLowerCase().includes('chairperson');

    return (
        <div className="dashboard-content">
            <div className="dashboard-header">
                <h2>Welcome to Smart SK Dashboard</h2>
                <div className="dashboard-header-buttons">
                    {isSKC && !hasActiveCycle && (
                        <button
                            id="init-cycle-dashboard-btn"
                            className="create-post-btn"
                            onClick={() => setIsInitModalOpen(true)}
                            title="Initialize a new Annual Project Cycle (Checkpoint 1: Youth Profiling)"
                        >
                            + Initialize Annual Project Cycle
                        </button>
                    )}
                    <ProjectNotificationBell />
                </div>
            </div>

            <div className="dashboard-main-content">
                {/* Project Tracking Section */}
                <ProjectTrackerList />
            </div>

            {/* Annual Project Cycle Initializer Modal — SKC only */}
            <InitializeCycleModal
                open={isInitModalOpen}
                onClose={() => setIsInitModalOpen(false)}
            />
        </div>
    );
};

export default Dashboard;