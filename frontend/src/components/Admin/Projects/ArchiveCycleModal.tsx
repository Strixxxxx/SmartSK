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

interface ArchiveCycleModalProps {
    open: boolean;
    onClose: () => void;
    onArchiveSuccess: () => void;
}

const ArchiveCycleModal: React.FC<ArchiveCycleModalProps> = ({ open, onClose, onArchiveSuccess }) => {
    const [cycles, setCycles] = useState<ProjectCycle[]>([]);
    const [loading, setLoading] = useState(false);
    const [archivingId, setArchivingId] = useState<number | null>(null);

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

    const handleArchive = async (cycleID: number) => {
        if (!window.confirm('Are you sure you want to archive this cycle? All associated projects and submissions will also be archived.')) return;
        
        setArchivingId(cycleID);
        try {
            const res = await axiosInstance.post(`/api/admin/proj-archive/cycles/${cycleID}`);
            if (res.data.success) {
                toast.success('Project cycle archived successfully');
                onArchiveSuccess(); // Trigger refresh on parent if needed
                onClose(); // Close modal
            } else {
                toast.error(res.data.message || 'Failed to archive cycle');
            }
        } catch (error) {
            console.error('Archive error:', error);
            toast.error('An error occurred while archiving');
        } finally {
            setArchivingId(null);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 'bold' }}>Archive Project Cycle</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    Select an active project cycle to archive. Archiving a cycle will automatically archive all its associated project batches and submissions.
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
                                                disabled={archivingId === cycle.cycleID}
                                                onClick={() => handleArchive(cycle.cycleID)}
                                            >
                                                {archivingId === cycle.cycleID ? 'Archiving...' : 'Archive'}
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

export default ArchiveCycleModal;
