import React, { useCallback, useRef, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { Workbook, WorkbookInstance } from '@fortune-sheet/react';
import type { Selection } from '@fortune-sheet/core';
import '@fortune-sheet/react/dist/index.css';

interface ProjectExcelGridProps {
    project: any;
    spreadsheetData: any[] | null;
    readOnly: boolean;
    sendCursorMove?: (cell: { r: number; c: number } | null) => void;
    sendCellChange?: (changes: any[]) => void;
    collaborators?: Map<number, any>;
    incomingChanges?: any[] | null;
}

// Default blank sheet
const defaultSheets = [
    {
        name: 'Sheet1',
        id: 'default',
        celldata: [] as any[],
        order: 0,
        status: 1,
    },
];

const ProjectExcelGrid: React.FC<ProjectExcelGridProps> = ({
    project, spreadsheetData, readOnly,
    sendCursorMove = () => { },
    sendCellChange = () => { },
    collaborators = new Map(),
    incomingChanges = null
}) => {
    const workbookRef = useRef<WorkbookInstance>(null);

    // 1. Sync: Apply incoming changes from remote users
    useEffect(() => {
        if (!workbookRef.current || !incomingChanges) return;

        try {
            incomingChanges.forEach((change: any) => {
                // FortuneSheet's setCellValue handles the update
                if (change.r !== undefined && change.c !== undefined) {
                    workbookRef.current?.setCellValue(change.r, change.c, change.v);
                }
            });
        } catch (error) {
            console.error('Failed to apply remote cell changes', error);
        }
    }, [incomingChanges]);

    // Whenever collaborators change, update FortuneSheet's native presence system
    useEffect(() => {
        if (!workbookRef.current) return;

        try {
            const presences: any[] = [];
            collaborators.forEach((collab) => {
                // Don't render self as a remote cursor
                if (collab.isSelf || !collab.cell) return;

                presences.push({
                    sheetId: spreadsheetData?.[0]?.id || 'default',
                    username: `${collab.fullName} (${collab.position})`,
                    userId: String(collab.userID),
                    color: collab.color,
                    selection: {
                        r: collab.cell.r,
                        c: collab.cell.c,
                    }
                });
            });

            if (presences.length > 0) {
                workbookRef.current.addPresences(presences);
            }
        } catch (error) {
            console.error('Failed to update presences', error);
        }

    }, [collaborators, spreadsheetData]);

    const handleChange = useCallback((cellDataChanges: any[]) => {
        // Only broadcast if not in read-only mode
        if (!readOnly) {
            sendCellChange(cellDataChanges);
        }
    }, [sendCellChange, readOnly]);

    if (!project) {
        return (
            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f5f7f9' }}>
                <Typography color="text.secondary" align="center">
                    Select a project from the left panel to view its spreadsheet.
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden', bgcolor: '#fff' }}>
            {readOnly && (
                <Box sx={{ px: 2, py: 0.5, bgcolor: '#fff3e0', borderBottom: '1px solid #ffe082', flexShrink: 0 }}>
                    <Typography variant="caption" sx={{ color: '#e65100', fontWeight: 600 }}>
                        READ-ONLY — LGU Approved. Editing is disabled.
                    </Typography>
                </Box>
            )}

            {/* FortuneSheet Workbook */}
            <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%' }}>
                    <Workbook
                        ref={workbookRef}
                        data={spreadsheetData || defaultSheets}
                        onChange={handleChange}
                        hooks={{
                            afterSelectionChange: (_sheetId: string, selection: Selection | Selection[]) => {
                                if (readOnly) return;
                                const sel = Array.isArray(selection) ? selection[0] : selection;
                                if (sel?.row && sel?.column) {
                                    sendCursorMove({ r: sel.row[0], c: sel.column[0] });
                                }
                            }
                        }}
                    />
                </div>
            </Box>
        </Box>
    );
};

export default ProjectExcelGrid;
