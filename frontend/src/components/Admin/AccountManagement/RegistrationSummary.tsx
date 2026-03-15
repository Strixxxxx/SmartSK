import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Button, Dialog, DialogActions, DialogContent, DialogTitle,
    TextField, CircularProgress, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, IconButton, Tooltip, Chip
} from '@mui/material';
import { Visibility, ArrowBackIosNew, ArrowForwardIos, Edit } from '@mui/icons-material';
import { toast } from 'react-toastify';
import axiosInstance from '../../../backend connection/axiosConfig';
import AuditSummaryModal from './AuditSummaryModal'; // Import the new modal
import { Save, Edit as EditIcon, Cancel, CheckCircle, Warning, Autorenew } from '@mui/icons-material';

const POSITION_MAPPING: Record<string, string> = {
    'SKC': 'SK Chairperson',
    'SKS': 'SK Secretary',
    'SKT': 'SK Treasurer',
    'SKK1': 'SK Kagawad I',
    'SKK2': 'SK Kagawad II',
    'SKK3': 'SK Kagawad III',
    'SKK4': 'SK Kagawad IV',
    'SKK5': 'SK Kagawad V',
    'SKK6': 'SK Kagawad VI',
    'SKK7': 'SK Kagawad VII',
};

const OFFICIAL_POSITIONS = Object.keys(POSITION_MAPPING);

interface OfficialMember {
    position: string;
    fullName: string;
}

interface AuditLog {
    userID: number;
    username: string;
    fullName: string;
    emailAddress: string;
    dateOfBirth: string;
    verificationReport: string;
    processedAt: string;
    verdict: string;
    registeredAt: string;
    validatedBy: string;
    attachmentPath: string;
    attachmentPathBack: string;
}

const RegistrationSummary: React.FC = () => {
    // State for SK Officials List Modal
    const [isListModalOpen, setIsListModalOpen] = useState(false);
    const [officialsList, setOfficialsList] = useState<OfficialMember[]>([]);
    const [isEditMode, setIsEditMode] = useState(false);
    const [saving, setSaving] = useState(false);

    // State for the main component data
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [pageLoading, setPageLoading] = useState(true);

    // State for Attachment Viewer Modal
    const [isAttachmentModalOpen, setIsAttachmentModalOpen] = useState(false);
    const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
    const [currentAttachmentIndex, setCurrentAttachmentIndex] = useState(0);
    const [modalLoading, setModalLoading] = useState(false);

    // State for the new Audit Summary Modal
    const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    // State for Term Lifecycle
    const [approvedCount, setApprovedCount] = useState<number>(0);
    const [isFinalized, setIsFinalized] = useState<boolean>(false);
    const [isTermLoading, setIsTermLoading] = useState(false);
    
    // Safety Dialogs
    const [isFinalizeDialogOpen, setIsFinalizeDialogOpen] = useState(false);
    const [isNewTermDialogOpen, setIsNewTermDialogOpen] = useState(false);

    const fetchInitialData = useCallback(async () => {
        setPageLoading(true);
        try {
            const [officialsRes, auditRes, termRes] = await Promise.all([
                axiosInstance.get('/api/admin/audit/officials'),
                axiosInstance.get('/api/admin/audit/registrations'),
                axiosInstance.get('/api/admin/audit/term-status')
            ]);

            if (officialsRes.data.success) {
                const data = officialsRes.data.content;
                // Ensure all 11 positions are present, preserving existing data if any
                const mergedList = OFFICIAL_POSITIONS.map(pos => {
                    const existing = Array.isArray(data) ? data.find((item: OfficialMember) => item.position === pos) : null;
                    return { position: pos, fullName: existing ? existing.fullName : '' };
                });
                setOfficialsList(mergedList);
            }
            if (auditRes.data.success) {
                setLogs(auditRes.data.data);
            }
            if (termRes.data.success) {
                setApprovedCount(termRes.data.approvedCount);
                setIsFinalized(termRes.data.isFinalized);
            }
        } catch (error) {
            toast.error('Failed to fetch initial data.');
            console.error("Error fetching initial data:", error);
        } finally {
            setPageLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    const handleOpenListModal = () => {
        setIsEditMode(false);
        setIsListModalOpen(true);
    };

    const handleCloseListModal = () => {
        setIsListModalOpen(false);
        setIsEditMode(false);
    };

    const handleSaveList = async () => {
        setSaving(true);
        try {
            const response = await axiosInstance.post('/api/admin/audit/officials', { officialsList });
            if (response.data.success) {
                toast.success('SK Officials list saved successfully!');
                setIsEditMode(false);
            } else {
                throw new Error(response.data.message || 'Failed to save list.');
            }
        } catch (error) {
            toast.error('Failed to save SK Officials list.');
            console.error('Save error:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleEdit = () => {
        if (isEditMode) {
            handleSaveList();
        } else {
            setIsEditMode(true);
        }
    };

    const handleFinalizeList = async () => {
        setIsTermLoading(true);
        try {
            const response = await axiosInstance.post('/api/admin/audit/finalize-term', { officialsList });
            if (response.data.success) {
                toast.success('SK Officials list finalized successfully!');
                setIsFinalizeDialogOpen(false);
                setIsListModalOpen(false);
                fetchInitialData();
            } else {
                throw new Error(response.data.message || 'Failed to finalize list.');
            }
        } catch (error) {
            toast.error('Failed to finalize list.');
            console.error('Finalize error:', error);
        } finally {
            setIsTermLoading(false);
        }
    };

    const handleCreateNewTerm = async () => {
        setIsTermLoading(true);
        try {
            const response = await axiosInstance.post('/api/admin/audit/start-new-term');
            if (response.data.success) {
                toast.success('New administration term started successfully!');
                setIsNewTermDialogOpen(false);
                setIsListModalOpen(false);
                fetchInitialData();
            } else {
                throw new Error(response.data.message || 'Failed to start new term.');
            }
        } catch (error) {
            toast.error('Failed to start new administration term.');
            console.error('New Term error:', error);
        } finally {
            setIsTermLoading(false);
        }
    };

    const handleNameChange = (position: string, newName: string) => {
        setOfficialsList(prev => prev.map(item =>
            item.position === position ? { ...item, fullName: newName } : item
        ));
    };

    const handleViewAttachment = async (userId: number) => {
        setIsAttachmentModalOpen(true);
        setModalLoading(true);
        setAttachmentUrls([]);
        setCurrentAttachmentIndex(0);
        try {
            const response = await axiosInstance.get(`/api/admin/audit/attachment/${userId}`);
            if (response.data.success) {
                const { frontUrl, backUrl } = response.data;
                const urls = [frontUrl];
                if (backUrl) {
                    urls.push(backUrl);
                }
                setAttachmentUrls(urls);
            } else {
                throw new Error(response.data.message);
            }
        } catch (error) {
            toast.error('Could not load attachment.');
            console.error('Attachment fetch error:', error);
            setIsAttachmentModalOpen(false);
        } finally {
            setModalLoading(false);
        }
    };

    const handleCloseAttachmentModal = () => setIsAttachmentModalOpen(false);

    const handlePrevAttachment = () => {
        setCurrentAttachmentIndex((prevIndex) =>
            prevIndex === 0 ? attachmentUrls.length - 1 : prevIndex - 1
        );
    };

    const handleNextAttachment = () => {
        setCurrentAttachmentIndex((prevIndex) =>
            prevIndex === attachmentUrls.length - 1 ? 0 : prevIndex + 1
        );
    };

    // Handlers for the new Audit Summary Modal
    const handleOpenAuditModal = (log: AuditLog) => {
        setSelectedLog(log);
        setIsAuditModalOpen(true);
    };

    const handleCloseAuditModal = () => {
        setSelectedLog(null);
        setIsAuditModalOpen(false);
    };

    const handleAuditSuccess = () => {
        handleCloseAuditModal();
        fetchInitialData(); // Re-fetch data to show the update
    };

    return (
        <Paper elevation={0} sx={{ p: 2, backgroundColor: 'transparent' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" component="h3">
                    Registration Audit Report
                </Typography>
                <Button variant="contained" onClick={handleOpenListModal}>
                    Manage SK Official List
                </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined">
                <Table sx={{ minWidth: 650 }} aria-label="registration audit table">
                    <TableHead>
                        <TableRow>
                            <TableCell>Username</TableCell>
                            <TableCell>Full Name</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Validated By</TableCell>
                            <TableCell>Verification Report</TableCell>
                            <TableCell align="center">Attachment</TableCell>
                            <TableCell>Processed At</TableCell>
                            <TableCell align="center">Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pageLoading ? (
                            <TableRow>
                                <TableCell colSpan={8} align="center">
                                    <CircularProgress />
                                </TableCell>
                            </TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} align="center">
                                    No registration logs found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={`${log.userID}-${log.processedAt}`}>
                                    <TableCell>{log.username}</TableCell>
                                    <TableCell>{log.fullName}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={log.verdict}
                                            color={log.verdict === 'Approved' ? 'success' : log.verdict === 'Rejected' ? 'error' : 'warning'}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>{log.validatedBy}</TableCell>
                                    <TableCell sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: 300, overflow: 'auto' }}>
                                        {log.verificationReport}
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="View Attachment">
                                            <IconButton onClick={() => handleViewAttachment(log.userID)}>
                                                <Visibility />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell>{new Date(log.processedAt).toLocaleString()}</TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="Manual Override">
                                            <IconButton onClick={() => handleOpenAuditModal(log)}>
                                                <Edit />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* SK Officials List Modal */}
            <Dialog
                open={isListModalOpen}
                onClose={handleCloseListModal}
                fullWidth
                maxWidth="lg"
            >
                <DialogTitle sx={{ borderBottom: '1px solid #eee', pb: 2, bgcolor: '#f9f9f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Manage SK Official List
                    <IconButton onClick={handleCloseListModal} size="small">
                        <Cancel />
                    </IconButton>
                </DialogTitle>
                <DialogContent sx={{ overflowX: 'hidden' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', my: 2 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                            Enter the full names of all official SK members. This list will be used by the AI for verification.
                        </Typography>
                        <Button 
                            variant="outlined" 
                            color="warning" 
                            startIcon={<Autorenew />}
                            onClick={() => setIsNewTermDialogOpen(true)}
                            disabled={approvedCount < 11}
                        >
                            Create New SK Official List
                        </Button>
                    </Box>

                    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500, overflowX: 'hidden' }}>
                        <Table stickyHeader size="medium">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold', width: '60%', bgcolor: '#f5f5f5' }}>Full Name</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold', width: '40%', bgcolor: '#f5f5f5' }}>Position</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {officialsList.map((official) => (
                                    <TableRow key={official.position} hover>
                                        <TableCell>
                                            {isEditMode ? (
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    value={official.fullName}
                                                    onChange={(e) => handleNameChange(official.position, e.target.value)}
                                                    placeholder="Enter Full Name"
                                                    variant="outlined"
                                                    autoComplete="off"
                                                    sx={{ bgcolor: 'white' }}
                                                />
                                            ) : (
                                                <Typography variant="body1" sx={{ color: official.fullName ? 'text.primary' : 'text.disabled', fontStyle: official.fullName ? 'normal' : 'italic', fontWeight: 500 }}>
                                                    {official.fullName || 'Not set'}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                                                {POSITION_MAPPING[official.position] || official.position}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid #eee', bgcolor: '#f9f9f9', justifyContent: 'flex-end' }}>
                    {!isEditMode && (
                        <Button 
                            variant="contained" 
                            color="success" 
                            startIcon={<CheckCircle />}
                            onClick={() => setIsFinalizeDialogOpen(true)}
                            disabled={isFinalized || officialsList.some(o => !o.fullName.trim())}
                            size="large"
                            sx={{ px: 4, mr: 2 }}
                        >
                            {isFinalized ? 'Already Finalized' : 'Finalize List'}
                        </Button>
                    )}
                    <Button
                        onClick={handleToggleEdit}
                        variant="contained"
                        disabled={saving || isFinalized}
                        startIcon={isEditMode ? (saving ? <CircularProgress size={20} /> : <Save />) : <EditIcon />}
                        color={isEditMode ? "success" : "primary"}
                        size="large"
                        sx={{ px: 4 }}
                    >
                        {isEditMode ? 'Save Changes' : 'Edit List'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Attachment Viewer Modal */}
            <Dialog
                open={isAttachmentModalOpen}
                onClose={handleCloseAttachmentModal}
                fullWidth
                maxWidth="lg"
                PaperProps={{ sx: { userSelect: 'none' } }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Attachment Viewer
                    {attachmentUrls.length > 1 && (
                        <Typography variant="body1">
                            {currentAttachmentIndex + 1} / {attachmentUrls.length}
                        </Typography>
                    )}
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                    {modalLoading ? (
                        <CircularProgress />
                    ) : attachmentUrls.length > 0 ? (
                        <>
                            {attachmentUrls.length > 1 && (
                                <IconButton
                                    onClick={handlePrevAttachment}
                                    sx={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(0,0,0,0.3)', '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)' } }}
                                >
                                    <ArrowBackIosNew sx={{ color: 'white' }} />
                                </IconButton>
                            )}
                            <img
                                src={attachmentUrls[currentAttachmentIndex]}
                                alt={`Registration Attachment ${currentAttachmentIndex + 1}`}
                                style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
                                onContextMenu={(e) => e.preventDefault()}
                            />
                            {attachmentUrls.length > 1 && (
                                <IconButton
                                    onClick={handleNextAttachment}
                                    sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(0,0,0,0.3)', '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)' } }}
                                >
                                    <ArrowForwardIos sx={{ color: 'white' }} />
                                </IconButton>
                            )}
                        </>
                    ) : (
                        <Typography>No attachment found.</Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAttachmentModal}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Audit Summary Modal */}
            {selectedLog && (
                <AuditSummaryModal
                    open={isAuditModalOpen}
                    onClose={handleCloseAuditModal}
                    log={selectedLog}
                    onSuccess={handleAuditSuccess}
                />
            )}

            {/* Finalize Safety Dialog */}
            <Dialog open={isFinalizeDialogOpen} onClose={() => !isTermLoading && setIsFinalizeDialogOpen(false)}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', color: 'warning.main', gap: 1 }}>
                    <Warning /> Finalize SK Official List
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure? Once finalized, this SK Official List will be locked and cannot be changed until the next administration term begins.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsFinalizeDialogOpen(false)} disabled={isTermLoading}>Cancel</Button>
                    <Button onClick={handleFinalizeList} color="warning" variant="contained" disabled={isTermLoading}>
                        {isTermLoading ? <CircularProgress size={24} color="inherit" /> : 'Yes, Finalize'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Create New Term Safety Dialog */}
            <Dialog open={isNewTermDialogOpen} onClose={() => !isTermLoading && setIsNewTermDialogOpen(false)}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', color: 'error.main', gap: 1 }}>
                    <Warning /> Start New Administration Term
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure? This will finalize the current term and <strong>automatically archive all 11 active accounts</strong> to prepare for the next administration.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsNewTermDialogOpen(false)} disabled={isTermLoading}>Cancel</Button>
                    <Button onClick={handleCreateNewTerm} color="error" variant="contained" disabled={isTermLoading}>
                        {isTermLoading ? <CircularProgress size={24} color="inherit" /> : 'Yes, Start New Term'}
                    </Button>
                </DialogActions>
            </Dialog>

        </Paper>
    );
};

export default RegistrationSummary;