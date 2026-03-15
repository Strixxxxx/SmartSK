import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from '../backend connection/axiosConfig';
import Loading from '../components/Loading/Loading';
import { Box, Typography, Button } from '@mui/material';
import DisclosureExplorer from './DisclosureExplorer';
import DisclosureTopNavbar from './DisclosureTopNavbar';
import ProjectTemplateHeader from '../components/Client/Projects/ProjectTemplateHeader';
import ProjectTemplateTable from '../components/Client/Projects/ProjectTemplateTable';
import ProjectSheetTabs from '../components/Client/Projects/ProjectSheetTabs';
import ProjectTableSkeleton from '../components/Client/Projects/ProjectTableSkeleton';
import styles from './DisclosureDetailView.module.css';

interface BatchDetail {
    batchInfo: {
        batchID: number;
        projType: 'ABYIP' | 'CBYDP';
        projName: string;
        targetYear: string;
        budget: number;
        barangayName: string;
    };
    agenda: any;
    rows: any[];
}

const CATEGORIES = [
    'Governance', 'Active Citizenship', 'Economic Empowerment', 'Global Mobility',
    'Agriculture', 'Environment', 'Peace Building and Security', 'Social Inclusion and Equity',
    'Education', 'Health', 'General Administration Program', 'Maintenance and Other Operating Expenses'
];

const DisclosureDetailView: React.FC = () => {
    const { batchID } = useParams<{ batchID: string }>();
    const [details, setDetails] = useState<BatchDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // UI State
    const [activeTab, setActiveTab] = useState<string>(CATEGORIES[0]);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [viewMode, setViewMode] = useState<'PLAN' | 'DOCUMENT'>('PLAN');
    const [activeDoc, setActiveDoc] = useState<any>(null);
    
    // Data State (Filtered by Category)
    const [displayRows, setDisplayRows] = useState<any[]>([]);
    const [isLoadingRows, setIsLoadingRows] = useState(false);

    // Helpers
    const parseBarangay = (name: string) => name.includes('_NN_') ? 'NN' : 'SB';
    const parseYear = (name: string) => name.match(/\d{4}/)?.[0] || '';

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const response = await axios.get(`/api/disclosures/${batchID}/details`);
                if (response.data.success) {
                    setDetails(response.data.data);
                } else {
                    setError('Failed to fetch project details.');
                }
            } catch (err) {
                console.error(err);
                setError('Error connecting to the server.');
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [batchID]);

    // Filter rows when activeTab or details change
    useEffect(() => {
        if (!details) return;
        setIsLoadingRows(true);
        
        // Simulating the backend row filtering by center
        const filtered = details.rows.filter(r => r.centerOfParticipation === activeTab);
        setDisplayRows(filtered);
        
        // Short delay to show skeleton for better feel
        const timer = setTimeout(() => setIsLoadingRows(false), 300);
        return () => clearTimeout(timer);
    }, [activeTab, details]);

    const handleSelectView = (view: 'PLAN' | 'DOCUMENT', data?: any) => {
        setViewMode(view);
        setActiveDoc(data || null);
    };

    if (loading) return <Loading />;
    if (error || !details) return <div className={styles.error}>{error || 'Project not found.'}</div>;

    const { batchInfo, agenda } = details;
    const projType = batchInfo.projType;

    return (
        <div className={styles.container}>
            <DisclosureExplorer 
                batchInfo={batchInfo}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                onSelectView={handleSelectView}
                activeView={viewMode}
                activeDocumentId={activeDoc?.name}
            />

            <main className={styles.mainContent}>
                <DisclosureTopNavbar batchInfo={batchInfo} />

                <Box className={styles.contentArea}>
                    {viewMode === 'PLAN' ? (
                        <>
                            <ProjectTemplateHeader 
                                projType={projType}
                                projName={batchInfo.projName}
                                barangay={parseBarangay(batchInfo.projName)}
                                fiscalYear={parseYear(batchInfo.projName)}
                                centerOfParticipation={activeTab}
                                agendaStatement={(() => {
                                    if (!agenda) return '';
                                    const mapping: Record<string, string> = {
                                        'Governance': 'governance',
                                        'Active Citizenship': 'active_citizenship',
                                        'Economic Empowerment': 'economic_empowerment',
                                        'Global Mobility': 'global_mobility',
                                        'Agriculture': 'agriculture',
                                        'Environment': 'environment',
                                        'Peace Building and Security': 'PBS',
                                        'Social Inclusion and Equity': 'SIE',
                                        'Education': 'education',
                                        'Health': 'health',
                                        'General Administration Program': 'GAP',
                                        'Maintenance and Other Operating Expenses': 'MOOE'
                                    };
                                    return agenda[mapping[activeTab] || activeTab.toLowerCase().replace(/ /g, '_')] || '';
                                })()}
                                readOnly={true}
                                onAgendaSave={async () => {}} // No-op for read-only
                            />

                            <Box sx={{ mt: 2 }}>
                                {isLoadingRows ? (
                                    <ProjectTableSkeleton projType={projType} />
                                ) : (
                                    <ProjectTemplateTable 
                                        projType={projType}
                                        rows={displayRows}
                                        readOnly={true}
                                        hideRowIndex={true}
                                        centerOfParticipation={activeTab}
                                        projName={batchInfo.projName}
                                        fiscalYear={parseYear(batchInfo.projName)}
                                        onAddRow={async () => {}}
                                        onCellChange={() => {}}
                                        onCellBlur={async () => {}}
                                        collaborators={new Map()}
                                    />
                                )}
                            </Box>
                        </>
                    ) : (
                        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#f1f3f4', borderRadius: 2, overflow: 'hidden' }}>
                            {activeDoc?.name.toLowerCase().endsWith('.pdf') ? (
                                <iframe 
                                    src={activeDoc.url} 
                                    title={activeDoc.name}
                                    width="100%" 
                                    height="100%" 
                                    style={{ border: 'none' }}
                                />
                            ) : activeDoc?.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 2 }}>
                                    <img src={activeDoc.url} alt={activeDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                </Box>
                            ) : (
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
                                    <Box sx={{ p: 4, bgcolor: '#fff', borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center', maxWidth: 450 }}>
                                        <Typography variant="h6" gutterBottom color="textPrimary">{activeDoc?.name}</Typography>
                                        <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                                            Current File cannot be viewed, please download it to see the content.
                                        </Typography>
                                        <Button 
                                            variant="contained" 
                                            onClick={() => window.open(activeDoc?.url, '_blank')}
                                            sx={{ bgcolor: '#1a73e8', '&:hover': { bgcolor: '#1557b0' }, textTransform: 'none', px: 3 }}
                                        >
                                            Download Document
                                        </Button>
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    )}
                </Box>

                {viewMode === 'PLAN' && (
                    <ProjectSheetTabs 
                        activeTab={activeTab} 
                        onTabChange={setActiveTab} 
                    />
                )}
            </main>
        </div>
    );
};

export default DisclosureDetailView;

