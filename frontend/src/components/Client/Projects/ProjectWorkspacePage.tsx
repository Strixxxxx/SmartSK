import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import ProjectWorkspaceSidebar from './ProjectWorkspaceSidebar';
import ProjectWorkNotes from './ProjectWorkNotes';
import ProjectTopNavbar from './ProjectTopNavbar';
import CreateProjectModal from './CreateProjectModal';
import ProjectTemplateHeader from './ProjectTemplateHeader';
import ProjectTemplateTable, { AbyipRow, CbydpRow } from './ProjectTemplateTable';
import ProjectSheetTabs from './ProjectSheetTabs';
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
    const [isLoadingRows, setIsLoadingRows] = useState(false);
    const { user } = useAuth();

    const canCreate = user?.role === 'SKC' ||
        user?.position?.toLowerCase().includes('chairperson') ||
        user?.position?.toUpperCase() === 'SKC';

    const isReadOnly = selectedProject?.projType === 'ABYIP' &&
        (selectedProject?.currentStatusID || 0) >= 6;

    const projName: string = selectedProject?.projName ?? '';
    const barangay = parseBarangay(projName);
    const fiscalYear = parseFiscalYear(projName);
    const projType: 'ABYIP' | 'CBYDP' = selectedProject?.projType === 'CBYDP' ? 'CBYDP' : 'ABYIP';

    // ── Load rows on project/tab change ──────────────────────────────────────
    useEffect(() => {
        if (!selectedProject?.batchID) {
            setRows([]);
            return;
        }

        const fetchRows = async () => {
            setIsLoadingRows(true);
            try {
                const res = await axiosInstance.get(
                    `/api/project-batch/${selectedProject.batchID}/rows`,
                    { params: { center: activeTab } }
                );
                setRows(res.data.data ?? []);
            } catch (err) {
                console.error('Failed to load rows:', err);
                setRows([]);
            } finally {
                setIsLoadingRows(false);
            }
        };

        fetchRows();
    }, [selectedProject?.batchID, activeTab]);

    // ── Collaboration ─────────────────────────────────────────────────────────
    const handleRemoteCellChange = useCallback((changes: any[]) => {
        changes.forEach(({ rowID, field, value }) => {
            setRows((prev) =>
                prev.map((r) =>
                    (r as any).rowID === rowID ? { ...r, [field]: value } : r
                )
            );
        });
    }, []);

    // ── Work Notes ────────────────────────────────────────────────────────────
    const [remoteNotes, setRemoteNotes] = useState<any[]>([]);

    const handleRemoteNote = useCallback((note: any) => {
        setRemoteNotes(prev => [...prev, note]);
    }, []);

    const [auditRefreshTrigger, setAuditRefreshTrigger] = useState(0);
    const handleAuditUpdate = useCallback(() => {
        setAuditRefreshTrigger(prev => prev + 1);
    }, []);

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
    const cellDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleCellChange = useCallback((rowID: number, field: string, value: string) => {
        // Optimistic update
        setRows((prev) =>
            prev.map((r) => (r as any).rowID === rowID ? { ...r, [field]: value } : r)
        );

        // Debounce API call
        if (cellDebounceRef.current) clearTimeout(cellDebounceRef.current);
        cellDebounceRef.current = setTimeout(async () => {
            try {
                await axiosInstance.patch(
                    `/api/project-batch/${selectedProject.batchID}/rows/${rowID}`,
                    { field, value, projType }
                );
                // Broadcast to collaborators
                sendCellChange([{ rowID, field, value }]);
                // Update local audit timeline
                setAuditRefreshTrigger(prev => prev + 1);
            } catch (err) {
                console.error('Failed to save cell:', err);
            }
        }, 600);
    }, [selectedProject?.batchID, projType, sendCellChange]);

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
            if (projType === 'ABYIP') {
                setRows((prev) => [...prev, { rowID: newRow.rowID, sheetRowIndex: nextIndex } as AbyipRow]);
            } else {
                setRows((prev) => [...prev, { rowID: newRow.rowID, sectionType: sectionType || 'FROM', sheetRowIndex: nextIndex } as CbydpRow]);
            }
            // Update local audit timeline
            setAuditRefreshTrigger(prev => prev + 1);
        } catch (err) {
            console.error('Failed to add row:', err);
        }
    }, [selectedProject?.batchID, activeTab, projType, rows]);

    // ── Tab change ────────────────────────────────────────────────────────────
    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setRows([]);
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
                }}
                auditRefreshTrigger={auditRefreshTrigger}
            />

            {/* Content Area */}
            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>

                {/* Top Navbar */}
                <ProjectTopNavbar
                    project={selectedProject}
                    canCreate={canCreate}
                    collaborators={collaborators}
                    currentUser={user}
                    onCreateNew={() => setIsModalOpen(true)}
                />

                {/* Main Row */}
                <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>

                    {/* Template Area */}
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#fff' }}>

                        {selectedProject ? (
                            <>
                                {/* Header */}
                                <ProjectTemplateHeader
                                    projType={projType}
                                    projName={projName}
                                    barangay={barangay}
                                    fiscalYear={fiscalYear}
                                    centerOfParticipation={activeTab}
                                />

                                {/* Table scroll area */}
                                <Box sx={{ flexGrow: 1, overflowY: 'auto', overflowX: 'auto', p: '12px 16px' }}>
                                    {isLoadingRows ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
                                            <CircularProgress />
                                        </Box>
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
                                            collaborators={collabMap}
                                            currentUserId={user?.id}
                                            sendCursorMove={sendCursorMove}
                                        />
                                    )}
                                </Box>

                                {/* Sheet Tab Bar */}
                                <ProjectSheetTabs activeTab={activeTab} onTabChange={handleTabChange} />
                            </>
                        ) : (
                            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa' }}>
                                Select a project from the sidebar to get started.
                            </Box>
                        )}
                    </Box>

                    {/* Work Notes */}
                    <Box sx={{ width: 280, minWidth: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #e0d9c4' }}>
                        <ProjectWorkNotes
                            project={selectedProject}
                            remoteNotes={remoteNotes}
                            onPostNote={(note) => sendNote(note)}
                        />
                    </Box>
                </Box>
            </Box>

            {/* Modal */}
            <CreateProjectModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreated={() => setIsModalOpen(false)}
            />
        </Box>
    );
};

export default ProjectWorkspacePage;
