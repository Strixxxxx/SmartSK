import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography } from '@mui/material';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../backend connection/axiosConfig';

import AppSettingsAltIcon from '@mui/icons-material/AppSettingsAlt';
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import VerifiedIcon from '@mui/icons-material/Verified';
import DomainIcon from '@mui/icons-material/Domain';
import LocalMallIcon from '@mui/icons-material/LocalMall';
import EngineeringIcon from '@mui/icons-material/Engineering';
import FlagIcon from '@mui/icons-material/Flag';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EastIcon from '@mui/icons-material/East';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import GroupsIcon from '@mui/icons-material/Groups';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import GavelIcon from '@mui/icons-material/Gavel';

// Newly added icon components for rich tracker screens
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PeopleIcon from '@mui/icons-material/People';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ThumbsUpDownIcon from '@mui/icons-material/ThumbsUpDown';
import DoneAllIcon from '@mui/icons-material/DoneAll';

import SupportingDocumentsModal from './SupportingDocumentsModal';
import CheckpointModal from './CheckpointModal';
import Checkpoint2to3 from './checkpoint2to3';
import Checkpoint3to4 from './checkpoint3to4';
import RescheduleModal from './RescheduleModal';
import CheckpointValidationModal from './CheckpointValidationModal';
import './ProjectTrackerList.css';

interface ProjectBatch {
    batchID: number;
    cycleID: number;
    projName: string;
    projType: 'ABYIP' | 'CBYDP';
    targetYear: string;
    StatusName: string;
    currentStatusID: number;
    budget?: number;
    updatedAt?: string;
    createdAt?: string;
}

interface ProjectCycle {
    cycleID: number;
    termID: number;
    termStartYear: number;
    termEndYear: number;
    targetFiscalYear: string;
    currentStatusID: number;
    updatedAt?: string;
    createdAt?: string;
    batches: ProjectBatch[];
}

const STATUS_STEPS: { label: string; icon: React.ReactNode }[] = [
    { label: 'Youth Profiling', icon: <AppSettingsAltIcon /> },
    { label: 'CBYDP Drafting', icon: <EditCalendarIcon /> },
    { label: 'CBYDP SK Session', icon: <GroupsIcon /> },
    { label: 'KK General Assembly', icon: <PeopleIcon /> },
    { label: 'ABYIP Budget Draft', icon: <AccountBalanceWalletIcon /> },
    { label: 'SK Resolution', icon: <AssignmentTurnedInIcon /> },
    { label: "Barangay Captain's Approval", icon: <AccountBalanceIcon /> },
    { label: 'QCYDO Review', icon: <VerifiedIcon /> },
    { label: 'QC SK Federation Review', icon: <DomainIcon /> },
    { label: 'City Budget Review', icon: <AccountBalanceWalletIcon /> },
    { label: 'City Council Budget Hearing', icon: <GavelIcon /> },
    { label: 'Procurement Phase', icon: <LocalMallIcon /> },
    { label: 'Project Execution', icon: <EngineeringIcon /> },
    { label: 'Project Closure', icon: <FlagIcon /> },
];

const getStatusAge = (statusID: number, updatedAt?: string) => {
    if (!updatedAt) return { days: 0, level: 'ok' as const };
    const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
    
    // Status 3 (SK Session) and 4 (Brgy. Captain's Approval) follow the 7/10 rule
    if (statusID === 3 || statusID === 4) {
        const level = days >= 10 ? 'urgent' : days >= 7 ? 'warn' : ('ok' as const);
        return { days, level };
    }
    
    // Standard 15/30 rule for other statuses
    const level = days >= 30 ? 'urgent' : days >= 15 ? 'warn' : ('ok' as const);
    return { days, level };
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

const ProjectTrackerList: React.FC = () => {
    const [cycles, setCycles] = useState<ProjectCycle[]>([]);
    const [loading, setLoading] = useState(true);
    const [docModalOpen, setDocModalOpen] = useState(false);
    const [selectedBatchForDocs, setSelectedBatchForDocs] = useState<ProjectBatch | null>(null);
    const [openScheduleModalBatchID, setOpenScheduleModalBatchID] = useState<number | null>(null);
    const [openRescheduleModalBatchID, setOpenRescheduleModalBatchID] = useState<number | null>(null);
    const [openAttendanceModalBatchID, setOpenAttendanceModalBatchID] = useState<number | null>(null);
    const [validationModal, setValidationModal] = useState<{ open: boolean; checkpointID: number; batchID: number } | null>(null);
    const [checklistModalBatchID, setChecklistModalBatchID] = useState<number | null>(null);
    const [selectedChecklistCategory, setSelectedChecklistCategory] = useState<string>('All');
    
    // Budget Validation Modal states
    const [budgetValidationModal, setBudgetValidationModal] = useState<{ open: boolean; batchID: number; budget: number } | null>(null);
    const [budgetValidationRemarks, setBudgetValidationRemarks] = useState('');
    const [budgetValidationDocUrl, setBudgetValidationDocUrl] = useState<string | null>(null);
    const [budgetValidationDocType, setBudgetValidationDocType] = useState<'pdf' | 'image' | null>(null);
    const [isLoadingBudgetDoc, setIsLoadingBudgetDoc] = useState(false);
    const navigate = useNavigate();
    const { user } = useAuth();

    // Context check for BCPT (Barangay Captain) & SKC (SK Chairperson)
    const isSkc =
        user?.role === 'SKC' ||
        user?.position?.toLowerCase().includes('chairperson') ||
        user?.position?.toUpperCase() === 'SKC';

    const isBcpt =
        user?.role === 'BCPT' ||
        user?.position?.toLowerCase().includes('captain') ||
        user?.position?.toUpperCase() === 'BCPT';

    const hasTrackerControl = isSkc; // SKC handles scheduling, attendance, and PPA tracking
    const hasDocsControl = isSkc || user?.permissions?.docsControl === true;

    // Local states for checkpoint detail rendering
    const [details, setDetails] = useState<Record<number, any>>({});
    const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [inputs] = useState<Record<string, any>>({});



    const fetchBatches = useCallback(async () => {
        try {
            const res = await axios.get('/api/project-tracker/cycles');
            if (res.data.success) setCycles(res.data.data);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, []);

    const refreshBatchDetails = async (batchID: number) => {
        try {
            const res = await axios.get(`/api/project-tracker/status/${batchID}`);
            if (res.data.success) {
                setDetails(prev => ({ ...prev, [batchID]: res.data.data }));
            }
        } catch (err) {
            console.error('Failed to refresh details for batch', batchID, err);
        }
    };

    useEffect(() => {
        fetchBatches();

        // Background poll the batch list every 5 seconds with strict optimization to prevent redundant state updates
        const pollInterval = setInterval(() => {
            axios.get('/api/project-tracker/cycles')
                .then(res => {
                    if (res.data.success) {
                        setCycles(prev => {
                            const isDifferent = prev.length !== res.data.data.length ||
                                prev.some((c, i) => 
                                    c.cycleID !== res.data.data[i].cycleID || 
                                    c.currentStatusID !== res.data.data[i].currentStatusID ||
                                    c.updatedAt !== res.data.data[i].updatedAt
                                );
                            return isDifferent ? res.data.data : prev;
                        });
                    }
                })
                .catch(() => { /* silent background error */ });
        }, 5000);

        return () => clearInterval(pollInterval);
    }, [fetchBatches]);

    // Derived active cycle IDs representing active statuses
    const activeCycleIdsStr = JSON.stringify(cycles.filter(c => c.currentStatusID <= 14).map(c => c.cycleID));

    // Fetch status details for each active cycle's default batch and setup real-time background polling
    useEffect(() => {
        const fetchAllDetails = async () => {
            const active = cycles.filter(c => c.currentStatusID <= 14);
            for (const c of active) {
                const primaryBatchID = c.batches?.find(b => b.projType === 'CBYDP')?.batchID || c.batches?.[0]?.batchID;
                const abyipBatchID = c.batches?.find(b => b.projType === 'ABYIP')?.batchID;
                if (primaryBatchID) await refreshBatchDetails(primaryBatchID);
                if (abyipBatchID && abyipBatchID !== primaryBatchID) await refreshBatchDetails(abyipBatchID);
            }
        };
        if (cycles.length > 0) {
            fetchAllDetails();
        }

        // Setup background poll interval for active details to reflect attendees and comment updates
        const pollInterval = setInterval(() => {
            const active = cycles.filter(c => c.currentStatusID <= 14);
            active.forEach(c => {
                const primaryBatchID = c.batches?.find(b => b.projType === 'CBYDP')?.batchID || c.batches?.[0]?.batchID;
                const abyipBatchID = c.batches?.find(b => b.projType === 'ABYIP')?.batchID;
                if (primaryBatchID) refreshBatchDetails(primaryBatchID);
                if (abyipBatchID && abyipBatchID !== primaryBatchID) refreshBatchDetails(abyipBatchID);
            });
        }, 5000);

        return () => clearInterval(pollInterval);
    }, [activeCycleIdsStr]);

    const handleAdvance = async (e: React.MouseEvent, batch: any) => {
        e.stopPropagation();
        const nextStatusID = batch.currentStatusID + 1;
        const nextStep = STATUS_STEPS[nextStatusID - 1];
        const isAIWarning = nextStatusID === 13 && batch.projType === 'ABYIP';

        const msg = isAIWarning
            ? `Advance to "${nextStep.label}"?\n\nIMPORTANT: This ABYIP project will be locked for editing and AI Historical Sync will be triggered.`
            : `Advance project to Step ${nextStatusID}: "${nextStep.label}"?`;

        if (!window.confirm(msg)) return;

        try {
            await axios.post('/api/project-batch/update-status', {
                batchID: batch.batchID,
                statusID: nextStatusID,
            });
            setCycles(prev =>
                prev.map(c =>
                    c.cycleID === batch.cycleID
                        ? { ...c, currentStatusID: nextStatusID, updatedAt: new Date().toISOString() }
                        : c
                )
            );
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to advance milestone.');
        }
    };

    const handleOpenDocs = (e: React.MouseEvent, batch: any) => {
        e.stopPropagation();

        let targetBatch = batch;
        if (batch.projType === 'Cycle' && batch.currentStatusID >= 5) {
            const cycle = activeCycles.find(c => c.cycleID === batch.cycleID);
            const abyipBatch = cycle?.batches?.find(b => b.projType === 'ABYIP');
            if (abyipBatch) {
                targetBatch = {
                    ...abyipBatch,
                    currentStatusID: batch.currentStatusID,
                    cycleID: batch.cycleID,
                    targetYear: batch.targetYear,
                    projName: batch.projName
                };
            }
        }

        setSelectedBatchForDocs(targetBatch);
        setDocModalOpen(true);
    };

    const handleOpenWorkspace = async (batch: any) => {
        if (batch.projType === 'CBYDP' && batch.currentStatusID >= 2) {
            try {
                const res = await axios.get(`/api/project-documents/${batch.batchID}/check-lydp`);
                if (res.data.success && !res.data.hasLYDP) {
                    alert('Please upload the Local Youth Development Plan (LYDP) in Supporting Documents before opening the project.');
                    return;
                }
            } catch (err) {
                console.error('Failed to check LYDP:', err);
            }
        }
        navigate(`/projects/${batch.batchID}`);
    };

    // --- Action Handlers for Custom Checkpoint Submissions ---

    const handleValidateBudget = async (batchID: number, action: 'approve' | 'reject', remarks?: string) => {
        setSubmitting(prev => ({ ...prev, [`${batchID}_budget`]: true }));
        try {
            const res = await axios.post('/api/project-tracker/validate-budget', {
                batchID,
                action,
                remarks
            });
            if (res.data.success) {
                alert(res.data.message || `Budget ${action}d successfully.`);
                setBudgetValidationModal(null);
                await fetchBatches();
                await refreshBatchDetails(batchID);
            }
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to process budget validation.');
        } finally {
            setSubmitting(prev => ({ ...prev, [`${batchID}_budget`]: false }));
        }
    };

    const handleOpenBudgetValidation = async (batch: any) => {
        const budgetValue = batch.budget || details[batch.batchID]?.batch?.budget;
        if (!budgetValue || budgetValue <= 0) {
            alert("The SK Chairperson hasn't extracted and inputted the budget yet.");
            return;
        }

        setBudgetValidationModal({ open: true, batchID: batch.batchID, budget: budgetValue });
        setBudgetValidationRemarks('');
        setIsLoadingBudgetDoc(true);
        setBudgetValidationDocUrl(null);
        setBudgetValidationDocType(null);

        try {
            const res = await axios.get(`/api/project-documents/${batch.batchID}`);
            if (res.data.success && res.data.data?.categories?.EstIncomeCert?.length > 0) {
                const doc = res.data.data.categories.EstIncomeCert[0]; // the latest one
                const docName = doc.name || doc.fileName || '';
                const fileType = docName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
                setBudgetValidationDocType(fileType);
                
                // Fetch SAS URL for the document preview
                try {
                    const sasRes = await axios.get(`/api/project-documents/${batch.batchID}/download`, {
                        params: { documentPath: doc.path }
                    });
                    if (sasRes.data.success && sasRes.data.url) {
                        setBudgetValidationDocUrl(sasRes.data.url);
                    } else {
                        setBudgetValidationDocUrl(null);
                    }
                } catch (sasErr) {
                    console.error('Failed to generate preview URL', sasErr);
                    setBudgetValidationDocUrl(null);
                }
            } else {
                alert('No Certificate of Estimated Income document found.');
            }
        } catch (err) {
            console.error('Failed to fetch document for budget validation', err);
            alert('Failed to load document preview.');
        } finally {
            setIsLoadingBudgetDoc(false);
        }
    };


    const handleScheduleMeeting = async (batchID: number, selectedMeetingDate?: string) => {
        const mDate = selectedMeetingDate || inputs[`${batchID}_meetingDate`];
        if (!mDate) {
            alert('Please select a meeting date and time.');
            return;
        }

        setSubmitting(prev => ({ ...prev, [`${batchID}_schedule`]: true }));
        try {
            const res = await axios.post('/api/project-tracker/schedule-meeting', {
                batchID,
                meetingDate: mDate
            });
            if (res.data.success) {
                alert(res.data.message || 'Meeting scheduled successfully!');
                setOpenScheduleModalBatchID(null);
                await fetchBatches();
                await refreshBatchDetails(batchID);
            }
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to schedule meeting.');
            throw err;
        } finally {
            setSubmitting(prev => ({ ...prev, [`${batchID}_schedule`]: false }));
        }
    };

    const handleRescheduleMeeting = async (batchID: number, meetingDate: string, reason: string) => {
        try {
            await axios.post('/api/project-tracker/reschedule-meeting', { batchID, meetingDate, reason });
            alert('Meeting rescheduled successfully!');
            setOpenRescheduleModalBatchID(null);
            await fetchBatches();
            await refreshBatchDetails(batchID);
        } catch (error: any) {
            console.error('Error rescheduling meeting:', error);
            alert(error.response?.data?.message || 'Failed to reschedule meeting');
        }
    };


    const handleOverrideFinalization = async (batchID: number) => {
        if (!window.confirm("Are you sure you want to bypass the SK Session checkpoint and manually proceed to Brgy. Captain's Approval?")) return;

        setSubmitting(prev => ({ ...prev, [`${batchID}_override`]: true }));
        try {
            const res = await axios.post('/api/project-tracker/override-finalization', { batchID });
            if (res.data.success) {
                alert('Bypass successful! The project plan has proceeded to Checkpoint 4.');
                await fetchBatches();
                await refreshBatchDetails(batchID);
            }
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to override finalization.');
        } finally {
            setSubmitting(prev => ({ ...prev, [`${batchID}_override`]: false }));
        }
    };


    const handleTogglePpaExecution = async (batchID: number, rowID: number, currentVal: boolean) => {
        try {
            const newVal = !currentVal;
            // Optimistic update
            setDetails(prev => {
                const bDetail = prev[batchID];
                if (!bDetail) return prev;
                return {
                    ...prev,
                    [batchID]: {
                        ...bDetail,
                        ppas: bDetail.ppas.map((p: any) => p.rowID === rowID ? { ...p, isExecuted: newVal } : p)
                    }
                };
            });

            await axios.post('/api/project-tracker/update-ppa-execution', {
                batchID,
                rowID,
                isExecuted: newVal
            });
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to update PPA execution.');
            await refreshBatchDetails(batchID);
        }
    };

    const handleValidateClosure = async (batchID: number) => {
        if (!window.confirm('Are you sure you want to validate closure for this project plan? This will transition it to Checkpoint 12: Project Closure & Evaluation.')) return;

        setSubmitting(prev => ({ ...prev, [`${batchID}_closure`]: true }));
        try {
            const res = await axios.post('/api/project-tracker/validate-closure', { batchID });
            if (res.data.success) {
                alert('Project closure validated successfully!');
                await fetchBatches();
                await refreshBatchDetails(batchID);
            }
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to validate project closure.');
        } finally {
            setSubmitting(prev => ({ ...prev, [`${batchID}_closure`]: false }));
        }
    };

    const activeCycles = cycles.filter(c => c.currentStatusID <= 14);

    if (loading) return <div className="ptl-loading">Loading projects...</div>;

    if (activeCycles.length === 0) return (
        <div className="ptl-wrapper">
            <h3 className="ptl-title">Active Project Tracking</h3>
            <div className="ptl-empty">
                <CheckCircleOutlineIcon sx={{ color: '#388e3c', fontSize: 36 }} />
                <p>All projects are finalized or no active projects found.</p>
            </div>
        </div>
    );

    return (
        <div className="ptl-wrapper">
            <h3 className="ptl-title">Active Project Tracking</h3>
            <div className="ptl-list">
                {activeCycles.map(cycle => {
                    const cbydpBatch = cycle.batches?.find(b => b.projType === 'CBYDP') || cycle.batches?.[0];
                    const primaryBatchID = cbydpBatch?.batchID || cycle.cycleID;
                    const batch = {
                        ...cbydpBatch,
                        currentStatusID: cycle.currentStatusID,
                        cycleID: cycle.cycleID,
                        batchID: primaryBatchID,
                        targetYear: cycle.targetFiscalYear,
                        StatusName: STATUS_STEPS[cycle.currentStatusID - 1]?.label || 'Unknown',
                        createdAt: cycle.createdAt || cbydpBatch?.createdAt,
                        updatedAt: cycle.updatedAt || cbydpBatch?.updatedAt,
                        projType: 'Cycle',
                        projName: `Project Cycle - ${cycle.targetFiscalYear}`
                    } as any;

                    const { days, level } = getStatusAge(batch.currentStatusID, batch.updatedAt);
                    const isAIStep = batch.currentStatusID === 13 && batch.projType === 'ABYIP';
                    
                    const isRegulatoryStep = batch.currentStatusID === 3 || batch.currentStatusID === 4;
                    const isNearOct16 = new Date().getMonth() === 9 && new Date().getDate() <= 16 && batch.projType === 'ABYIP' && batch.currentStatusID < 5;

                    const detail = details[batch.batchID];
                    const abyipBatch = cycle.batches?.find(b => b.projType === 'ABYIP');
                    const abyipBudget = abyipBatch?.budget || 0;

                    return (
                        <div
                            key={batch.batchID}
                            className={`ptl-card ptl-card--${level}${isAIStep ? ' ptl-card--ai' : ''}`}
                        >
                            {/* ── Card Header ───────────────────────────────── */}
                            <div className="ptl-card__header">
                                <div className="ptl-cycle-title-row">
                                    <h3 className="ptl-cycle-title">{batch.projName}</h3>
                                    <span className="ptl-cycle-badge">Cycle #{batch.cycleID}</span>
                                    {level === 'urgent' && <ErrorOutlineIcon className="ptl-level-icon" sx={{ color: '#c62828' }} />}
                                    {level === 'warn' && <WarningAmberIcon className="ptl-level-icon" sx={{ color: '#e65100' }} />}
                                </div>
                                <button
                                    className="ptl-open-btn"
                                    onClick={() => handleOpenWorkspace(batch)}
                                    title="Open in workspace"
                                >
                                    Open <EastIcon sx={{ fontSize: 14, ml: 0.5 }} />
                                </button>
                            </div>

                            {/* ── Meta Header ───────────────────────────────── */}
                            <div className="ptl-meta-row">
                                <span className="ptl-meta-item">
                                    Step {batch.currentStatusID} of {STATUS_STEPS.length} — <strong>{batch.StatusName}</strong>
                                </span>
                                <span className="ptl-meta-dot">•</span>
                                <span className="ptl-meta-item">
                                    Created {formatDate(batch.createdAt)}
                                </span>
                                <span className="ptl-meta-dot">•</span>
                                <span className={`ptl-meta-item ptl-age--${level}`}>
                                    {days} day{days !== 1 ? 's' : ''} at this status
                                </span>
                            </div>

                            {/* ── Horizontal Milestone Stepper ──────────────── */}
                            <div className="ptl-stepper">
                                {STATUS_STEPS.map((step, index) => {
                                    const stepID = index + 1;
                                    const isCompleted = stepID < batch.currentStatusID;
                                    const isCurrent = stepID === batch.currentStatusID;
                                    const statusClass = isCompleted ? 'completed' : isCurrent ? 'current' : 'pending';

                                    return (
                                        <React.Fragment key={stepID}>
                                            <div className={`ptl-step ptl-step--${statusClass}`}>
                                                <div className="ptl-step__icon">
                                                    {step.icon}
                                                </div>
                                                <span className="ptl-step__label">{step.label}</span>
                                            </div>
                                            {index < STATUS_STEPS.length - 1 && (
                                                <div className={`ptl-step__connector ${isCompleted ? 'ptl-step__connector--filled' : ''}`} />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>

                            {/* ── Old Status & Timeline Removed ──────────────── */}

                            {/* ── AI Notice ─────────────────────────────────── */}
                            {isAIStep && (
                                <div className="ptl-ai-notice">
                                    <PrecisionManufacturingIcon sx={{ fontSize: 14 }} />
                                    <span>AI Historical Sync has been triggered for this plan.</span>
                                </div>
                            )}

                            {/* ── Deadline Warnings ─────────────────────────── */}
                            {isNearOct16 && (
                                <p className="ptl-warn-text ptl-warn-text--urgent">
                                    📅 FISCAL DEADLINE: October 16 is approaching. Budget submission required per JMC 2019.
                                </p>
                            )}
                            {level === 'urgent' && (
                                <p className="ptl-warn-text ptl-warn-text--urgent">
                                    ⚠️ {isRegulatoryStep ? 'LEGAL BREACH: Over 10 days in review phase (JMC 2019).' : 'URGENT: Over 30 days stalled. Legal compliance at risk.'}
                                </p>
                            )}
                            {level === 'warn' && (
                                <p className="ptl-warn-text ptl-warn-text--warn">
                                    📋 {isRegulatoryStep ? 'COMPLIANCE WARNING: Approaching 10-day legal limit (7 days elapsed).' : 'Reminder: Over 15 days in this status. Please review.'}
                                </p>
                            )}

                            {/* ── Interactive Detail Panel ──────────────────── */}
                            {detail && (
                                <div className="ptl-detail-panel">
                                    {/* --- Checkpoint 5 Panel: Validation & Schedule Meeting --- */}
                                    {batch.currentStatusID === 5 && detail?.hasABYIPDocs === true && (
                                        <div className="ptl-detail-section">
                                            {isBcpt ? (
                                                <p className="ptl-info-text">
                                                    Waiting for the SK Chairperson to schedule the official SK Session meeting.
                                                    <br/><br/>
                                                    <em>Note: The Validate Budget button is available below.</em>
                                                </p>
                                            ) : (
                                                <>
                                                    <p className="ptl-detail-title">
                                                        <CalendarMonthIcon sx={{ fontSize: 16 }} /> SK Resolution Session Schedule
                                                    </p>
                                                    {hasTrackerControl ? (
                                                        <div className="ptl-schedule-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                            <span className="ptl-form-instruction">
                                                                The Barangay Captain must validate the Estimated Annual Budget before you can schedule the SK Resolution Session.
                                                            </span>
                                                            {/* We will leave this disabled or hidden if they haven't validated, but since the status advances to 6 upon validation, if it's 5, it means it's NOT validated yet. */}
                                                            <div>
                                                                <button
                                                                    className="ptl-btn ptl-btn--primary"
                                                                    disabled={true}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '8px',
                                                                        padding: '10px 20px',
                                                                        borderRadius: '8px',
                                                                        backgroundColor: '#9ca3af',
                                                                        color: '#ffffff',
                                                                        fontWeight: 600,
                                                                        border: 'none',
                                                                        cursor: 'not-allowed'
                                                                    }}
                                                                >
                                                                    <CalendarMonthIcon sx={{ fontSize: 18 }} />
                                                                    Waiting for Validation
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="ptl-info-text">
                                                            Waiting for the Barangay Captain to validate the Estimated Annual Budget.
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* --- Checkpoint 2 Panel: Schedule Meeting --- */}
                                    {batch.currentStatusID === 2 && detail?.hasLYDP === true && (
                                        <div className="ptl-detail-section">
                                            <p className="ptl-detail-title">
                                                <CalendarMonthIcon sx={{ fontSize: 16 }} /> Finalization SK Session Schedule
                                            </p>
                                            {hasTrackerControl ? (
                                                <div className="ptl-schedule-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <span className="ptl-form-instruction">
                                                        Click the button below to open the scheduler modal and set the date and time for the official SK Session.
                                                    </span>
                                                    <div>
                                                        <button
                                                            className="ptl-btn ptl-btn--primary"
                                                            onClick={() => setOpenScheduleModalBatchID(batch.batchID)}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                padding: '10px 20px',
                                                                borderRadius: '8px',
                                                                backgroundColor: '#4f46e5',
                                                                color: '#ffffff',
                                                                fontWeight: 600,
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                transition: 'background-color 0.2s ease'
                                                            }}
                                                        >
                                                            <CalendarMonthIcon sx={{ fontSize: 18 }} />
                                                            Schedule a Meeting
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="ptl-info-text">
                                                    Waiting for the SK Chairperson to schedule the official SK Session meeting.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* --- Checkpoint 3 Panel: Attendance Checklist --- */}
                                    {batch.currentStatusID === 3 && (
                                        <div className="ptl-detail-section">
                                            <p className="ptl-detail-title">
                                                <PeopleIcon sx={{ fontSize: 16 }} /> SK Session Attendance Check
                                            </p>
                                            <p className="ptl-form-instruction">
                                                📅 Scheduled: <strong>{formatDateTime(detail.batch?.meetingDate)}</strong>
                                            </p>
                                            
                                            <div className="ptl-attendance-box" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                                                <span className="ptl-checklist-title" style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Session Attendance & Comments Log</span>
                                                
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0' }}>
                                                    <span style={{ fontSize: '13px', color: '#4b5563' }}>Current check-in progress:</span>
                                                    <span className="ptl-badge" style={{ 
                                                        backgroundColor: '#ede9fe', 
                                                        color: '#4f46e5', 
                                                        fontWeight: 700, 
                                                        padding: '4px 10px', 
                                                        borderRadius: '20px', 
                                                        fontSize: '12px' 
                                                    }}>
                                                        {detail.attendees?.filter((a: any) => a.attended).length || 0} / {detail.attendees?.length || 0} Present
                                                    </span>
                                                </div>

                                                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                                    <button
                                                        className="ptl-btn"
                                                        onClick={() => setOpenAttendanceModalBatchID(batch.batchID)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '10px 18px',
                                                            borderRadius: '8px',
                                                            backgroundColor: '#4f46e5',
                                                            color: '#ffffff',
                                                            fontWeight: 600,
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            transition: 'background-color 0.2s ease',
                                                            fontSize: '13px'
                                                        }}
                                                    >
                                                        <PeopleIcon sx={{ fontSize: 18 }} />
                                                        Manage Session Attendance & Comments
                                                    </button>

                                                    {hasTrackerControl && (
                                                        <button
                                                            className="ptl-btn"
                                                            onClick={() => setOpenRescheduleModalBatchID(batch.batchID)}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                padding: '10px 18px',
                                                                borderRadius: '8px',
                                                                backgroundColor: '#f59e0b',
                                                                color: '#ffffff',
                                                                fontWeight: 600,
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                transition: 'background-color 0.2s ease',
                                                                fontSize: '13px'
                                                            }}
                                                        >
                                                            <CalendarMonthIcon sx={{ fontSize: 18 }} />
                                                            Reschedule Meeting
                                                        </button>
                                                    )}

                                                    {isBcpt && (
                                                        <button
                                                            className="ptl-btn ptl-btn--danger"
                                                            onClick={() => handleOverrideFinalization(batch.batchID)}
                                                            disabled={submitting[`${batch.batchID}_override`]}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                padding: '10px 18px',
                                                                borderRadius: '8px',
                                                                backgroundColor: '#ef4444',
                                                                color: '#ffffff',
                                                                fontWeight: 600,
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                transition: 'background-color 0.2s ease',
                                                                fontSize: '13px'
                                                            }}
                                                        >
                                                            {submitting[`${batch.batchID}_override`] ? 'Overriding...' : 'Force Advance (Bypass)'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {isBcpt && (
                                                <div className="ptl-bcpt-override-box" style={{ marginTop: '12px', border: '1px dashed #fca5a5', backgroundColor: '#fef2f2', padding: '12px', borderRadius: '8px' }}>
                                                    <p className="ptl-bcpt-instruction" style={{ margin: 0, fontSize: '12px', color: '#991b1b', lineHeight: '1.5' }}>
                                                        🛡️ <strong>Barangay Captain Admin Action:</strong> If a legislative SK Session cannot meet full attendance, you can manually bypass this step to proceed to approval using the red action button above.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* --- Checkpoint 7 Panel: Brgy. Captain's Approval --- */}
                                    {batch.currentStatusID === 7 && (
                                        <div className="ptl-detail-section">
                                            <p className="ptl-detail-title">
                                                <ThumbsUpDownIcon sx={{ fontSize: 16 }} /> Brgy. Captain's Approval Review
                                            </p>
                                            {isBcpt ? (
                                                <div className="ptl-endorsement-form" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <span className="ptl-form-instruction">
                                                        You are designated as the official reviewer for this project plan. Click the button below to review, approve, or request revisions directly in the workspace.
                                                    </span>
                                                    <div>
                                                        <button
                                                            className="ptl-btn"
                                                            onClick={() => navigate(`/projects/${batch.batchID}?review=true`)}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '8px',
                                                                padding: '10px 20px',
                                                                borderRadius: '8px',
                                                                backgroundColor: '#16a34a',
                                                                color: '#ffffff',
                                                                fontWeight: 600,
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                transition: 'background-color 0.2s ease',
                                                                fontSize: '13px'
                                                            }}
                                                        >
                                                            <ThumbsUpDownIcon sx={{ fontSize: 18 }} />
                                                            Review Project Plan
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="ptl-info-text">
                                                    ⌛ Awaiting Barangay Captain's endorsement review and verdict.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* --- Checkpoints 6, 8, 9, 10, 11, 12 Validation & Proof --- */}
                                    {[6, 8, 9, 10, 11, 12].includes(batch.currentStatusID) && (
                                        <div className="ptl-detail-section" style={{ marginTop: '12px' }}>
                                            <p className="ptl-detail-title">
                                                <VerifiedIcon sx={{ fontSize: 16 }} /> Checkpoint {batch.currentStatusID} Validation & Proof
                                            </p>
                                            <p className="ptl-form-instruction">
                                                The SK Chairperson must upload the required documents in the Supporting Documents for this checkpoint. Once uploaded, the Barangay Captain will review and validate it.
                                            </p>
                                        </div>
                                    )}

                                    {/* --- Checkpoint 13 Panel: Project Execution Checklist --- */}
                                    {batch.currentStatusID === 13 && (
                                        <div className="ptl-detail-section">
                                            <p className="ptl-detail-title">
                                                <FactCheckIcon sx={{ fontSize: 16 }} /> PPA Execution Status Checklist
                                            </p>
                                            <p className="ptl-form-instruction">
                                                Toggle completed PPAs. When all items are executed, the Barangay Captain must validate and sign off on closure.
                                            </p>
                                            
                                            <div style={{ margin: '14px 0' }}>
                                                <button
                                                    className="ptl-btn ptl-btn--primary"
                                                    onClick={() => {
                                                        const targetBatchID = abyipBatch ? abyipBatch.batchID : batch.batchID;
                                                        setChecklistModalBatchID(targetBatchID);
                                                        const targetDetail = details[targetBatchID] || detail;
                                                        const cats = Array.from(new Set((targetDetail.ppas || []).map((p: any) => p.centerOfParticipation).filter(Boolean)));
                                                        setSelectedChecklistCategory(cats.length > 0 ? (cats[0] as string) : '');
                                                    }}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '10px 18px',
                                                        borderRadius: '8px',
                                                        fontWeight: 600,
                                                        fontSize: '13px',
                                                        border: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <FactCheckIcon sx={{ fontSize: 16 }} />
                                                    Open Status Checklist
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Action Rows ────────────────────────────────── */}
                            <div className="ptl-actions-row">
                                {/* ── Standard Advance Button (Hidden for custom states to prevent accidental skips) ── */}
                                {isBcpt && batch.currentStatusID < 14 && ![2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(batch.currentStatusID) && (
                                    <button
                                        className="ptl-advance-btn"
                                        onClick={(e) => handleAdvance(e, batch)}
                                    >
                                        Advance to Step {batch.currentStatusID + 1}: {STATUS_STEPS[batch.currentStatusID]?.label}
                                    </button>
                                )}

                                {/* ── Supporting Document Button ────────────────── */}
                                {(hasDocsControl || isBcpt) && batch.currentStatusID >= 2 && (
                                    <button
                                        className="ptl-docs-btn"
                                        onClick={(e) => handleOpenDocs(e, batch)}
                                    >
                                        <InsertDriveFileIcon sx={{ fontSize: 16 }} />
                                        Supporting Documents
                                    </button>
                                )}

                                {/* ── Validate Checkpoint Button (Checkpoint 6, 8, 9, 10, 11, 12) ── */}
                                {[6, 8, 9, 10, 11, 12].includes(batch.currentStatusID) && isBcpt && (
                                    <button
                                        className="ptl-docs-btn"
                                        style={{ backgroundColor: '#1a73e8', color: '#ffffff', border: '1px solid #1a73e8' }}
                                        onClick={() => setValidationModal({ open: true, batchID: batch.batchID, checkpointID: batch.currentStatusID })}
                                    >
                                        <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
                                        Validate Checkpoint
                                    </button>
                                )}

                                {/* ── Validate Budget Button (Checkpoint 5) ── */}
                                {batch.currentStatusID === 5 && isBcpt && (
                                    <button
                                        className="ptl-docs-btn"
                                        style={{
                                            backgroundColor: abyipBudget > 0 ? '#1a73e8' : '#9ca3af',
                                            color: '#ffffff',
                                            border: 'none',
                                            cursor: abyipBudget > 0 ? 'pointer' : 'not-allowed'
                                        }}
                                        onClick={() => {
                                            if (abyipBudget > 0) {
                                                handleOpenBudgetValidation(abyipBatch || batch);
                                            }
                                        }}
                                        disabled={abyipBudget <= 0}
                                        title={abyipBudget <= 0 ? 'Waiting for the SK Chairperson to extract and input the budget from the Supporting Documents.' : 'Validate the Estimated Annual Budget'}
                                    >
                                        <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />
                                        {abyipBudget <= 0 ? 'Waiting for Budget Input' : 'Validate Budget'}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedBatchForDocs && (
                <SupportingDocumentsModal
                    open={docModalOpen}
                    onClose={() => setDocModalOpen(false)}
                    batchID={selectedBatchForDocs.batchID}
                    projName={selectedBatchForDocs.projName}
                    onStatusChange={() => {
                        fetchBatches();
                        refreshBatchDetails(selectedBatchForDocs.batchID);
                    }}
                />
            )}

            <CheckpointModal
                open={openScheduleModalBatchID !== null}
                onClose={() => setOpenScheduleModalBatchID(null)}
                title="Schedule Finalization SK Session"
            >
                {openScheduleModalBatchID !== null && (
                    <Checkpoint2to3
                        onSubmit={(meetingDate) => handleScheduleMeeting(openScheduleModalBatchID, meetingDate)}
                        onClose={() => setOpenScheduleModalBatchID(null)}
                    />
                )}
            </CheckpointModal>

            <CheckpointModal
                open={openRescheduleModalBatchID !== null}
                onClose={() => setOpenRescheduleModalBatchID(null)}
                title="Reschedule Finalization SK Session"
            >
                {openRescheduleModalBatchID !== null && (
                    <RescheduleModal
                        onSubmit={(meetingDate, reason) => handleRescheduleMeeting(openRescheduleModalBatchID, meetingDate, reason)}
                        onClose={() => setOpenRescheduleModalBatchID(null)}
                    />
                )}
            </CheckpointModal>

            <CheckpointModal
                open={openAttendanceModalBatchID !== null}
                onClose={() => setOpenAttendanceModalBatchID(null)}
                title="SK Session Attendance & Comments Log"
            >
                {openAttendanceModalBatchID !== null && (
                    <Checkpoint3to4
                        batchID={openAttendanceModalBatchID}
                        onClose={() => setOpenAttendanceModalBatchID(null)}
                        onSuccess={() => refreshBatchDetails(openAttendanceModalBatchID)}
                    />
                )}
            </CheckpointModal>

            {validationModal && (
                <CheckpointValidationModal
                    open={validationModal.open}
                    batchID={validationModal.batchID}
                    checkpointID={validationModal.checkpointID}
                    onClose={() => setValidationModal(null)}
                    onSuccess={() => {
                        refreshBatchDetails(validationModal.batchID);
                        fetchBatches();
                    }}
                />
            )}

            {checklistModalBatchID !== null && details[checklistModalBatchID] && (
                <CheckpointModal
                    open={checklistModalBatchID !== null}
                    onClose={() => setChecklistModalBatchID(null)}
                    title={`PPA Execution Checklist - ${cycles.flatMap(c => c.batches || []).find(b => b.batchID === checklistModalBatchID)?.projName}`}
                >
                    <div className="ptl-checklist-modal-container">
                        <div className="ptl-checklist-filter-row">
                            <span className="ptl-checklist-filter-label">Filter by Category:</span>
                            <select
                                className="ptl-checklist-select"
                                value={selectedChecklistCategory}
                                onChange={(e) => setSelectedChecklistCategory(e.target.value)}
                            >
                                {Array.from(
                                    new Set(
                                        (details[checklistModalBatchID]?.ppas || [])
                                            .map((p: any) => p.centerOfParticipation)
                                            .filter(Boolean)
                                    )
                                ).map((cat: any) => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="ptl-checklist-table-wrapper">
                            <table className="ptl-checklist-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '60px', textAlign: 'center' }}>Done</th>
                                        <th>PPA</th>
                                        <th>Period of Implementation</th>
                                        <th style={{ width: '140px' }}>Total Budget</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(details[checklistModalBatchID]?.ppas || [])
                                        .filter((p: any) => p.centerOfParticipation === selectedChecklistCategory)
                                        .map((ppa: any) => (
                                            <tr
                                                key={ppa.rowID}
                                                className={`ptl-checklist-tr ${ppa.isExecuted ? 'ptl-checklist-tr--done' : ''}`}
                                            >
                                                <td className="ptl-checklist-td" style={{ textAlign: 'center' }}>
                                                    <input
                                                        type="checkbox"
                                                        className="ptl-checklist-checkbox"
                                                        checked={ppa.isExecuted === true}
                                                        disabled={!hasTrackerControl}
                                                        onChange={() => handleTogglePpaExecution(checklistModalBatchID, ppa.rowID, ppa.isExecuted)}
                                                    />
                                                </td>
                                                <td className="ptl-checklist-td" style={{ fontWeight: 600 }}>
                                                    {ppa.PPA || ppa.YDC}
                                                </td>
                                                <td className="ptl-checklist-td">
                                                    {ppa.period || 'N/A'}
                                                </td>
                                                <td className="ptl-checklist-td ptl-checklist-price">
                                                    ₱{(ppa.total || ppa.budget || 0).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    {(!details[checklistModalBatchID]?.ppas || details[checklistModalBatchID].ppas.length === 0) && (
                                        <tr>
                                            <td colSpan={4} style={{ textAlign: 'center', padding: '16px' }}>
                                                No PPAs found for this plan.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="ptl-status-footer">
                            <button className="ptl-checklist-btn-close" onClick={() => setChecklistModalBatchID(null)}>
                                Close
                            </button>

                            {isBcpt && (
                                <>
                                    {details[checklistModalBatchID]?.ppas?.every((p: any) => p.isExecuted) ? (
                                        <button
                                            className="ptl-btn ptl-btn--success"
                                            onClick={() => {
                                                handleValidateClosure(checklistModalBatchID);
                                                setChecklistModalBatchID(null);
                                            }}
                                            disabled={submitting[`${checklistModalBatchID}_closure`]}
                                        >
                                            <DoneAllIcon sx={{ fontSize: 18 }} style={{ marginRight: '8px' }} />
                                            {submitting[`${checklistModalBatchID}_closure`] ? 'Validating...' : 'Validate Closure & Finalize Project'}
                                        </button>
                                    ) : (
                                        <div className="ptl-modal-warn" style={{ width: 'auto' }}>
                                            ⚠️ Awaiting completion of all PPAs
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </CheckpointModal>
            )}

            {/* --- Budget Validation Modal --- */}
            {budgetValidationModal?.open && (
                <CheckpointModal
                    title="Validate Estimated Annual Budget"
                    open={budgetValidationModal.open}
                    onClose={() => setBudgetValidationModal(null)}
                >
                    <div className="ptl-modal-inner" style={{ minWidth: '600px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {isLoadingBudgetDoc ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>Loading document preview...</div>
                        ) : budgetValidationDocUrl ? (
                            <div style={{ height: '250px', border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
                                {budgetValidationDocType === 'pdf' ? (
                                    <iframe src={budgetValidationDocUrl} width="100%" height="100%" style={{ border: 'none' }} title="Est Income Cert Preview" />
                                ) : (
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', backgroundColor: '#f5f5f5' }}>
                                        <img src={budgetValidationDocUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="ptl-modal-warn">No document available for preview.</div>
                        )}

                        <div style={{ padding: '8px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                            <Typography variant="subtitle2" color="textSecondary">
                                Estimated Annual Budget inputted by SK Chairperson:
                            </Typography>
                            <Typography variant="h4" color="primary" sx={{ mt: 1, fontWeight: 'bold' }}>
                                ₱{budgetValidationModal.budget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </Typography>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <Typography variant="subtitle2" color="textSecondary">
                                Remarks (Required if rejecting):
                            </Typography>
                            <textarea
                                className="ptl-input"
                                rows={2}
                                placeholder="Enter remarks..."
                                value={budgetValidationRemarks}
                                onChange={e => setBudgetValidationRemarks(e.target.value)}
                            />
                        </div>

                        <div className="ptl-status-footer" style={{ marginTop: '8px' }}>
                            <button
                                className="ptl-checklist-btn-close"
                                onClick={() => setBudgetValidationModal(null)}
                                disabled={submitting[`${budgetValidationModal.batchID}_budget`]}
                            >
                                Cancel
                            </button>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="ptl-btn ptl-btn--danger"
                                    onClick={() => {
                                        if (!budgetValidationRemarks.trim()) {
                                            alert("Please enter remarks before rejecting.");
                                            return;
                                        }
                                        handleValidateBudget(budgetValidationModal.batchID, 'reject', budgetValidationRemarks);
                                    }}
                                    disabled={submitting[`${budgetValidationModal.batchID}_budget`]}
                                >
                                    {submitting[`${budgetValidationModal.batchID}_budget`] ? 'Processing...' : 'Reject'}
                                </button>
                                <button
                                    className="ptl-btn ptl-btn--success"
                                    onClick={() => handleValidateBudget(budgetValidationModal.batchID, 'approve')}
                                    disabled={submitting[`${budgetValidationModal.batchID}_budget`]}
                                >
                                    {submitting[`${budgetValidationModal.batchID}_budget`] ? 'Processing...' : 'Approve'}
                                </button>
                            </div>
                        </div>
                    </div>
                </CheckpointModal>
            )}
        </div>
    );
};

export default ProjectTrackerList;
