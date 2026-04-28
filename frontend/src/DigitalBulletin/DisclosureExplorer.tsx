import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, List, ListItem, ListItemIcon, ListItemText, 
    Collapse, IconButton, CircularProgress, ListItemButton 
} from '@mui/material';
import { 
    InsertDriveFile, Folder, ChevronRight, ExpandMore, 
    Menu as MenuIcon, Description 
} from '@mui/icons-material';
import styles from './DigitalBulletin.module.css';
import axiosInstance from '../backend connection/axiosConfig';

const CATEGORY_LABELS: Record<string, string> = {
    'PPMP_or_APP': 'APP',
    'Activity_Design': 'Activity Designs',
    'SK_Resolution': 'SK Resolution',
    'LYDP': 'LYDP',
    'KK_Minutes': 'Consultation Minutes',
    'Youth_Profile': 'Youth Profile'
};

interface DisclosureExplorerProps {
    batchInfo: any;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    onSelectView: (view: 'PLAN' | 'DOCUMENT', data?: any) => void;
    activeView: 'PLAN' | 'DOCUMENT';
    activeDocumentId?: string;
    docEndpoint?: string; // New prop
}

const DisclosureExplorer: React.FC<DisclosureExplorerProps> = ({
    batchInfo,
    isCollapsed,
    onToggleCollapse,
    onSelectView,
    activeView,
    activeDocumentId,
    docEndpoint = '/api/disclosures' // Default to public
}) => {
    const [docsExpanded, setDocsExpanded] = useState(true);
    const [docCategories, setDocCategories] = useState<any>({});
    const [loadingDocs, setLoadingDocs] = useState(false);

    useEffect(() => {
        const fetchDocs = async () => {
            if (!batchInfo?.batchID) return;
            setLoadingDocs(true);
            try {
                const response = await axiosInstance.get(`${docEndpoint}/${batchInfo.batchID}/documents`);
                if (response.data.success) {
                    setDocCategories(response.data.data.categories || {});
                }
            } catch (err) {
                console.error('Failed to fetch supporting docs:', err);
            } finally {
                setLoadingDocs(false);
            }
        };
        fetchDocs();
    }, [batchInfo?.batchID, docEndpoint]);

    // List of category names from the object keys
    const categoryNames = Object.keys(docCategories);

    return (
        <Box 
            className={`${styles.explorer} ${isCollapsed ? styles.collapsed : ''}`}
            sx={{ 
                width: isCollapsed ? 60 : 280,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                borderRight: '1px solid #e0d9c4',
                bgcolor: '#f8f9fa',
                transition: 'width 0.3s ease'
            }}
        >
            <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between' }}>
                {!isCollapsed && (
                    <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#1a73e8', letterSpacing: '0.1em' }}>
                        EXPLORER
                    </Typography>
                )}
                <IconButton onClick={onToggleCollapse} size="small">
                    <MenuIcon fontSize="small" />
                </IconButton>
            </Box>

            {!isCollapsed && (
                <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                    {/* Project Plan Section */}
                    <Box sx={{ px: 2, py: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', '&:hover': { bgcolor: 'rgba(26,115,232,0.05)' } }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#5f6368', flexGrow: 1 }}>PROJECT PLAN</Typography>
                    </Box>
                    <List dense sx={{ pt: 0 }}>
                        <ListItemButton 
                            onClick={() => onSelectView('PLAN')}
                            selected={activeView === 'PLAN'}
                            sx={{
                                '&.Mui-selected': { bgcolor: 'rgba(26,115,232,0.1)', color: '#1a73e8' },
                                mx: 1, borderRadius: 1, width: 'calc(100% - 16px)'
                            }}
                        >
                            <ListItemIcon sx={{ minWidth: 28 }}><InsertDriveFile sx={{ fontSize: 18, color: activeView === 'PLAN' ? '#1a73e8' : '#5f6368' }} /></ListItemIcon>
                            <ListItemText 
                                primary={batchInfo?.projName || 'Project Plan'} 
                                primaryTypographyProps={{ 
                                    variant: 'body2', 
                                    noWrap: true, 
                                    sx: { fontSize: '0.8rem', color: activeView === 'PLAN' ? '#1a73e8' : '#3c4043', fontWeight: activeView === 'PLAN' ? 600 : 400 } 
                                }} 
                            />
                        </ListItemButton>
                    </List>

                    {/* Supporting Docs Section */}
                    <Box 
                        onClick={() => setDocsExpanded(!docsExpanded)}
                        sx={{ px: 2, py: 1, mt: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', '&:hover': { bgcolor: 'rgba(26,115,232,0.05)' } }}
                    >
                        {docsExpanded ? <ExpandMore sx={{ fontSize: 16, mr: 0.5 }} /> : <ChevronRight sx={{ fontSize: 16, mr: 0.5 }} />}
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#5f6368', flexGrow: 1 }}>SUPPORTING DOCUMENTS</Typography>
                    </Box>
                    
                    <Collapse in={docsExpanded}>
                        {loadingDocs ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={16} /></Box>
                        ) : categoryNames.length === 0 ? (
                            <Typography variant="caption" sx={{ color: '#9aa0a6', px: 4, py: 1, display: 'block' }}>No documents</Typography>
                        ) : (
                            <List dense sx={{ pt: 0 }}>
                                {categoryNames.map((cat: string) => (
                                    <Box key={cat}>
                                        <ListItem sx={{ py: 0.5, px: 3 }}>
                                            <ListItemIcon sx={{ minWidth: 24 }}><Folder sx={{ fontSize: 16, color: '#fbbc04' }} /></ListItemIcon>
                                            <ListItemText 
                                                primary={CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ')} 
                                                primaryTypographyProps={{ variant: 'caption', sx: { fontWeight: 600, color: '#5f6368' } }} 
                                            />
                                        </ListItem>
                                        {(docCategories[cat] || []).length === 0 ? (
                                            <Typography variant="caption" sx={{ color: '#9aa0a6', px: 7, py: 0.2, display: 'block', fontStyle: 'italic' }}>
                                                Empty folder
                                            </Typography>
                                        ) : (
                                            (docCategories[cat] || []).map((doc: any) => (
                                                <ListItemButton 
                                                    key={doc.path} 
                                                    onClick={() => onSelectView('DOCUMENT', doc)}
                                                    selected={activeView === 'DOCUMENT' && activeDocumentId === doc.name}
                                                    sx={{ 
                                                        pl: 6, py: 0.2,
                                                        '&.Mui-selected': { bgcolor: 'rgba(26,115,232,0.1)', color: '#1a73e8' }
                                                    }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 24 }}><Description sx={{ fontSize: 14, color: activeView === 'DOCUMENT' && activeDocumentId === doc.name ? '#1a73e8' : '#9aa0a6' }} /></ListItemIcon>
                                                    <ListItemText 
                                                        primary={doc.name} 
                                                        primaryTypographyProps={{ 
                                                            variant: 'caption', 
                                                            noWrap: true,
                                                            sx: { color: activeView === 'DOCUMENT' && activeDocumentId === doc.name ? '#1a73e8' : '#3c4043' }
                                                        }} 
                                                    />
                                                </ListItemButton>
                                            ))
                                        )}
                                    </Box>
                                ))}
                            </List>
                        )}
                    </Collapse>
                </Box>
            )}
        </Box>
    );
};

export default DisclosureExplorer;
