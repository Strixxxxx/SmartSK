import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Box } from '@mui/material';
import ProjectWorkspaceSidebar from './ProjectWorkspaceSidebar';
import ProjectWorkNotes from './ProjectWorkNotes';
import ProjectTopNavbar from './ProjectTopNavbar';
import CreateProjectModal from './CreateProjectModal';
import ProjectTemplateHeader from './ProjectTemplateHeader';
import ProjectTemplateTable from './ProjectTemplateTable';
import { AbyipRow, CbydpRow } from './ProjectTemplateTypes';
import ProjectSheetTabs from './ProjectSheetTabs';
import ProjectTableSkeleton from './ProjectTableSkeleton'; // Added Skeleton
import { useAuth } from '../../../context/AuthContext';
import { useCollaborationSocket } from '../../../hooks/useCollaborationSocket';
import axiosInstance from '../../../backend connection/axiosConfig';

/** Parse barangay from filename: SB_ → 'SB', NN_ → 'NN' */
function parseBarangay(fileName: string): 'SB' | 'NN' {
    if (fileName.toUpperCase().includes('_NN_') || fileName.toUpperCase().startsWith('NN_')) return 'NN';
    return 'SB';
}

/** Parse fiscal year from filename: e.g. "ABYIP_SB_2026.xlsx" → "2026", "CBYDP_SB_2023-2025.xlsx" → "2023-2025" */
function parseFiscalYear(fileName: string): string {
    const rangeMatch = fileName.match(/(\d{4}-\d{4})/);
    if (rangeMatch) return rangeMatch[1];
    const singleMatch = fileName.match(/(\d{4})/);
    return singleMatch ? singleMatch[1] : '';
}

const CATEGORIES = [
    'Governance',
    'Active Citizenship',
    'Economic Empowerment',
    'Global Mobility',
    'Agriculture',
    'Environment',
    'Peace Building and Security',
    'Social Inclusion and Equity',
    'Education',
    'Health',
];

const ProjectWorkspacePage: React.FC = () => {
    const location = useLocation();
    const [selectedProject, setSelectedProject] = useState<any>((location.state as any)?.project || null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string>(CATEGORIES[0]);
    const [rows, setRows] = useState<(AbyipRow | CbydpRow)[]>([]);
    const [agendaData, setAgendaData] = useState<Record<string, string>>({});
    const [isLoadingRows, setIsLoadingRows] = useState(false);
    const [projectListRefreshTrigger, setProjectListRefreshTrigger] = useState(0);
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(true);
    const { user } = useAuth();
    
    // ── Tab Caching ──────────────────────────────────────────────────────────
    // Stores the row data for each category (center) for the currently selected project
    const dataCache = useRef<Record<string, (AbyipRow | CbydpRow)[]>>({});

// Helper to map tab name to agenda column name
function getAgendaColumnMap(tabName: string): string {
    const map: Record<string, string> = {
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
        'Maintenance and Other Operating Expenses': 'MOOE',
    };
    return map[tabName] || 'governance';
}

    const canCreate = user?.role === 'SKC' ||
        user?.position?.toLowerCase().includes('chairperson') ||
        user?.position?.toUpperCase() === 'SKC';

    const isReadOnly = selectedProject?.projType === 'ABYIP' &&
        (selectedProject?.currentStatusID || 0) >= 6;

    const projName: string = selectedProject?.projName ?? '';
    const barangay = parseBarangay(projName);
    const fiscalYear = parseFiscalYear(projName);
    const projType: 'ABYIP' | 'CBYDP' = selectedProject?.projType === 'CBYDP' ? 'CBYDP' : 'ABYIP';

    const [auditRefreshTrigger, setAuditRefreshTrigger] = useState(0);
    const handleAuditUpdate = useCallback(() => {
        setAuditRefreshTrigger(prev => prev + 1);
    }, []);

    // Clear cache when project matches change
    useEffect(() => {
        dataCache.current = {};
        setAgendaData({});
    }, [selectedProject?.batchID]);

    // ── Load rows on project/tab change (TAB CACHE + SKELETON) ───────────────
    useEffect(() => {
        if (!selectedProject?.batchID) {
            setRows([]);
            return;
        }

        const fetchRows = async () => {
            // If we have cached data for this tab, use it immediately (Instant load)
            const cached = dataCache.current[activeTab];
            if (cached) {
                setRows(cached);
                setIsLoadingRows(false);
            } else {
                setIsLoadingRows(true);
                setRows([]);
            }

            try {
                // Fetch Rows
                const res = await axiosInstance.get(
                    `/api/project-batch/${selectedProject.batchID}/rows`,
                    { params: { center: activeTab } }
                );
                const newData = res.data.data ?? [];
                
                // Update Cache and State
                dataCache.current[activeTab] = newData;
                setRows(newData);

                // Fetch Agenda Data once per project change if CBYDP
                if (projType === 'CBYDP' && Object.keys(agendaData).length === 0) {
                    const agendaRes = await axiosInstance.get(`/api/project-batch/${selectedProject.batchID}/agenda`);
                    if (agendaRes.data.success && agendaRes.data.data) {
                        setAgendaData(agendaRes.data.data);
                    }
                }
            } catch (err) {
                console.error('Failed to load rows or agenda:', err);
                if (!dataCache.current[activeTab]) setRows([]);
            } finally {
                setIsLoadingRows(false);
            }
        };

        fetchRows();
    }, [selectedProject?.batchID, activeTab, projType, agendaData]);

    // ── Load rows on audit update (SILENT REFRESH NO SPINNER) ────────────────
    useEffect(() => {
        if (!selectedProject?.batchID) return;
        if (auditRefreshTrigger === 0) return;

        const fetchRowsSilently = async () => {
            try {
                const res = await axiosInstance.get(
                    `/api/project-batch/${selectedProject.batchID}/rows`,
                    { params: { center: activeTab } }
                );
                const newData = res.data.data ?? [];
                dataCache.current[activeTab] = newData; // Update cache silently
                setRows(newData);
            } catch (err) {
                console.error('Failed to silently refresh rows:', err);
            }
        };

        fetchRowsSilently();
    }, [auditRefreshTrigger]);

    // ── Collaboration ─────────────────────────────────────────────────────────
    const [remoteNotes, setRemoteNotes] = useState<any[]>([]);

    const handleRemoteNote = useCallback((note: any) => {
        setRemoteNotes(prev => [...prev, note]);
    }, []);

    const handleRemoteCellChange = useCallback((changes: any[]) => {
        changes.forEach(({ rowID, field, value }) => {
            setRows((prev) => {
                const updated = prev.map((r) =>
                    (r as any).rowID === rowID ? { ...r, [field]: value } : r
                );
                // Also update cache if this is the active tab
                dataCache.current[activeTab] = updated;
                return updated;
            });
        });
    }, [activeTab]);

    const { collaborators, sendCursorMove, sendCellChange, sendNote } = useCollaborationSocket({
        batchID: selectedProject?.batchID ?? null,
        onCellChange: handleRemoteCellChange,
        onNote: handleRemoteNote,
        onAuditUpdate: handleAuditUpdate,
    });

    // Build a Map for the collaborators (keyed by userID)
    const collabMap = new Map<number, any>();
    collaborators.forEach((c: any) => collabMap.set(c.userID, c));

    // ── Cell change handler ───────────────────────────────────────────────────

    const handleCellChange = useCallback((rowID: number, field: string, value: string) => {
        // 1. Optimistic update (Immediate UI feedback)
        setRows((prev) => {
            const updated = prev.map((r) => (r as any).rowID === rowID ? { ...r, [field]: value } : r);
            dataCache.current[activeTab] = updated; // Update cache
            return updated;
        });

        // 2. Real-time sync (Broadcast to other users)
        sendCellChange([{ rowID, field, value }]);
    }, [sendCellChange, activeTab]);

    // ── Cell blur handler (Finalize Audit) ─────────────────────────────────────
    const handleCellBlur = useCallback(async (rowID: number, field: string, value: string) => {
        if (!selectedProject?.batchID) return;

        try {
            await axiosInstance.patch(
                `/api/project-batch/${selectedProject.batchID}/rows/${rowID}`,
                { field, value, projType, center: activeTab }
            );
            setAuditRefreshTrigger(prev => prev + 1);
        } catch (err) {
            console.error('Failed to save finalized cell:', err);
        }
    }, [selectedProject?.batchID, projType, activeTab]);

    // ── Add row handler ───────────────────────────────────────────────────────
    const handleAddRow = useCallback(async (sectionType?: string) => {
        try {
            let nextIndex = 1;
            if (projType === 'ABYIP') {
                const abyipRows = rows as AbyipRow[];
                const maxIndex = Math.max(0, ...abyipRows.map(r => r.sheetRowIndex || 0));
                nextIndex = maxIndex + 1;
            } else {
                const cbydpRows = rows as CbydpRow[];
                const sectionRows = cbydpRows.filter(r => r.sectionType === (sectionType || 'FROM'));
                const maxIndex = Math.max(0, ...sectionRows.map(r => r.sheetRowIndex || 0));
                nextIndex = maxIndex + 1;
            }

            const res = await axiosInstance.post(
                `/api/project-batch/${selectedProject.batchID}/rows`,
                { center: activeTab, sectionType: sectionType || 'FROM', sheetRowIndex: nextIndex }
            );
            const newRow = res.data.data;
            let updated: (AbyipRow | CbydpRow)[] = [];
            
            if (projType === 'ABYIP') {
                updated = [...rows, { rowID: newRow.rowID, sheetRowIndex: nextIndex } as AbyipRow];
            } else {
                updated = [...rows, { rowID: newRow.rowID, sectionType: sectionType || 'FROM', sheetRowIndex: nextIndex } as CbydpRow];
            }
            
            setRows(updated);
            dataCache.current[activeTab] = updated;
            setAuditRefreshTrigger(prev => prev + 1);
        } catch (err) {
            console.error('Failed to add row:', err);
        }
    }, [selectedProject?.batchID, activeTab, projType, rows]);

    // ── Update Status handler ───────────────────────────────────────────────
    const handleUpdateStatus = async (statusID: number) => {
        if (!selectedProject?.batchID) return;
        try {
            const res = await axiosInstance.post('/api/project-batch/update-status', {
                batchID: selectedProject.batchID,
                statusID
            });
            if (res.data.success) {
                setSelectedProject((prev: any) => ({
                    ...prev,
                    currentStatusID: statusID
                }));
            }
        } catch (err: any) {
            console.error('Failed to update status:', err);
            alert(err.response?.data?.message || 'Failed to update milestone.');
        }
    };

    // ── Update Agenda Statement handler ─────────────────────────────────────
    const handleAgendaSave = async (newValue: string) => {
        if (!selectedProject?.batchID) return;
        
        const colMap = getAgendaColumnMap(activeTab);
        setAgendaData(prev => ({ ...prev, [colMap]: newValue }));

        try {
            await axiosInstance.patch(`/api/project-batch/${selectedProject.batchID}/agenda`, {
                categoryMap: colMap,
                value: newValue
            });
            // trigger audit refresh if you added audit logs in backend, or just UI refresh
            setAuditRefreshTrigger(prev => prev + 1);
        } catch (err) {
            console.error('Failed to update agenda statement:', err);
        }
    };

    // ── Tab change ────────────────────────────────────────────────────────────
    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        // Don't clear rows here, fetchRows will handle it with cache/isLoading
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', bgcolor: '#f5f7f9' }}>

            {/* Left Sidebar */}
            <ProjectWorkspaceSidebar
                selectedProject={selectedProject}
                onSelectProject={(proj) => {
                    setSelectedProject(proj);
                    setRows([]);
                    setActiveTab(CATEGORIES[0]);
                    dataCache.current = {};
                }}
                auditRefreshTrigger={auditRefreshTrigger}
                projectListRefreshTrigger={projectListRefreshTrigger}
                center={activeTab}
                isCollapsed={isLeftSidebarCollapsed}
                onToggleCollapse={() => setIsLeftSidebarCollapsed(prev => !prev)}
            />

            {/* Content Area */}
            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>

                {/* Top Navbar */}
                <ProjectTopNavbar
                    project={selectedProject}
                    canCreate={canCreate}
                    collaborators={collaborators}
                    currentUser={user}
                    onCreateNew={() => setIsModalOpen(true)}
                    onUpdateStatus={handleUpdateStatus}
                />

                {/* Main Row */}
                <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>

                    {/* Template Area - auto-fills remaining space */}
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#fff', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>

                        {selectedProject ? (
                            <>
                                <ProjectTemplateHeader
                                    projType={projType}
                                    projName={projName}
                                    barangay={barangay}
                                    fiscalYear={fiscalYear}
                                    centerOfParticipation={activeTab}
                                    agendaStatement={agendaData[getAgendaColumnMap(activeTab)] || ''}
                                    onAgendaSave={handleAgendaSave}
                                    readOnly={isReadOnly}
                                />

                                <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'auto', p: '12px 16px' }}>
                                    {isLoadingRows && rows.length === 0 ? (
                                        <ProjectTableSkeleton projType={projType} />
                                    ) : (
                                        <ProjectTemplateTable
                                            projType={projType}
                                            projName={projName}
                                            fiscalYear={fiscalYear}
                                            centerOfParticipation={activeTab}
                                            rows={rows}
                                            readOnly={isReadOnly}
                                            onAddRow={handleAddRow}
                                            onCellChange={handleCellChange}
                                            onCellBlur={handleCellBlur}
                                            collaborators={collabMap}
                                            currentUserId={user?.id}
                                            sendCursorMove={sendCursorMove}
                                        />
                                    )}
                                </Box>

                                <ProjectSheetTabs activeTab={activeTab} onTabChange={handleTabChange} />
                            </>
                        ) : (
                            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
                                Select a project from the sidebar to get started.
                            </Box>
                        )}
                    </Box>

                    {/* Right Sidebar: Notes & Agenda */}
                    <Box sx={{
                        width: isRightSidebarCollapsed ? 40 : 280,
                        minWidth: isRightSidebarCollapsed ? 40 : 280,
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        borderLeft: '1px solid #e0d9c4',
                        overflow: 'hidden',
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}>
                        <ProjectWorkNotes
                            project={selectedProject}
                            remoteNotes={remoteNotes}
                            onPostNote={(note) => sendNote(note)}
                            center={activeTab}
                            isCollapsed={isRightSidebarCollapsed}
                            onToggleCollapse={() => setIsRightSidebarCollapsed(prev => !prev)}
                        />
                    </Box>
                </Box>
            </Box>

            {/* Modal */}
            <CreateProjectModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreated={() => {
                    setIsModalOpen(false);
                    setProjectListRefreshTrigger(prev => prev + 1);
                }}
            />
        </Box>
    );
};

export default ProjectWorkspacePage;
