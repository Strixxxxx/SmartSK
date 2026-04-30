import React, { useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { InsertDriveFile, Menu as MenuIcon } from '@mui/icons-material';
import {
    List, ListItem, ListItemIcon, ListItemText,
    Typography, Box, CircularProgress, IconButton, Tooltip
} from '@mui/material';
import { formatRoleName } from '../../../utils/roleUtils';
import logo from '../../../assets/logo_SB.png';
import axiosInstance from '../../../backend connection/axiosConfig';
import ProjectAuditTimeline from './ProjectAuditTimeline';
import '../Sidebar/Sidebar.css';

interface ProjectWorkspaceSidebarProps {
    selectedProject: any | null;
    onSelectProject: (project: any) => void;
    auditRefreshTrigger?: number;
    projectListRefreshTrigger?: number;
    center?: string;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    onAuditUpdate?: () => void;
}

const ProjectWorkspaceSidebar: React.FC<ProjectWorkspaceSidebarProps> = ({
    selectedProject,
    onSelectProject,
    auditRefreshTrigger,
    projectListRefreshTrigger,
    center,
    isCollapsed = false,
    onToggleCollapse,
    onAuditUpdate,
}) => {
    const { user, logout } = useAuth();
    const [batches, setBatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBatches = async () => {
            try {
                const response = await axiosInstance.get('/api/project-batch/all-files');
                if (response.data.success) {
                    setBatches(response.data.data);
                }
            } catch (err) {
                console.error('Failed to fetch project batches:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchBatches();
    }, [projectListRefreshTrigger]);

    const handleLogout = async () => {
        try { logout(); } catch { logout(); }
    };

    const isSelected = (batch: any) => selectedProject?.batchID === batch.batchID;

    return (
        <Box 
            className={`client-sidebar ${isCollapsed ? 'collapsed' : ''}`}
            sx={{ 
                position: 'relative', 
                flexShrink: 0,
                width: isCollapsed ? 70 : 280,
                minWidth: isCollapsed ? 70 : 280,
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                background: isCollapsed ? 'linear-gradient(135deg, #eee9e9, #747bff)' : 'linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05))',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#213547',
                zIndex: 1000,
            }}
        >
            {/* Header: Hamburger + Logo */}
            <Box 
                className="client-sidebar-header" 
                sx={{ 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'flex-start',
                    background: isCollapsed ? 'transparent' : 'linear-gradient(135deg, #ffffff, #ffffff)',
                    transition: 'all 0.4s ease',
                    height: 80,
                    width: '100%',
                    px: isCollapsed ? 0 : 2, // Remove horizontal padding when collapsed for centering
                    flexShrink: 0,
                }}
            >
                <Tooltip title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}>
                    <IconButton
                        className="client-sidebar-toggle"
                        onClick={onToggleCollapse}
                        sx={{ 
                            color: '#747bff',
                            bgcolor: 'rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(5px)',
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            borderRadius: '8px',
                            padding: isCollapsed ? '12px' : '10px',
                            marginRight: isCollapsed ? 0 : '15px',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                                bgcolor: 'rgba(255, 255, 255, 0.3)',
                                transform: 'scale(1.05)',
                            }
                        }}
                    >
                        <MenuIcon sx={{ fontSize: isCollapsed ? '1.4rem' : '1.2rem' }} />
                    </IconButton>
                </Tooltip>
                
                <Box sx={{ 
                    display: isCollapsed ? 'none' : 'flex', // Completely remove from flow when collapsed
                    alignItems: 'center',
                    opacity: isCollapsed ? 0 : 1, 
                    transition: 'opacity 0.3s ease',
                    visibility: isCollapsed ? 'hidden' : 'visible',
                }}>
                    <img src={logo} alt="Smart SK Logo" className="client-sidebar-logo" />
                </Box>
            </Box>

            {/* Main Content Area - Stable DOM */}
            <Box sx={{ 
                flexGrow: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: 0,
                opacity: isCollapsed ? 0 : 1,
                visibility: isCollapsed ? 'hidden' : 'visible',
                transition: 'opacity 0.2s ease, visibility 0.2s ease',
                width: 280, // Constant width for performance
            }}>
                {/* User Info */}
                <div className="client-user-info">
                    <div className="client-user-name">{user?.fullName || user?.username || 'User'}</div>
                    <div className="client-user-role">{formatRoleName(user?.position)}</div>
                </div>

                {/* File Explorer */}
                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <Box sx={{ px: 2, py: 1, bgcolor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                        <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#646cff', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                            EXPLORER — PROJECTS
                        </Typography>
                    </Box>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', pt: 3 }}>
                            <CircularProgress size={20} />
                        </Box>
                    ) : batches.length === 0 ? (
                        <Typography variant="caption" sx={{ color: '#88939e', p: 2 }}>
                            No projects yet.
                        </Typography>
                    ) : (
                        <List dense sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', pt: 0, pb: 0 }}>
                            {batches.map((batch) => (
                                <React.Fragment key={batch.batchID}>
                                    {batch.projName ? (
                                        <ListItem
                                            onClick={() => onSelectProject(batch)}
                                            sx={{
                                                '&:hover': { bgcolor: 'rgba(100,108,255,0.1)' },
                                                cursor: 'pointer',
                                                borderRadius: 1,
                                                mx: 0.5,
                                                bgcolor: isSelected(batch) ? 'rgba(100,108,255,0.18)' : 'transparent',
                                            }}
                                        >
                                            <ListItemIcon sx={{ minWidth: 28 }}>
                                                <InsertDriveFile sx={{ color: '#646cff', fontSize: 16 }} />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={batch.projName}
                                                secondary={!batch.fileExists ? '⚠ File not found' : undefined}
                                                primaryTypographyProps={{
                                                    variant: 'body2',
                                                    noWrap: true,
                                                    sx: {
                                                        color: isSelected(batch) ? '#646cff' : '#213547',
                                                        fontSize: '0.75rem',
                                                        fontWeight: isSelected(batch) ? 600 : 400,
                                                    }
                                                }}
                                                secondaryTypographyProps={{ variant: 'caption', sx: { color: '#e57373' } }}
                                            />
                                        </ListItem>
                                    ) : (
                                        <ListItem sx={{ opacity: 0.5 }}>
                                            <ListItemIcon sx={{ minWidth: 28 }}>
                                                <InsertDriveFile sx={{ color: '#bbb', fontSize: 16 }} />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={`${batch.projType} ${batch.targetYear} — no file`}
                                                primaryTypographyProps={{ variant: 'caption', sx: { color: '#88939e' } }}
                                            />
                                        </ListItem>
                                    )}
                                </React.Fragment>
                            ))}
                        </List>
                    )}
                </Box>

                {/* Audit Timeline */}
                <ProjectAuditTimeline
                    batchID={selectedProject?.batchID ?? null}
                    projType={selectedProject?.projType}
                    center={center}
                    auditRefreshTrigger={auditRefreshTrigger}
                    onAuditUpdate={onAuditUpdate}
                />

                {/* Footer: Logout */}
                <div className="client-sidebar-footer">
                    <button className="client-logout-button" onClick={handleLogout} title="Logout">
                        Logout
                    </button>
                </div>
            </Box>
        </Box>
    );
};

export default ProjectWorkspaceSidebar;
