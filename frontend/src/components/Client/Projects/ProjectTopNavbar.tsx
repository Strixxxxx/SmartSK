import React from 'react';
import { Box, Typography, Button, Tooltip, Divider } from '@mui/material';
import { FileDownload, PictureAsPdf, AddCircleOutline } from '@mui/icons-material';
import CollaboratorAvatars from './CollaboratorAvatars';
import { CollaboratorInfo } from '../../../hooks/useCollaborationSocket';

interface ProjectTopNavbarProps {
    project: any | null;
    canCreate: boolean;
    collaborators: Map<number, CollaboratorInfo>;
    currentUser?: any;
    onCreateNew: () => void;
}

const ProjectTopNavbar: React.FC<ProjectTopNavbarProps> = ({ project, canCreate, collaborators, currentUser, onCreateNew }) => {

    const handleExportExcel = () => {
        // TODO: Hook up to backend export endpoint when implemented
        alert('Export to Excel – coming soon!');
    };

    const handleExportPDF = () => {
        // TODO: Hook up to backend export endpoint when implemented
        alert('Export to PDF – coming soon!');
    };

    return (
        <Box
            sx={{
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                bgcolor: '#ffffff',
                borderBottom: '1px solid #e0e0e0',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                flexShrink: 0,
                zIndex: 10,
            }}
        >
            {/* Left: Breadcrumb */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    Projects
                </Typography>
                {project && (
                    <>
                        <Typography variant="body2" color="text.disabled">/</Typography>
                        <Typography variant="body2" fontWeight="600" color="primary">
                            {project.projType} {project.targetYear}
                        </Typography>
                        <Typography variant="body2" color="text.disabled">/</Typography>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 240 }}>
                            {project.projName}
                        </Typography>
                    </>
                )}
            </Box>

            {/* Right: Collaborators + Action buttons */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* Collaborator avatars (other users in same project) */}
                <CollaboratorAvatars collaborators={collaborators} currentUser={currentUser} />
                {(collaborators.size > 0 || currentUser) && <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />}
                {project && (
                    <>
                        <Tooltip title="Export to Excel">
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<FileDownload />}
                                onClick={handleExportExcel}
                                sx={{ textTransform: 'none', borderRadius: 2 }}
                            >
                                Excel
                            </Button>
                        </Tooltip>
                        <Tooltip title="Export to PDF">
                            <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={<PictureAsPdf />}
                                onClick={handleExportPDF}
                                sx={{ textTransform: 'none', borderRadius: 2 }}
                            >
                                PDF
                            </Button>
                        </Tooltip>
                        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                    </>
                )}
                {canCreate && (
                    <Button
                        size="small"
                        variant="contained"
                        startIcon={<AddCircleOutline />}
                        onClick={onCreateNew}
                        sx={{ textTransform: 'none', borderRadius: 2 }}
                    >
                        Create New Project
                    </Button>
                )}
            </Box>
        </Box>
    );
};

export default ProjectTopNavbar;
