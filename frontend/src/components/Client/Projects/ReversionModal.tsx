import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, List, ListItem,
    ListItemText, IconButton, Typography, Box, CircularProgress, Divider,
    Tooltip
} from '@mui/material';
import { Restore, Close, WarningAmber } from '@mui/icons-material';
import axiosInstance from '../../../backend connection/axiosConfig';
import { useAuth } from '../../../context/AuthContext';

interface ReversibleLog {
    auditID: number;
    action: string;
    oldValue: string;
    newValue: string;
    timestamp: string;
    targetColumn: string;
    fullName: string;
    userID: number;
}

interface ReversionModalProps {
    open: boolean;
    onClose: () => void;
    batchID: number | null;
    center?: string | null;
    onSuccess: () => void;
}

const ReversionModal: React.FC<ReversionModalProps> = ({ open, onClose, batchID, center, onSuccess }) => {
    const { user } = useAuth();
    const [logs, setLogs] = useState<ReversibleLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [revertingID, setRevertingID] = useState<number | null>(null);
    const [collision, setCollision] = useState<{ open: boolean; auditID: number | null; currentValue: string | null; lastEditor: string | null }>({
        open: false,
        auditID: null,
        currentValue: null,
        lastEditor: null
    });

    useEffect(() => {
        if (open && batchID) {
            fetchPersonalHistory();
        }
    }, [open, batchID, center]);

    const fetchPersonalHistory = async () => {
        setLoading(true);
        try {
            const res = await axiosInstance.get(`/api/project-batch/${batchID}/audit`, {
                params: { center }
            });
            // Filter: Only current user's reversible edits
            const personalLogs = res.data.data.filter((log: ReversibleLog) => 
                log.userID === user?.id && ['EDIT', 'EDIT_AGENDA'].includes(log.action)
            );
            setLogs(personalLogs);
        } catch (err) {
            console.error('Failed to load personal history:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRevert = async (auditID: number, force = false) => {
        setRevertingID(auditID);
        try {
            const res = await axiosInstance.post(`/api/project-batch/revert/${auditID}`, { force });
            if (res.data.success) {
                onSuccess();
                onClose();
            }
        } catch (err: any) {
            if (err.response?.status === 409 && err.response?.data?.collision) {
                setCollision({
                    open: true,
                    auditID,
                    currentValue: err.response.data.currentValue,
                    lastEditor: err.response.data.lastEditor
                });
            } else {
                console.error('Reversion failed:', err);
                alert(err.response?.data?.message || 'Failed to restore value.');
            }
        } finally {
            setRevertingID(null);
        }
    };

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600 }}>
                    Reversion History
                    <IconButton onClick={onClose} size="small"><Close /></IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0 }}>
                    <Box sx={{ px: 3, py: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                            Only your recent edits are shown here. Restoring a value will overwrite the current data in the workspace.
                        </Typography>
                    </Box>
                    <Divider />
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={30} /></Box>
                    ) : logs.length === 0 ? (
                        <Box sx={{ py: 6, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                No reversible edits found in your history.
                            </Typography>
                        </Box>
                    ) : (
                        <List sx={{ py: 0 }}>
                            {logs.map((log) => (
                                <ListItem 
                                    key={log.auditID}
                                    divider
                                    secondaryAction={
                                        <Tooltip title="Restore this value">
                                            <IconButton 
                                                edge="end" 
                                                onClick={() => handleRevert(log.auditID)}
                                                disabled={revertingID === log.auditID}
                                                sx={{ color: '#646cff' }}
                                            >
                                                {revertingID === log.auditID ? <CircularProgress size={20} /> : <Restore />}
                                            </IconButton>
                                        </Tooltip>
                                    }
                                >
                                    <ListItemText 
                                        primary={
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#333' }}>
                                                {log.targetColumn}
                                            </Typography>
                                        }
                                        secondary={
                                            <Box component="span">
                                                <Typography variant="caption" component="span" sx={{ display: 'block', color: '#666', mb: 0.5 }}>
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </Typography>
                                                <Typography variant="caption" sx={{ 
                                                    display: 'block', 
                                                    fontStyle: 'italic',
                                                    bgcolor: 'rgba(0,0,0,0.03)',
                                                    p: 1,
                                                    borderRadius: 1,
                                                    borderLeft: '3px solid #646cff'
                                                }}>
                                                    Restore to: "{log.oldValue}"
                                                </Typography>
                                            </Box>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}
                </DialogContent>
            </Dialog>

            {/* Collision Warning Modal */}
            <Dialog open={collision.open} onClose={() => setCollision({ ...collision, open: false })}>
                <DialogTitle sx={{ bgcolor: '#fff4e5', color: '#663c00', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmber /> Concurrency Conflict
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    <Typography variant="body2" gutterBottom>
                        This value was updated more recently by <strong>{collision.lastEditor || 'another user'}</strong>. Are you sure you want to overwrite it?
                    </Typography>
                    <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1, borderLeft: '4px solid #ed6c02' }}>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>Current Data:</Typography>
                        <Typography variant="body2">{collision.currentValue || '(Empty)'}</Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setCollision({ ...collision, open: false })} color="inherit">Cancel</Button>
                    <Button 
                        onClick={() => {
                            if (collision.auditID) {
                                handleRevert(collision.auditID, true);
                                setCollision({ ...collision, open: false });
                            }
                        }} 
                        variant="contained" 
                        color="warning"
                    >
                        Confirm Overwrite
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default ReversionModal;
