import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button, Tooltip, Divider, CircularProgress, IconButton } from '@mui/material';
import { FileDownload, PictureAsPdf, Close } from '@mui/icons-material';
import CollaboratorAvatars from './CollaboratorAvatars';
import { CollaboratorInfo } from '../../../hooks/useCollaborationSocket';
import instance from '../../../backend connection/axiosConfig';
import { toastError } from '../../../utils/ProjectCycleToast';

interface ProjectTopNavbarProps {
    project: any | null;
    collaborators: Map<number, CollaboratorInfo>;
    currentUser?: any;
    onUpdateStatus?: (statusID: number) => void;
    onClose?: () => void;
    isReviewMode?: boolean;
    onApprove?: () => void;
    onRevise?: () => void;
}

const ProjectTopNavbar: React.FC<ProjectTopNavbarProps> = ({ 
    project, collaborators, currentUser, onClose,
    isReviewMode = false, onApprove, onRevise
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
            toastError(`Failed to export ${format.toUpperCase()}. Please ensure the file is synced and try again.`);
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
                {isReviewMode && (
                    <>
                        <Typography variant="body2" color="text.disabled">/</Typography>
                        <Typography 
                            variant="body2" 
                            sx={{ 
                                color: '#16a34a', 
                                fontWeight: 700, 
                                bgcolor: '#e8f5e9', 
                                px: 1, 
                                py: 0.25, 
                                borderRadius: 1, 
                                fontSize: '11px' 
                            }}
                        >
                            Barangay Captain Review Mode
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
                    isReviewMode ? (
                        <>
                            <Button
                                size="small"
                                variant="contained"
                                color="success"
                                onClick={onApprove}
                                sx={{ 
                                    textTransform: 'none', 
                                    borderRadius: 2,
                                    fontWeight: 600,
                                    bgcolor: '#2e7d32',
                                    '&:hover': { bgcolor: '#1b5e20' }
                                }}
                            >
                                Approve Plan
                            </Button>
                            <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={onRevise}
                                sx={{ 
                                    textTransform: 'none', 
                                    borderRadius: 2,
                                    fontWeight: 600,
                                    borderWidth: 1.5,
                                    '&:hover': { borderWidth: 1.5 }
                                }}
                            >
                                Request Revision
                            </Button>
                            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                        </>
                    ) : (
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
                            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                        </>
                    )
                )}

                <Tooltip title="Back to Dashboard">
                    <IconButton
                        size="small"
                        onClick={onClose || (() => navigate('/dashboard'))}
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
