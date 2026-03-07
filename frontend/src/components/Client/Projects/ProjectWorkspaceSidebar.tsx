import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { FaArrowLeft } from 'react-icons/fa';
import { InsertDriveFile, History } from '@mui/icons-material';
import {
    List, ListItem, ListItemIcon, ListItemText,
    Typography, Box, CircularProgress
} from '@mui/material';
import { formatRoleName } from '../../../utils/roleUtils';
import logo from '../../../assets/logo_SB.png';
import axiosInstance from '../../../backend connection/axiosConfig';
import '../Sidebar/Sidebar.css';

interface ProjectWorkspaceSidebarProps {
    selectedProject: any | null;
    onSelectProject: (project: any) => void;
}

const ProjectWorkspaceSidebar: React.FC<ProjectWorkspaceSidebarProps> = ({ selectedProject, onSelectProject }) => {
    const navigate = useNavigate();
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
    }, []);

    const handleLogout = async () => {
        try { logout(); } catch { logout(); }
    };

    const isSelected = (batch: any) => selectedProject?.batchID === batch.batchID;

    return (
        <div className="client-sidebar" style={{ position: 'relative', flexShrink: 0 }}>
            {/* Header: Back button + Logo */}
            <div className="client-sidebar-header">
                <button
                    className="client-sidebar-toggle"
                    onClick={() => navigate('/dashboard')}
                    title="Back to Dashboard"
                >
                    <FaArrowLeft />
                </button>
                <div className="client-header-content">
                    <img src={logo} alt="Smart SK Logo" className="client-sidebar-logo" />
                </div>
            </div>

            {/* User Info */}
            <div className="client-user-info">
                <div className="client-user-name">{user?.fullName || user?.username || 'User'}</div>
                <div className="client-user-role">{formatRoleName(user?.position)}</div>
            </div>

            {/* File Explorer */}
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* Section Label */}
                <Box sx={{ px: 2, py: 1, bgcolor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                    <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#646cff', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                        EXPLORER — PROJECTS
                    </Typography>
                </Box>

                {/* File List */}
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

                {/* Audit Timeline */}
                <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
                    <Box sx={{ px: 2, py: 1, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1 }}>
                        <History sx={{ fontSize: 14, color: '#646cff' }} />
                        <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#646cff', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                            AUDIT TIMELINE
                        </Typography>
                    </Box>
                    <Box sx={{ px: 2, pb: 1.5 }}>
                        <Typography variant="caption" sx={{ color: '#88939e' }}>
                            {selectedProject
                                ? `Showing logs for ${selectedProject.projType} ${selectedProject.targetYear}`
                                : 'Select a project to view logs.'
                            }
                        </Typography>
                    </Box>
                </Box>
            </Box>

            {/* Footer: Logout */}
            <div className="client-sidebar-footer">
                <button className="client-logout-button" onClick={handleLogout} title="Logout">
                    Logout
                </button>
            </div>
        </div>
    );
};

export default ProjectWorkspaceSidebar;
