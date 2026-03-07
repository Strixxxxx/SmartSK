import React from 'react';
import { Folder, InsertDriveFile, History, Close } from '@mui/icons-material';
import { Box, Typography, List, ListItem, ListItemIcon, ListItemText, Divider, IconButton } from '@mui/material';

interface ProjectSidebarProps {
    project: any;
    onExit: () => void;
}

const ProjectSidebar: React.FC<ProjectSidebarProps> = ({ project, onExit }) => {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#1e1e1e', color: '#cccccc' }}>
            {/* VSC Style Sidebar Top */}
            <Box sx={{ p: 2, bgcolor: '#252526', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#858585' }}>
                    EXPLORER - {project?.projType} {project?.targetYear}
                </Typography>
                <IconButton
                    size="small"
                    onClick={onExit}
                    sx={{ color: '#858585', '&:hover': { color: '#ffffff' } }}
                >
                    <Close sx={{ fontSize: 16 }} />
                </IconButton>
            </Box>

            <List sx={{ flexGrow: 1, pt: 0 }}>
                <ListItem sx={{ '&:hover': { bgcolor: '#2a2d2e' } }}>
                    <ListItemIcon sx={{ minWidth: 32 }}><Folder sx={{ color: '#dcb67a', fontSize: 18 }} /></ListItemIcon>
                    <ListItemText primary={`${project?.projType} Plans`} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItem>
                <ListItem sx={{ pl: 4, '&:hover': { bgcolor: '#2a2d2e' } }}>
                    <ListItemIcon sx={{ minWidth: 32 }}><InsertDriveFile sx={{ color: '#519aba', fontSize: 18 }} /></ListItemIcon>
                    <ListItemText primary={`${project?.projType}_${project?.targetYear}.xlsx`} primaryTypographyProps={{ variant: 'body2' }} />
                </ListItem>
            </List>

            <Divider sx={{ bgcolor: '#333' }} />

            {/* Audit Timeline Section */}
            <Box sx={{ p: 2, bgcolor: '#252526' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <History sx={{ fontSize: 18, color: '#858585' }} />
                    <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#858585' }}>
                        AUDIT TIMELINE
                    </Typography>
                </Box>
            </Box>
            <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto' }}>
                <Typography variant="caption" sx={{ color: '#666' }}>
                    No audit logs recorded yet.
                </Typography>
            </Box>
        </Box>
    );
};

export default ProjectSidebar;
