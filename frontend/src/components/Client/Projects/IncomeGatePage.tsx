import React from 'react';
import { Button, Typography, Paper, Box } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import styles from './LYDPGatePage.module.css';

interface IncomeGatePageProps {
    hasEstIncomeCert: boolean;
    hasIncomeCert: boolean;
    budget?: number;
    currentStatusID?: number;
}

const IncomeGatePage: React.FC<IncomeGatePageProps> = ({ hasEstIncomeCert, hasIncomeCert, budget, currentStatusID }) => {
    const navigate = useNavigate();
    const hasBudget = budget !== undefined && budget > 0;
    const isApproved = currentStatusID !== undefined && currentStatusID >= 6;

    return (
        <Box className={styles.gateContainer}>
            <Paper elevation={3} className={styles.gateCard}>
                <div className={styles.iconWrapper}>
                    <WarningAmberIcon className={styles.warningIcon} />
                </div>
                
                <Typography variant="h5" className={styles.title}>
                    ABYIP Workspace Locked
                </Typography>
                
                <div className={styles.badge}>
                    Access Restricted
                </div>
                
                <Typography variant="body1" className={styles.description}>
                    Before you can access the ABYIP Budget Draft Workspace, the following mandatory prerequisites must be completed:
                </Typography>
                <ul style={{ textAlign: 'left', marginBottom: '20px', color: '#666', listStyle: 'none', paddingLeft: '1rem' }}>
                    <li style={{ marginBottom: '8px' }}>
                        {hasIncomeCert ? '✅' : '❌'} <strong>Certification of Income from Barangay</strong> (Uploaded)
                    </li>
                    <li style={{ marginBottom: '8px' }}>
                        {hasEstIncomeCert ? '✅' : '❌'} <strong>Certification of Estimated Income</strong> (Uploaded)
                    </li>
                    <li style={{ marginBottom: '8px' }}>
                        {hasBudget ? '✅' : '❌'} <strong>Certified SK Fund Allocation Value</strong> (Entered by SK Chairperson)
                    </li>
                    <li style={{ marginBottom: '8px' }}>
                        {isApproved ? '✅' : '❌'} <strong>Budget Validation Approval</strong> (Approved by Brgy. Captain)
                    </li>
                </ul>
                
                <Typography variant="body2" className={styles.subtext}>
                    Please return to the Dashboard to track the status of these prerequisites and complete any pending actions.
                </Typography>
                
                <div className={styles.actionContainer}>
                    <Button 
                        variant="contained" 
                        color="primary" 
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate('/dashboard')}
                        className={styles.dashboardButton}
                    >
                        Return to Dashboard
                    </Button>
                </div>
            </Paper>
        </Box>
    );
};

export default IncomeGatePage;
