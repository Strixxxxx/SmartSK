import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import CreatePostModal from './CreatePostModal';
import DashboardFeed from './DashboardFeed';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refreshFeed, setRefreshFeed] = useState(false);

    useEffect(() => {
        if (!user) {
            navigate('/home', { replace: true });
        }
    }, [user, navigate]);

    const handlePostCreated = () => {
        setRefreshFeed(prev => !prev); // Toggle refresh state to trigger re-fetch in DashboardFeed
    };

    return (
        <div className="dashboard-content">
            <div className="dashboard-header">
                <h2>Welcome to Smart SK Dashboard</h2>
                <button onClick={() => setIsModalOpen(true)} className="create-post-btn">Create Post</button>
            </div>

            {isModalOpen && (
                <CreatePostModal
                    onClose={() => setIsModalOpen(false)}
                    onPostCreated={handlePostCreated}
                />
            )}

            <div className="dashboard-main-content">
                <h3>Recent Project Posts</h3>
                <DashboardFeed refreshFeed={refreshFeed} />
            </div>
        </div>
    );
};

export default Dashboard;