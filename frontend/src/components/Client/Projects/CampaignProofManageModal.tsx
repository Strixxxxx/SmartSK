import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, IconButton, Grid, Checkbox,
    List, ListItem, ListItemText, ListItemIcon
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PhotoIcon from '@mui/icons-material/Photo';
import CollectionsIcon from '@mui/icons-material/Collections';

interface CampaignProof {
    attachmentID: number;
    imageBlobName: string;
    uploadedAt: string;
    url: string;
}

interface CampaignProofManageModalProps {
    open: boolean;
    onClose: () => void;
    existingProofs: CampaignProof[];
    onConfirm: (reusedAttachmentIDs: number[], deletedAttachmentIDs: number[], newFiles: File[]) => void;
    loading?: boolean;
}

const CampaignProofManageModal: React.FC<CampaignProofManageModalProps> = ({
    open,
    onClose,
    existingProofs,
    onConfirm,
    loading = false
}) => {
    const [checkedAttachmentIDs, setCheckedAttachmentIDs] = useState<number[]>([]);
    const [deletedAttachmentIDs, setDeletedAttachmentIDs] = useState<number[]>([]);
    const [newFiles, setNewFiles] = useState<File[]>([]);
    const [activeImage, setActiveImage] = useState<{ type: 'existing' | 'new'; src: string; name: string } | null>(null);
    const [newPreviews, setNewPreviews] = useState<string[]>([]);

    // New state for 2MB limit warning modal
    const [warningModalOpen, setWarningModalOpen] = useState(false);
    const [skippedFiles, setSkippedFiles] = useState<string[]>([]);

    useEffect(() => {
        if (open) {
            // By default, only select proofs that are included
            setCheckedAttachmentIDs(existingProofs.map(p => p.attachmentID));
            setDeletedAttachmentIDs([]);
            setNewFiles([]);
            setNewPreviews([]);
            if (existingProofs.length > 0) {
                setActiveImage({
                    type: 'existing',
                    src: existingProofs[0].url,
                    name: existingProofs[0].imageBlobName.split('/').pop() || ''
                });
            } else {
                setActiveImage(null);
            }
        }
    }, [open, existingProofs]);

    // Clean up preview URLs
    useEffect(() => {
        return () => {
            newPreviews.forEach(url => URL.revokeObjectURL(url));
        };
    }, [newPreviews]);

    const handleCheckboxChange = (id: number) => {
        setCheckedAttachmentIDs(prev =>
            prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
        );
    };

    const handleDeleteExisting = (id: number) => {
        setDeletedAttachmentIDs(prev => [...prev, id]);
        setCheckedAttachmentIDs(prev => prev.filter(b => b !== id));
        
        // If the deleted image was active, clear it
        if (activeImage?.type === 'existing' && existingProofs.find(p => p.attachmentID === id)?.url === activeImage.src) {
            setActiveImage(null);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            filterAndAddFiles(files);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (e.dataTransfer.files) {
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            filterAndAddFiles(files);
        }
    };

    const filterAndAddFiles = (files: File[]) => {
        const validFiles: File[] = [];
        const invalidFiles: string[] = [];

        files.forEach(file => {
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
            addFiles(validFiles);
        }
    };

    const addFiles = (files: File[]) => {
        const addedPreviews = files.map(file => URL.createObjectURL(file));
        setNewPreviews(prev => [...prev, ...addedPreviews]);
        setNewFiles(prev => [...prev, ...files]);

        // Automatically set the first newly added file as active if no active image or first addition
        if (files.length > 0) {
            setActiveImage({
                type: 'new',
                src: addedPreviews[0],
                name: files[0].name
            });
        }
    };

    const handleRemoveNewFile = (idx: number) => {
        URL.revokeObjectURL(newPreviews[idx]);
        setNewPreviews(prev => prev.filter((_, i) => i !== idx));
        setNewFiles(prev => prev.filter((_, i) => i !== idx));

        // If the removed image was active, fallback to first existing
        if (activeImage && activeImage.type === 'new' && activeImage.name === newFiles[idx].name) {
            if (existingProofs.length > 0) {
                setActiveImage({
                    type: 'existing',
                    src: existingProofs[0].url,
                    name: existingProofs[0].imageBlobName.split('/').pop() || ''
                });
            } else {
                setActiveImage(null);
            }
        }
    };

    const handleConfirm = () => {
        onConfirm(checkedAttachmentIDs, deletedAttachmentIDs, newFiles);
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl">
            <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <CollectionsIcon sx={{ color: '#1e3a8a', mr: 1.5 }} />
                    <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: '#1e3a8a' }}>
                        Manage Campaign Proofs (Annex 2)
                    </Typography>
                </Box>
                <IconButton onClick={onClose} size="small" sx={{ color: '#64748b' }} disabled={loading}>
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 0, height: '70vh', display: 'flex' }}>
                <Grid container sx={{ height: '100%' }}>
                    {/* Left Sidebar (1/3 width) */}
                    <Grid sx={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid #cbd5e1', bgcolor: '#f8fafc', width: { xs: '100%', md: '33.33%' } }}>
                        {/* Top Section - Scrollable lists */}
                        <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 'calc(70vh - 180px)' }}>
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                                    Existing Uploads ({existingProofs.length})
                                </Typography>
                                {existingProofs.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">No proofs uploaded yet.</Typography>
                                ) : (
                                    <List dense sx={{ p: 0, bgcolor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                        {existingProofs.filter(p => !deletedAttachmentIDs.includes(p.attachmentID)).map((proof, idx) => {
                                            const name = proof.imageBlobName.split('/').pop() || '';
                                            const isChecked = checkedAttachmentIDs.includes(proof.attachmentID);
                                            const isActive = activeImage?.type === 'existing' && activeImage.src === proof.url;

                                            return (
                                                <ListItem
                                                    key={idx}
                                                    sx={{
                                                        borderBottom: '1px solid #f1f5f9',
                                                        cursor: 'pointer',
                                                        bgcolor: isActive ? '#eff6ff' : 'transparent',
                                                        '&:hover': { bgcolor: isActive ? '#eff6ff' : '#f8fafc' }
                                                    }}
                                                    onClick={() => setActiveImage({ type: 'existing', src: proof.url, name })}
                                                    secondaryAction={
                                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                            <Checkbox
                                                                edge="end"
                                                                checked={isChecked}
                                                                onChange={() => handleCheckboxChange(proof.attachmentID)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                sx={{ color: '#cbd5e1', '&.Mui-checked': { color: '#1e3a8a' }, mr: 1 }}
                                                            />
                                                            <IconButton
                                                                edge="end"
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteExisting(proof.attachmentID);
                                                                }}
                                                                sx={{ color: '#ef4444' }}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Box>
                                                    }
                                                >
                                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                                        <PhotoIcon sx={{ fontSize: 20, color: isChecked ? '#3b82f6' : '#94a3b8' }} />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={name}
                                                        primaryTypographyProps={{
                                                            noWrap: true,
                                                            variant: 'body2',
                                                            fontWeight: isActive ? 600 : 400,
                                                            color: isChecked ? '#1e293b' : '#94a3b8',
                                                            sx: { textDecoration: isChecked ? 'none' : 'line-through' }
                                                        }}
                                                    />
                                                </ListItem>
                                            );
                                        })}
                                    </List>
                                )}
                            </Box>

                            {newFiles.length > 0 && (
                                <Box>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                                        New Images to Upload ({newFiles.length})
                                    </Typography>
                                    <List dense sx={{ p: 0, bgcolor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                        {newFiles.map((file, idx) => {
                                            const isActive = activeImage?.type === 'new' && activeImage.name === file.name;

                                            return (
                                                <ListItem
                                                    key={idx}
                                                    sx={{
                                                        borderBottom: idx < newFiles.length - 1 ? '1px solid #f1f5f9' : 'none',
                                                        cursor: 'pointer',
                                                        bgcolor: isActive ? '#eff6ff' : 'transparent',
                                                        '&:hover': { bgcolor: isActive ? '#eff6ff' : '#f8fafc' }
                                                    }}
                                                    onClick={() => setActiveImage({ type: 'new', src: newPreviews[idx], name: file.name })}
                                                    secondaryAction={
                                                        <IconButton
                                                            edge="end"
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRemoveNewFile(idx);
                                                            }}
                                                            sx={{ color: '#ef4444' }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    }
                                                >
                                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                                        <PhotoIcon sx={{ fontSize: 20, color: '#10b981' }} />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={file.name}
                                                        primaryTypographyProps={{
                                                            noWrap: true,
                                                            variant: 'body2',
                                                            fontWeight: isActive ? 600 : 400,
                                                            color: '#0f766e'
                                                        }}
                                                    />
                                                </ListItem>
                                            );
                                        })}
                                    </List>
                                </Box>
                            )}
                        </Box>

                        {/* Bottom Section - Drag and drop zone */}
                        <Box sx={{ p: 2, borderTop: '1px solid #cbd5e1', bgcolor: 'white' }}>
                            <Box
                                onDrop={handleDrop}
                                onDragOver={(e) => e.preventDefault()}
                                sx={{
                                    border: '2px dashed #cbd5e1',
                                    borderRadius: '8px',
                                    p: 2,
                                    bgcolor: '#f8fafc',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    '&:hover': { borderColor: '#1e3a8a', bgcolor: '#f1f5f9' },
                                    transition: 'all 0.2s'
                                }}
                            >
                                <input
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    id="proofs-replace-input"
                                    multiple
                                    type="file"
                                    onChange={handleFileChange}
                                />
                                <label htmlFor="proofs-replace-input" style={{ cursor: 'pointer', display: 'block', width: '100%' }}>
                                    <CloudUploadIcon sx={{ fontSize: 32, color: '#94a3b8', mb: 0.5 }} />
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569' }}>
                                        Drag & Drop or Click to Add
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        PNG, JPG, JPEG
                                    </Typography>
                                </label>
                            </Box>
                        </Box>
                    </Grid>

                    {/* Right Viewer Panel (2/3 width) */}
                    <Grid sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0f172a', p: 2, justifyContent: 'center', alignItems: 'center', width: { xs: '100%', md: '66.66%' } }}>
                        {activeImage ? (
                            <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                                    <img
                                        src={activeImage.src}
                                        alt={activeImage.name}
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }}
                                    />
                                </Box>
                                <Typography variant="caption" noWrap sx={{ color: '#94a3b8', mt: 1.5, textAlign: 'center', width: '100%', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                    Viewing: {activeImage.name} ({activeImage.type === 'new' ? 'New Upload' : 'Existing'})
                                </Typography>
                            </Box>
                        ) : (
                            <Box sx={{ textAlign: 'center', color: '#64748b' }}>
                                <PhotoIcon sx={{ fontSize: 64, mb: 1, color: '#334155' }} />
                                <Typography variant="body1">Select an image from the sidebar to view it</Typography>
                            </Box>
                        )}
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: '1px solid #cbd5e1' }}>
                <Button onClick={onClose} variant="outlined" sx={{ borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f1f5f9' } }} disabled={loading}>
                    Cancel
                </Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    sx={{ bgcolor: '#1e3a8a', '&:hover': { bgcolor: '#1d4ed8' } }}
                    disabled={(checkedAttachmentIDs.length === 0 && newFiles.length === 0 && deletedAttachmentIDs.length === 0) || loading}
                >
                    {loading ? 'Saving Changes...' : 'Save & Upload'}
                </Button>
            </DialogActions>

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

export default CampaignProofManageModal;
