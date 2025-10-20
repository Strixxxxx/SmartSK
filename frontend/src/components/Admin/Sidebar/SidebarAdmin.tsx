import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { FaBars } from 'react-icons/fa';
import './Sidebar.css';
import logo from '../../../assets/logo_SB.png';

interface SidebarProps {
  collapsed?: boolean;
  toggleSidebar?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  collapsed = false,
  toggleSidebar,
}) => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleLogout = async () => {
    try {
      logout();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error during logout:', error);
      logout();
    }
  };

  return (
    <div className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="admin-sidebar-header">
        <button className="admin-sidebar-toggle" onClick={toggleSidebar}>
          <FaBars />
        </button>
        {!collapsed && (
          <div className="admin-header-content">
            <img src={logo} alt="Smart SK Logo" className="admin-sidebar-logo" />
          </div>
        )}
      </div>
      
      {!collapsed && (
        <>
          <div className="admin-user-info">
            <div className="admin-user-name">{user?.fullName || user?.username || 'Admin'}</div>
            <div className="admin-user-role">{user?.position || 'Admin'}</div>
          </div>
          
          <nav className="admin-sidebar-nav">
            <ul>
              <li className={isActive('/admin/dashboard') ? 'active' : ''}>
                <Link to="/admin/dashboard" title="Dashboard">
                  Dashboard
                </Link>
              </li>
              <li className={isActive('/admin/account-creation') ? 'active' : ''}>
                <Link to="/admin/account-creation" title="Account Creation">
                  Account Creation
                </Link>
              </li>
              <li className={isActive('/admin/roles') ? 'active' : ''}>
                <Link to="/admin/roles" title="Roles">
                  Roles
                </Link>
              </li>
              <li className={isActive('/admin/projects') ? 'active' : ''}>
                <Link to="/admin/projects" title="Projects">
                  Projects
                </Link>
              </li>
              <li className={isActive('/admin/raw-data') ? 'active' : ''}>
                <Link to="/admin/raw-data" title="Raw Data">
                  Raw Data
                </Link>
              </li>
              <li className={isActive('/admin/audit-trail') ? 'active' : ''}>
                <Link to="/admin/audit-trail" title="Audit Trail">
                  Audit Trail
                </Link>
              </li>
              <li className={isActive('/admin/sessions') ? 'active' : ''}>
                <Link to="/admin/sessions" title="Sessions">
                  Session Log
                </Link>
              </li>
              <li className={isActive('/admin/archive') ? 'active' : ''}>
                <Link to="/admin/archive" title="Archive">
                  Archive
                </Link>
              </li>
              <li className={isActive('/admin/backup') ? 'active' : ''}>
                <Link to="/admin/backup" title="Back-up">
                  Back-up
                </Link>
              </li>
            </ul>
          </nav>
          
          <div className="admin-sidebar-footer">
            <button className="admin-logout-button" onClick={handleLogout} title="Logout">
              Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Sidebar;