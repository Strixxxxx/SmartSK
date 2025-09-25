import React, { useState } from 'react';
import { Box } from '@mui/material';
import Sidebar from '../Sidebar/SidebarAdmin';
import './Layout.css';
import { Outlet } from 'react-router-dom';
import { FaBars } from 'react-icons/fa';

const LayoutAdmin: React.FunctionComponent = () => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  return (
    <Box className="admin-layout-container">
      <button className="mobile-sidebar-toggle" onClick={toggleSidebar}>
        <FaBars />
      </button>

      {/* Backdrop for mobile overlay */}
      {!collapsed && <div className="sidebar-backdrop" onClick={toggleSidebar}></div>}

      <Sidebar collapsed={collapsed} toggleSidebar={toggleSidebar} />
      <Box className={`admin-main-content ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <Outlet context={{ sidebarCollapsed: collapsed }} />
      </Box>
    </Box>
  );
};

export default LayoutAdmin;