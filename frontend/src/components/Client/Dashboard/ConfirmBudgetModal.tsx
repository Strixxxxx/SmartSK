import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Typography, CircularProgress, DialogContentText, Box } from '@mui/material';
import axios from '../../../backend connection/axiosConfig';

interface ConfirmBudgetModalProps {
    open: boolean;
    batchID: number;
    selectedFile: File | null;
    onClose: () => void;
    onSuccess: () => void;
}

const ConfirmBudgetModal: React.FC<ConfirmBudgetModalProps> = ({
    open,
    batchID,
    selectedFile,
    onClose,
    onSuccess
}) => {
    const [budgetInput, setBudgetInput] = useState<string>('');
    const [isSaving, setIsSaving] = useState(false);
    
    // Validation Modal State
    const [confirmationModalOpen, setConfirmationModalOpen] = useState(false);

    // New States
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [isValidatingOCR, setIsValidatingOCR] = useState(false);
    const [ocrWarningModalOpen, setOcrWarningModalOpen] = useState(false);
    const [ocrWarningMessage, setOcrWarningMessage] = useState('');

    useEffect(() => {
        if (open) {
            setBudgetInput('');
            setConfirmationModalOpen(false);
            setOcrWarningModalOpen(false);
        }
    }, [open]);

    useEffect(() => {
        if (open && selectedFile) {
            const objectUrl = URL.createObjectURL(selectedFile);
            setPreviewUrl(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        }
    }, [open, selectedFile]);

    const handleConfirmStep1 = async () => {
        const numericBudget = parseFloat(budgetInput.replace(/,/g, ''));
        if (isNaN(numericBudget) || numericBudget <= 0) {
            alert('Please enter a valid positive number for the budget.');
            return;
        }

        if (!selectedFile) {
            alert('No file selected for validation.');
            return;
        }

        setIsValidatingOCR(true);
        try {
            const formData = new FormData();
            formData.append('document', selectedFile);

            const ocrRes = await axios.post(`/api/project-documents/${batchID}/ocr-preview`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (ocrRes.data.success && ocrRes.data.extractedBudget) {
                const extractedBudget = parseFloat(ocrRes.data.extractedBudget);
                if (extractedBudget !== numericBudget) {
                    setOcrWarningMessage(`The entered amount (₱${numericBudget.toLocaleString()}) does not match the amount extracted from the file (₱${extractedBudget.toLocaleString()}). Please type the exact amount.`);
                    setOcrWarningModalOpen(true);
                    setIsValidatingOCR(false);
                    return;
                }
            } else if (ocrRes.data.ocrFailed) {
                setOcrWarningMessage(ocrRes.data.message || 'OCR extraction failed. Please ensure you uploaded a clear document with the exact budget format.');
                setOcrWarningModalOpen(true);
                setIsValidatingOCR(false);
                return;
            } else if (!ocrRes.data.success) {
                setOcrWarningMessage(ocrRes.data.message || 'Validation failed. Please try again.');
                setOcrWarningModalOpen(true);
                setIsValidatingOCR(false);
                return;
            }

            setConfirmationModalOpen(true);
        } catch (error: any) {
            setOcrWarningMessage('Failed to validate the document with the server. Please check your connection and try again.');
            setOcrWarningModalOpen(true);
        } finally {
            setIsValidatingOCR(false);
        }
    };

    const handleSave = async () => {
        const numericBudget = parseFloat(budgetInput.replace(/,/g, ''));
        if (isNaN(numericBudget) || numericBudget <= 0) {
            alert('Please enter a valid positive number for the budget.');
            return;
        }

        if (!selectedFile) {
            alert('No file selected for upload.');
            return;
        }

        setIsSaving(true);
        try {
            // First upload the document
            const formData = new FormData();
            formData.append('document', selectedFile);
            formData.append('category', 'EstIncomeCert');

            const uploadRes = await axios.post(`/api/project-documents/${batchID}/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (!uploadRes.data.success) {
                throw new Error('Document upload failed');
            }

            // Then save the budget
            const res = await axios.patch(`/api/project-batch/${batchID}/budget`, {
                budget: numericBudget
            });
            if (res.data.success) {
                alert('Budget and document saved successfully!');
                setConfirmationModalOpen(false);
                onSuccess();
            }
        } catch (error: any) {
            alert(error.response?.data?.message || error.message || 'Failed to save budget and document.');
            setIsSaving(false);
        }
    };

    const handleDialogClose = (_event: any, reason: string) => {
        if (reason === 'backdropClick') return;
        if (!isSaving) {
            onClose();
        }
    };

    return (
        <>
            <Dialog 
                open={open && !confirmationModalOpen} 
                onClose={handleDialogClose} 
                maxWidth="md" 
                fullWidth
                disableEscapeKeyDown={isSaving}
                sx={{ '& .MuiDialog-paper': { height: '85vh', maxHeight: '900px', width: '1000px', maxWidth: '90vw' } }}
            >
                <DialogTitle>Estimated Annual Budget</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', pb: 2 }}>
                    {previewUrl && (
                        <Box sx={{ flexGrow: 1, width: '100%', minHeight: 0, border: '1px solid #ccc', borderRadius: 1, overflow: 'hidden', mb: 2, mt: 1 }}>
                            {selectedFile?.type.startsWith('image/') ? (
                                <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                                <iframe src={previewUrl} title="Document Preview" style={{ width: '100%', height: '100%', border: 'none' }} />
                            )}
                        </Box>
                    )}
                    <Box sx={{ flexShrink: 0 }}>
                        <Typography sx={{ mb: 2 }}>
                            Please enter the Estimated Annual Budget for the ABYIP.
                        </Typography>

                    <TextField
                        autoFocus
                        margin="dense"
                        label="Estimated Annual Budget (PHP)"
                        type="number"
                        fullWidth
                        variant="outlined"
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        disabled={isSaving}
                        InputProps={{
                            startAdornment: <Typography sx={{ mr: 1 }}>₱</Typography>
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && budgetInput.trim() && !isSaving) {
                                handleConfirmStep1();
                            }
                        }}
                    />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} color="inherit" disabled={isSaving || isValidatingOCR}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleConfirmStep1} 
                        color="primary" 
                        variant="contained" 
                        disabled={!budgetInput.trim() || isSaving || isValidatingOCR}
                        startIcon={isValidatingOCR ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {isValidatingOCR ? 'Validating...' : 'Confirm'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Validation Confirmation Modal */}
            <Dialog 
                open={confirmationModalOpen} 
                onClose={(_event, reason) => {
                    if (reason === 'backdropClick') return;
                    if (!isSaving) setConfirmationModalOpen(false);
                }} 
                maxWidth="xs" 
                fullWidth
            >
                <DialogTitle>Confirm Allocation</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Is this the correct estimated annual budget?
                        <br /><br />
                        <Typography variant="h6" color="primary" sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                            ₱{parseFloat(budgetInput.replace(/,/g, '') || '0').toLocaleString()}
                        </Typography>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmationModalOpen(false)} color="inherit" disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSave} 
                        color="primary" 
                        variant="contained" 
                        disabled={isSaving}
                        startIcon={isSaving ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {isSaving ? 'Saving...' : 'Yes, Confirm'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* OCR Warning Modal */}
            <Dialog 
                open={ocrWarningModalOpen} 
                onClose={() => setOcrWarningModalOpen(false)} 
                maxWidth="xs" 
                fullWidth
            >
                <DialogTitle sx={{ color: '#ef4444', fontWeight: 'bold' }}>Validation Failed</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {ocrWarningMessage}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOcrWarningModalOpen(false)} variant="contained" color="error">
                        Understood
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default ConfirmBudgetModal;
