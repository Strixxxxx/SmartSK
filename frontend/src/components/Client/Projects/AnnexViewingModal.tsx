import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, IconButton
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';

interface AnnexViewingModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    type: 'pdf' | 'image' | 'carousel';
    urls: string[];
    showReuseCheckbox?: boolean;
    reuseChecked?: boolean;
    onReuseChange?: (checked: boolean) => void;
}

const AnnexViewingModal: React.FC<AnnexViewingModalProps> = ({ open, onClose, title, type, urls, showReuseCheckbox, reuseChecked, onReuseChange }) => {
    const [activeIndex, setActiveIndex] = useState(0);

    const handlePrev = () => {
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : urls.length - 1));
    };

    const handleNext = () => {
        setActiveIndex((prev) => (prev < urls.length - 1 ? prev + 1 : 0));
    };

    // Reset index on open
    useEffect(() => {
        if (open) {
            setActiveIndex(0);
        }
    }, [open]);

    const isPdf = type === 'pdf';
    const isCarousel = type === 'carousel';

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', borderBottom: '1px solid #e2e8f0' }}>
                <Typography variant="h6" component="div" sx={{ fontWeight: 'bold', color: '#1e3a8a' }}>
                    {title}
                </Typography>
            </DialogTitle>
            <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', minHeight: '400px' }}>
                {urls.length === 0 ? (
                    <Typography variant="body1" color="text.secondary">No files uploaded.</Typography>
                ) : isPdf ? (
                    <Box sx={{ width: '100%', height: '600px', display: 'flex', flexDirection: 'column' }}>
                        <iframe 
                            src={urls[0]} 
                            title={title} 
                            width="100%" 
                            height="100%" 
                            style={{ border: 'none', borderRadius: '4px' }} 
                        />
                    </Box>
                ) : isCarousel ? (
                    <Box sx={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '500px', overflow: 'hidden', borderRadius: '4px', bgcolor: '#0f172a' }}>
                            <img 
                                src={urls[activeIndex]} 
                                alt={`Campaign Proof ${activeIndex + 1}`} 
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                            />
                            
                            {urls.length > 1 && (
                                <>
                                    <IconButton 
                                        onClick={handlePrev} 
                                        sx={{ position: 'absolute', left: 16, bgcolor: 'rgba(255,255,255,0.2)', color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.4)' } }}
                                    >
                                        <ArrowBackIosNewIcon />
                                    </IconButton>
                                    <IconButton 
                                        onClick={handleNext} 
                                        sx={{ position: 'absolute', right: 16, bgcolor: 'rgba(255,255,255,0.2)', color: 'white', '&:hover': { bgcolor: 'rgba(255,255,255,0.4)' } }}
                                    >
                                        <ArrowForwardIosIcon />
                                    </IconButton>
                                </>
                            )}
                        </Box>
                        <Typography variant="body2" sx={{ mt: 2, fontWeight: 500, color: '#334155' }}>
                            Image {activeIndex + 1} of {urls.length}
                        </Typography>
                    </Box>
                ) : (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', maxHeight: '550px', overflow: 'auto', borderRadius: '4px', bgcolor: 'white', p: 1, border: '1px solid #e2e8f0' }}>
                        <img 
                            src={urls[0]} 
                            alt={title} 
                            style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }} 
                        />
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0', justifyContent: showReuseCheckbox ? 'space-between' : 'flex-end' }}>
                {showReuseCheckbox && onReuseChange && (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            id="reuse-checkbox"
                            checked={reuseChecked}
                            onChange={(e) => onReuseChange(e.target.checked)}
                            style={{ width: '18px', height: '18px', marginRight: '8px', cursor: 'pointer' }}
                        />
                        <Typography component="label" htmlFor="reuse-checkbox" variant="body2" sx={{ fontWeight: 600, color: '#1e3a8a', cursor: 'pointer' }}>
                            Reuse this file
                        </Typography>
                    </Box>
                )}
                <Button onClick={onClose} variant="outlined" sx={{ borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f1f5f9' } }}>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AnnexViewingModal;
