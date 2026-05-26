import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, IconButton, Grid, Card, CardMedia
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AnnexViewingModal from './AnnexViewingModal';

interface CampaignProofUploadModalProps {
    open: boolean;
    onClose: () => void;
    files: File[];
    onChange: (files: File[]) => void;
}

const CampaignProofUploadModal: React.FC<CampaignProofUploadModalProps> = ({ open, onClose, files, onChange }) => {
    const [localFiles, setLocalFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [viewUrl, setViewUrl] = useState<string>('');
    const [viewFilename, setViewFilename] = useState<string>('');

    // New state for 2MB limit warning modal
    const [warningModalOpen, setWarningModalOpen] = useState(false);
    const [skippedFiles, setSkippedFiles] = useState<string[]>([]);

    useEffect(() => {
        if (open) {
            setLocalFiles(files);
        }
    }, [open, files]);

    useEffect(() => {
        // Generate preview URLs
        const newPreviews = localFiles.map(file => URL.createObjectURL(file));
        setPreviews(newPreviews);

        // Cleanup function to avoid memory leak
        return () => {
            newPreviews.forEach(url => URL.revokeObjectURL(url));
        };
    }, [localFiles]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const addedFiles = Array.from(e.target.files);
            const validFiles: File[] = [];
            const invalidFiles: string[] = [];

            addedFiles.forEach(file => {
                if (file.size > 2 * 1024 * 1024) { // 2MB limit
                    invalidFiles.push(file.name);
                } else {
                    validFiles.push(file);
                }
            });

            if (invalidFiles.length > 0) {
                setSkippedFiles(invalidFiles);
                setWarningModalOpen(true);
            }

            if (validFiles.length > 0) {
                setLocalFiles(prev => [...prev, ...validFiles]);
            }
        }
    };

    const handleRemoveFile = (index: number) => {
        setLocalFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleConfirm = () => {
        onChange(localFiles);
        onClose();
    };

    const handlePreviewClick = (url: string, filename: string) => {
        setViewUrl(url);
        setViewFilename(filename);
        setViewModalOpen(true);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: '#1e3a8a' }}>
                    Upload Campaign Proofs (Annex 2)
                </Typography>
                <IconButton onClick={onClose} size="small" sx={{ color: '#64748b' }}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 3, backgroundColor: '#f8fafc' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1', borderRadius: '8px', p: 4, bgcolor: 'white', mb: 3, '&:hover': { borderColor: '#1e3a8a' }, transition: 'border-color 0.2s' }}>
                    <input
                        accept="image/*"
                        style={{ display: 'none' }}
                        id="campaign-files-input"
                        multiple
                        type="file"
                        onChange={handleFileChange}
                    />
                    <label htmlFor="campaign-files-input" style={{ width: '100%', height: '100%', cursor: 'pointer', textAlign: 'center' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <CloudUploadIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
                            <Typography variant="h6" color="#334155" sx={{ mb: 0.5, fontWeight: 600 }}>
                                Drag & Drop or Click to Upload
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Select screenshots of Google Form results or door-to-door photos (PNG, JPG, JPEG)
                            </Typography>
                            <Typography variant="caption" sx={{ mt: 1, color: '#1e3a8a', fontWeight: 500 }}>
                                Supports uploading multiple files at once (10+ images recommended for documentation)
                            </Typography>
                        </Box>
                    </label>
                </Box>

                {localFiles.length > 0 && (
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 'bold', color: '#334155' }}>
                            Selected Files ({localFiles.length})
                        </Typography>
                        <Grid container spacing={2}>
                            {localFiles.map((file, idx) => (
                                <Grid size={{ xs: 6, sm: 4, md: 3 }} key={idx}>
                                    <Card sx={{ position: 'relative', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                                        <CardMedia
                                            component="img"
                                            height="120"
                                            image={previews[idx] || ''}
                                            alt={file.name}
                                            sx={{ objectFit: 'cover', cursor: 'pointer' }}
                                            onClick={() => handlePreviewClick(previews[idx], file.name)}
                                        />
                                        <Box sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'white' }}>
                                            <Typography variant="caption" noWrap sx={{ maxWidth: '75%', fontWeight: 500 }}>
                                                {file.name}
                                            </Typography>
                                            <IconButton 
                                                size="small" 
                                                onClick={() => handleRemoveFile(idx)} 
                                                sx={{ color: '#ef4444', p: 0.5, '&:hover': { bgcolor: '#fef2f2' } }}
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f1f5f9' } }}>
                    Cancel
                </Button>
                <Button 
                    onClick={handleConfirm} 
                    variant="contained" 
                    sx={{ bgcolor: '#1e3a8a', '&:hover': { bgcolor: '#1d4ed8' } }}
                    disabled={localFiles.length === 0}
                >
                    Confirm Selection
                </Button>
            </DialogActions>

            {/* Preview Modal for individual image */}
            <AnnexViewingModal
                open={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                title={viewFilename}
                type="image"
                urls={[viewUrl]}
            />

            {/* 2MB Limit Warning Modal */}
            <Dialog open={warningModalOpen} onClose={() => setWarningModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 'bold', color: '#ef4444' }}>File Size Limit Exceeded</DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 2 }}>
                        The following files exceed the 2MB system limit and were not included in the upload:
                    </Typography>
                    <Box sx={{ maxHeight: 150, overflowY: 'auto', bgcolor: '#fef2f2', p: 2, borderRadius: 1, border: '1px solid #fecaca' }}>
                        {skippedFiles.map((name, idx) => (
                            <Typography key={idx} variant="body2" sx={{ color: '#b91c1c', mb: 0.5 }}>• {name}</Typography>
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setWarningModalOpen(false)} variant="contained" color="error">
                        Understood
                    </Button>
                </DialogActions>
            </Dialog>
        </Dialog>
    );
};

export default CampaignProofUploadModal;
