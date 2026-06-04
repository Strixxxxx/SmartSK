import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    CircularProgress,
    Typography,
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Radio
} from '@mui/material';
import axios from '../../../backend connection/axiosConfig';
import { toastSuccess, toastError } from '../../../utils/ProjectCycleToast';

interface AssignProponentModalProps {
    open: boolean;
    cycleID: number;
    onClose: () => void;
    onSuccess: () => void;
}

interface Kagawad {
    userID: number;
    fullName: string;
    position: string;
}

const AssignProponentModal: React.FC<AssignProponentModalProps> = ({ open, cycleID, onClose, onSuccess }) => {
    const [kagawads, setKagawads] = useState<Kagawad[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUserID, setSelectedUserID] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);

    useEffect(() => {
        if (open && cycleID) {
            fetchKagawads();
        }
    }, [open, cycleID]);

    const fetchKagawads = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/project-tracker/sk-kagawads/${cycleID}`);
            if (res.data.success) {
                setKagawads(res.data.data);
            }
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Failed to load SK Kagawads.');
        } finally {
            setLoading(false);
        }
    };

    const handleAssignClick = () => {
        if (!selectedUserID) {
            toastError('Please select a Kagawad to assign.');
            return;
        }
        setConfirmOpen(true);
    };

    const executeAssign = async () => {
        setSubmitting(true);
        try {
            const res = await axios.post('/api/project-tracker/sk-resolution/assign-proponent', {
                cycleID,
                assignedUserID: selectedUserID
            });
            if (res.data.success) {
                toastSuccess(res.data.message);
                onSuccess();
                setConfirmOpen(false);
                onClose();
            }
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Failed to assign proponent.');
            setSubmitting(false);
            setConfirmOpen(false);
        }
    };

    const selectedKagawad = kagawads.find(k => k.userID === selectedUserID);

    return (
        <>
        <Dialog open={open} onClose={!submitting ? onClose : undefined} maxWidth="sm" fullWidth>
            <DialogTitle>Assign Proponent</DialogTitle>
            <DialogContent dividers sx={{ overflowX: 'hidden' }}>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Select an SK Kagawad to assign as the proponent for the SK Resolution. Only one proponent can be assigned.
                </Typography>
                
                {loading ? (
                    <Box display="flex" justifyContent="center" p={3}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <TableContainer sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden' }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ backgroundColor: '#f3f4f6' }}>
                                    <TableCell width="50">Select</TableCell>
                                    <TableCell>Full Name</TableCell>
                                    <TableCell>Position</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {kagawads.length > 0 ? kagawads.map((k) => (
                                    <TableRow key={k.userID} hover onClick={() => setSelectedUserID(k.userID)} sx={{ cursor: 'pointer' }}>
                                        <TableCell>
                                            <Radio
                                                checked={selectedUserID === k.userID}
                                                onChange={() => setSelectedUserID(k.userID)}
                                                value={k.userID}
                                                name="radio-buttons"
                                                inputProps={{ 'aria-label': k.fullName }}
                                            />
                                        </TableCell>
                                        <TableCell>{k.fullName}</TableCell>
                                        <TableCell>{k.position}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={3} align="center">No SK Kagawads found.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>Cancel</Button>
                <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={handleAssignClick} 
                    disabled={!selectedUserID}
                >
                    Confirm Assignment
                </Button>
            </DialogActions>
        </Dialog>

        {/* Confirmation Modal */}
        <Dialog open={confirmOpen} onClose={!submitting ? () => setConfirmOpen(false) : undefined} maxWidth="xs" fullWidth>
            <DialogTitle>Confirm Assignment</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body1">
                    Are you sure you want to assign <strong>{selectedKagawad?.fullName}</strong> as the proponent?
                </Typography>
                <Typography variant="body2" color="error" sx={{ mt: 2 }}>
                    This action is irreversible.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setConfirmOpen(false)} disabled={submitting}>Cancel</Button>
                <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={executeAssign} 
                    disabled={submitting}
                >
                    {submitting ? <CircularProgress size={24} color="inherit" /> : 'Yes, Assign'}
                </Button>
            </DialogActions>
        </Dialog>
        </>
    );
};

export default AssignProponentModal;
