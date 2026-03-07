import React, { useCallback } from 'react';
import './ProjectTemplate.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse year range from filename, e.g. "CBYDP_SB_2023-2025.xlsx" → ["2023","2024","2025"] */
export function parseYearRange(fileName: string): string[] {
    const match = fileName.match(/(\d{4})-(\d{4})/);
    if (!match) return ['Year 1', 'Year 2', 'Year 3'];
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2], 10);
    const years: string[] = [];
    for (let y = start; y <= end; y++) years.push(String(y));
    return years.slice(0, 3); // DB supports max 3
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AbyipRow {
    rowID: number;
    referenceCode?: string;
    PPA?: string;
    Description?: string;
    expectedResult?: string;
    performanceIndicator?: string;
    period?: string;
    PS?: string;
    MOOE?: string;
    CO?: string;
    total?: string;
    personResponsible?: string;
}

export interface CbydpRow {
    rowID: number;
    YDC?: string;
    objective?: string;
    performanceIndicator?: string;
    target1?: string;
    target2?: string;
    target3?: string;
    PPAs?: string;
    budget?: string;
    personResponsible?: string;
    sectionType?: 'FROM' | 'TO' | 'ADDITIONAL PROJECT';
}

interface ProjectTemplateTableProps {
    projType: 'ABYIP' | 'CBYDP';
    projName: string;
    fiscalYear: string;
    centerOfParticipation: string;
    rows: (AbyipRow | CbydpRow)[];
    readOnly: boolean;
    onAddRow?: (sectionType?: string) => void;
    onCellChange?: (rowID: number, field: string, value: string) => void;
    /** collaborators Map<userID, CollaboratorInfo> */
    collaborators?: Map<number, any>;
    currentUserId?: number;
    sendCursorMove?: (info: { cellId: string } | null) => void;
}

const ABYIP_COLS = [
    { key: 'referenceCode', label: 'Reference Code', width: '9%' },
    { key: 'PPA', label: 'PPAs', width: '10%' },
    { key: 'Description', label: 'Description', width: '13%' },
    { key: 'expectedResult', label: 'Expected Result', width: '13%' },
    { key: 'performanceIndicator', label: 'Performance Indicator', width: '13%' },
    { key: 'period', label: 'Period of Implementation', width: '10%' },
    { key: 'PS', label: 'PS', width: '6%', budget: true },
    { key: 'MOOE', label: 'MOOE', width: '6%', budget: true },
    { key: 'CO', label: 'CO', width: '6%', budget: true },
    { key: 'total', label: 'Total', width: '6%', budget: true },
    { key: 'personResponsible', label: 'Person Responsible', width: '8%' },
];

const CBYDP_BASE_COLS = [
    { key: 'YDC', label: 'Youth Development Concern', width: '13%' },
    { key: 'objective', label: 'Objective', width: '13%' },
    { key: 'performanceIndicator', label: 'Performance Indicator', width: '13%' },
];
const CBYDP_TARGET_KEYS = ['target1', 'target2', 'target3'];
const CBYDP_TAIL_COLS = [
    { key: 'PPAs', label: 'PPAs', width: '12%' },
    { key: 'budget', label: 'Budget', width: '8%' },
    { key: 'personResponsible', label: 'Person Responsible', width: '10%' },
];

const CBYDP_SECTIONS: Array<CbydpRow['sectionType']> = ['FROM', 'TO', 'ADDITIONAL PROJECT'];

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectTemplateTable: React.FC<ProjectTemplateTableProps> = ({
    projType,
    projName,
    fiscalYear,
    centerOfParticipation,
    rows,
    readOnly,
    onAddRow,
    onCellChange,
    collaborators = new Map(),
    currentUserId,
    sendCursorMove,
}) => {
    const yearLabels = parseYearRange(projName);

    // Get collaborator info for a cell if someone is focused on it
    const getCellHighlight = useCallback((cellId: string): any | null => {
        let activeCollab: any | null = null;
        collaborators.forEach((collab) => {
            // Check if cell is in { cellId: '...' } format
            const activeCellId = (collab.cell && 'cellId' in collab.cell) ? collab.cell.cellId : null;
            if (collab.userID !== currentUserId && activeCellId === cellId) {
                activeCollab = collab;
            }
        });
        return activeCollab;
    }, [collaborators, currentUserId]);

    const handleFocus = (cellId: string) => sendCursorMove?.({ cellId });
    const handleBlur = () => sendCursorMove?.(null);

    const autoResize = (el: HTMLTextAreaElement) => {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    };

    const renderCell = (rowID: number, field: string, value: string | undefined) => {
        const cellId = `cell-${rowID}-${field}`;
        const activeCollab = getCellHighlight(cellId);

        return (
            <td
                key={field}
                className="pt-cell"
                style={activeCollab ? { outline: `2px solid ${activeCollab.color}`, outlineOffset: '-2px' } : {}}
            >
                {activeCollab && (
                    <div className="pt-collab-nametag" style={{ backgroundColor: activeCollab.color }}>
                        {activeCollab.fullName}
                    </div>
                )}
                <textarea
                    id={cellId}
                    className="pt-cell-input"
                    value={value ?? ''}
                    disabled={readOnly || !!activeCollab}
                    ref={(el) => { if (el) autoResize(el); }}
                    onFocus={() => handleFocus(cellId)}
                    onBlur={handleBlur}
                    onChange={(e) => {
                        autoResize(e.target);
                        onCellChange?.(rowID, field, e.target.value);
                    }}
                />
            </td>
        );
    };

    // ── ABYIP Layout ──────────────────────────────────────────────────────────

    if (projType === 'ABYIP') {
        const abyipRows = rows as AbyipRow[];
        return (
            <div className="pt-table-wrapper">
                <table className="pt-table">
                    <thead>
                        {/* Title rows */}
                        <tr><th colSpan={11} className="pt-title-row">ANNUAL BARANGAY YOUTH INVESTMENT PROGRAM (ABYIP)</th></tr>
                        <tr><th colSpan={11} className="pt-title-row">FY {fiscalYear}</th></tr>
                        <tr><th colSpan={11} className="pt-title-row">YOUTH DEVELOPMENT AND EMPOWERMENT PROGRAMS</th></tr>
                        <tr><th colSpan={11} className="pt-title-row">CENTER FOR PARTICIPATION: {centerOfParticipation.toUpperCase()}</th></tr>

                        {/* Column headers — row 1 */}
                        <tr className="pt-col-header">
                            <th rowSpan={2} style={{ width: '9%' }}>Reference Code</th>
                            <th rowSpan={2} style={{ width: '10%' }}>PPAs</th>
                            <th rowSpan={2} style={{ width: '13%' }}>Description</th>
                            <th rowSpan={2} style={{ width: '13%' }}>Expected Result</th>
                            <th rowSpan={2} style={{ width: '13%' }}>Performance Indicator</th>
                            <th rowSpan={2} style={{ width: '10%' }}>Period of Implementation</th>
                            <th colSpan={4} style={{ width: '24%' }}>Annual Budget</th>
                            <th rowSpan={2} style={{ width: '8%' }}>Person Responsible</th>
                        </tr>
                        {/* Column headers — row 2 (budget sub-cols) */}
                        <tr className="pt-col-header">
                            <th style={{ width: '6%' }}>PS</th>
                            <th style={{ width: '6%' }}>MOOE</th>
                            <th style={{ width: '6%' }}>CO</th>
                            <th style={{ width: '6%' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {abyipRows.map((row) => (
                            <tr key={row.rowID}>
                                {ABYIP_COLS.map((col) =>
                                    renderCell(row.rowID, col.key, (row as any)[col.key])
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>

                {!readOnly && (
                    <button className="pt-add-row-btn" onClick={() => onAddRow?.()}>
                        + Add Row
                    </button>
                )}
            </div>
        );
    }

    // ── CBYDP Layout ──────────────────────────────────────────────────────────

    const cbydpRows = rows as CbydpRow[];

    const renderCbydpSection = (section: CbydpRow['sectionType']) => {
        const sectionRows = cbydpRows.filter((r) => r.sectionType === section);
        return (
            <>
                <tr>
                    <td colSpan={9} className="pt-section-divider">{section}</td>
                </tr>
                {sectionRows.map((row) => (
                    <tr key={row.rowID}>
                        {CBYDP_BASE_COLS.map((col) => renderCell(row.rowID, col.key, (row as any)[col.key]))}
                        {CBYDP_TARGET_KEYS.map((k) => renderCell(row.rowID, k, (row as any)[k]))}
                        {CBYDP_TAIL_COLS.map((col) => renderCell(row.rowID, col.key, (row as any)[col.key]))}
                    </tr>
                ))}
                {!readOnly && (
                    <tr>
                        <td colSpan={9} className="pt-add-row-cell">
                            <button className="pt-add-row-btn-inline" onClick={() => onAddRow?.(section)}>
                                + Add Row
                            </button>
                        </td>
                    </tr>
                )}
            </>
        );
    };

    const colCount = CBYDP_BASE_COLS.length + 3 + CBYDP_TAIL_COLS.length; // 9

    return (
        <div className="pt-table-wrapper">
            <table className="pt-table">
                <thead>
                    <tr>
                        <th colSpan={colCount} className="pt-title-row">
                            COMPREHENSIVE BARANGAY YOUTH DEVELOPMENT PLAN (CBYDP) CY {fiscalYear}
                        </th>
                    </tr>
                    <tr>
                        <th colSpan={colCount} className="pt-title-row">
                            PARTICIPATION: {centerOfParticipation.toUpperCase()}
                        </th>
                    </tr>

                    {/* Column headers — row 1 */}
                    <tr className="pt-col-header">
                        <th rowSpan={2}>Youth Development Concern</th>
                        <th rowSpan={2}>Objective</th>
                        <th rowSpan={2}>Performance Indicator</th>
                        <th colSpan={3}>TARGET</th>
                        <th rowSpan={2}>PPAs</th>
                        <th rowSpan={2}>Budget</th>
                        <th rowSpan={2}>Person Responsible</th>
                    </tr>
                    {/* Column headers — row 2 (target years) */}
                    <tr className="pt-col-header">
                        {yearLabels.map((yr) => <th key={yr}>{yr}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {CBYDP_SECTIONS.map((section) => renderCbydpSection(section))}
                </tbody>
            </table>
        </div>
    );
};

export default ProjectTemplateTable;
