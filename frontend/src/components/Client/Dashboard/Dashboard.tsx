import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import ProjectNotificationBell from './ProjectNotificationBell';
import ProjectTrackerList from './ProjectTrackerList';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!user) {
            navigate('/home', { replace: true });
        }
    }, [user, navigate]);

    return (
        <div className="dashboard-content">
            <div className="dashboard-header">
                <h2>Welcome to Smart SK Dashboard</h2>
                <div className="dashboard-header-buttons">
                    <ProjectNotificationBell />
                </div>
            </div>

            <div className="dashboard-main-content">
                {/* Project Tracking Section */}
                <ProjectTrackerList />
            </div>
        </div>
    );
};

export default Dashboard;