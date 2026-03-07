import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Grid, CircularProgress, Alert } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import CreateProjectModal from './CreateProjectModal';
import { useAuth } from '../../../context/AuthContext';
import axiosInstance from '../../../backend connection/axiosConfig';

const Projects: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { user } = useAuth();
    const navigate = useNavigate();

    const fetchProjects = async () => {
        setLoading(true);
        try {
            const response = await axiosInstance.get('/api/project-batch/dashboard');
            if (response.data.success) {
                setProjects(response.data.data);
            }
        } catch (err) {
            console.error('Error fetching projects:', err);
            setError('Failed to load projects. Please try again later.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchProjects();
        }
    }, [user]);

    // Check if user is SK Chairperson
    const canCreateProject = user?.role === 'SKC' ||
        user?.position?.toLowerCase().includes('chairperson') ||
        user?.position?.toUpperCase() === 'SKC';

    const handleOpenProject = (project: any) => {
        navigate(`/projects/${project.batchID}`, { state: { project } });
    };

    return (
        <Box sx={{ p: 4, flexGrow: 1, overflowY: 'auto', height: '100vh' }}>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">
                        Project Management
                    </Typography>
                    <Typography variant="subtitle1" color="text.secondary">
                        Create and manage your barangay's investment programs.
                    </Typography>
                </Box>
                {canCreateProject && (
                    <Button
                        variant="contained"
                        size="large"
                        onClick={() => setIsModalOpen(true)}
                        sx={{ borderRadius: 2, px: 4 }}
                    >
                        Create New Project
                    </Button>
                )}
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : error ? (
                <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
            ) : projects.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', border: '2px dashed #e0e0e0', bgcolor: 'transparent' }}>
                    <Typography color="text.secondary">No projects created yet. Click "Create New Project" to get started.</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {projects.map((project) => (
                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={project.batchID}>
                            <Paper
                                onClick={() => handleOpenProject(project)}
                                sx={{
                                    p: 3,
                                    cursor: 'pointer',
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    '&:hover': {
                                        bgcolor: '#f8f9fa',
                                        transform: 'translateY(-4px)',
                                        boxShadow: 4
                                    }
                                }}
                            >
                                <Typography variant="overline" color="primary" fontWeight="bold">
                                    {project.projType} {project.targetYear}
                                </Typography>
                                <Typography variant="h6" sx={{ mb: 1 }}>{project.projName}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                                    Status: <strong>{project.StatusName}</strong>
                                </Typography>
                                <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #eee' }}>
                                    <Typography variant="caption" color="text.secondary">
                                        Created-on: {new Date(project.createdAt).toLocaleDateString()}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            )}

            <CreateProjectModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreated={() => {
                    fetchProjects();
                }}
            />
        </Box>
    );
};

export default Projects;
