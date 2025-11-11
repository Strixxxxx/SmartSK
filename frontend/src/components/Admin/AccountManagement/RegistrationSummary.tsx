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

interface AuditLog {
    userID: number;
    username: string;
    fullName: string;
    emailAddress: string;
    dateOfBirth: string;
    verificationReport: string;
    processedAt: string;
    status: string;
    registeredAt: string;
    validatedBy: string;
    attachmentPath: string;
    attachmentPathBack: string;
}

const RegistrationSummary: React.FC = () => {
    // State for SK Officials List Modal
    const [isListModalOpen, setIsListModalOpen] = useState(false);
    const [officialsList, setOfficialsList] = useState('');
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

    const fetchInitialData = useCallback(async () => {
        setPageLoading(true);
        try {
            const [officialsRes, auditRes] = await Promise.all([
                axiosInstance.get('/api/admin/audit/officials'),
                axiosInstance.get('/api/admin/audit/registrations')
            ]);

            if (officialsRes.data.success) {
                setOfficialsList(officialsRes.data.content || '');
            }
            if (auditRes.data.success) {
                setLogs(auditRes.data.data);
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
        if (officialsList.trim() === '') setOfficialsList('- ');
        setIsListModalOpen(true);
    };

    const handleCloseListModal = () => setIsListModalOpen(false);

    const handleSaveList = async () => {
        setSaving(true);
        try {
            const response = await axiosInstance.post('/api/admin/audit/officials', { officialsList });
            if (response.data.success) {
                toast.success('SK Officials list saved successfully!');
                handleCloseListModal();
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
                                            label={log.status}
                                            color={log.status === 'approved' ? 'success' : log.status === 'rejected' ? 'error' : 'warning'}
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
            <Dialog open={isListModalOpen} onClose={handleCloseListModal} fullWidth maxWidth="md">
                <DialogTitle>Manage SK Official List</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        Enter the full names of all official SK members. This list will be used by the AI for verification.
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        id="officials-list"
                        label="SK Officials Full Names"
                        type="text"
                        fullWidth
                        multiline
                        rows={10}
                        value={officialsList}
                        onChange={(e) => setOfficialsList(e.target.value)}
                        variant="outlined"
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleCloseListModal} disabled={saving}>Cancel</Button>
                    <Button onClick={handleSaveList} variant="contained" disabled={saving}>
                        {saving ? <CircularProgress size={24} /> : 'Save'}
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
                                    sx={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(0,0,0,0.3)', '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)'} }}
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
                                    sx={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', backgroundColor: 'rgba(0,0,0,0.3)', '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)'} }}
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
        </Paper>
    );
};

export default RegistrationSummary;