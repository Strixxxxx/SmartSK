import React, { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    CircularProgress,
    Typography,
    Box,
    Alert
} from '@mui/material';
import axios from '../../../backend connection/axiosConfig';
import { toastSuccess, toastError } from '../../../utils/ProjectCycleToast';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

interface SkResolutionUploadModalProps {
    open: boolean;
    cycleID: number;
    onClose: () => void;
    onSuccess: () => void;
}

const SkResolutionUploadModal: React.FC<SkResolutionUploadModalProps> = ({ open, cycleID, onClose, onSuccess }) => {
    const [file, setFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [status, setStatus] = useState<string>('');
    const [revisionComment, setRevisionComment] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open && cycleID) {
            fetchProponentDetails();
        }
    }, [open, cycleID]);

    const fetchProponentDetails = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/project-tracker/sk-resolution/proponent/${cycleID}`);
            if (res.data.success && res.data.data) {
                setStatus(res.data.data.status);
                setRevisionComment(res.data.data.revisionComment);
            }
        } catch (err) {
            console.error('Failed to load proponent details', err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            toastError('Please select a file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('cycleID', cycleID.toString());
        formData.append('sk_resolution', file);

        setSubmitting(true);
        try {
            const res = await axios.post('/api/project-tracker/sk-resolution/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success) {
                toastSuccess(res.data.message);
                onSuccess();
                onClose();
            }
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Failed to upload SK Resolution.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={!submitting ? onClose : undefined} maxWidth="sm" fullWidth>
            <DialogTitle>Upload SK Resolution</DialogTitle>
            <DialogContent dividers>
                {loading ? (
                    <Box display="flex" justifyContent="center" p={3}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box display="flex" flexDirection="column" gap={2}>
                        <Typography variant="body2" color="textSecondary">
                            Please upload the signed SK Resolution document (PDF or Word format).
                        </Typography>

                        {status === 'REVISION_REQUESTED' && revisionComment && (
                            <Alert severity="warning">
                                <strong>Revision Requested:</strong> {revisionComment}
                            </Alert>
                        )}

                        <Box 
                            sx={{ 
                                border: '2px dashed #cbd5e1', 
                                borderRadius: '8px', 
                                p: 3, 
                                textAlign: 'center',
                                backgroundColor: '#f8fafc'
                            }}
                        >
                            <input
                                type="file"
                                accept=".pdf,.doc,.docx"
                                style={{ display: 'none' }}
                                ref={fileInputRef}
                                onChange={handleFileChange}
                            />
                            <Button
                                variant="outlined"
                                startIcon={<CloudUploadIcon />}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={submitting}
                            >
                                Select File
                            </Button>
                            {file && (
                                <Typography variant="body2" sx={{ mt: 2, color: '#0f172a', fontWeight: 500 }}>
                                    {file.name}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={handleUpload} 
                    disabled={submitting || !file}
                >
                    {submitting ? <CircularProgress size={24} color="inherit" /> : 'Upload'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SkResolutionUploadModal;
