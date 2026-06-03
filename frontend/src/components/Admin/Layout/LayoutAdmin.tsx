import { Outlet } from 'react-router-dom';
import Sidebar from '../Sidebar/SidebarAdmin';
import './Layout.css';
import { useState } from 'react';

const LayoutAdmin: React.FC = () => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const toggleSidebar = () => {
        setSidebarCollapsed(!sidebarCollapsed);
    };

    return (
        <div className="admin-layout-container">
            <Sidebar collapsed={sidebarCollapsed} toggleSidebar={toggleSidebar} />
            <div className={`admin-main-content ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
                <Outlet context={{ sidebarCollapsed }} />
            </div>
        </div>
    );
};

export default LayoutAdmin;