import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { Close, Menu as MenuIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface DisclosureTopNavbarProps {
    batchInfo: any;
    backPath?: string;
    onMenuClick?: () => void;
}

const DisclosureTopNavbar: React.FC<DisclosureTopNavbarProps> = ({ 
    batchInfo, 
    backPath = '/project-list',
    onMenuClick 
}) => {
    const navigate = useNavigate();

    return (
        <Box sx={{ 
            height: 60, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            px: { xs: 1.5, sm: 3 }, 
            borderBottom: '1px solid #e0d9c4',
            bgcolor: '#ffffff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
            zIndex: 10
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton 
                    onClick={onMenuClick}
                    sx={{ display: { xs: 'flex', md: 'none' }, mr: 0.5 }}
                >
                    <MenuIcon />
                </IconButton>
                <Box sx={{ overflow: 'hidden' }}>
                    <Typography 
                        variant="subtitle2" 
                        noWrap 
                        sx={{ fontWeight: 700, color: '#1a73e8', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                    >
                        {batchInfo?.projType} {batchInfo?.targetYear} | {batchInfo?.barangayName}
                    </Typography>
                    <Typography 
                        variant="caption" 
                        noWrap 
                        sx={{ color: '#5f6368', display: 'block', fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                    >
                        {batchInfo?.projName}
                    </Typography>
                </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton 
                    size="small" 
                    onClick={() => navigate(backPath)}
                    sx={{ bgcolor: '#f1f3f4', '&:hover': { bgcolor: '#e8eaed' } }}
                >
                    <Close fontSize="small" />
                </IconButton>
            </Box>
        </Box>
    );
};

export default DisclosureTopNavbar;
