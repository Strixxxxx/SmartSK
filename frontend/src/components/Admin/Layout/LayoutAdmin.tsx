import { Outlet } from 'react-router-dom';
import Sidebar from '../Sidebar/SidebarAdmin';
import './LayoutAdmin.css';
import FlashMessage from '../../FlashMessage/FlashMessage';
import { useState } from 'react';

const LayoutAdmin: React.FC = () => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [flashMessage, setFlashMessage] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

    const toggleSidebar = () => {
        setSidebarCollapsed(!sidebarCollapsed);
    };

    const showFlashMessage = (message: string, type: 'success' | 'error' | 'info') => {
        setFlashMessage({ message, type });
    };

    return (
        <div className={`admin-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <Sidebar collapsed={sidebarCollapsed} toggleSidebar={toggleSidebar} />
            <div className="main-content">
                {flashMessage && (
                    <FlashMessage
                        message={flashMessage.message}
                        type={flashMessage.type}
                        onClose={() => setFlashMessage(null)}
                    />
                )}
                <Outlet context={{ sidebarCollapsed, showFlashMessage }} />
            </div>
        </div>
    );
};

export default LayoutAdmin;