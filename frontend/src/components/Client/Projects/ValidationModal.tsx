import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, IconButton, List, ListItemText, ListItemIcon, ListItemButton,
    Select, MenuItem, FormControl, InputLabel, TextField
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import DownloadIcon from '@mui/icons-material/Download';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface ValidationModalProps {
    open: boolean;
    onClose: () => void;
    onApprove: () => void;
    onRequestRevision: (comment: string) => void;
    isApproving: boolean;
    isRequestingRevision: boolean;
    uploadedFiles: {
        noticeLetter: boolean;
        masterDataset: boolean;
        campaignProofs: number;
    };
    noticeLetterUrl?: string;
    masterDatasetUrl?: string;
    campaignProofUrls?: string[];
}

const ValidationModal: React.FC<ValidationModalProps> = ({
    open, onClose, onApprove, onRequestRevision, isApproving, isRequestingRevision,
    noticeLetterUrl, masterDatasetUrl, campaignProofUrls
}) => {
    const [step, setStep] = useState<1 | 2>(1);
    const [selectedAnnex, setSelectedAnnex] = useState<'notice' | 'proofs' | 'dataset'>('notice');
    const [verdict, setVerdict] = useState<'Approved' | 'Revision'>('Approved');
    const [comment, setComment] = useState('');
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    useEffect(() => {
        if (!open) {
            setStep(1);
            setVerdict('Approved');
            setComment('');
            setSelectedAnnex('notice');
            setCurrentImageIndex(0);
        }
    }, [open]);

    const handleSubmit = () => {
        if (verdict === 'Approved') {
            onApprove();
        } else {
            onRequestRevision(comment);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" PaperProps={{ sx: { height: '80vh' } }}>
            <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
                    Validate Checkpoint 1 Documents {step === 2 && '- Verdict'}
                </Typography>
                <IconButton onClick={onClose} size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            
            <DialogContent sx={{ p: 0, display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
                {step === 1 ? (
                    <>
                        {/* Sidebar */}
                        <Box sx={{ width: 280, borderRight: '1px solid #e2e8f0', bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
                            <List sx={{ p: 1 }}>
                                <ListItemButton 
                                    selected={selectedAnnex === 'notice'}
                                    onClick={() => { setSelectedAnnex('notice'); setCurrentImageIndex(0); }}
                                    sx={{ borderRadius: 1, mb: 0.5, '&.Mui-selected': { bgcolor: '#e0e7ff' } }}
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <InsertDriveFileIcon color={selectedAnnex === 'notice' ? 'primary' : 'inherit'} />
                                    </ListItemIcon>
                                    <ListItemText 
                                        primary="Annex 1" 
                                        secondary="Notice Letter" 
                                        primaryTypographyProps={{ variant: 'subtitle2', fontWeight: 'bold' }} 
                                    />
                                </ListItemButton>
                                
                                <ListItemButton 
                                    selected={selectedAnnex === 'proofs'}
                                    onClick={() => { setSelectedAnnex('proofs'); setCurrentImageIndex(0); }}
                                    sx={{ borderRadius: 1, mb: 0.5, '&.Mui-selected': { bgcolor: '#e0e7ff' } }}
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <ImageIcon color={selectedAnnex === 'proofs' ? 'primary' : 'inherit'} />
                                    </ListItemIcon>
                                    <ListItemText 
                                        primary="Annex 2" 
                                        secondary="Campaign Proofs" 
                                        primaryTypographyProps={{ variant: 'subtitle2', fontWeight: 'bold' }} 
                                    />
                                </ListItemButton>

                                <ListItemButton 
                                    selected={selectedAnnex === 'dataset'}
                                    onClick={() => { setSelectedAnnex('dataset'); setCurrentImageIndex(0); }}
                                    sx={{ borderRadius: 1, '&.Mui-selected': { bgcolor: '#e0e7ff' } }}
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <InsertDriveFileIcon color={selectedAnnex === 'dataset' ? 'primary' : 'inherit'} />
                                    </ListItemIcon>
                                    <ListItemText 
                                        primary="Annex 4" 
                                        secondary="Master Dataset" 
                                        primaryTypographyProps={{ variant: 'subtitle2', fontWeight: 'bold' }} 
                                    />
                                </ListItemButton>
                            </List>
                        </Box>

                        {/* Workspace Preview */}
                        <Box sx={{ flexGrow: 1, bgcolor: '#e2e8f0', p: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'auto' }}>
                            {selectedAnnex === 'notice' && noticeLetterUrl && (
                                noticeLetterUrl.toLowerCase().split('?')[0].endsWith('.pdf') ? (
                                    <iframe src={`${noticeLetterUrl}#toolbar=0`} width="100%" height="100%" style={{ border: 'none', background: 'white' }} title="Notice Letter" />
                                ) : (
                                    <img src={noticeLetterUrl} alt="Notice Letter" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                )
                            )}
                            
                            {selectedAnnex === 'proofs' && campaignProofUrls && campaignProofUrls.length > 0 && (
                                <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', p: 2 }}>
                                    <img 
                                        src={campaignProofUrls[currentImageIndex]} 
                                        alt={`Campaign Proof ${currentImageIndex + 1}`} 
                                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                                    />
                                    
                                    {campaignProofUrls.length > 1 && (
                                        <>
                                            <IconButton 
                                                onClick={() => setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : campaignProofUrls.length - 1))}
                                                sx={{ position: 'absolute', left: 16, bgcolor: 'rgba(255, 255, 255, 0.8)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 1)' } }}
                                            >
                                                <ChevronLeftIcon />
                                            </IconButton>
                                            
                                            <IconButton 
                                                onClick={() => setCurrentImageIndex((prev) => (prev < campaignProofUrls.length - 1 ? prev + 1 : 0))}
                                                sx={{ position: 'absolute', right: 16, bgcolor: 'rgba(255, 255, 255, 0.8)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 1)' } }}
                                            >
                                                <ChevronRightIcon />
                                            </IconButton>
                                        </>
                                    )}

                                    <Typography 
                                        variant="caption" 
                                        sx={{ position: 'absolute', bottom: 16, bgcolor: 'rgba(0, 0, 0, 0.6)', color: 'white', px: 2, py: 0.5, borderRadius: 4 }}
                                    >
                                        Attempt {campaignProofUrls[currentImageIndex].match(/\/Campaign_Proof\/(\d+)\//i)?.[1] || '?'} - Image {currentImageIndex + 1} of {campaignProofUrls.length}
                                    </Typography>
                                </Box>
                            )}

                            {selectedAnnex === 'dataset' && masterDatasetUrl && (
                                <Box sx={{ textAlign: 'center', bgcolor: 'white', p: 6, borderRadius: 2, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                    <InsertDriveFileIcon sx={{ fontSize: 64, color: '#10b981', mb: 2 }} />
                                    <Typography variant="h6" sx={{ mb: 1 }}>Master Youth Dataset</Typography>
                                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                        Click the button below to download and review the .xlsx file.
                                    </Typography>
                                    <Button 
                                        variant="contained" 
                                        color="success" 
                                        startIcon={<DownloadIcon />}
                                        onClick={() => window.open(masterDatasetUrl, '_blank')}
                                    >
                                        Download Dataset
                                    </Button>
                                </Box>
                            )}
                        </Box>
                    </>
                ) : (
                    <Box sx={{ flexGrow: 1, p: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Submit Your Verdict</Typography>
                        <FormControl fullWidth>
                            <InputLabel id="verdict-label">Verdict</InputLabel>
                            <Select
                                labelId="verdict-label"
                                value={verdict}
                                label="Verdict"
                                onChange={(e) => setVerdict(e.target.value as 'Approved' | 'Revision')}
                            >
                                <MenuItem value="Approved">Approved</MenuItem>
                                <MenuItem value="Revision">Revision</MenuItem>
                            </Select>
                        </FormControl>

                        {verdict === 'Revision' && (
                            <TextField
                                label="Revision Comment"
                                multiline
                                rows={6}
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Please provide insights regarding why you are asking for revision..."
                                fullWidth
                                required
                            />
                        )}
                        {verdict === 'Approved' && (
                            <Typography variant="body2" color="text.secondary">
                                Approving this checkpoint will automatically advance the project cycle to Checkpoint 2.
                            </Typography>
                        )}
                    </Box>
                )}
            </DialogContent>
            
            <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
                {step === 1 ? (
                    <>
                        <Button onClick={onClose} variant="outlined" sx={{ color: '#475569', borderColor: '#cbd5e1' }}>
                            Close
                        </Button>
                        <Button onClick={() => setStep(2)} variant="contained" sx={{ bgcolor: '#1e3a8a', '&:hover': { bgcolor: '#1d4ed8' } }}>
                            Next
                        </Button>
                    </>
                ) : (
                    <>
                        <Button onClick={() => setStep(1)} variant="outlined" sx={{ color: '#475569', borderColor: '#cbd5e1' }}>
                            Back
                        </Button>
                        <Button 
                            onClick={handleSubmit} 
                            variant="contained" 
                            color={verdict === 'Approved' ? 'success' : 'error'}
                            disabled={isApproving || isRequestingRevision || (verdict === 'Revision' && !comment.trim())}
                        >
                            {verdict === 'Approved' ? 'Approve' : 'Request Revision'}
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default ValidationModal;
