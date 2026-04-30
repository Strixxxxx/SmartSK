import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Tooltip, Divider, CircularProgress, IconButton } from '@mui/material';
import { FileDownload, PictureAsPdf, AddCircleOutline, Close } from '@mui/icons-material';
import CollaboratorAvatars from './CollaboratorAvatars';
import { CollaboratorInfo } from '../../../hooks/useCollaborationSocket';
import instance from '../../../backend connection/axiosConfig';

interface ProjectTopNavbarProps {
    project: any | null;
    canCreate: boolean;
    collaborators: Map<number, CollaboratorInfo>;
    currentUser?: any;
    onCreateNew: () => void;
    onUpdateStatus?: (statusID: number) => void;
    onAdjustBudget?: () => void;
    canAdjustBudget?: boolean;
}

const ProjectTopNavbar: React.FC<ProjectTopNavbarProps> = ({ 
    project, canCreate, collaborators, currentUser, onCreateNew, 
    onAdjustBudget, canAdjustBudget 
}) => {
    const navigate = useNavigate();
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [isExportingPDF, setIsExportingPDF] = useState(false);

    const handleExport = async (format: 'excel' | 'pdf') => {
        if (!project || !project.batchID) return;
        
        try {
            if (format === 'excel') setIsExportingExcel(true);
            else setIsExportingPDF(true);

            const response = await instance.get(`/api/project-batch/export/${format}/${project.batchID}`, {
                responseType: 'blob', // Important for file downloads
            });
            
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            
            let fileName = `Export_${project.batchID}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (fileNameMatch && fileNameMatch.length === 2) {
                    fileName = fileNameMatch[1];
                }
            }
            
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            
        } catch (error) {
            console.error(`Error exporting ${format}:`, error);
            alert(`Failed to export ${format.toUpperCase()}. Please ensure the file is synced and try again.`);
        } finally {
            if (format === 'excel') setIsExportingExcel(false);
            else setIsExportingPDF(false);
        }
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
            {/* Left: Breadcrumb — show only filename */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    Projects
                </Typography>
                {project && (
                    <>
                        <Typography variant="body2" color="text.disabled">/</Typography>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 300 }}>
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
                                startIcon={isExportingExcel ? <CircularProgress size={20} color="inherit" /> : <FileDownload />}
                                onClick={() => handleExport('excel')}
                                disabled={isExportingExcel || isExportingPDF}
                                sx={{ textTransform: 'none', borderRadius: 2 }}
                            >
                                {isExportingExcel ? 'Exporting...' : 'Excel'}
                            </Button>
                        </Tooltip>
                        <Tooltip title="Export to PDF">
                            <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                startIcon={isExportingPDF ? <CircularProgress size={20} color="inherit" /> : <PictureAsPdf />}
                                onClick={() => handleExport('pdf')}
                                disabled={isExportingExcel || isExportingPDF}
                                sx={{ textTransform: 'none', borderRadius: 2 }}
                            >
                                {isExportingPDF ? 'Exporting...' : 'PDF'}
                            </Button>
                        </Tooltip>
                        {canAdjustBudget && project?.projType === 'ABYIP' && (
                            <Tooltip title="Adjust Budget Allocation">
                                <Button
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    onClick={onAdjustBudget}
                                    sx={{ textTransform: 'none', borderRadius: 2 }}
                                >
                                    Budget
                                </Button>
                            </Tooltip>
                        )}
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
                        Create New Project Plan
                    </Button>
                )}
                <Tooltip title="Back to Dashboard">
                    <IconButton
                        size="small"
                        onClick={() => navigate('/dashboard')}
                        sx={{
                            color: 'text.secondary',
                            '&:hover': { color: 'error.main', bgcolor: 'rgba(211,47,47,0.08)' },
                        }}
                    >
                        <Close fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    );
};

export default ProjectTopNavbar;
