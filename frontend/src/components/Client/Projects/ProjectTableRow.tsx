import React from 'react';
import { AbyipRow, CbydpRow } from './ProjectTemplateTypes';
import ProjectTableCell from './ProjectTableCell';

interface ProjectTableRowProps {
    row: AbyipRow | CbydpRow;
    columns: any[];
    readOnly: boolean;
    collabLookup: Record<string, any>;
    projType?: 'ABYIP' | 'CBYDP';
    yearLabels?: string[];
    onCellChange: (rowID: number, field: string, value: string) => void;
    onCellBlur: (rowID: number, field: string, value: string) => void;
    handleFocus: (cellId: string) => void;
    handleBlur: () => void;
}

const ProjectTableRow: React.FC<ProjectTableRowProps> = React.memo(({
    row,
    columns,
    readOnly,
    collabLookup,
    projType,
    yearLabels,
    onCellChange,
    onCellBlur,
    handleFocus,
    handleBlur
}) => {
    return (
        <tr>
            {columns.map((col) => {
                const cellId = `cell-${row.rowID}-${col.key}`;
                const activeCollab = collabLookup[cellId] || null;
                const value = (row as any)[col.key] || '';

                return (
                    <ProjectTableCell
                        key={col.key}
                        rowID={row.rowID}
                        field={col.key}
                        value={value}
                        readOnly={readOnly || col.readOnly}
                        activeCollab={activeCollab}
                        projType={projType}
                        yearLabels={yearLabels}
                        onCellChange={onCellChange}
                        onCellBlur={onCellBlur}
                        handleFocus={handleFocus}
                        handleBlur={handleBlur}
                    />
                );
            })}
        </tr>
    );
});

export default ProjectTableRow;
