import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Box, TextField, InputAdornment,
    Divider, Slider, Alert
} from '@mui/material';
import axios from '../../../backend connection/axiosConfig';

const THEMATIC_AREAS = [
    { key: 'governance', label: 'Governance' },
    { key: 'active_citizenship', label: 'Active Citizenship' },
    { key: 'economic_empowerment', label: 'Economic Empowerment' },
    { key: 'global_mobility', label: 'Global Mobility' },
    { key: 'agriculture', label: 'Agriculture' },
    { key: 'environment', label: 'Environment' },
    { key: 'PBS', label: 'Peace Building & Security' },
    { key: 'SIE', label: 'Social Inclusion & Equity' },
    { key: 'education', label: 'Education' },
    { key: 'health', label: 'Health' },
    { key: 'GAP', label: 'General Administration Program' },
    { key: 'MOOE', label: 'Maintenance and Other Operating Expenses' },
];

interface BudgetAdjustmentModalProps {
    open: boolean;
    onClose: () => void;
    batchID: number;
    onAdjusted: () => void;
}

const BudgetAdjustmentModal: React.FC<BudgetAdjustmentModalProps> = ({ open, onClose, batchID, onAdjusted }) => {
    const [totalBudget, setTotalBudget] = useState(0);
    const [allocations, setAllocations] = useState<Record<string, number>>({});
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open && batchID) {
            fetchBudgetSummary();
        }
    }, [open, batchID]);

    const fetchBudgetSummary = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await axios.get(`/api/project-batch/${batchID}/budget-summary`);
            if (response.data.success) {
                setTotalBudget(response.data.data.totalBudget);
                setAllocations(response.data.data.allocations);
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to load budget data');
        } finally {
            setLoading(false);
        }
    };

    const handleAmountChange = (key: string, value: string) => {
        const numeric = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
        setAllocations(prev => ({ ...prev, [key]: numeric }));
    };

    const handleSliderChange = (key: string, pct: number) => {
        const amount = parseFloat(((pct / 100) * totalBudget).toFixed(2));
        setAllocations(prev => ({ ...prev, [key]: amount }));
    };

    const totalAllocated = Object.values(allocations).reduce((a, b) => a + (Number(b) || 0), 0);
    const isOverBudget = totalAllocated > totalBudget + 0.01;

    const handleSubmit = async () => {
        if (!reason.trim()) {
            setError('Please provide a reason for this adjustment.');
            return;
        }
        if (isOverBudget) {
            setError('Total allocated exceeds project budget.');
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const response = await axios.post(`/api/project-batch/${batchID}/reallocate-budget`, {
                newAllocations: allocations,
                reason
            });

            if (response.data.success) {
                onAdjusted();
                onClose();
                setReason('');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to reallocate budget');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (val: number) => {
        return val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontWeight: 'bold' }}>Reallocate Budget</DialogTitle>
            <DialogContent dividers>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                
                <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight={600}>Total Budget: ₱{formatCurrency(totalBudget)}</Typography>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="subtitle1" color={isOverBudget ? 'error' : 'primary'} fontWeight={700}>
                            Remaining: ₱{formatCurrency(totalBudget - totalAllocated)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Sum of categories must not exceed total budget
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ maxHeight: 400, overflowY: 'auto', pr: 1 }}>
                    {THEMATIC_AREAS.map((area) => {
                        const amount = allocations[area.key] || 0;
                        const pct = totalBudget > 0 ? (amount / totalBudget) * 100 : 0;
                        return (
                            <Box key={area.key} sx={{ mb: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2" fontWeight={500}>{area.label}</Typography>
                                    <Typography variant="caption" color="text.secondary">{pct.toFixed(1)}%</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{ flexGrow: 1 }}>
                                        <Slider
                                            value={pct}
                                            onChange={(_, val) => handleSliderChange(area.key, val as number)}
                                            size="small"
                                            min={0}
                                            max={100}
                                            step={0.1}
                                        />
                                    </Box>
                                    <TextField
                                        size="small"
                                        sx={{ width: 140 }}
                                        value={amount === 0 ? '' : amount}
                                        onChange={(e) => handleAmountChange(area.key, e.target.value)}
                                        placeholder="0.00"
                                        InputProps={{
                                            startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                                        }}
                                    />
                                </Box>
                            </Box>
                        );
                    })}
                </Box>

                <Divider sx={{ my: 2 }} />

                <TextField
                    fullWidth
                    label="Reason for Adjustment"
                    multiline
                    rows={2}
                    placeholder="e.g., Shifting funds to Health due to emergency needs..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                />
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} disabled={loading}>Cancel</Button>
                <Button 
                    variant="contained" 
                    onClick={handleSubmit} 
                    disabled={loading || isOverBudget || !reason.trim()}
                >
                    Apply Adjustment
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default BudgetAdjustmentModal;
