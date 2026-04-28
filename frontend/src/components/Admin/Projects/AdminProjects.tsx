import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../../backend connection/axiosConfig';
import { useAuth } from '../../../context/AuthContext';
import { toast } from 'react-toastify';
import Loading from '../../Loading/Loading';
import AdminProjectCard from './AdminProjectCard';
import styles from './AdminProjects.module.css';
import { Switch, FormControlLabel, Paper, Box } from '@mui/material';

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

            {showArchiveConfirm && (
                <div className="modal-overlay">
                    <div className="file-viewer-modal" style={{ height: 'auto', maxWidth: '400px' }}>
                        <div className="file-viewer-header">
                            <h3 className="file-viewer-title">Confirm Archive</h3>
                            <button className="file-viewer-close" onClick={() => setShowArchiveConfirm(false)}>×</button>
                        </div>
                        <div className="file-viewer-content" style={{ padding: '20px' }}>
                            <p>Are you sure you want to archive this entire project batch? This action cannot be undone.</p>
                        </div>
                        <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setShowArchiveConfirm(false)} className="review-button" style={{ backgroundColor: '#6c757d' }}>Cancel</button>
                            <button onClick={confirmArchive} className="review-button">Archive</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminProjects;
