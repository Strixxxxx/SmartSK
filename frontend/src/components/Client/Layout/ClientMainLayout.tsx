import React, { useState, ReactNode } from 'react';
import { Box } from '@mui/material';
import Sidebar from '../Sidebar/ClientSidebar';
import './Layout.css';
import { Outlet } from 'react-router-dom';

interface ClientMainLayoutProps {
  children?: ReactNode;
  [key: string]: any;
}

const ClientMainLayout: React.FC<ClientMainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  return (
    <Box className="client-layout-container">
      <Sidebar collapsed={collapsed} toggleSidebar={toggleSidebar} />
      <Box 
        className={`client-main-content ${collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}
      >
        {children}
        <Outlet context={{ sidebarCollapsed: collapsed }} />
      </Box>
    </Box>
  );
};

export default ClientMainLayout;