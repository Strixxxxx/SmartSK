import React from 'react';
import { useOutletContext } from 'react-router-dom';
import './DashboardAdmin.css';

interface DashboardAdminProps {}

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const DashboardAdmin: React.FC<DashboardAdminProps> = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  return (
    <div className={`dashboard-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="dashboard-content">
        <div className="dashboard-header">
          <h1 className="dashboard-title">Admin Dashboard</h1>
          <div className="dashboard-subtitle">
            Welcome to the Admin Dashboard! Manage your system with ease.
          </div>
        </div>
        
        <div className="dashboard-grid">
          <div className="dashboard-card">
            <div className="card-icon">📊</div>
            <div className="card-content">
              <h3>Analytics</h3>
              <p>View system analytics and performance metrics</p>
              <div className="card-stats">
                <span className="stat-number">1,234</span>
                <span className="stat-label">Total Users</span>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card">
            <div className="card-icon">👥</div>
            <div className="card-content">
              <h3>User Management</h3>
              <p>Manage user accounts and permissions</p>
              <div className="card-stats">
                <span className="stat-number">56</span>
                <span className="stat-label">Active Sessions</span>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card">
            <div className="card-icon">🔧</div>
            <div className="card-content">
              <h3>System Settings</h3>
              <p>Configure system preferences and options</p>
              <div className="card-stats">
                <span className="stat-number">98%</span>
                <span className="stat-label">System Health</span>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card">
            <div className="card-icon">📈</div>
            <div className="card-content">
              <h3>Reports</h3>
              <p>Generate and view detailed system reports</p>
              <div className="card-stats">
                <span className="stat-number">24</span>
                <span className="stat-label">Reports Today</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="dashboard-widgets">
          <div className="widget-large">
            <h3>Recent Activity</h3>
            <div className="activity-list">
              <div className="activity-item">
                <div className="activity-icon">✅</div>
                <div className="activity-details">
                  <div className="activity-title">User account created</div>
                  <div className="activity-time">2 minutes ago</div>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon">🔄</div>
                <div className="activity-details">
                  <div className="activity-title">System backup completed</div>
                  <div className="activity-time">15 minutes ago</div>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon">⚠️</div>
                <div className="activity-details">
                  <div className="activity-title">Security alert resolved</div>
                  <div className="activity-time">1 hour ago</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="widget-small">
            <h3>Quick Actions</h3>
            <div className="quick-actions">
              <button className="action-btn primary">Create User</button>
              <button className="action-btn secondary">Generate Report</button>
              <button className="action-btn tertiary">System Backup</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardAdmin;