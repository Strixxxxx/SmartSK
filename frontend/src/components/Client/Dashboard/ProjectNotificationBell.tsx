import React, { useState, useEffect, useRef, useCallback } from 'react';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import axios from '../../../backend connection/axiosConfig';
import './ProjectNotificationBell.css';

interface ProjectNotification {
    notificationID: number;
    batchID: number;
    notifType: 'DEADLINE_WARNING' | 'URGENT' | 'AI_TRIGGERED';
    message: string;
    isRead: boolean;
    createdAt: string;
    projName: string;
    projType: string;
}

const ProjectNotificationBell: React.FC = () => {
    const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const fetchNotifications = useCallback(async () => {
        try {
            const res = await axios.get('/api/project-batch/notifications');
            if (res.data.success) setNotifications(res.data.data);
        } catch {
            // Silently fail — non-critical UI
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60_000); // poll every 60s
        return () => clearInterval(interval);
    }, [fetchNotifications]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const markAsRead = async (id: number) => {
        try {
            await axios.patch(`/api/project-batch/notifications/${id}/read`);
            setNotifications(prev =>
                prev.map(n => n.notificationID === id ? { ...n, isRead: true } : n)
            );
        } catch { /* silent */ }
    };

    const getIcon = (type: string) => {
        if (type === 'URGENT') return <WarningAmberIcon sx={{ color: '#c62828', fontSize: 18 }} />;
        if (type === 'AI_TRIGGERED') return <PrecisionManufacturingIcon sx={{ color: '#1565c0', fontSize: 18 }} />;
        return <InfoOutlinedIcon sx={{ color: '#e65100', fontSize: 18 }} />;
    };

    const formatTime = (iso: string) => {
        return new Date(iso).toLocaleString('en-PH', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <div className="pnb-wrapper" ref={panelRef}>
            <button
                className={`pnb-bell-btn ${unreadCount > 0 ? 'pnb-bell-btn--active' : ''}`}
                onClick={() => setIsOpen(prev => !prev)}
                aria-label={`${unreadCount} project notifications`}
                id="project-notification-bell"
            >
                {unreadCount > 0
                    ? <NotificationsActiveIcon />
                    : <NotificationsIcon />}
                {unreadCount > 0 && (
                    <span className="pnb-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className="pnb-panel">
                    <div className="pnb-panel__header">
                        <span>Project Alerts</span>
                        {unreadCount > 0 && (
                            <span className="pnb-panel__count">{unreadCount} unread</span>
                        )}
                    </div>
                    <div className="pnb-panel__list">
                        {notifications.length === 0 ? (
                            <p className="pnb-empty">No notifications at the moment.</p>
                        ) : (
                            notifications.map(n => (
                                <button
                                    key={n.notificationID}
                                    className={`pnb-item ${!n.isRead ? 'pnb-item--unread' : ''} pnb-item--${n.notifType.toLowerCase()}`}
                                    onClick={() => markAsRead(n.notificationID)}
                                >
                                    <span className="pnb-item__icon">{getIcon(n.notifType)}</span>
                                    <span className="pnb-item__body">
                                        <span className="pnb-item__proj">{n.projName} ({n.projType})</span>
                                        <span className="pnb-item__msg">{n.message}</span>
                                        <span className="pnb-item__time">{formatTime(n.createdAt)}</span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectNotificationBell;
