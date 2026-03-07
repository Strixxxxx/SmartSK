import React, { useState, useEffect } from 'react';
import { Box, CircularProgress } from '@mui/material';
import ProjectSidebar from './ProjectSidebar';
import ProjectExcelGrid from './ProjectExcelGrid';
import ProjectChatbot from './ProjectChatbot';
import { loadProjectTemplate } from '../../../utils/ProjectLoader';

interface ProjectLayoutProps {
    project: any;
    onExit: () => void;
}

const ProjectLayout: React.FC<ProjectLayoutProps> = ({ project, onExit }) => {
    const [sheetData, setSheetData] = useState<any[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Logic: CBYDP never locks. ABYIP locks if StatusID >= 6 (City Approval)
    const isReadOnly = project?.projType === 'ABYIP' && (project?.statusID || 0) >= 6;

    useEffect(() => {
        if (!project?.projName) {
            setSheetData(null);
            return;
        }

        const loadData = async () => {
            setIsLoading(true);
            try {
                const sheets = await loadProjectTemplate(project.projName);
                setSheetData(sheets);
            } catch (err) {
                console.error('Failed to load project template in ProjectLayout:', err);
                setSheetData(null);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, [project?.projName]);

    return (
        <Box
            sx={{
                display: 'flex',
                height: 'calc(100vh - 100px)',
                width: '100%',
                overflow: 'hidden',
                bgcolor: '#f5f7f9'
            }}
        >
            {/* Left Section: 20% - Sidebar & Timeline */}
            <Box sx={{ width: '20%', minWidth: 250, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e0e0e0' }}>
                <ProjectSidebar project={project} onExit={onExit} />
            </Box>

            {/* Middle Section: 60% - Excel-like Grid */}
            <Box sx={{ width: '60%', flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {isLoading ? (
                    <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#fff' }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <ProjectExcelGrid project={project} spreadsheetData={sheetData} readOnly={isReadOnly} />
                )}
            </Box>

            {/* Right Section: 20% - AI Chatbot */}
            <Box sx={{ width: '20%', minWidth: 250, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e0e0e0' }}>
                <ProjectChatbot project={project} />
            </Box>
        </Box>
    );
};

export default ProjectLayout;
