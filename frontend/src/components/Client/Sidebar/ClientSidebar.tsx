import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { FaBars } from 'react-icons/fa';
import './Sidebar.css';
import logo from '../../../assets/logo_SB.png';
import { formatRoleName } from '../../../utils/roleUtils';

interface SidebarProps {
  collapsed?: boolean;
  toggleSidebar?: () => void;
}

const ClientSidebar: React.FC<SidebarProps> = ({ 
  collapsed: propCollapsed = false,
  toggleSidebar: propToggleSidebar
}) => {
  // Use local state if no prop is provided
  const [localCollapsed, setLocalCollapsed] = useState(propCollapsed);
  
  // Determine if we're using props or local state
  const collapsed = propToggleSidebar ? propCollapsed : localCollapsed;
  
  const toggleSidebar = () => {
    if (propToggleSidebar) {
      propToggleSidebar();
    } else {
      setLocalCollapsed(!localCollapsed);
    }
  };
  
  const { user, logout } = useAuth();
  const location = useLocation();

  // Function to check if a menu item is active
  const isActive = (path: string) => {
    return location.pathname === path;
  };

  // Handle logout with token expiration
  const handleLogout = async () => {
    try {
      // Then perform the regular logout
      logout();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error during logout:', error);
      // Still perform logout even if the API call fails
      logout();
    }
  };

  return (
    <div className={`client-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="client-sidebar-header">
        <button className="client-sidebar-toggle" onClick={toggleSidebar}>
          <FaBars />
        </button>
        {!collapsed && (
          <div className="client-header-content">
            <img src={logo} alt="Smart SK Logo" className="client-sidebar-logo" />
          </div>
        )}
      </div>
      
      {!collapsed && (
        <>
          <div className="client-user-info">
            <div className="client-user-name">{user?.fullName || user?.username || 'User'}</div>
            <div className="client-user-role">{formatRoleName(user?.position)}</div>
          </div>
          
          <nav className="client-sidebar-nav">
            <ul>
              <li className={isActive('/dashboard') ? 'active' : ''}>
                <Link to="/dashboard" title="Dashboard">
                  Dashboard
                </Link>
              </li>
              
              <li className={isActive('/projects') ? 'active' : ''}>
                <Link to="/projects" title="Projects">
                  Projects
                </Link>
              </li>
              
              {user?.role === 'SKC' && (
                <li className={isActive('/access-control') ? 'active' : ''}>
                  <Link to="/access-control" title="Access Control">
                    Access Control
                  </Link>
                </li>
              )}

              <li className={isActive('/predictive-analytics') ? 'active' : ''}>
                <Link to="/predictive-analytics" title="Predictive Project Analysis">
                  Predictive Project Analysis
                </Link>
              </li>
              
              <li className={isActive('/forecast') ? 'active' : ''}>
                <Link to="/forecast" title="Budget Forecasting">
                  Budget Forecasting
                </Link>
              </li>
            </ul>
          </nav>
          
          <div className="client-sidebar-footer">
            <button className="client-logout-button" onClick={handleLogout} title="Logout">
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ClientSidebar;