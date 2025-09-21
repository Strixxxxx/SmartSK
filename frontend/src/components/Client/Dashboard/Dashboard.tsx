import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import './Dashboard.css';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is logged in
    if (!user) {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  return (
    <div className="dashboard-content">
      <h2>Welcome to Smart SK Dashboard</h2>
      <div className="dashboard-cards">
        <div className="dashboard-card">
          <h3>Projects</h3>
          <p>View and manage your projects</p>
        </div>
        <div className="dashboard-card">
          <h3>Tasks</h3>
          <p>Track your assigned tasks</p>
        </div>
        <div className="dashboard-card">
          <h3>Reports</h3>
          <p>Generate and view reports</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;