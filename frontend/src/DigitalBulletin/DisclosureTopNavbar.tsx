import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface DisclosureTopNavbarProps {
    batchInfo: any;
}

const DisclosureTopNavbar: React.FC<DisclosureTopNavbarProps> = ({ batchInfo }) => {
    const navigate = useNavigate();

    return (
        <Box sx={{ 
            height: 60, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            px: 3, 
            borderBottom: '1px solid #e0d9c4',
            bgcolor: '#ffffff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
            <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1a73e8' }}>
                    {batchInfo?.projType} {batchInfo?.targetYear} | {batchInfo?.barangayName}
                </Typography>
                <Typography variant="caption" sx={{ color: '#5f6368' }}>
                    {batchInfo?.projName}
                </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton 
                    size="small" 
                    onClick={() => navigate('/project-list')}
                    sx={{ bgcolor: '#f1f3f4', '&:hover': { bgcolor: '#e8eaed' } }}
                >
                    <Close fontSize="small" />
                </IconButton>
            </Box>
        </Box>
    );
};

export default DisclosureTopNavbar;
