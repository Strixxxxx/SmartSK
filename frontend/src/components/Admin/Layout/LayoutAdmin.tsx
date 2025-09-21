import React, { useState } from 'react';
import { Box } from '@mui/material';
import Sidebar from '../Sidebar/SidebarAdmin';
import './Layout.css';
import { Outlet } from 'react-router-dom';

const LayoutAdmin: React.FunctionComponent = () => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  return (
    <Box className="admin-layout-container">
      <Sidebar collapsed={collapsed} toggleSidebar={toggleSidebar} />
      <Box className={`admin-main-content ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <Outlet context={{ sidebarCollapsed: collapsed }} />
      </Box>
    </Box>
  );
};

export default LayoutAdmin;
