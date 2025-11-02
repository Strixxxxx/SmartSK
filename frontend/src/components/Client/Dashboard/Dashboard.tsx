import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import CreatePostModal from './CreatePostModal';
import ManagePostModal from '../ManagePost/ManagePostModal'; // Updated path
import DashboardFeed from './DashboardFeed';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false); // New state for manage modal
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
                <div className="dashboard-header-buttons">
                    <button onClick={() => setIsManageModalOpen(true)} className="manage-post-btn">Manage Posts</button>
                    <button onClick={() => setIsCreateModalOpen(true)} className="create-post-btn">Create Post</button>
                </div>
            </div>

            {isCreateModalOpen && (
                <CreatePostModal
                    onClose={() => setIsCreateModalOpen(false)}
                    onPostCreated={handlePostCreated}
                />
            )}

            {isManageModalOpen && (
                <ManagePostModal
                    onClose={() => setIsManageModalOpen(false)}
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