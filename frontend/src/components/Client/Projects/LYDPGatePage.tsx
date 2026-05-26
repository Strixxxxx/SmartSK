import React from 'react';
import { Button, Typography, Paper, Box } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import styles from './LYDPGatePage.module.css';

const LYDPGatePage: React.FC = () => {
    const navigate = useNavigate();

    return (
        <Box className={styles.gateContainer}>
            <Paper elevation={3} className={styles.gateCard}>
                <div className={styles.iconWrapper}>
                    <WarningAmberIcon className={styles.warningIcon} />
                </div>
                
                <Typography variant="h5" className={styles.title}>
                    Local Youth Development Plan (LYDP) Required
                </Typography>
                
                <div className={styles.badge}>
                    Access Restricted
                </div>
                
                <Typography variant="body1" className={styles.description}>
                    Before you can access the CBYDP Drafting Workspace, the SK Chairperson must upload the 
                    <strong> Local Youth Development Plan (LYDP)</strong>. This is a mandatory prerequisite supporting document.
                </Typography>
                
                <Typography variant="body2" className={styles.subtext}>
                    Please return to the Dashboard and navigate to the <strong>Supporting Documents</strong> section to upload the LYDP.
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

export default LYDPGatePage;
