import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CircularProgress from '@mui/material/CircularProgress';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import axiosInstance from '../../../backend connection/axiosConfig';
import styles from './InitializeCycleModal.module.css';

interface InitializeCycleModalProps {
    open: boolean;
    onClose: () => void;
}

const InitializeCycleModal: React.FC<InitializeCycleModalProps> = ({ open, onClose }) => {
    const navigate = useNavigate();

    const [termStartYear, setTermStartYear] = useState('');
    const [termEndYear, setTermEndYear] = useState('');
    const [targetFiscalYear, setTargetFiscalYear] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    const tStart = parseInt(termStartYear, 10);
    const tEnd = parseInt(termEndYear, 10);
    const tFiscal = parseInt(targetFiscalYear, 10);

    // Live client-side validation
    const validationErrors = useMemo(() => {
        const errors: string[] = [];
        if (termStartYear.length === 4 && termEndYear.length === 4 && !isNaN(tStart) && !isNaN(tEnd)) {
            if (tEnd - tStart !== 2) {
                errors.push(`Term must span exactly 3 years (end − start = 2). Current difference: ${tEnd - tStart}.`);
            }
        }
        if (targetFiscalYear.length === 4 && !isNaN(tFiscal) && !isNaN(tStart) && !isNaN(tEnd)) {
            if (tFiscal < tStart || tFiscal > tEnd) {
                errors.push(`Fiscal year must fall within the term range (${tStart}–${tEnd}).`);
            }
        }
        return errors;
    }, [termStartYear, termEndYear, targetFiscalYear, tStart, tEnd, tFiscal]);

    const isFormComplete =
        termStartYear.length === 4 && termEndYear.length === 4 && targetFiscalYear.length === 4 &&
        !isNaN(tStart) && !isNaN(tEnd) && !isNaN(tFiscal) &&
        validationErrors.length === 0;

    const handleClose = () => {
        if (isSubmitting) return;
        setTermStartYear('');
        setTermEndYear('');
        setTargetFiscalYear('');
        setApiError(null);
        onClose();
    };

    const handleSubmit = async () => {
        if (!isFormComplete || isSubmitting) return;
        setIsSubmitting(true);
        setApiError(null);
        try {
            const response = await axiosInstance.post('/api/project-tracker/initialize-cycle', {
                termStartYear: tStart,
                termEndYear: tEnd,
                targetFiscalYear: tFiscal,
            });
            if (response.data.success) {
                handleClose();
                navigate('/projects', { state: { cycle: response.data.cycle } });
            }
        } catch (err: any) {
            const status = err?.response?.status;
            const serverMessage = err?.response?.data?.message;
            if (status === 409) {
                setApiError(serverMessage || `A cycle for FY ${tFiscal} already exists for this barangay.`);
            } else if (status === 403) {
                setApiError('Only the SK Chairperson can initialize a project cycle.');
            } else if (status === 400) {
                setApiError(serverMessage || 'Invalid input. Please review the year values.');
            } else {
                setApiError('Initialization failed. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleYearInput = (setter: React.Dispatch<React.SetStateAction<string>>) =>
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setter(e.target.value.replace(/\D/g, '').slice(0, 4));
            setApiError(null);
        };

    if (!open) return null;

    return (
        <div className={styles.modalOverlay} onClick={handleClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon}>
                            <RocketLaunchIcon style={{ fontSize: 18, color: '#1565c0' }} />
                        </div>
                        <div>
                            <h2 className={styles.title}>Initialize Annual Project Cycle</h2>
                            <p className={styles.subtitle}>Sangguniang Kabataan — Annual Investment Plan</p>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={handleClose} aria-label="Close" disabled={isSubmitting}>
                        ✕
                    </button>
                </div>

                <div className={styles.divider} />

                {/* Info notice */}
                <div className={styles.infoBox}>
                    <InfoOutlinedIcon style={{ fontSize: 16, color: '#1565c0', flexShrink: 0, marginTop: 1 }} />
                    <p className={styles.infoText}>
                        This initializes <strong>Checkpoint 1: Youth Profiling</strong> for a new fiscal year cycle.
                        The SK term must span exactly <strong>3 years</strong>, and the target fiscal year
                        must fall within that range.
                    </p>
                </div>

                {/* API Error */}
                {apiError && (
                    <div className={styles.errorBox}>
                        <span>⚠ {apiError}</span>
                        <button className={styles.errorDismiss} onClick={() => setApiError(null)}>✕</button>
                    </div>
                )}

                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                    <div className={styles.warnBox}>
                        {validationErrors.map((err, i) => (
                            <p key={i} className={styles.warnText}>⚠ {err}</p>
                        ))}
                    </div>
                )}

                {/* Form Fields */}
                <div className={styles.fieldSection}>
                    <p className={styles.sectionLabel}>SK TERM DURATION</p>
                    <div className={styles.yearRow}>
                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel} htmlFor="init-cycle-term-start">
                                <CalendarTodayIcon style={{ fontSize: 12 }} /> Term Start Year
                            </label>
                            <input
                                id="init-cycle-term-start"
                                type="text"
                                inputMode="numeric"
                                className={styles.yearInput}
                                placeholder="e.g. 2024"
                                value={termStartYear}
                                onChange={handleYearInput(setTermStartYear)}
                                maxLength={4}
                                disabled={isSubmitting}
                            />
                            <span className={styles.fieldHint}>Year the SK term began</span>
                        </div>

                        <div className={styles.yearSeparator}>–</div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.fieldLabel} htmlFor="init-cycle-term-end">
                                <CalendarTodayIcon style={{ fontSize: 12 }} /> Term End Year
                            </label>
                            <input
                                id="init-cycle-term-end"
                                type="text"
                                inputMode="numeric"
                                className={styles.yearInput}
                                placeholder="e.g. 2026"
                                value={termEndYear}
                                onChange={handleYearInput(setTermEndYear)}
                                maxLength={4}
                                disabled={isSubmitting}
                            />
                            <span className={styles.fieldHint}>Must be start + 2 years</span>
                        </div>
                    </div>

                    <div className={styles.fieldGroup} style={{ marginTop: 16 }}>
                        <p className={styles.sectionLabel}>TARGET FISCAL YEAR</p>
                        <label className={styles.fieldLabel} htmlFor="init-cycle-fiscal-year">
                            <CalendarTodayIcon style={{ fontSize: 12 }} /> Fiscal Year
                        </label>
                        <input
                            id="init-cycle-fiscal-year"
                            type="text"
                            inputMode="numeric"
                            className={`${styles.yearInput} ${styles.yearInputFull}`}
                            placeholder="e.g. 2025"
                            value={targetFiscalYear}
                            onChange={handleYearInput(setTargetFiscalYear)}
                            maxLength={4}
                            disabled={isSubmitting}
                        />
                        <span className={styles.fieldHint}>Must fall within the term range above</span>
                    </div>
                </div>

                {/* Live Preview */}
                {isFormComplete && (
                    <div className={styles.previewBox}>
                        <span className={styles.previewLabel}>CYCLE PREVIEW</span>
                        <div className={styles.previewContent}>
                            <span>SK Term: <strong>{tStart}–{tEnd}</strong></span>
                            <span className={styles.previewDot}>•</span>
                            <span>Fiscal Year: <strong>{tFiscal}</strong></span>
                            <span className={styles.previewDot}>•</span>
                            <span>Status: <strong>Checkpoint 1</strong></span>
                        </div>
                    </div>
                )}

                <div className={styles.divider} />

                {/* Footer */}
                <div className={styles.footer}>
                    <button className={styles.btnCancel} onClick={handleClose} disabled={isSubmitting}>
                        Cancel
                    </button>
                    <button
                        id="init-cycle-submit-btn"
                        className={styles.btnPrimary}
                        onClick={handleSubmit}
                        disabled={!isFormComplete || isSubmitting}
                    >
                        {isSubmitting
                            ? <><CircularProgress size={14} color="inherit" style={{ marginRight: 6 }} />Initializing...</>
                            : <><RocketLaunchIcon style={{ fontSize: 15, marginRight: 6 }} />Initialize Cycle</>
                        }
                    </button>
                </div>

            </div>
        </div>
    );
};

export default InitializeCycleModal;
