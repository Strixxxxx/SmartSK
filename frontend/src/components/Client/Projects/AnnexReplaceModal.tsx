import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

interface AnnexReplaceModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    annexName: string;
    accept: string;
    onConfirm: (file: File) => void;
    loading?: boolean;
}

const AnnexReplaceModal: React.FC<AnnexReplaceModalProps> = ({
    open,
    onClose,
    title,
    annexName,
    accept,
    onConfirm,
    loading = false
}) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    useEffect(() => {
        if (open) {
            setSelectedFile(null);
        }
    }, [open]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setSelectedFile(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleConfirm = () => {
        if (selectedFile) {
            onConfirm(selectedFile);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: '#1e3a8a' }}>
                    {title}
                </Typography>
                <IconButton onClick={onClose} size="small" sx={{ color: '#64748b' }} disabled={loading}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 3, backgroundColor: '#f8fafc' }}>
                <Typography variant="subtitle2" sx={{ mb: 2, color: '#475569', fontWeight: 600 }}>
                    Select a new file to replace the existing {annexName}.
                </Typography>

                <Box
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px dashed #cbd5e1',
                        borderRadius: '8px',
                        p: 4,
                        bgcolor: 'white',
                        mb: 3,
                        cursor: 'pointer',
                        '&:hover': { borderColor: '#1e3a8a' },
                        transition: 'border-color 0.2s',
                        textAlign: 'center'
                    }}
                >
                    <input
                        accept={accept}
                        style={{ display: 'none' }}
                        id="replace-file-input"
                        type="file"
                        onChange={handleFileChange}
                    />
                    <label htmlFor="replace-file-input" style={{ width: '100%', height: '100%', cursor: 'pointer' }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <CloudUploadIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
                            <Typography variant="h6" color="#334155" sx={{ mb: 0.5, fontWeight: 600 }}>
                                Drag & Drop or Click to Upload
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Supported formats: {accept.replace(/\./g, ' ').toUpperCase()}
                            </Typography>
                        </Box>
                    </label>
                </Box>

                {selectedFile && (
                    <Box sx={{ display: 'flex', alignItems: 'center', p: 2, bgcolor: 'white', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                        <InsertDriveFileIcon sx={{ color: '#64748b', mr: 2, fontSize: 32 }} />
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: '#334155' }}>
                                {selectedFile.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {(selectedFile.size / 1024).toFixed(1)} KB
                            </Typography>
                        </Box>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f1f5f9' } }} disabled={loading}>
                    Cancel
                </Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    sx={{ bgcolor: '#1e3a8a', '&:hover': { bgcolor: '#1d4ed8' } }}
                    disabled={!selectedFile || loading}
                >
                    {loading ? 'Replacing...' : 'Replace File'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AnnexReplaceModal;
