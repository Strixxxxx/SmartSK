import React, { useCallback, useMemo } from 'react';
import styles from './ProjectTemplate.module.css';
import { AbyipRow, CbydpRow, parseYearRange } from './ProjectTemplateTypes';
import ProjectTableRow from './ProjectTableRow';
interface ProjectTemplateTableProps {
    projType: 'ABYIP' | 'CBYDP';
    projName: string;
    fiscalYear: string;
    centerOfParticipation: string;
    rows: (AbyipRow | CbydpRow)[];
    readOnly: boolean;
    hideRowIndex?: boolean;
    onAddRow?: (sectionType?: string) => void;
    onCellChange?: (rowID: number, field: string, value: string) => void;
    onCellBlur?: (rowID: number, field: string, value: string) => void;
    /** collaborators Map<userID, CollaboratorInfo> */
    collaborators?: Map<number, any>;
    currentUserId?: number;
    sendCursorMove?: (info: { cellId: string } | null) => void;
}

const ABYIP_COLS = [
    { key: 'sheetRowIndex', label: 'Rows', width: '4%' },
    { key: 'referenceCode', label: 'Reference Code', width: '9%' },
    { key: 'PPA', label: 'PPAs', width: '10%' },
    { key: 'Description', label: 'Description', width: '12%' },
    { key: 'expectedResult', label: 'Expected Result', width: '12%' },
    { key: 'performanceIndicator', label: 'Performance Indicator', width: '12%' },
    { key: 'period', label: 'Period of Implementation', width: '9%' },
    { key: 'PS', label: 'PS', width: '6%', budget: true },
    { key: 'MOOE', label: 'MOOE', width: '6%', budget: true },
    { key: 'CO', label: 'CO', width: '6%', budget: true },
    { key: 'total', label: 'Total', width: '6%', budget: true },
    { key: 'personResponsible', label: 'Person Responsible', width: '8%' },
];

const CBYDP_BASE_COLS = [
    { key: 'sheetRowIndex', label: 'Rows', width: '4%' },
    { key: 'YDC', label: 'Youth Development Concern', width: '13%' },
    { key: 'objective', label: 'Objective', width: '13%' },
    { key: 'performanceIndicator', label: 'Performance Indicator', width: '13%' },
];
const CBYDP_TARGET_COLS = [
    { key: 'target1', label: 'Target 1' },
    { key: 'target2', label: 'Target 2' },
    { key: 'target3', label: 'Target 3' },
];
const CBYDP_TAIL_COLS = [
    { key: 'PPAs', label: 'PPAs', width: '12%' },
    { key: 'budget', label: 'Budget', width: '8%' },
    { key: 'personResponsible', label: 'Person Responsible', width: '10%' },
];

const CBYDP_ALL_COLS = [...CBYDP_BASE_COLS, ...CBYDP_TARGET_COLS, ...CBYDP_TAIL_COLS];

const CBYDP_SECTIONS: Array<CbydpRow['sectionType']> = ['FROM', 'TO', 'ADDITIONAL PROJECT'];

// ─── Component ────────────────────────────────────────────────────────────────

const ProjectTemplateTable: React.FC<ProjectTemplateTableProps> = ({
    projType,
    projName,
    fiscalYear,
    centerOfParticipation,
    rows,
    readOnly,
    hideRowIndex = false,
    onAddRow,
    onCellChange,
    onCellBlur,
    collaborators = new Map(),
    currentUserId,
    sendCursorMove,
}) => {
    const yearLabels = parseYearRange(projName);

    // Optimized collaborator lookup: O(C) instead of O(N*M*C)
    const collabLookup = useMemo(() => {
        const lookup: Record<string, any> = {};
        collaborators.forEach((collab) => {
            if (collab.userID !== currentUserId && collab.cell && 'cellId' in collab.cell) {
                lookup[collab.cell.cellId] = collab;
            }
        });
        return lookup;
    }, [collaborators, currentUserId]);

    const handleFocus = useCallback((cellId: string) => sendCursorMove?.({ cellId }), [sendCursorMove]);
    const handleBlur = useCallback(() => sendCursorMove?.(null), [sendCursorMove]);

    // ── ABYIP Layout ──────────────────────────────────────────────────────────

    if (projType === 'ABYIP') {
        const abyipRows = rows as AbyipRow[];
        return (
            <div className={styles['pt-table-wrapper']}>
                <table className={styles['pt-table']}>
                    <thead>
                        {/* Title rows */}
                        <tr><th colSpan={12} className={styles['pt-title-row']}>ANNUAL BARANGAY YOUTH INVESTMENT PROGRAM (ABYIP)</th></tr>
                        <tr><th colSpan={12} className={styles['pt-title-row']}>FY {fiscalYear}</th></tr>
                        <tr><th colSpan={12} className={styles['pt-title-row']}>YOUTH DEVELOPMENT AND EMPOWERMENT PROGRAMS</th></tr>
                        <tr><th colSpan={12} className={styles['pt-title-row']}>CENTER FOR PARTICIPATION: {centerOfParticipation.toUpperCase()}</th></tr>

                        {/* Column headers — row 1 */}
                        <tr className={styles['pt-col-header']}>
                            {!hideRowIndex && <th rowSpan={2} style={{ width: '4%' }}>Rows</th>}
                            <th rowSpan={2} style={{ width: '10%' }}>Reference Code</th>
                            <th rowSpan={2} style={{ width: '11%' }}>PPAs</th>
                            <th rowSpan={2} style={{ width: '12%' }}>Description</th>
                            <th rowSpan={2} style={{ width: '12%' }}>Expected Result</th>
                            <th rowSpan={2} style={{ width: '12%' }}>Performance Indicator</th>
                            <th rowSpan={2} style={{ width: '9%' }}>Period of Implementation</th>
                            <th colSpan={4} style={{ width: '24%' }}>Annual Budget</th>
                            <th rowSpan={2} style={{ width: '8%' }}>Person Responsible</th>
                        </tr>
                        {/* Column headers — row 2 (budget sub-cols) */}
                        <tr className={styles['pt-col-header']}>
                            <th style={{ width: '6%' }}>PS</th>
                            <th style={{ width: '6%' }}>MOOE</th>
                            <th style={{ width: '6%' }}>CO</th>
                            <th style={{ width: '6%' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {abyipRows.map((row) => (
                            <ProjectTableRow
                                key={row.rowID}
                                row={row}
                                columns={hideRowIndex ? ABYIP_COLS.slice(1) : ABYIP_COLS}
                                readOnly={readOnly}
                                collabLookup={collabLookup}
                                projType="ABYIP"
                                onCellChange={onCellChange!}
                                onCellBlur={onCellBlur!}
                                handleFocus={handleFocus}
                                handleBlur={handleBlur}
                            />
                        ))}
                    </tbody>
                </table>

                {!readOnly && (
                    <button className={styles['pt-add-row-btn']} onClick={() => onAddRow?.()}>
                        + Add Row
                    </button>
                )}
            </div>
        );
    }

    // ── CBYDP Layout ──────────────────────────────────────────────────────────

    const cbydpRows = rows as CbydpRow[];

    const colCount = CBYDP_ALL_COLS.length; // 10

    return (
        <div className={styles['pt-table-wrapper']}>
            <table className={styles['pt-table']}>
                <thead>
                    <tr>
                        <th colSpan={hideRowIndex ? colCount - 1 : colCount} className={styles['pt-title-row']}>
                            COMPREHENSIVE BARANGAY YOUTH DEVELOPMENT PLAN (CBYDP) CY {fiscalYear}
                        </th>
                    </tr>
                    <tr>
                        <th colSpan={hideRowIndex ? colCount - 1 : colCount} className={styles['pt-title-row']}>
                            PARTICIPATION: {centerOfParticipation.toUpperCase()}
                        </th>
                    </tr>

                    {/* Column headers — row 1 */}
                    <tr className={styles['pt-col-header']}>
                        {!hideRowIndex && <th rowSpan={2} style={{ width: '4%' }}>Rows</th>}
                        <th rowSpan={2}>Youth Development Concern</th>
                        <th rowSpan={2}>Objective</th>
                        <th rowSpan={2}>Performance Indicator</th>
                        <th colSpan={3}>TARGET</th>
                        <th rowSpan={2}>PPAs</th>
                        <th rowSpan={2}>Budget</th>
                        <th rowSpan={2}>Person Responsible</th>
                    </tr>
                    {/* Column headers — row 2 (target years) */}
                    <tr className={styles['pt-col-header']}>
                        {yearLabels.map((yr) => <th key={yr}>{yr}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {CBYDP_SECTIONS.map((section) => {
                        const sectionRows = cbydpRows.filter((r) => r.sectionType === section);
                        return (
                            <React.Fragment key={`${section}-${centerOfParticipation}`}>
                                <tr key={`divider-${section}`}>
                                    <td colSpan={hideRowIndex ? colCount - 1 : colCount} className={styles['pt-section-divider']}>{section}</td>
                                </tr>
                                {sectionRows.map((row, idx) => (
                                    <ProjectTableRow
                                        key={`${row.rowID || idx}-${section}`}
                                        row={row}
                                        columns={hideRowIndex ? CBYDP_ALL_COLS.slice(1) : CBYDP_ALL_COLS}
                                        readOnly={readOnly}
                                        collabLookup={collabLookup}
                                        projType="CBYDP"
                                        yearLabels={yearLabels}
                                        onCellChange={onCellChange!}
                                        onCellBlur={onCellBlur!}
                                        handleFocus={handleFocus}
                                        handleBlur={handleBlur}
                                    />
                                ))}
                                {!readOnly && (
                                    <tr>
                                        <td colSpan={colCount} className={styles['pt-add-row-cell']}>
                                            <button className={styles['pt-add-row-btn-inline']} onClick={() => onAddRow?.(section)}>
                                                + Add Row
                                            </button>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default ProjectTemplateTable;
