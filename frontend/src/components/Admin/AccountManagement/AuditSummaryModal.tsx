import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
    Table, TableBody, TableCell, TableRow, TableContainer, Paper, Select, MenuItem,
    TextField, CircularProgress, IconButton, SelectChangeEvent
} from '@mui/material';
import { ArrowBackIosNew, ArrowForwardIos } from '@mui/icons-material';
import { toast } from 'react-toastify';
import axiosInstance from '../../../backend connection/axiosConfig';

interface AuditLog {
    userID: number;
    username: string;
    fullName: string;
    emailAddress: string;
    dateOfBirth: string;
    verificationReport: string;
    attachmentPath: string;
    attachmentPathBack: string;
    processedAt: string;
    verdict: string;
    registeredAt: string;
    validatedBy: string;
}

interface AuditSummaryModalProps {
    open: boolean;
    onClose: () => void;
    log: AuditLog | null;
    onSuccess: () => void;
}

const AuditSummaryModal: React.FC<AuditSummaryModalProps> = ({ open, onClose, log, onSuccess }) => {
    const [verdict, setVerdict] = useState<'approved' | 'rejected' | ''>('');
    const [report, setReport] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [attachmentUrls, setAttachmentUrls] = useState<string[]>([]);
    const [currentAttachmentIndex, setCurrentAttachmentIndex] = useState(0);
    const [modalLoading, setModalLoading] = useState(false);

    // State for the large attachment viewer
    const [isAttachmentViewerOpen, setIsAttachmentViewerOpen] = useState(false);

    useEffect(() => {
        if (open && log) {
            // Reset state on open
            setVerdict('');
            setReport('');
            
            // Fetch attachments
            const fetchAttachments = async () => {
                setModalLoading(true);
                setAttachmentUrls([]);
                setCurrentAttachmentIndex(0);
                try {
                    const response = await axiosInstance.get(`/api/admin/audit/attachment/${log.userID}`);
                    if (response.data.success) {
                        const { frontUrl, backUrl } = response.data;
                        const urls = [frontUrl];
                        if (backUrl) urls.push(backUrl);
                        setAttachmentUrls(urls);
                    } else {
                        throw new Error(response.data.message);
                    }
                } catch (error) {
                    toast.error('Could not load attachment.');
                    console.error('Attachment fetch error:', error);
                } finally {
                    setModalLoading(false);
                }
            };
            fetchAttachments();
        }
    }, [open, log]);

    const handlePrevAttachment = () => {
        setCurrentAttachmentIndex((prev) => (prev === 0 ? attachmentUrls.length - 1 : prev - 1));
    };

    const handleNextAttachment = () => {
        setCurrentAttachmentIndex((prev) => (prev === attachmentUrls.length - 1 ? 0 : prev + 1));
    };

    const handleOpenAttachmentViewer = () => {
        if (attachmentUrls.length > 0) {
            setIsAttachmentViewerOpen(true);
        }
    };

    const handleCloseAttachmentViewer = () => setIsAttachmentViewerOpen(false);

    const handleSubmit = async () => {
        if (!log || !verdict || !report.trim()) {
            toast.warn('Please select a verdict and provide a justification report.');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await axiosInstance.post('/api/admin/audit/override', {
                userID: log.userID,
                verdict,
                report,
            });

            if (response.data.success) {
                toast.success(`User has been manually ${verdict}.`);
                onSuccess(); // Trigger data refresh in parent
                onClose();   // Close the modal
            } else {
                throw new Error(response.data.message || 'An unknown error occurred.');
            }
        } catch (error) {
            console.error('Override submission error:', error);
            toast.error('Failed to submit override.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!log) return null;

    return (
        <>
            <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
                <DialogTitle sx={{ fontWeight: 600 }}>Manual Registration Audit</DialogTitle>
                <DialogContent dividers>
                    {/* Attachment Viewer */}
                    <Box sx={{ mb: 3, textAlign: 'center' }}>
                        <Typography variant="h6" gutterBottom>Attachments</Typography>
                        <Box 
                            onClick={handleOpenAttachmentViewer}
                            sx={{ 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center', 
                                position: 'relative', 
                                height: 400, 
                                backgroundColor: '#f0f0f0', 
                                borderRadius: 2,
                                cursor: attachmentUrls.length > 0 ? 'pointer' : 'default',
                                '&:hover': {
                                    backgroundColor: attachmentUrls.length > 0 ? '#e0e0e0' : '#f0f0f0'
                                }
                            }}
                        >
                            {modalLoading ? <CircularProgress /> : attachmentUrls.length > 0 ? (
                                <>
                                    <img 
                                        src={attachmentUrls[currentAttachmentIndex]} 
                                        alt="Attachment" 
                                        style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} 
                                        onContextMenu={(e) => e.preventDefault()}
                                    />
                                    {attachmentUrls.length > 1 && (
                                        <>
                                            <IconButton onClick={(e) => { e.stopPropagation(); handlePrevAttachment(); }} sx={{ position: 'absolute', left: 8, zIndex: 1, backgroundColor: 'rgba(0,0,0,0.3)', '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)'} }}><ArrowBackIosNew sx={{ color: 'white' }} /></IconButton>
                                            <IconButton onClick={(e) => { e.stopPropagation(); handleNextAttachment(); }} sx={{ position: 'absolute', right: 8, zIndex: 1, backgroundColor: 'rgba(0,0,0,0.3)', '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)'} }}><ArrowForwardIos sx={{ color: 'white' }} /></IconButton>
                                        </>
                                    )}
                                </>
                            ) : <Typography>No attachments found.</Typography>}
                        </Box>
                    </Box>

                    {/* User Details */}
                    <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                        <Table size="small">
                            <TableBody>
                                <TableRow><TableCell><strong>Username</strong></TableCell><TableCell>{log.username}</TableCell></TableRow>
                                <TableRow><TableCell><strong>Full Name</strong></TableCell><TableCell>{log.fullName}</TableCell></TableRow>
                                <TableRow><TableCell><strong>Email Address</strong></TableCell><TableCell>{log.emailAddress}</TableCell></TableRow>
                                <TableRow><TableCell><strong>Date of Birth</strong></TableCell><TableCell>{new Date(log.dateOfBirth).toLocaleDateString()}</TableCell></TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* Verdict and Report */}
                    <Box>
                        <Typography variant="h6" gutterBottom>Admin Verdict</Typography>
                        <Select
                            fullWidth
                            value={verdict}
                            onChange={(e: SelectChangeEvent) => setVerdict(e.target.value as 'approved' | 'rejected' | '')}
                            displayEmpty
                            sx={{ mb: 2 }}
                        >
                            <MenuItem value="" disabled><em>Select a Verdict</em></MenuItem>
                            <MenuItem value="approved">Approve</MenuItem>
                            <MenuItem value="rejected">Reject</MenuItem>
                        </Select>
                        <TextField
                            fullWidth
                            multiline
                            rows={6}
                            label="Justification Report"
                            placeholder="Provide a detailed reason for the manual override..."
                            value={report}
                            onChange={(e) => setReport(e.target.value)}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={isSubmitting || !verdict || !report.trim()}>
                        {isSubmitting ? <CircularProgress size={24} /> : 'Submit Verdict'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Large Attachment Viewer Modal */}
            <Dialog 
                open={isAttachmentViewerOpen} 
                onClose={handleCloseAttachmentViewer} 
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
                    {attachmentUrls.length > 0 ? (
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
                    <Button onClick={handleCloseAttachmentViewer}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AuditSummaryModal;
