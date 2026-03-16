import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EastIcon from '@mui/icons-material/East';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

import SupportingDocumentsModal from './SupportingDocumentsModal';
import './ProjectTrackerList.css';

interface ProjectBatch {
    batchID: number;
    projName: string;
    projType: 'ABYIP' | 'CBYDP';
    targetYear: string;
    StatusName: string;
    currentStatusID: number;
    updatedAt?: string;
    createdAt?: string;
}

const STATUS_STEPS: { label: string; icon: React.ReactNode }[] = [
    { label: 'Template Setup', icon: <AppSettingsAltIcon /> },
    { label: 'Program Planning', icon: <EditCalendarIcon /> },
    { label: 'Internal Finalization', icon: <AssignmentTurnedInIcon /> },
    { label: 'Barangay Endorsement', icon: <AccountBalanceIcon /> },
    { label: 'QCYDO Validation', icon: <VerifiedIcon /> },
    { label: 'City Approval', icon: <DomainIcon /> },
    { label: 'Procurement Phase', icon: <LocalMallIcon /> },
    { label: 'Project Execution', icon: <EngineeringIcon /> },
    { label: 'Project Closure', icon: <FlagIcon /> },
];

const getStatusAge = (updatedAt?: string) => {
    if (!updatedAt) return { days: 0, level: 'ok' as const };
    const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
    const level = days >= 30 ? 'urgent' : days >= 15 ? 'warn' : ('ok' as const);
    return { days, level };
};

const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

const ProjectTrackerList: React.FC = () => {
    const [batches, setBatches] = useState<ProjectBatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [docModalOpen, setDocModalOpen] = useState(false);
    const [selectedBatchForDocs, setSelectedBatchForDocs] = useState<ProjectBatch | null>(null);
    const navigate = useNavigate();
    const { user } = useAuth();

    const isSkc =
        user?.role === 'SKC' ||
        user?.position?.toLowerCase().includes('chairperson') ||
        user?.position?.toUpperCase() === 'SKC';

    const hasTrackerControl = isSkc || user?.permissions?.trackerControl === true;
    const hasDocsControl = isSkc || user?.permissions?.docsControl === true;

    const fetchBatches = useCallback(async () => {
        try {
            const res = await axios.get('/api/project-batch/all-files');
            if (res.data.success) setBatches(res.data.data);
        } catch { /* silent */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBatches();
    }, [fetchBatches]);

    const handleAdvance = async (e: React.MouseEvent, batch: ProjectBatch) => {
        e.stopPropagation();
        const nextStatusID = batch.currentStatusID + 1;
        const nextStep = STATUS_STEPS[nextStatusID - 1];
        const isAIWarning = nextStatusID === 6 && batch.projType === 'ABYIP';

        const msg = isAIWarning
            ? `Advance to "${nextStep.label}"?\n\nIMPORTANT: This ABYIP project will be locked for editing and AI Historical Sync will be triggered.`
            : `Advance project to Step ${nextStatusID}: "${nextStep.label}"?`;

        if (!window.confirm(msg)) return;

        try {
            await axios.post('/api/project-batch/update-status', {
                batchID: batch.batchID,
                statusID: nextStatusID,
            });
            setBatches(prev =>
                prev.map(b =>
                    b.batchID === batch.batchID
                        ? { ...b, currentStatusID: nextStatusID, StatusName: nextStep.label, updatedAt: new Date().toISOString() }
                        : b
                )
            );
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to advance milestone.');
        }
    };

    const handleOpenDocs = (e: React.MouseEvent, batch: ProjectBatch) => {
        e.stopPropagation();
        setSelectedBatchForDocs(batch);
        setDocModalOpen(true);
    };

    const activeBatches = batches.filter(b => b.currentStatusID < 9);

    if (loading) return <div className="ptl-loading">Loading projects...</div>;

    if (activeBatches.length === 0) return (
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
                {activeBatches.map(batch => {
                    const { days, level } = getStatusAge(batch.updatedAt);
                    const isAIStep = batch.currentStatusID === 6 && batch.projType === 'ABYIP';

                    return (
                        <div
                            key={batch.batchID}
                            className={`ptl-card ptl-card--${level}${isAIStep ? ' ptl-card--ai' : ''}`}
                        >
                            {/* ── Card Header ───────────────────────────────── */}
                            <div className="ptl-card__header">
                                <div className="ptl-card__header-left">
                                    <span className={`ptl-type-badge ptl-type-badge--${batch.projType.toLowerCase()}`}>
                                        {batch.projType}
                                    </span>
                                    <button
                                        className="ptl-open-btn"
                                        onClick={() => navigate(`/projects/${batch.batchID}`)}
                                        title="Open in workspace"
                                    >
                                        <EastIcon sx={{ fontSize: 14 }} /> Open
                                    </button>
                                </div>
                                <div className="ptl-card__header-right">
                                    <span className="ptl-year">{batch.targetYear}</span>
                                    {level === 'urgent' && <ErrorOutlineIcon className="ptl-level-icon" sx={{ color: '#c62828' }} />}
                                    {level === 'warn' && <WarningAmberIcon className="ptl-level-icon" sx={{ color: '#e65100' }} />}
                                </div>
                            </div>

                            {/* ── Project Name ──────────────────────────────── */}
                            <p className="ptl-card__name">{batch.projName}</p>

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

                            {/* ── Current Status & Timeline ─────────────────── */}
                            <div className="ptl-status-row">
                                <span className="ptl-status-label">
                                    Step {batch.currentStatusID}/{STATUS_STEPS.length} — <strong>{batch.StatusName}</strong>
                                </span>
                            </div>

                            <div className="ptl-timeline">
                                <div className="ptl-timeline__item">
                                    <AccessTimeIcon sx={{ fontSize: 13 }} />
                                    <span>Created: {formatDate(batch.createdAt)}</span>
                                </div>
                                <div className={`ptl-timeline__item ptl-age--${level}`}>
                                    <AccessTimeIcon sx={{ fontSize: 13 }} />
                                    <span>{days} day{days !== 1 ? 's' : ''} at this status</span>
                                </div>
                            </div>

                            {/* ── AI Notice ─────────────────────────────────── */}
                            {isAIStep && (
                                <div className="ptl-ai-notice">
                                    <PrecisionManufacturingIcon sx={{ fontSize: 14 }} />
                                    <span>AI Historical Sync has been triggered for this plan.</span>
                                </div>
                            )}

                            {/* ── Deadline Warnings ─────────────────────────── */}
                            {level === 'urgent' && (
                                <p className="ptl-warn-text ptl-warn-text--urgent">
                                    ⚠️ URGENT: Over 30 days stalled. Legal compliance may be at risk.
                                </p>
                            )}
                            {level === 'warn' && (
                                <p className="ptl-warn-text ptl-warn-text--warn">
                                    📋 Reminder: Over 15 days in this status. Please review.
                                </p>
                            )}

                            <div className="ptl-actions-row">
                                {/* ── SKC Advance Button ────────────────────────── */}
                                {hasTrackerControl && batch.currentStatusID < 9 && (
                                    <button
                                        className="ptl-advance-btn"
                                        onClick={(e) => handleAdvance(e, batch)}
                                    >
                                        Advance to Step {batch.currentStatusID + 1}: {STATUS_STEPS[batch.currentStatusID]?.label}
                                    </button>
                                )}

                                {/* ── Supporting Document Button ────────────────── */}
                                {hasDocsControl && batch.currentStatusID >= 3 && (
                                    <button
                                        className="ptl-docs-btn"
                                        onClick={(e) => handleOpenDocs(e, batch)}
                                    >
                                        <InsertDriveFileIcon sx={{ fontSize: 16 }} />
                                        Supporting Documents
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
                />
            )}
        </div>
    );
};

export default ProjectTrackerList;
