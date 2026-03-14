import React, { useRef, useEffect, useState, useCallback } from 'react';
import styles from './ProjectTemplate.module.css';

interface ProjectTableCellProps {
    rowID: number;
    field: string;
    value: string;
    readOnly: boolean;
    activeCollab: any | null;
    projType?: 'ABYIP' | 'CBYDP';
    yearLabels?: string[];
    onCellChange: (rowID: number, field: string, value: string) => void;
    onCellBlur: (rowID: number, field: string, value: string) => void;
    handleFocus: (cellId: string) => void;
    handleBlur: () => void;
}

// ─── Budget value parser ─────────────────────────────────────────────────────
function parseBudgetValue(raw: string, yearLabels: string[]): Record<string, string> {
    const result: Record<string, string> = {};
    yearLabels.forEach(yr => { result[yr] = ''; });
    if (!raw) return result;

    const lines = raw.split('\n');
    lines.forEach(line => {
        const match = line.match(/^(\d{4}):\s*(.*)$/);
        if (match && result.hasOwnProperty(match[1])) {
            result[match[1]] = match[2].trim();
        }
    });
    return result;
}

// Serialize budget values
function serializeBudgetValue(yearValues: Record<string, string>, yearLabels: string[]): string {
    const lines = ['MOOE', ...yearLabels.map(yr => `${yr}: ${yearValues[yr] ?? ''}`)];
    return lines.join('\n');
}

// ─── Structured Budget Cell ──────────────────────────────────────────────────
interface BudgetCellProps {
    rowID: number;
    value: string;
    readOnly: boolean;
    yearLabels: string[];
    activeCollab: any | null;
    onCellChange: (rowID: number, field: string, value: string) => void;
    onCellBlur: (rowID: number, field: string, value: string) => void;
    handleFocus: (cellId: string) => void;
    handleBlur: () => void;
}

const CbydpBudgetCell: React.FC<BudgetCellProps> = React.memo(({
    rowID, value, readOnly, yearLabels, activeCollab,
    onCellChange, onCellBlur, handleFocus, handleBlur
}) => {
    const cellId = `cell-${rowID}-budget`;
    const [yearValues, setYearValues] = useState<Record<string, string>>(
        () => parseBudgetValue(value, yearLabels)
    );
    const isEditing = useRef(false);
    const lastPushedValue = useRef(value ?? '');
    const debouncedSync = useRef<NodeJS.Timeout | null>(null);

    // Sync incoming value changes (remote updates) only if not being edited locally
    useEffect(() => {
        if (!isEditing.current) {
            setYearValues(parseBudgetValue(value, yearLabels));
            lastPushedValue.current = value;
        }
    }, [value, yearLabels]);

    const handleYearChange = (yr: string, newVal: string) => {
        isEditing.current = true;
        const updated = { ...yearValues, [yr]: newVal };
        setYearValues(updated);
        
        // INP Performance: Debounce sync to main state
        if (debouncedSync.current) clearTimeout(debouncedSync.current);
        debouncedSync.current = setTimeout(() => {
            const serialized = serializeBudgetValue(updated, yearLabels);
            if (serialized !== lastPushedValue.current) {
                onCellChange(rowID, 'budget', serialized);
                lastPushedValue.current = serialized;
            }
        }, 500);
    };

    const handleYearBlur = (_yr: string) => {
        isEditing.current = false;
        if (debouncedSync.current) clearTimeout(debouncedSync.current);

        handleBlur();
        const serialized = serializeBudgetValue(yearValues, yearLabels);
        
        // Immediate sync on blur
        if (serialized !== lastPushedValue.current) {
            onCellChange(rowID, 'budget', serialized);
            lastPushedValue.current = serialized;
        }
        onCellBlur(rowID, 'budget', serialized);
    };

    return (
        <td
            className={`${styles['pt-cell']} ${styles['pt-budget-cell']}`}
            style={activeCollab ? { outline: `2px solid ${activeCollab.color}`, outlineOffset: '-2px' } : {}}
        >
            {activeCollab && (
                <div className={styles['pt-collab-nametag']} style={{ backgroundColor: activeCollab.color }}>
                    {activeCollab.fullName}
                </div>
            )}
            <div className={styles['pt-budget-label']}>MOOE</div>
            {yearLabels.map(yr => (
                <div key={yr} className={styles['pt-budget-row']}>
                    <span className={styles['pt-budget-year']}>{yr}:</span>
                    <input
                        id={`${cellId}-${yr}`}
                        type="text"
                        className={styles['pt-budget-input']}
                        value={yearValues[yr] ?? ''}
                        disabled={readOnly || !!activeCollab}
                        onFocus={() => {
                            isEditing.current = true;
                            handleFocus(`${cellId}-${yr}`);
                        }}
                        onBlur={() => handleYearBlur(yr)}
                        onChange={(e) => handleYearChange(yr, e.target.value)}
                    />
                </div>
            ))}
        </td>
    );
});

// ─── Main Cell ───────────────────────────────────────────────────────────────
const ProjectTableCell: React.FC<ProjectTableCellProps> = React.memo(({
    rowID,
    field,
    value,
    readOnly,
    activeCollab,
    projType,
    yearLabels = [],
    onCellChange,
    onCellBlur,
    handleFocus,
    handleBlur
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [localValue, setLocalValue] = useState(value ?? '');
    const isFocused = useRef(false);
    const lastPushedValue = useRef(value ?? '');
    const cellId = `cell-${rowID}-${field}`;

    // Sync prop changes (remote) to local state IF NOT focused OR if state differs significantly
    useEffect(() => {
        if (!isFocused.current) {
            setLocalValue(value ?? '');
            lastPushedValue.current = value ?? '';
        }
    }, [value]);

    const autoResize = useCallback(() => {
        const el = textareaRef.current;
        if (el) {
            el.style.height = 'auto';
            el.style.height = el.scrollHeight + 'px';
        }
    }, []);

    // Initial and focus resize
    useEffect(() => {
        autoResize();
    }, [autoResize, localValue]);

    // Handle Change with Debounce
    const debouncedSync = useRef<NodeJS.Timeout | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setLocalValue(newValue);

        // Performance: Skip autoResize on every char if text is short and likely fits
        // (Removing immediate autoResize is the key to sub-200ms INP)
        if (debouncedSync.current) clearTimeout(debouncedSync.current);
        
        debouncedSync.current = setTimeout(() => {
            // Only sync if content actually changed from what we last sent
            if (newValue !== lastPushedValue.current) {
                lastPushedValue.current = newValue;
                onCellChange(rowID, field, newValue);
            }
        }, 500); 
    };

    const handleBlurInternal = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        isFocused.current = false;
        if (debouncedSync.current) clearTimeout(debouncedSync.current);

        handleBlur();
        const finalValue = e.target.value;
        
        // Immediate sync on blur to ensure persistence
        if (finalValue !== lastPushedValue.current) {
            onCellChange(rowID, field, finalValue);
            lastPushedValue.current = finalValue;
        }
        onCellBlur(rowID, field, finalValue);
        autoResize();
    };

    const handleFocusInternal = () => {
        isFocused.current = true;
        handleFocus(cellId);
        autoResize();
    };

    // ── Special: row index ─────────────────────────────────────────────────
    if (field === 'sheetRowIndex') {
        return (
            <td className={`${styles['pt-cell']} ${styles['pt-cell-secondary']}`}>
                <div className={styles['pt-index-label']}>{value ?? ''}</div>
            </td>
        );
    }

    // ── Special: CBYDP structured budget cell ────────────────────────────
    if (projType === 'CBYDP' && field === 'budget' && yearLabels.length > 0) {
        return (
            <CbydpBudgetCell
                rowID={rowID}
                value={value}
                readOnly={readOnly}
                yearLabels={yearLabels}
                activeCollab={activeCollab}
                onCellChange={onCellChange}
                onCellBlur={onCellBlur}
                handleFocus={handleFocus}
                handleBlur={handleBlur}
            />
        );
    }

    // ── Default: standard textarea cell ─────────────────────────────────
    return (
        <td
            className={styles['pt-cell']}
            style={activeCollab ? { outline: `2px solid ${activeCollab.color}`, outlineOffset: '-2px' } : {}}
        >
            {activeCollab && (
                <div className={styles['pt-collab-nametag']} style={{ backgroundColor: activeCollab.color }}>
                    {activeCollab.fullName}
                </div>
            )}
            <div className={styles['pt-cell-content-wrapper']}>
                <textarea
                    id={cellId}
                    ref={textareaRef}
                    className={styles['pt-cell-input']}
                    value={localValue}
                    disabled={readOnly || !!activeCollab}
                    onFocus={handleFocusInternal}
                    onBlur={handleBlurInternal}
                    onKeyDown={(e) => {
                        // Enter handles blur, satisfying immediate sync
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            (e.target as HTMLTextAreaElement).blur();
                        }
                    }}
                    onChange={handleChange}
                />
            </div>
        </td>
    );
});

export default ProjectTableCell;
