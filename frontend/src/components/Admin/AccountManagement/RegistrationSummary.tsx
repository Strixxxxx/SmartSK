import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Button, Dialog, DialogActions, DialogContent, DialogTitle, 
    TextField, CircularProgress, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, IconButton, Tooltip 
} from '@mui/material';
import { Visibility } from '@mui/icons-material';
import { toast } from 'react-toastify';
import axiosInstance from '../../../backend connection/axiosConfig';

interface AuditLog {
    userID: number;
    username: string;
    fullName: string;
    verificationReport: string;
    processedAt: string;
    status: string;
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
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [modalLoading, setModalLoading] = useState(false);

    useEffect(() => {
        const fetchInitialData = async () => {
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
        };

        fetchInitialData();
    }, []);

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
        setAttachmentUrl('');
        try {
            const response = await axiosInstance.get(`/api/admin/audit/attachment/${userId}`);
            if (response.data.success) {
                setAttachmentUrl(response.data.url);
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

    return (
        <Paper elevation={0} sx={{ p: 2, backgroundColor: 'transparent' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" component="h3">
                    AI Registration Report
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
                            <TableCell>Verification Report</TableCell>
                            <TableCell align="center">Attachment</TableCell>
                            <TableCell>Processed At</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pageLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center">
                                    <CircularProgress />
                                </TableCell>
                            </TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center">
                                    No registration logs found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.userID}>
                                    <TableCell>{log.username}</TableCell>
                                    <TableCell>{log.fullName}</TableCell>
                                    <TableCell>{log.status}</TableCell>
                                    <TableCell sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
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
            <Dialog open={isAttachmentModalOpen} onClose={handleCloseAttachmentModal} fullWidth maxWidth="lg">
                <DialogTitle>Attachment Viewer</DialogTitle>
                <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {modalLoading ? (
                        <CircularProgress />
                    ) : (
                        <img src={attachmentUrl} alt="Registration Attachment" style={{ maxWidth: '100%', maxHeight: '80vh' }} />
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAttachmentModal}>Close</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default RegistrationSummary;