import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../../backend connection/axiosConfig';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import Loading from '../../Loading/Loading';
import AdminProjectCard from './AdminProjectCard';
import ArchiveCycleModal from './ArchiveCycleModal';
import styles from './AdminProjects.module.css';
import { Switch, FormControlLabel, Paper, Box, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';

interface ProjectBatch {
    batchID: number;
    barangayID: number;
    projType: 'ABYIP' | 'CBYDP';
    projName: string;
    targetYear: string;
    budget: number;
    createdAt: string;
    barangayName: string;
    currentStatusID: number;
    StatusName: string;
    projectTermIsCurrent: boolean;
}

const AdminProjects: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [projects, setProjects] = useState<ProjectBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        ABYIP: true,
        CBYDP: true,
        Finalized: true,
        Pending: true
    });

    const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
    const [archivingBatchId, setArchivingBatchId] = useState<number | null>(null);
    const [showCycleModal, setShowCycleModal] = useState(false);

    useEffect(() => {
        const fetchProjects = async () => {
            setLoading(true);
            try {
                const response = await axiosInstance.get('/api/admin/project-list');
                if (response.data.success) {
                    setProjects(response.data.projects);
                }
            } catch (error) {
                console.error('Failed to fetch projects:', error);
                toast.error('Could not load projects.');
            } finally {
                setLoading(false);
            }
        };
        fetchProjects();
    }, []);

    const handleArchive = (batchID: number) => {
        setArchivingBatchId(batchID);
        setShowArchiveConfirm(true);
    };

    const confirmArchive = async () => {
        if (!archivingBatchId) return;
        try {
            const response = await axiosInstance.post(`/api/admin/proj-archive/batch/${archivingBatchId}`);
            if (response.data.success) {
                toast.success('Project archived successfully.');
                setProjects(prev => prev.filter(p => p.batchID !== archivingBatchId));
            } else {
                toast.error(response.data.message || 'Archive failed.');
            }
        } catch (error) {
            console.error('Archive error:', error);
            toast.error('An error occurred while archiving.');
        } finally {
            setShowArchiveConfirm(false);
            setArchivingBatchId(null);
        }
    };

    const handleViewDetails = (batchID: number) => {
        navigate(`/admin/projects/${batchID}`);
    };

    const filteredProjects = projects.filter(p => {
        const typeMatch = (p.projType === 'ABYIP' && filters.ABYIP) || (p.projType === 'CBYDP' && filters.CBYDP);
        const statusMatch = (p.currentStatusID >= 6 && filters.Finalized) || (p.currentStatusID < 6 && filters.Pending);
        return typeMatch && statusMatch;
    });

    const currentTermProjects = filteredProjects.filter(p => p.projectTermIsCurrent);
    const pastTermProjects = filteredProjects.filter(p => !p.projectTermIsCurrent);

    if (loading) return <Loading />;

    return (
        <div className={styles.bulletinPage}>
            <div className={styles.heroHeader}>
                <div className={styles.heroContent}>
                    <h1>{user?.barangayName} Projects</h1>
                    <p>Manage and review ABYIP & CBYDP submissions for your barangay.</p>
                </div>
            </div>

            <div className={styles.disclosureWrapper}>
                <Paper className={styles.filterBar} elevation={0}>
                    <Box className={styles.filterSection}>
                        <span className={styles.filterLabel}>PROJECT TYPE</span>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <FormControlLabel
                                control={<Switch checked={filters.ABYIP} onChange={() => setFilters({ ...filters, ABYIP: !filters.ABYIP })} color="primary" />}
                                label="ABYIP"
                            />
                            <FormControlLabel
                                control={<Switch checked={filters.CBYDP} onChange={() => setFilters({ ...filters, CBYDP: !filters.CBYDP })} color="primary" />}
                                label="CBYDP"
                            />
                        </Box>
                    </Box>

                    <Box className={styles.filterSection}>
                        <span className={styles.filterLabel}>STATUS</span>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <FormControlLabel
                                control={<Switch checked={filters.Finalized} onChange={() => setFilters({ ...filters, Finalized: !filters.Finalized })} color="success" />}
                                label="Finalized"
                            />
                            <FormControlLabel
                                control={<Switch checked={filters.Pending} onChange={() => setFilters({ ...filters, Pending: !filters.Pending })} color="warning" />}
                                label="Pending"
                            />
                        </Box>
                    </Box>

                    <Box sx={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: '1rem' }}>
                        <Button 
                            variant="outlined" 
                            color="error" 
                            onClick={() => setShowCycleModal(true)}
                            sx={{ fontWeight: 'bold' }}
                        >
                            Archive Project Cycle
                        </Button>
                    </Box>
                </Paper>

                <main className={styles.mainBulletins}>
                    {currentTermProjects.length > 0 && (
                        <section className={styles.termSection}>
                            <h2 className={styles.termHeader}>Current Administration</h2>
                            <div className={styles.bulletinGrid}>
                                {currentTermProjects.map(p => (
                                    <AdminProjectCard key={p.batchID} project={p} onArchive={handleArchive} onViewDetails={handleViewDetails} />
                                ))}
                            </div>
                        </section>
                    )}

                    {pastTermProjects.length > 0 && (
                        <section className={styles.termSection}>
                            <h2 className={styles.termHeader}>List of Existing Projects</h2>
                            <div className={styles.bulletinGrid}>
                                {pastTermProjects.map(p => (
                                    <AdminProjectCard key={p.batchID} project={p} onArchive={handleArchive} onViewDetails={handleViewDetails} />
                                ))}
                            </div>
                        </section>
                    )}

                    {filteredProjects.length === 0 && (
                        <div className={styles.emptyState}>
                            <p>No projects found matching the current filters.</p>
                        </div>
                    )}
                </main>
            </div>

            <ArchiveCycleModal
                open={showCycleModal}
                onClose={() => setShowCycleModal(false)}
                onArchiveSuccess={() => window.location.reload()}
            />

            <Dialog
                open={showArchiveConfirm}
                onClose={() => setShowArchiveConfirm(false)}
                aria-labelledby="archive-dialog-title"
                aria-describedby="archive-dialog-description"
                PaperProps={{
                    style: {
                        borderRadius: '16px',
                        padding: '10px'
                    }
                }}
            >
                <DialogTitle id="archive-dialog-title" sx={{ fontWeight: 700, color: '#202124' }}>
                    Confirm Archive
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="archive-dialog-description" sx={{ color: '#5f6368' }}>
                        Are you sure you want to archive this entire project batch? This action cannot be undone and will move the project to the archive records.
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ padding: '20px', gap: '10px' }}>
                    <Button 
                        onClick={() => setShowArchiveConfirm(false)} 
                        variant="outlined"
                        sx={{ 
                            borderRadius: '8px', 
                            textTransform: 'none', 
                            fontWeight: 600,
                            color: '#5f6368',
                            borderColor: '#dadce0'
                        }}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={confirmArchive} 
                        variant="contained" 
                        color="error"
                        sx={{ 
                            borderRadius: '8px', 
                            textTransform: 'none', 
                            fontWeight: 600,
                            boxShadow: 'none',
                            '&:hover': {
                                boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)',
                                backgroundColor: '#d32f2f'
                            }
                        }}
                    >
                        Archive Project
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default AdminProjects;
