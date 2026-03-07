import React, { useState } from 'react';
import axios from '../../../backend connection/axiosConfig';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Stepper,
    Step,
    StepLabel,
    Box,
    Typography,
    Grid,
    TextField,
    Card,
    CardActionArea,
    CardContent,
    Slider,
    InputAdornment,
    Divider,
} from '@mui/material';
import { Description, EventNote } from '@mui/icons-material';

interface CreateProjectModalProps {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

const ABYIP_STEPS = ['Select Template', 'Configuration', 'Percentage Allocation'];
const CBYDP_STEPS = ['Select Template', 'Configuration'];

const THEMATIC_AREAS = [
    { key: 'governance_pct', label: 'Governance' },
    { key: 'active_citizenship_pct', label: 'Active Citizenship' },
    { key: 'economic_empowerment_pct', label: 'Economic Empowerment' },
    { key: 'global_mobility_pct', label: 'Global Mobility' },
    { key: 'agriculture_pct', label: 'Agriculture' },
    { key: 'environment_pct', label: 'Environment' },
    { key: 'PBS_pct', label: 'Peace Building & Security' },
    { key: 'SIE_pct', label: 'Social Inclusion & Equity' },
    { key: 'education_pct', label: 'Education' },
    { key: 'health_pct', label: 'Health' },
];

const formatCurrency = (value: number): string => {
    if (isNaN(value) || value === 0) return '';
    return value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ open, onClose, onCreated }) => {
    const [activeStep, setActiveStep] = useState(0);
    const [budgetDisplay, setBudgetDisplay] = useState('');
    const [amountDisplays, setAmountDisplays] = useState<Record<string, string>>(
        THEMATIC_AREAS.reduce((acc, area) => ({ ...acc, [area.key]: '' }), {})
    );

    const [formData, setFormData] = useState({
        projType: '',
        targetYear: new Date().getFullYear().toString(),
        yearStart: '',
        yearEnd: '',
        budget: 0,
        ...THEMATIC_AREAS.reduce((acc, area) => ({ ...acc, [area.key]: 0 }), {}),
    });

    const handleNext = () => setActiveStep((prev) => prev + 1);
    const handleBack = () => setActiveStep((prev) => prev - 1);

    const calculateTotalPct = (): number => {
        return parseFloat(
            THEMATIC_AREAS.reduce((acc, area) => acc + (formData as any)[area.key], 0).toFixed(2)
        );
    };

    const handleBudgetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/[^0-9.]/g, '');
        const numeric = parseFloat(raw) || 0;
        const parts = raw.split('.');
        const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const display = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;

        setBudgetDisplay(display);
        setFormData({ ...formData, budget: numeric });
    };

    const handleBudgetBlur = () => {
        if (formData.budget > 0) {
            setBudgetDisplay(formatCurrency(formData.budget));
        }
    };

    const handleBudgetFocus = () => {
        if (formData.budget > 0) {
            setBudgetDisplay(String(formData.budget));
        }
    };

    const handleSliderChange = (key: string, pct: number) => {
        const intPct = Math.round(pct);
        setFormData((prev) => ({ ...prev, [key]: intPct }));
        const amount = formData.budget > 0 ? (intPct / 100) * formData.budget : 0;
        setAmountDisplays((prev) => ({ ...prev, [key]: amount > 0 ? formatCurrency(amount) : '' }));
    };

    const handleAmountChange = (key: string, raw: string) => {
        const stripped = raw.replace(/[^0-9.]/g, '');
        const parts = stripped.split('.');
        const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const displayVal = parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
        setAmountDisplays((prev) => ({ ...prev, [key]: displayVal }));

        const amount = parseFloat(stripped) || 0;
        const pct = formData.budget > 0 ? parseFloat(((amount / formData.budget) * 100).toFixed(2)) : 0;
        setFormData((prev) => ({ ...prev, [key]: Math.min(pct, 100) }));
    };

    const handleAmountBlur = (key: string, pct: number) => {
        const amount = formData.budget > 0 ? (pct / 100) * formData.budget : 0;
        setAmountDisplays((prev) => ({ ...prev, [key]: amount > 0 ? formatCurrency(amount) : '' }));
    };

    const handleCreate = async () => {
        try {
            const payload = {
                projType: formData.projType,
                targetYear: formData.projType === 'ABYIP' ? formData.targetYear : `${formData.yearStart}-${formData.yearEnd}`,
                budget: formData.projType === 'ABYIP' ? formData.budget : 0,
                ...THEMATIC_AREAS.reduce((acc, area) => ({ ...acc, [area.key]: formData.projType === 'ABYIP' ? (formData as any)[area.key] : 0 }), {}),
            };

            const response = await axios.post('/api/project-batch/initialize', payload);

            if (response.data.success) {
                onCreated();
                onClose();
            } else {
                alert(response.data.message || 'Failed to create project');
            }
        } catch (error: any) {
            console.error("Failed to create project", error);
            alert(error.response?.data?.message || 'Internal Server Error');
        }
    };

    const renderStepContent = (step: number) => {
        switch (step) {
            case 0:
                return (
                    <Grid container spacing={2} sx={{ mt: 2 }}>
                        <Grid size={{ xs: 6 }}>
                            <Card
                                sx={{
                                    border: formData.projType === 'ABYIP' ? '2px solid #1976d2' : 'none',
                                    bgcolor: formData.projType === 'ABYIP' ? 'rgba(25, 118, 210, 0.04)' : 'transparent'
                                }}
                            >
                                <CardActionArea onClick={() => setFormData({ ...formData, projType: 'ABYIP' })}>
                                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                        <Description color="primary" sx={{ fontSize: 60 }} />
                                        <Typography variant="h6">ABYIP</Typography>
                                        <Typography variant="caption" color="textSecondary">
                                            Annual Barangay Youth Investment Program
                                        </Typography>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                            <Card
                                sx={{
                                    border: formData.projType === 'CBYDP' ? '2px solid #1976d2' : 'none',
                                    bgcolor: formData.projType === 'CBYDP' ? 'rgba(25, 118, 210, 0.04)' : 'transparent'
                                }}
                            >
                                <CardActionArea onClick={() => setFormData({ ...formData, projType: 'CBYDP' })}>
                                    <CardContent sx={{ textAlign: 'center', py: 4 }}>
                                        <EventNote color="primary" sx={{ fontSize: 60 }} />
                                        <Typography variant="h6">CBYDP</Typography>
                                        <Typography variant="caption" color="textSecondary">
                                            Comprehensive Barangay Youth Development Plan
                                        </Typography>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    </Grid>
                );
            case 1:
                return (
                    <Box sx={{ mt: 3 }}>
                        {formData.projType === 'ABYIP' ? (
                            <TextField
                                fullWidth
                                label="Target Year"
                                type="text"
                                value={formData.targetYear}
                                onChange={(e) => setFormData({ ...formData, targetYear: e.target.value.replace(/\D/g, '') })}
                                sx={{ mb: 2 }}
                                inputProps={{ inputMode: 'numeric', maxLength: 4 }}
                            />
                        ) : (
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid size={{ xs: 6 }}>
                                    <TextField
                                        fullWidth
                                        label="Year Start"
                                        type="text"
                                        value={formData.yearStart}
                                        onChange={(e) => setFormData({ ...formData, yearStart: e.target.value.replace(/\D/g, '') })}
                                        inputProps={{ inputMode: 'numeric', maxLength: 4 }}
                                    />
                                </Grid>
                                <Grid size={{ xs: 6 }}>
                                    <TextField
                                        fullWidth
                                        label="Year End"
                                        type="text"
                                        value={formData.yearEnd}
                                        onChange={(e) => setFormData({ ...formData, yearEnd: e.target.value.replace(/\D/g, '') })}
                                        inputProps={{ inputMode: 'numeric', maxLength: 4 }}
                                    />
                                </Grid>
                            </Grid>
                        )}
                        {formData.projType === 'ABYIP' && (
                            <TextField
                                fullWidth
                                label="Total Allocated Budget"
                                value={budgetDisplay}
                                onChange={handleBudgetChange}
                                onBlur={handleBudgetBlur}
                                onFocus={handleBudgetFocus}
                                placeholder="000.00"
                                inputProps={{ inputMode: 'decimal' }}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                                }}
                                sx={{ mt: 2 }}
                            />
                        )}
                    </Box>
                );
            case 2: {
                const total = calculateTotalPct();
                return (
                    <Box sx={{ mt: 3 }}>
                        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6">Thematic Split</Typography>
                            <Typography
                                variant="h6"
                                color={total > 100 ? 'error' : 'primary'}
                                sx={{ fontWeight: 'bold' }}
                            >
                                Total: {Number.isInteger(total) ? `${total}%` : `${total.toFixed(2)}%`}
                            </Typography>
                        </Box>
                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ maxHeight: 320, overflowY: 'auto', pr: 1 }}>
                            {THEMATIC_AREAS.map((area) => {
                                const pct: number = (formData as any)[area.key];
                                return (
                                    <Box key={area.key} sx={{ mb: 3 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="body2" fontWeight={500}>
                                                {area.label}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2)}%`}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box sx={{ flexGrow: 1, px: 0.5, pb: 1 }}>
                                                <Slider
                                                    value={pct}
                                                    onChange={(_, value) => handleSliderChange(area.key, value as number)}
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    size="small"
                                                />
                                            </Box>
                                            <TextField
                                                size="small"
                                                sx={{ width: 140, flexShrink: 0 }}
                                                value={amountDisplays[area.key]}
                                                onChange={(e) => handleAmountChange(area.key, e.target.value)}
                                                onBlur={() => handleAmountBlur(area.key, pct)}
                                                placeholder="0.00"
                                                inputProps={{ inputMode: 'decimal' }}
                                                InputProps={{
                                                    startAdornment: <InputAdornment position="start">₱</InputAdornment>,
                                                }}
                                                disabled={formData.budget <= 0}
                                            />
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                        {formData.budget <= 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Set a budget in Step 2 to enable amount-based input.
                            </Typography>
                        )}
                    </Box>
                );
            }
            default:
                return null;
        }
    };

    const steps = formData.projType === 'CBYDP' ? CBYDP_STEPS : ABYIP_STEPS;

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontWeight: 'bold' }}>Create New Project Plan</DialogTitle>
            <DialogContent>
                <Stepper activeStep={activeStep} alternativeLabel sx={{ mt: 2 }}>
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>
                {renderStepContent(activeStep)}
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} color="inherit">Cancel</Button>
                <Box sx={{ flex: '1 1 auto' }} />
                {activeStep !== 0 && (
                    <Button onClick={handleBack} sx={{ mr: 1 }}>Back</Button>
                )}
                {activeStep === steps.length - 1 ? (
                    <Button
                        onClick={handleCreate}
                        variant="contained"
                        disabled={formData.projType === 'ABYIP' ? (calculateTotalPct() > 100 || formData.budget <= 0) : (!formData.yearStart || !formData.yearEnd)}
                    >
                        Create Plan
                    </Button>
                ) : (
                    <Button
                        onClick={handleNext}
                        variant="contained"
                        disabled={
                            (activeStep === 0 && !formData.projType) ||
                            (activeStep === 1 && formData.projType === 'ABYIP' && (formData.budget <= 0 || !formData.targetYear)) ||
                            (activeStep === 1 && formData.projType === 'CBYDP' && (!formData.yearStart || !formData.yearEnd))
                        }
                    >
                        Next
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default CreateProjectModal;
