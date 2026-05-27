import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress, Typography } from '@mui/material';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';

interface ProjectCycle {
    cycleID: number;
    targetFiscalYear: string;
    termStartYear: string;
    termEndYear: string;
    displayName: string;
}

interface DeleteCycleModalProps {
    open: boolean;
    onClose: () => void;
    onDeleteSuccess: () => void;
}

const DeleteCycleModal: React.FC<DeleteCycleModalProps> = ({ open, onClose, onDeleteSuccess }) => {
    const [cycles, setCycles] = useState<ProjectCycle[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    const fetchCycles = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get('/api/admin/proj-archive/cycles');
            if (res.data.success) {
                setCycles(res.data.cycles);
            }
        } catch (error) {
            console.error('Failed to fetch cycles:', error);
            toast.error('Failed to load project cycles');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            fetchCycles();
        }
    }, [open]);

    const handleDelete = async (cycleID: number) => {
        if (!window.confirm('Are you sure you want to delete this cycle? All associated project batches, submissions, and files on Azure storage will be permanently deleted. This action cannot be undone.')) return;
        
        setDeletingId(cycleID);
        try {
            const res = await axiosInstance.delete(`/api/admin/proj-archive/cycles/${cycleID}`);
            if (res.data.success) {
                toast.success('Project cycle deleted successfully');
                onDeleteSuccess(); // Trigger refresh on parent if needed
                onClose(); // Close modal
            } else {
                toast.error(res.data.message || 'Failed to delete cycle');
            }
        } catch (error) {
            console.error('Delete error:', error);
            toast.error('An error occurred while deleting');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 'bold', color: 'error.main' }}>Delete Project Cycle</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Select a project cycle to delete. Deleting a cycle will automatically and permanently delete all its associated project batches, submissions, and stored files.
                </Typography>
                
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                        <CircularProgress />
                    </div>
                ) : cycles.length === 0 ? (
                    <Typography align="center" color="textSecondary" sx={{ p: 2 }}>
                        No active project cycles available.
                    </Typography>
                ) : (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Project Cycle</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>Action</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {cycles.map(cycle => (
                                    <TableRow key={cycle.cycleID}>
                                        <TableCell>{cycle.displayName}</TableCell>
                                        <TableCell align="right">
                                            <Button 
                                                variant="outlined" 
                                                color="error" 
                                                size="small"
                                                disabled={deletingId === cycle.cycleID}
                                                onClick={() => handleDelete(cycle.cycleID)}
                                            >
                                                {deletingId === cycle.cycleID ? 'Deleting...' : 'Delete'}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} color="inherit">Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default DeleteCycleModal;
