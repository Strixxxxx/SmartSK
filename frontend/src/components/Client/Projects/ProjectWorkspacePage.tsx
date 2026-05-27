import React, { useState, useEffect, useCallback, useRef, DragEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Box, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Alert, Typography, Snackbar, CircularProgress, List, ListItem, ListItemText, TextField, LinearProgress } from '@mui/material';
import ProjectWorkspaceSidebar from './ProjectWorkspaceSidebar';
import ProjectWorkNotes from './ProjectWorkNotes';
import ProjectTopNavbar from './ProjectTopNavbar';

import BudgetAdjustmentModal from './BudgetAdjustmentModal';
import ProjectTemplateHeader from './ProjectTemplateHeader';
import ProjectTemplateTable from './ProjectTemplateTable';
import { AbyipRow, CbydpRow } from './ProjectTemplateTypes';
import ProjectSheetTabs from './ProjectSheetTabs';
import ProjectTableSkeleton from './ProjectTableSkeleton';
import { useAuth } from '../../../context/AuthContext';
import { useCollaborationSocket } from '../../../hooks/useCollaborationSocket';
import axiosInstance from '../../../backend connection/axiosConfig';
import styles from './ProfilingPortal.module.css';
import AnnexViewingModal from './AnnexViewingModal';
import CampaignProofUploadModal from './CampaignProofUploadModal';
import AnnexReplaceModal from './AnnexReplaceModal';
import CampaignProofManageModal from './CampaignProofManageModal';
import ValidationModal from './ValidationModal';
import LYDPGatePage from './LYDPGatePage';
import IncomeGatePage from './IncomeGatePage';
import KkAssemblyPortal from './KkAssemblyPortal';

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

// ── Profiling Portal ─────────────────────────────────────────────────────────

interface DropZoneProps {
    label: string;
    accept: string;
    multiple?: boolean;
    file: File | File[] | null;
    onFile: (f: File | File[]) => void;
    onClear?: () => void;
    hint: string;
}

const DropZone: React.FC<DropZoneProps> = ({ label, accept, multiple, file, onFile, onClear, hint }) => {
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;
        if (multiple) onFile(files);
        else onFile(files[0]);
    };

    const hasFile = multiple ? (Array.isArray(file) && file.length > 0) : !!file;
    const fileLabel = multiple
        ? (Array.isArray(file) && file.length > 0 ? `${file.length} file(s) selected` : '')
        : (file instanceof File ? file.name : '');

    return (
        <div
            className={`${styles.dropZone} ${dragging ? styles.dropZoneDragging : ''} ${hasFile ? styles.dropZoneFilled : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={multiple}
                style={{ display: 'none' }}
                onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    if (multiple) onFile(files);
                    else onFile(files[0]);
                    e.target.value = '';
                }}
            />
            <div className={styles.dropZoneIcon}>
                {hasFile ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                )}
            </div>
            <div className={styles.dropZoneLabel}>{label}</div>
            {hasFile
                ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', zIndex: 2 }}>
                        <div className={styles.dropZoneFileName}>{fileLabel}</div>
                        {onClear && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onClear(); }}
                                style={{
                                    background: 'transparent', border: 'none', color: '#ef4444', 
                                    cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                title="Remove file"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        )}
                    </div>
                )
                : <div className={styles.dropZoneHint}>{hint}</div>
            }
        </div>
    );
};

interface ProfilingPortalProps {
    project: any;
    user: any;
}

const ProfilingPortal: React.FC<ProfilingPortalProps> = ({ project, user }) => {
    const [noticeLetter, setNoticeLetter] = useState<File | null>(null);
    const [campaignProofs, setCampaignProofs] = useState<File[]>([]);
    const [masterDataset, setMasterDataset] = useState<File | null>(null);
    
    // Checkpoint 1 file preview states
    const [pendingNoticeLetter, setPendingNoticeLetter] = useState<File | null>(null);
    const [noticePreviewModalOpen, setNoticePreviewModalOpen] = useState(false);
    const [pendingMasterDataset, setPendingMasterDataset] = useState<File | null>(null);
    const [datasetConfirmModalOpen, setDatasetConfirmModalOpen] = useState(false);

    // SKC Validation modal state
    const [validationModalOpen, setValidationModalOpen] = useState(false);
    const [hasConsent, setHasConsent] = useState(false);

    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [submissionID, setSubmissionID] = useState<number | null>(null);
    const [submissionStatus, setSubmissionStatus] = useState<string>('INCOMPLETE');
    const [analytics, setAnalytics] = useState<any>(null);
    const [uploadedFiles, setUploadedFiles] = useState<{ noticeLetter: boolean; masterDataset: boolean; campaignProofs: number }>({ noticeLetter: false, masterDataset: false, campaignProofs: 0 });
    const [revisionComment, setRevisionComment] = useState<string | null>(null);
    const [campaignProofDetails, setCampaignProofDetails] = useState<any[]>([]);

    const [reuseNoticeLetter, setReuseNoticeLetter] = useState(true);
    const [reuseMasterDataset, setReuseMasterDataset] = useState(true);
    
    useEffect(() => {
        if (submissionStatus === 'REVISION_REQUESTED') {
            setReuseNoticeLetter(true);
            setReuseMasterDataset(true);
        }
    }, [submissionStatus]);

    const [noticeLetterUrl, setNoticeLetterUrl] = useState<string | null>(null);
    const [masterDatasetUrl, setMasterDatasetUrl] = useState<string | null>(null);
    const [campaignProofUrls, setCampaignProofUrls] = useState<string[]>([]);

    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [viewTitle, setViewTitle] = useState('');
    const [viewType, setViewType] = useState<'pdf' | 'image' | 'carousel'>('pdf');
    const [viewUrls, setViewUrls] = useState<string[]>([]);

    const [uploadModalOpen, setUploadModalOpen] = useState(false);

    // Replace annex modal state
    const [replaceAnnexOpen, setReplaceAnnexOpen] = useState(false);
    const [replaceAnnexType, setReplaceAnnexType] = useState<'noticeLetter' | 'masterDataset' | null>(null);
    const [isReplacing, setIsReplacing] = useState(false);

    // Campaign proof manage modal state
    const [proofManageOpen, setProofManageOpen] = useState(false);
    const [isManagingProofs, setIsManagingProofs] = useState(false);

    // SKC request revision state
    const [isRequestingRevision, setIsRequestingRevision] = useState(false);
    const [isApproving, setIsApproving] = useState(false);

    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

    const fetchSubmissionDetails = useCallback(async () => {
        if (!project?.cycleID) return;
        try {
            const res = await axiosInstance.get(`/api/project-tracker/profiling/submission/${project.cycleID}`);
            if (res.data.success && res.data.data) {
                const d = res.data.data;
                setSubmissionID(d.submissionID);
                setSubmissionStatus(d.status);
                setUploadedFiles({
                    noticeLetter: !!d.noticeLetterBlobName,
                    masterDataset: !!d.masterDatasetBlobName,
                    campaignProofs: d.campaignProofs?.length ?? 0,
                });
                setNoticeLetterUrl(d.noticeLetterUrl || null);
                setMasterDatasetUrl(d.masterDatasetUrl || null);
                setCampaignProofUrls((d.campaignProofs || []).map((p: any) => p.url).filter(Boolean));
                setCampaignProofDetails(d.campaignProofs || []);
                setRevisionComment(d.revisionComment || null);
                if (d.analytics) setAnalytics(d.analytics);
                if (d.hasInformedConsentVerified) setHasConsent(true);
            }
        } catch (err) {
            console.error('[ProfilingPortal] failed to load submission:', err);
        }
    }, [project?.cycleID]);

    // Load existing submission on mount
    useEffect(() => {
        fetchSubmissionDetails();
    }, [fetchSubmissionDetails]);

    const handleUpload = async () => {
        if (!noticeLetter || !masterDataset || campaignProofs.length === 0) {
            setSnackbar({ open: true, message: 'Please select all three required Annex documents (Notice Letter, Campaign Proofs, and Master Dataset) before uploading.', severity: 'error' });
            return;
        }
        if (!hasConsent) {
            setSnackbar({ open: true, message: 'Please confirm that all youth respondents have signed the Informed Consent Form.', severity: 'error' });
            return;
        }
        setIsUploading(true);
        setUploadProgress(10);
        try {
            const formData = new FormData();
            formData.append('cycleID', String(project.cycleID));
            formData.append('barangayID', String(user?.barangay || project.barangayID));
            formData.append('hasInformedConsent', String(hasConsent));
            if (noticeLetter) formData.append('barangay_notice_letter', noticeLetter);
            if (masterDataset) formData.append('master_youth_dataset', masterDataset);
            campaignProofs.forEach(f => formData.append('campaign_proof_images', f));

            setUploadProgress(40);
            const res = await axiosInstance.post('/api/project-tracker/profiling/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadProgress(100);

            if (res.data.success) {
                setNoticeLetter(null);
                setMasterDataset(null);
                setCampaignProofs([]);
                setSnackbar({ open: true, message: 'Files uploaded successfully.', severity: 'success' });
                await fetchSubmissionDetails();
            }
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Upload failed. Please try again.', severity: 'error' });
        } finally {
            setIsUploading(false);
            setTimeout(() => setUploadProgress(0), 800);
        }
    };

    const handleValidate = async () => {
        if (!submissionID) {
            setSnackbar({ open: true, message: 'Please upload the required documents first.', severity: 'error' });
            return;
        }
        setIsApproving(true);
        try {
            const res = await axiosInstance.post('/api/project-tracker/profiling/validate', { submissionID });
            if (res.data.success) {
                setSubmissionStatus('CHECKPOINT_1_COMPLETE');
                setRevisionComment(null);
                setSnackbar({ open: true, message: 'Checkpoint 1 approved. Youth profiling is complete. Analytics computing in the background.', severity: 'success' });
                await fetchSubmissionDetails();
            } else {
                setSnackbar({ open: true, message: res.data.message || 'Approval failed.', severity: 'error' });
            }
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Approval failed. Please try again.', severity: 'error' });
        } finally {
            setIsApproving(false);
        }
    };

    const handleRequestRevision = async (comment: string) => {
        if (!submissionID || !comment.trim()) return;
        setIsRequestingRevision(true);
        try {
            const res = await axiosInstance.post('/api/project-tracker/profiling/request-revision', {
                submissionID,
                comment: comment.trim()
            });
            if (res.data.success) {
                setSubmissionStatus('REVISION_REQUESTED');
                setRevisionComment(comment.trim());
                setSnackbar({ open: true, message: 'Revision requested. The SK Secretary has been notified.', severity: 'info' });
            } else {
                setSnackbar({ open: true, message: res.data.message || 'Failed to request revision.', severity: 'error' });
            }
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to request revision.', severity: 'error' });
        } finally {
            setIsRequestingRevision(false);
        }
    };

    const handleReplaceAnnex = async (file: File) => {
        if (!replaceAnnexType) return;
        setIsReplacing(true);
        try {
            const formData = new FormData();
            formData.append('cycleID', String(project.cycleID));
            formData.append('barangayID', String(user?.barangay || project.barangayID));
            formData.append('annexType', replaceAnnexType);
            if (replaceAnnexType === 'noticeLetter') formData.append('barangay_notice_letter', file);
            if (replaceAnnexType === 'masterDataset') formData.append('master_youth_dataset', file);

            const res = await axiosInstance.patch('/api/project-tracker/profiling/replace-annex', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (res.data.success) {
                setReplaceAnnexOpen(false);
                setReplaceAnnexType(null);
                if (res.data.status) setSubmissionStatus(res.data.status);
                setSnackbar({ open: true, message: 'Annex replaced successfully.', severity: 'success' });
                await fetchSubmissionDetails();
            } else {
                setSnackbar({ open: true, message: res.data.message || 'Replacement failed.', severity: 'error' });
            }
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Replacement failed.', severity: 'error' });
        } finally {
            setIsReplacing(false);
        }
    };

    const handleManageCampaignProofs = async (reusedAttachmentIDs: number[], deletedAttachmentIDs: number[], newFiles: File[]) => {
        setIsManagingProofs(true);
        try {
            const formData = new FormData();
            formData.append('cycleID', String(project.cycleID));
            formData.append('barangayID', String(user?.barangay || project.barangayID));
            formData.append('annexType', 'campaignProofs');
            formData.append('reusedAttachmentIDs', JSON.stringify(reusedAttachmentIDs));
            formData.append('deletedAttachmentIDs', JSON.stringify(deletedAttachmentIDs));
            newFiles.forEach(f => formData.append('campaign_proof_images', f));

            const res = await axiosInstance.patch('/api/project-tracker/profiling/replace-annex', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (res.data.success) {
                setProofManageOpen(false);
                if (res.data.status) setSubmissionStatus(res.data.status);
                setSnackbar({ open: true, message: 'Campaign proofs updated successfully.', severity: 'success' });
                await fetchSubmissionDetails();
            } else {
                setSnackbar({ open: true, message: res.data.message || 'Update failed.', severity: 'error' });
            }
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Update failed.', severity: 'error' });
        } finally {
            setIsManagingProofs(false);
        }
    };

    const handleSubmitRevision = async () => {
        if (!submissionID) return;
        setIsUploading(true);
        setUploadProgress(10);
        try {
            if (!reuseNoticeLetter && noticeLetter) {
                const formData = new FormData();
                formData.append('cycleID', String(project.cycleID));
                formData.append('barangayID', String(user?.barangay || project.barangayID));
                formData.append('annexType', 'noticeLetter');
                formData.append('barangay_notice_letter', noticeLetter);
                await axiosInstance.patch('/api/project-tracker/profiling/replace-annex', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            }
            setUploadProgress(40);
            
            if (!reuseMasterDataset && masterDataset) {
                const formData = new FormData();
                formData.append('cycleID', String(project.cycleID));
                formData.append('barangayID', String(user?.barangay || project.barangayID));
                formData.append('annexType', 'masterDataset');
                formData.append('master_youth_dataset', masterDataset);
                await axiosInstance.patch('/api/project-tracker/profiling/replace-annex', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            }
            setUploadProgress(70);
            
            const res = await axiosInstance.post('/api/project-tracker/profiling/submit-revision', { submissionID });
            
            setUploadProgress(100);
            if (res.data.success) {
                setNoticeLetter(null);
                setMasterDataset(null);
                setSubmissionStatus('SUBMITTED');
                setRevisionComment(null);
                setSnackbar({ open: true, message: 'Revision submitted successfully.', severity: 'success' });
                await fetchSubmissionDetails();
            } else {
                setSnackbar({ open: true, message: res.data.message || 'Submit failed.', severity: 'error' });
            }
        } catch (err: any) {
            setSnackbar({ open: true, message: err.response?.data?.message || 'Submit failed. Please try again.', severity: 'error' });
        } finally {
            setIsUploading(false);
            setTimeout(() => setUploadProgress(0), 800);
        }
    };

    const isSks = user?.role === 'SKS' || user?.position?.toUpperCase() === 'SKS' || user?.position?.toLowerCase().includes('secretary');
    const isSkc = user?.role === 'SKC' || user?.position?.toUpperCase() === 'SKC' || user?.position?.toLowerCase().includes('chairperson');

    const isComplete = submissionStatus === 'CHECKPOINT_1_COMPLETE';
    const isSubmitted = submissionStatus === 'SUBMITTED';
    const isRevisionRequested = submissionStatus === 'REVISION_REQUESTED';
    const canValidate = uploadedFiles.noticeLetter && uploadedFiles.masterDataset && uploadedFiles.campaignProofs > 0;
    const canReplace = isSks && (submissionStatus === 'INCOMPLETE' || submissionStatus === 'SUBMITTED');

    const handleAnnexClick = (type: 'notice' | 'dataset' | 'proofs') => {
        if (type === 'notice' && uploadedFiles.noticeLetter && noticeLetterUrl) {
            setViewTitle('Annex 1 — Barangay Notice Letter');
            setViewType(noticeLetterUrl.toLowerCase().split('?')[0].endsWith('.pdf') ? 'pdf' : 'image');
            setViewUrls([noticeLetterUrl]);
            setViewModalOpen(true);
        } else if (type === 'dataset' && uploadedFiles.masterDataset && masterDatasetUrl) {
            window.open(masterDatasetUrl, '_blank');
        } else if (type === 'proofs' && uploadedFiles.campaignProofs > 0 && campaignProofUrls.length > 0) {
            setViewTitle('Annex 2 — Campaign Proofs');
            setViewType('carousel');
            setViewUrls(campaignProofUrls);
            setViewModalOpen(true);
        }
    };

    return (
        <div className={styles.portal}>
            <div className={styles.portalHeader}>
                <div className={styles.portalHeaderLeft}>
                    <span className={styles.stepBadge}>Checkpoint 1</span>
                    <h2 className={styles.portalTitle}>Youth Profiling</h2>
                    <p className={styles.portalSubtitle}>DILG Memorandum Circular No. 2022-033 — Annex 4 Compliance</p>
                </div>
                {isComplete && (
                    <div className={styles.completeBadge}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Checkpoint 1 Complete
                    </div>
                )}
                {isRevisionRequested && (
                    <div className={styles.revisionBadge}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Revision Requested
                    </div>
                )}
            </div>

            {/* Revision requested comment banner - visible to SKS */}
            {isRevisionRequested && revisionComment && isSks && (
                <div className={styles.revisionBanner}>
                    <div className={styles.revisionBannerIcon}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>
                    <div>
                        <div className={styles.revisionBannerTitle}>Revision Requested by SK Chairperson</div>
                        <div className={styles.revisionBannerComment}>{revisionComment}</div>
                    </div>
                </div>
            )}

            {/* Revision comment shown to SKC when revision is active */}
            {isRevisionRequested && revisionComment && isSkc && (
                <div className={styles.revisionBannerSkc}>
                    <strong>Your revision comment:</strong> {revisionComment}
                </div>
            )}

            {/* Uploaded file status chips */}
            <div className={styles.statusRow}>
                {/* Annex 1 chip */}
                <div className={styles.chipGroup}>
                    <span
                        className={`${styles.statusChip} ${uploadedFiles.noticeLetter ? `${styles.chipDone} ${styles.statusChipInteractive}` : styles.chipPending}`}
                        onClick={() => handleAnnexClick('notice')}
                    >
                        Annex 1 — Notice Letter {uploadedFiles.noticeLetter ? '(uploaded - click to view)' : '(required)'}
                    </span>
                    {canReplace && uploadedFiles.noticeLetter && (
                        <button
                            className={styles.replaceBtn}
                            onClick={() => { setReplaceAnnexType('noticeLetter'); setReplaceAnnexOpen(true); }}
                        >
                            Replace
                        </button>
                    )}
                </div>

                {/* Annex 2 chip */}
                <div className={styles.chipGroup}>
                    <span
                        className={`${styles.statusChip} ${uploadedFiles.campaignProofs > 0 ? `${styles.chipDone} ${styles.statusChipInteractive}` : styles.chipPending}`}
                        onClick={() => handleAnnexClick('proofs')}
                    >
                        Annex 2 — Campaign Proofs {uploadedFiles.campaignProofs > 0 ? `(${uploadedFiles.campaignProofs} uploaded - click to view)` : '(required)'}
                    </span>
                    {canReplace && uploadedFiles.campaignProofs > 0 && (
                        <button
                            className={styles.replaceBtn}
                            onClick={() => setProofManageOpen(true)}
                        >
                            Manage
                        </button>
                    )}
                </div>

                {/* Annex 4 chip */}
                <div className={styles.chipGroup}>
                    <span
                        className={`${styles.statusChip} ${uploadedFiles.masterDataset ? `${styles.chipDone} ${styles.statusChipInteractive}` : styles.chipPending}`}
                        onClick={() => handleAnnexClick('dataset')}
                    >
                        Annex 4 — Master Dataset {uploadedFiles.masterDataset ? '(uploaded - click to download)' : '(required)'}
                    </span>
                    {canReplace && uploadedFiles.masterDataset && (
                        <button
                            className={styles.replaceBtn}
                            onClick={() => { setReplaceAnnexType('masterDataset'); setReplaceAnnexOpen(true); }}
                        >
                            Replace
                        </button>
                    )}
                </div>
            </div>

            {/* Secretary Upload Section (Interactive drop zones only for SKS and when incomplete) */}
            {isSks && (!isComplete && !isSubmitted) ? (
                <>
                    <div className={styles.grid}>
                        {isRevisionRequested ? (
                            <div className={`${styles.dropZone} ${reuseNoticeLetter ? styles.dropZoneFilled : ''}`} style={{ cursor: 'default' }}>
                                <div className={styles.dropZoneIcon}>
                                    {reuseNoticeLetter ? (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                    )}
                                </div>
                                <div className={styles.dropZoneLabel}>Barangay Notice Letter</div>
                                <div className={styles.dropZoneHint} style={{ marginBottom: '12px' }}>
                                    {reuseNoticeLetter ? 'Using previously approved file' : (noticeLetter ? `Selected: ${noticeLetter.name}` : 'Awaiting replacement')}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', zIndex: 2 }}>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleAnnexClick('notice'); }}
                                        style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#334155' }}
                                    >
                                        Preview / Reuse
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); document.getElementById('replace-notice-input')?.click(); }}
                                        style={{ background: '#1e3a8a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                                    >
                                        Replace
                                    </button>
                                    <input 
                                        id="replace-notice-input" 
                                        type="file" 
                                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" 
                                        style={{ display: 'none' }} 
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) { setPendingNoticeLetter(f); setNoticePreviewModalOpen(true); setReuseNoticeLetter(false); }
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <DropZone
                                label="Barangay Notice Letter"
                                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                file={noticeLetter}
                                onFile={(f) => { setPendingNoticeLetter(f as File); setNoticePreviewModalOpen(true); }}
                                onClear={() => setNoticeLetter(null)}
                                hint="PDF, JPEG, or PNG — Annex 1 (Official notice to the barangay community)"
                            />
                        )}
                        {isRevisionRequested ? (
                            <div className={`${styles.dropZone} ${styles.dropZoneFilled}`} style={{ cursor: 'default' }}>
                                <div className={styles.dropZoneIcon}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                </div>
                                <div className={styles.dropZoneLabel}>Campaign Proof Images</div>
                                <div className={styles.dropZoneHint} style={{ marginBottom: '12px' }}>
                                    Review existing proofs or add replacements
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setProofManageOpen(true); }}
                                    style={{ background: '#1e3a8a', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, zIndex: 2 }}
                                >
                                    Manage
                                </button>
                            </div>
                        ) : (
                            <div 
                                className={`${styles.dropZone} ${campaignProofs.length > 0 ? styles.dropZoneFilled : ''}`}
                                onClick={() => setUploadModalOpen(true)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className={styles.dropZoneIcon}>
                                    {campaignProofs.length > 0 ? (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                                    )}
                                </div>
                                <div className={styles.dropZoneLabel}>Campaign Proof Images</div>
                                {campaignProofs.length > 0 ? (
                                    <div className={styles.dropZoneFileName}>{campaignProofs.length} images selected</div>
                                ) : (
                                    <div className={styles.dropZoneHint}>Click to manage campaign proofs (JPEG/PNG — Annex 2)</div>
                                )}
                            </div>
                        )}
                        {isRevisionRequested ? (
                            <div className={`${styles.dropZone} ${reuseMasterDataset ? styles.dropZoneFilled : ''}`} style={{ cursor: 'default' }}>
                                <div className={styles.dropZoneIcon}>
                                    {reuseMasterDataset ? (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                    )}
                                </div>
                                <div className={styles.dropZoneLabel}>Master Youth Dataset</div>
                                <div className={styles.dropZoneHint} style={{ marginBottom: '12px' }}>
                                    {reuseMasterDataset ? 'Using previously approved file' : (masterDataset ? `Selected: ${masterDataset.name}` : 'Awaiting replacement')}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', zIndex: 2 }}>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleAnnexClick('dataset'); }}
                                        style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#334155' }}
                                    >
                                        Preview / Reuse
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); document.getElementById('replace-dataset-input')?.click(); }}
                                        style={{ background: '#1e3a8a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                                    >
                                        Replace
                                    </button>
                                    <input 
                                        id="replace-dataset-input" 
                                        type="file" 
                                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
                                        style={{ display: 'none' }} 
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) { setPendingMasterDataset(f); setDatasetConfirmModalOpen(true); setReuseMasterDataset(false); }
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <DropZone
                                label="Master Youth Dataset"
                                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                file={masterDataset}
                                onFile={(f) => { setPendingMasterDataset(f as File); setDatasetConfirmModalOpen(true); }}
                                onClear={() => setMasterDataset(null)}
                                hint="XLSX only — Annex 4 (Official DILG youth profiling spreadsheet)"
                            />
                        )}
                    </div>

                    <div className={styles.consentRow}>
                        <label className={styles.consentLabel}>
                            <input
                                type="checkbox"
                                checked={hasConsent}
                                onChange={e => setHasConsent(e.target.checked)}
                                className={styles.consentCheck}
                            />
                            I confirm that all youth respondents have signed the Informed Consent Form (Annex 2), in compliance with the Data Privacy Act of 2012 (RA 10173). Parsing of personal data will only proceed after this verification.
                        </label>
                    </div>
                </>
            ) : (
                /* Conditional message boxes for non-Secretary roles when incomplete */
                !isComplete && (
                    <>
                        {isSkc ? (
                            /* SK Chairperson-specific view */
                            canValidate ? (
                                <div className={styles.infoBox} style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
                                    <h3 className={styles.infoTitle} style={{ color: '#166534' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                            <polyline points="22 4 12 14.01 9 11.01" />
                                        </svg>
                                        Checkpoint 1 Validation Pending
                                    </h3>
                                    <p className={styles.infoText} style={{ color: '#166534' }}>
                                        The SK Secretary has successfully uploaded all required DILG MC 2022-033 Annex documents. 
                                        As the <strong>SK Chairperson</strong>, please review the uploaded dataset and click the <strong>"Validate Dataset"</strong> button below to run the data checks and complete Checkpoint 1.
                                    </p>
                                </div>
                            ) : (
                                <div className={styles.infoBox} style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
                                    <h3 className={styles.infoTitle} style={{ color: '#475569' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                        Awaiting Secretary Document Upload
                                    </h3>
                                    <p className={styles.infoText} style={{ color: '#475569' }}>
                                        Only the <strong>SK Secretary</strong> is authorized to upload the required DILG MC 2022-033 Annex documents. 
                                        Once the secretary completes the uploads, you will be able to perform the data validation here.
                                    </p>
                                </div>
                            )
                        ) : (
                            /* Other roles view (SK members, BCPT, etc.) */
                            canValidate ? (
                                <div className={styles.infoBox} style={{ background: '#fffbeb', borderColor: '#fcd34d' }}>
                                    <h3 className={styles.infoTitle} style={{ color: '#b45309' }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                        Awaiting Chairperson Validation
                                    </h3>
                                    <p className={styles.infoText} style={{ color: '#b45309' }}>
                                        Required youth profiling documents have been uploaded successfully. Awaiting data verification and validation by the <strong>SK Chairperson</strong>.
                                    </p>
                                </div>
                            ) : (
                                <div className={styles.infoBox}>
                                    <h3 className={styles.infoTitle}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                        Youth Profiling Upload Portal
                                    </h3>
                                    <p className={styles.infoText}>
                                        Only the <strong>SK Secretary</strong> is authorized to upload the required DILG MC 2022-033 Annex documents. 
                                        Awaiting document upload by the Secretary.
                                    </p>
                                </div>
                            )
                        )}
                    </>
                )
            )}

            {uploadProgress > 0 && uploadProgress < 100 && (
                <div className={styles.progressBar}>
                    <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 4, borderRadius: 2 }} />
                </div>
            )}

            <div className={styles.actionRow}>
                {isSks && (!isComplete && !isSubmitted) && (
                    <button
                        className={styles.btnPrimary}
                        onClick={isRevisionRequested ? handleSubmitRevision : handleUpload}
                        disabled={
                            isUploading || isApproving ||
                            (isRevisionRequested
                                ? (!hasConsent || (!reuseNoticeLetter && !noticeLetter) || (!reuseMasterDataset && !masterDataset))
                                : (!noticeLetter || !masterDataset || campaignProofs.length === 0 || !hasConsent))
                        }
                        id="profiling-upload-btn"
                        title={(!hasConsent) ? "Please check the consent box" : ""}
                    >
                        {isUploading ? 'Submitting...' : 'Submit Documents'}
                    </button>
                )}

                {/* SKC Validate button - shown when status is SUBMITTED */}
                {isSubmitted && isSkc && (
                    <button
                        className={styles.btnSecondary}
                        onClick={() => setValidationModalOpen(true)}
                        disabled={isApproving || isRequestingRevision}
                        id="profiling-validate-btn"
                    >
                        Validate
                    </button>
                )}
            </div>

            {/* Analytics cards */}
            {isComplete && analytics && (
                <div className={styles.analyticsSection}>
                    <div className={styles.analyticsSectionTitle}>Profiling Summary — Demographic Overview</div>
                    <div className={styles.analyticsGrid}>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.totalCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>Total Respondents</div>
                        </div>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.maleCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>Male</div>
                        </div>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.femaleCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>Female</div>
                        </div>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.studentCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>In-School (ISY)</div>
                        </div>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.outOfSchoolCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>Out-of-School (OSY/NEET)</div>
                        </div>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.employedCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>Working Youth (WY)</div>
                        </div>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.childYouthCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>Child Youth (15–17)</div>
                        </div>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.coreYouthCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>Core Youth (18–24)</div>
                        </div>
                        <div className={styles.analyticsCard}>
                            <div className={styles.analyticsCardValue}>{analytics.youngAdultCount ?? 0}</div>
                            <div className={styles.analyticsCardLabel}>Young Adult (25–30)</div>
                        </div>
                    </div>
                </div>
            )}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={5000}
                onClose={() => setSnackbar(p => ({ ...p, open: false }))}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    severity={snackbar.severity}
                    variant="filled"
                    onClose={() => setSnackbar(p => ({ ...p, open: false }))}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            <AnnexViewingModal
                open={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                title={viewTitle}
                type={viewType}
                urls={viewUrls}
                showReuseCheckbox={isRevisionRequested && viewTitle.includes('Notice Letter')}
                reuseChecked={reuseNoticeLetter}
                onReuseChange={setReuseNoticeLetter}
            />

            <CampaignProofUploadModal
                open={uploadModalOpen}
                onClose={() => setUploadModalOpen(false)}
                files={campaignProofs}
                onChange={(files) => setCampaignProofs(files)}
            />

            {/* Annex 1 & 4 Replace Modal */}
            <AnnexReplaceModal
                open={replaceAnnexOpen}
                onClose={() => { setReplaceAnnexOpen(false); setReplaceAnnexType(null); }}
                title={replaceAnnexType === 'noticeLetter' ? 'Replace Annex 1 — Notice Letter' : 'Replace Annex 4 — Master Dataset'}
                annexName={replaceAnnexType === 'noticeLetter' ? 'Barangay Notice Letter' : 'Master Youth Dataset'}
                accept={replaceAnnexType === 'noticeLetter' ? '.pdf,.jpg,.jpeg,.png' : '.xlsx'}
                onConfirm={handleReplaceAnnex}
                loading={isReplacing}
            />

            {/* Campaign Proof Manage Modal */}
            <CampaignProofManageModal
                open={proofManageOpen}
                onClose={() => setProofManageOpen(false)}
                existingProofs={campaignProofDetails}
                onConfirm={handleManageCampaignProofs}
                loading={isManagingProofs}
            />

            {/* SKS Upload Preview Modals */}
            <Dialog open={noticePreviewModalOpen} onClose={() => setNoticePreviewModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Preview: {pendingNoticeLetter?.name}</DialogTitle>
                <DialogContent sx={{ p: 2, height: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {pendingNoticeLetter && (
                        pendingNoticeLetter.type === 'application/pdf' ? (
                            <iframe src={URL.createObjectURL(pendingNoticeLetter) + '#toolbar=0'} width="100%" height="100%" title="Notice Preview" />
                        ) : (
                            <img src={URL.createObjectURL(pendingNoticeLetter)} alt="Notice Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        )
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNoticePreviewModalOpen(false)} color="inherit">Cancel</Button>
                    <Button onClick={() => {
                        if (pendingNoticeLetter) setNoticeLetter(pendingNoticeLetter);
                        setNoticePreviewModalOpen(false);
                    }} variant="contained">Confirm Selection</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={datasetConfirmModalOpen} onClose={() => setDatasetConfirmModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Confirm Master Dataset</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You selected <strong>{pendingMasterDataset?.name}</strong>. Please confirm this is the correct Annex 4 (DILG format .xlsx file) before proceeding.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDatasetConfirmModalOpen(false)} color="inherit">Cancel</Button>
                    <Button onClick={() => {
                        if (pendingMasterDataset) setMasterDataset(pendingMasterDataset);
                        setDatasetConfirmModalOpen(false);
                    }} variant="contained">Confirm File</Button>
                </DialogActions>
            </Dialog>

            {/* Validation Modal for SKC */}
            <ValidationModal
                open={validationModalOpen}
                onClose={() => setValidationModalOpen(false)}
                onApprove={() => {
                    setValidationModalOpen(false);
                    handleValidate();
                }}
                onRequestRevision={(comment) => {
                    setValidationModalOpen(false);
                    handleRequestRevision(comment);
                }}
                isApproving={isApproving}
                isRequestingRevision={isRequestingRevision}
                uploadedFiles={{ noticeLetter: !!uploadedFiles.noticeLetter, masterDataset: !!uploadedFiles.masterDataset, campaignProofs: uploadedFiles.campaignProofs }}
                noticeLetterUrl={noticeLetterUrl || ''}
                masterDatasetUrl={masterDatasetUrl || ''}
                campaignProofUrls={campaignProofUrls}
            />
        </div>
    );
};

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

interface SessionChange {
    id: string;
    type: 'cell_edit' | 'row_add' | 'row_delete' | 'agenda_update';
    timestamp: Date;
    description: string;
}

const ProjectWorkspacePage: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    // Accepts a cycle (CP1) record or a projectBatch record from navigation state.
    // Falls back to GET /active-cycle if the page is loaded without state (e.g. browser back).
    const [selectedProject, setSelectedProject] = useState<any>(
        (location.state as any)?.cycle || (location.state as any)?.project || null
    );
    const [hasEditedSession, setHasEditedSession] = useState(false);
    const [sessionChanges, setSessionChanges] = useState<SessionChange[]>([]);
    const [isExitModalOpen, setIsExitModalOpen] = useState(false);
    const [pendingProjectSelection, setPendingProjectSelection] = useState<any>(null);
    const [isSavingSimulated, setIsSavingSimulated] = useState(false);
    const [activeTab, setActiveTab] = useState<string>(CATEGORIES[0]);
    const [rows, setRows] = useState<(AbyipRow | CbydpRow)[]>([]);
    const [agendaData, setAgendaData] = useState<Record<string, string>>({});
    const [isLoadingRows, setIsLoadingRows] = useState(false);
    const [projectListRefreshTrigger, _setProjectListRefreshTrigger] = useState(0);
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
    const [isRightSidebarCollapsed, setIsRightSidebarCollapsed] = useState(true);
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ open: boolean; sectionType?: string; onConfirm?: () => void }>({ open: false });
    const [aiSnackbar, setAiSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
    const [lydpCheckStatus, setLydpCheckStatus] = useState<'idle' | 'loading' | 'has_lydp' | 'no_lydp'>('idle');
    const [incomeCertsStatus, setIncomeCertsStatus] = useState<'idle' | 'loading' | { est: boolean; income: boolean }>('idle');

    useEffect(() => {
        if (!selectedProject) {
            setLydpCheckStatus('idle');
            return;
        }

        if (selectedProject.projType === 'CBYDP' && selectedProject.currentStatusID >= 2) {
            setLydpCheckStatus('loading');
            axiosInstance.get(`/api/project-documents/${selectedProject.batchID}/check-lydp`)
                .then(res => {
                    if (res.data.success && !res.data.hasLYDP) {
                        setLydpCheckStatus('no_lydp');
                    } else {
                        setLydpCheckStatus('has_lydp');
                    }
                })
                .catch(err => {
                    console.error('Failed to check LYDP:', err);
                    setLydpCheckStatus('has_lydp');
                });
        } else {
            setLydpCheckStatus('idle');
        }

        if (selectedProject.projType === 'ABYIP' && selectedProject.currentStatusID <= 5) {
            setIncomeCertsStatus('loading');
            axiosInstance.get(`/api/project-documents/${selectedProject.batchID}/check-income-certs`)
                .then(res => {
                    if (res.data.success) {
                        setIncomeCertsStatus({ est: res.data.hasEstIncomeCert, income: res.data.hasIncomeCert });
                    } else {
                        setIncomeCertsStatus({ est: true, income: true });
                    }
                })
                .catch(err => {
                    console.error('Failed to check Income Certs:', err);
                    setIncomeCertsStatus({ est: true, income: true });
                });
        } else {
            setIncomeCertsStatus('idle');
        }
    }, [selectedProject?.batchID, selectedProject?.projType, selectedProject?.currentStatusID]);

    const { user } = useAuth();

    // ── Review Mode ───────────────────────────────────────────────────────────
    const { batchID: urlBatchID } = useParams<{ batchID: string }>();
    const isReviewMode = new URLSearchParams(location.search).get('review') === 'true';

    // ── Verdict Modal State ───────────────────────────────────────────────────
    const [verdictModalOpen, setVerdictModalOpen] = useState(false);
    const [verdictAction, setVerdictAction] = useState<'approve' | 'revise' | null>(null);
    const [verdictNotes, setVerdictNotes] = useState('');
    const [isSubmittingVerdict, setIsSubmittingVerdict] = useState(false);
    
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


    const isBcpt = user?.role === 'BCPT' ||
        user?.position?.toLowerCase().includes('captain') ||
        user?.position?.toUpperCase() === 'BCPT';

    const isReadOnly = (selectedProject?.projType === 'ABYIP' && (selectedProject?.currentStatusID || 0) >= 12) ||
        Boolean(selectedProject?.projectTermIsLocked) ||
        (selectedProject?.termID && user?.termID && selectedProject.termID !== user.termID) ||
        isBcpt;

    const projName: string = selectedProject?.projName ?? '';
    const barangay = parseBarangay(projName);
    const fiscalYear = parseFiscalYear(projName);
    const projType: 'ABYIP' | 'CBYDP' = selectedProject?.projType === 'CBYDP' ? 'CBYDP' : 'ABYIP';

    const [auditRefreshTrigger, setAuditRefreshTrigger] = useState(0);
    const handleAuditUpdate = useCallback(() => {
        setAuditRefreshTrigger(prev => prev + 1);
    }, []);

    // ── Budget Monitoring ──────────────────────────────────────────────────
    const [budgetSummary, setBudgetSummary] = useState<any>(null);
    const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);

    const canAdjustBudget = user?.role === 'SKC' || 
                            user?.position?.toLowerCase().includes('chairperson') ||
                            user?.permissions?.budgetControl;

    const fetchBudgetSummary = useCallback(async () => {
        if (!selectedProject?.batchID || projType !== 'ABYIP') return;
        try {
            const res = await axiosInstance.get(`/api/project-batch/${selectedProject.batchID}/budget-summary?center=${encodeURIComponent(activeTab)}`);
            if (res.data.success) {
                setBudgetSummary(res.data.data);
            }
        } catch (err) {
            console.error('Failed to fetch budget summary:', err);
        }
    }, [selectedProject?.batchID, projType, activeTab]);

    useEffect(() => {
        fetchBudgetSummary();
    }, [fetchBudgetSummary, auditRefreshTrigger]);

    // Clear cache when project switches
    useEffect(() => {
        dataCache.current = {};
        setAgendaData({});
        setBudgetSummary(null);
    }, [selectedProject?.batchID]);

    // Auto-fetch active cycle REMOVED per user request.
    // Workspace will now open into a blank state requiring manual file selection.

    // Intercept browser reload / tab close when edits exist
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasEditedSession) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [hasEditedSession]);

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

                // Also refresh agenda data silently
                if (projType === 'CBYDP') {
                    const agendaRes = await axiosInstance.get(`/api/project-batch/${selectedProject.batchID}/agenda`);
                    if (agendaRes.data.success && agendaRes.data.data) {
                        setAgendaData(agendaRes.data.data);
                    }
                }
            } catch (err) {
                console.error('Failed to silently refresh rows or agenda:', err);
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
        onAiReportStatus: (msg: any) => {
            setAiSnackbar({
                open: true,
                message: msg.message,
                severity: msg.status === 'success' ? 'success' : 'error'
            });
        },
        onBcptVerdict: (msg: any) => {
            // Show flash toast to all other active users in the workspace when captain submits verdict
            setAiSnackbar({
                open: true,
                message: msg.message || 'Brgy. Captain has reviewed the plan. Please check the Work Notes & Agenda section to view the verdict.',
                severity: 'info'
            });
            // Silently refresh notes and audit trail
            setAuditRefreshTrigger(prev => prev + 1);
        },
        onBcptOverride: (msg: any) => {
            // Flash a warning toast to all active collaborators when BCPT uses Force Advance
            setAiSnackbar({
                open: true,
                message: msg.message || '⚠️ Barangay Captain has used the Force Advance override. The project has advanced to Checkpoint 4.',
                severity: 'info'
            });
            setAuditRefreshTrigger(prev => prev + 1);
        }

    });

    // Build a Map for the collaborators (keyed by userID)
    const collabMap = new Map<number, any>();
    collaborators.forEach((c: any) => collabMap.set(c.userID, c));

    // ── Cell change handler ───────────────────────────────────────────────────

    const handleCellChange = useCallback((rowID: number, field: string, value: string) => {
        setHasEditedSession(true);

        const fieldLabels: Record<string, string> = {
            referenceCode: 'Reference Code',
            PPA: 'Program/Project/Activity (PPA)',
            Description: 'Description',
            expectedResult: 'Expected Result',
            performanceIndicator: 'Performance Indicator',
            period: 'Implementation Period',
            PS: 'Personnel Services Budget (PS)',
            MOOE: 'Maintenance & Other Operating Expenses (MOOE)',
            CO: 'Capital Outlay (CO)',
            personResponsible: 'Person Responsible',
            YDC: 'Youth Development Concern',
            objective: 'Objective',
            target1: 'Year 1 Target',
            target2: 'Year 2 Target',
            target3: 'Year 3 Target',
            PPAs: 'PPAs',
            budget: 'Budget'
        };

        const fieldLabel = fieldLabels[field] || field;
        const shortVal = value.length > 25 ? value.substring(0, 22) + '...' : value;
        const description = `Edited "${fieldLabel}" to "${shortVal || '(empty)'}" in ${activeTab}`;

        setSessionChanges(prev => {
            const filtered = prev.filter(c => !(c.type === 'cell_edit' && (c as any).rowID === rowID && (c as any).field === field));
            return [
                ...filtered,
                {
                    id: Math.random().toString(),
                    type: 'cell_edit',
                    timestamp: new Date(),
                    description,
                    rowID,
                    field
                } as any
            ];
        });

        // 1. Optimistic update (Immediate UI feedback)
        setRows((prev) => {
            const updated = prev.map((r) => {
                if ((r as any).rowID === rowID) {
                    const updatedRow = { ...r, [field]: value };
                    
                    // ABYIP: Auto-calculate total for instant feedback
                    if (projType === 'ABYIP' && ['PS', 'MOOE', 'CO'].includes(field)) {
                        const ps = parseFloat(String(field === 'PS' ? value : (r as any).PS || 0)) || 0;
                        const mooe = parseFloat(String(field === 'MOOE' ? value : (r as any).MOOE || 0)) || 0;
                        const co = parseFloat(String(field === 'CO' ? value : (r as any).CO || 0)) || 0;
                        (updatedRow as any).total = (ps + mooe + co).toFixed(2);
                    }
                    
                    return updatedRow;
                }
                return r;
            });
            dataCache.current[activeTab] = updated; // Update cache
            return updated;
        });

        // 2. Real-time sync (Broadcast to other users)
        sendCellChange([{ rowID, field, value }]);
    }, [sendCellChange, activeTab, projType]);

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
            setHasEditedSession(true);
            const desc = `Added a new row under "${activeTab}" center`;
            setSessionChanges(prev => [
                ...prev,
                { id: Math.random().toString(), type: 'row_add', timestamp: new Date(), description: desc }
            ]);

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

    // ── Delete row handler ────────────────────────────────────────────────────
    const handleDeleteRecentRow = useCallback(async (sectionType?: string) => {
        if (!selectedProject?.batchID) return;

        // 1. Identify the latest row
        let targetRow: AbyipRow | CbydpRow | undefined;
        if (projType === 'ABYIP') {
            const abyipRows = rows as AbyipRow[];
            if (abyipRows.length === 0) return;
            const maxIndex = Math.max(0, ...abyipRows.map(r => r.sheetRowIndex || 0));
            targetRow = abyipRows.find(r => r.sheetRowIndex === maxIndex);
        } else {
            const cbydpRows = rows as CbydpRow[];
            const sectionRows = cbydpRows.filter(r => r.sectionType === (sectionType || 'FROM'));
            if (sectionRows.length === 0) return;
            const maxIndex = Math.max(0, ...sectionRows.map(r => r.sheetRowIndex || 0));
            targetRow = sectionRows.find(r => r.sheetRowIndex === maxIndex);
        }

        if (!targetRow) return;

        // 2. Check if empty
        const isRowEmpty = (row: any) => {
            if (projType === 'ABYIP') {
                const fields = ['referenceCode', 'PPA', 'Description', 'expectedResult', 'performanceIndicator', 'period', 'PS', 'MOOE', 'CO', 'total', 'personResponsible'];
                return fields.every(f => !row[f] || String(row[f]).trim() === '');
            } else {
                const fields = ['YDC', 'objective', 'performanceIndicator', 'target1', 'target2', 'target3', 'PPAs', 'budget', 'personResponsible'];
                return fields.every(f => !row[f] || String(row[f]).trim() === '');
            }
        };

        const performDelete = async () => {
            try {
                setHasEditedSession(true);
                const desc = `Deleted the most recent row under "${activeTab}" center`;
                setSessionChanges(prev => [
                    ...prev,
                    { id: Math.random().toString(), type: 'row_delete', timestamp: new Date(), description: desc }
                ]);

                await axiosInstance.delete(`/api/project-batch/${selectedProject.batchID}/rows/${targetRow!.rowID}`, {
                    params: { projType }
                });
                
                // Update UI state
                const updated = rows.filter(r => (r as any).rowID !== targetRow!.rowID);
                setRows(updated);
                dataCache.current[activeTab] = updated;
                setAuditRefreshTrigger(prev => prev + 1);
            } catch (err) {
                console.error('Failed to delete row:', err);
            } finally {
                setDeleteConfirmation({ open: false });
            }
        };

        if (isRowEmpty(targetRow)) {
            await performDelete();
        } else {
            setDeleteConfirmation({
                open: true,
                sectionType,
                onConfirm: performDelete
            });
        }
    }, [selectedProject?.batchID, projType, rows, activeTab]);

    // ── Auto-load project from URL batchID (for BCPT Review Mode navigation) ───
    useEffect(() => {
        if (!urlBatchID) return;
        const numericID = Number(urlBatchID);
        if (selectedProject?.batchID === numericID) return; // already loaded

        const loadProjectFromUrl = async () => {
            try {
                const res = await axiosInstance.get(`/api/project-tracker/status/${numericID}`);
                if (res.data.success && res.data.data?.batch) {
                    const batch = res.data.data.batch;
                    setSelectedProject({
                        batchID: batch.batchID,
                        cycleID: batch.cycleID,
                        barangayID: batch.barangayID,
                        projName: batch.projName,
                        projType: batch.projType,
                        targetYear: batch.targetYear,
                        budget: batch.budget,
                        termID: batch.termID,
                        currentStatusID: res.data.data.currentStatusID,
                    });
                    dataCache.current = {};
                    setAgendaData({});
                    setBudgetSummary(null);
                }
            } catch (err) {
                console.error('[ReviewMode] Failed to auto-load project from URL:', err);
            }
        };

        loadProjectFromUrl();
    }, [urlBatchID]);

    // ── Verdict Submit Handler ────────────────────────────────────────────────
    const handleVerdictSubmit = async () => {
        if (!selectedProject?.batchID || !verdictAction || !verdictNotes.trim()) return;
        setIsSubmittingVerdict(true);
        try {
            const res = await axiosInstance.post('/api/project-tracker/endorse-project', {
                batchID: selectedProject.batchID,
                action: verdictAction,
                notes: verdictNotes.trim()
            });
            if (res.data.success) {
                setVerdictModalOpen(false);
                setVerdictNotes('');
                setVerdictAction(null);
                setHasEditedSession(false); // prevent unsaved-changes warning on redirect
                setAiSnackbar({
                    open: true,
                    message: verdictAction === 'approve'
                        ? '✅ Project endorsed! Advancing to Checkpoint 5: QCYDO Validation.'
                        : '📝 Revisions requested. Project returned to Checkpoint 2.',
                    severity: 'success'
                });
                // Redirect BCPT to dashboard after a short delay
                setTimeout(() => navigate('/dashboard'), 1500);
            }
        } catch (err: any) {
            console.error('[Verdict] Failed to submit verdict:', err);
            setAiSnackbar({
                open: true,
                message: err.response?.data?.message || 'Failed to submit verdict. Please try again.',
                severity: 'error'
            });
        } finally {
            setIsSubmittingVerdict(false);
        }
    };

    // ── Update Status handler ───────────────────────────────────────────────
    const handleUpdateStatus = async (statusID: number) => {
        if (!selectedProject?.batchID) return;
        try {
            const res = await axiosInstance.post('/api/project-batch/update-status', {
                batchID: selectedProject.batchID,
                statusID
            });
            if (res.data.success) {
                console.log(`[Update-Status-DEBUG] Frontend received success. aiTriggered flag is: ${res.data.aiTriggered}`);
                setSelectedProject((prev: any) => ({
                    ...prev,
                    currentStatusID: statusID
                }));
                if (res.data.aiTriggered) {
                    console.log(`[Update-Status-DEBUG] Opening AI Snackbar toast...`);
                    setAiSnackbar({
                        open: true,
                        message: 'City Approval reached! AI Report generation has been queued and will update shortly.',
                        severity: 'info'
                    });
                } else {
                    console.log(`[Update-Status-DEBUG] aiTriggered was false. Toast not shown.`);
                }
            }
        } catch (err: any) {
            console.error('Failed to update status:', err);
            const errMsg = err.response?.data?.message || 'Failed to update milestone.';
            setAiSnackbar({ open: true, message: errMsg, severity: 'error' });
        }
    };


    // ── Update Agenda Statement handler ─────────────────────────────────────
    const handleAgendaSave = async (newValue: string) => {
        if (!selectedProject?.batchID) return;
        
        setHasEditedSession(true);
        const colMap = getAgendaColumnMap(activeTab);
        setAgendaData(prev => ({ ...prev, [colMap]: newValue }));

        const desc = `Updated Agenda Statement for "${activeTab}"`;
        setSessionChanges(prev => {
            const filtered = prev.filter(c => !(c.type === 'agenda_update' && (c as any).center === activeTab));
            return [
                ...filtered,
                { id: Math.random().toString(), type: 'agenda_update', timestamp: new Date(), description: desc, center: activeTab } as any
            ];
        });

        try {
            await axiosInstance.patch(`/api/project-batch/${selectedProject.batchID}/agenda`, {
                categoryMap: colMap,
                center: activeTab,
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

    const handleConfirmProjectSwitch = (proj: any) => {
        setSelectedProject(proj);
        setRows([]);
        setRemoteNotes([]);
        setActiveTab(CATEGORIES[0]);
        dataCache.current = {};
        setHasEditedSession(false);
        setSessionChanges([]);
        setIsExitModalOpen(false);
        setPendingProjectSelection(null);

        if (isReviewMode) {
            navigate(`/projects/${proj.batchID}?review=true`, { replace: true });
        } else {
            navigate(`/projects/${proj.batchID}`, { replace: true });
        }
    };

    const handleCloseClick = () => {
        if (hasEditedSession) {
            setIsExitModalOpen(true);
        } else {
            navigate('/dashboard');
        }
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', bgcolor: '#f5f7f9' }}>

            {/* Left Sidebar */}
            <ProjectWorkspaceSidebar
                selectedProject={selectedProject}
                onSelectProject={(proj) => {
                    if (hasEditedSession) {
                        setPendingProjectSelection(proj);
                        setIsExitModalOpen(true);
                    } else {
                        handleConfirmProjectSwitch(proj);
                    }
                }}
                auditRefreshTrigger={auditRefreshTrigger}
                projectListRefreshTrigger={projectListRefreshTrigger}
                onAuditUpdate={handleAuditUpdate}
                center={activeTab}
                isCollapsed={isLeftSidebarCollapsed}
                onToggleCollapse={() => setIsLeftSidebarCollapsed(prev => !prev)}
                isReadOnly={isReadOnly}
            />

            {/* Content Area */}
            <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>

                {/* Top Navbar */}
                <ProjectTopNavbar
                    project={selectedProject}
                    collaborators={collaborators}
                    currentUser={user}

                    onUpdateStatus={handleUpdateStatus}
                    onClose={handleCloseClick}
                    isReviewMode={isReviewMode}
                    onApprove={() => {
                        setVerdictAction('approve');
                        setVerdictNotes('');
                        setVerdictModalOpen(true);
                    }}
                    onRevise={() => {
                        setVerdictAction('revise');
                        setVerdictNotes('');
                        setVerdictModalOpen(true);
                    }}
                />

                {/* Real-time Budget Alert */}
                {projType === 'ABYIP' && budgetSummary && (
                    <Alert 
                        severity={budgetSummary.percentUsed >= 100 ? 'error' : (budgetSummary.percentUsed >= 80 ? 'warning' : 'info')}
                        variant="filled"
                        sx={{ 
                            borderRadius: 0, 
                            fontWeight: 'bold', 
                            px: 3,
                            bgcolor: budgetSummary.percentUsed < 80 ? '#2c3e50' : undefined 
                        }}
                        action={
                            canAdjustBudget && (
                                <Button color="inherit" size="small" variant="outlined" onClick={() => setIsBudgetModalOpen(true)}>
                                    ADJUST ALLOCATION
                                </Button>
                            )
                        }
                    >
                        <Box sx={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <Box>
                                <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', lineHeight: 1, mb: 0.5 }}>BATCH UTILIZATION</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                    {budgetSummary.percentUsed >= 100 
                                        ? `CRITICAL: ₱${Math.abs(budgetSummary.remainingBudget).toLocaleString('en-PH', { minimumFractionDigits: 2 })} OVER BUDGET`
                                        : `${budgetSummary.percentUsed.toFixed(1)}% Used (₱${budgetSummary.remainingBudget.toLocaleString('en-PH', { minimumFractionDigits: 2 })} left)`
                                    }
                                </Typography>
                            </Box>
                            
                            {budgetSummary.categorySummary && (
                                <Box sx={{ borderLeft: '1px solid rgba(255,255,255,0.3)', pl: 4 }}>
                                    <Typography variant="caption" sx={{ opacity: 0.8, display: 'block', lineHeight: 1, mb: 0.5 }}>
                                        {budgetSummary.categorySummary.center.toUpperCase()} ALLOCATION
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                        ₱{budgetSummary.categorySummary.used.toLocaleString('en-PH', { minimumFractionDigits: 2 })} of ₱{budgetSummary.categorySummary.allocated.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ({budgetSummary.categorySummary.percentUsed.toFixed(1)}%)
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </Alert>
                )}

                {/* Main Row */}
                <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>

                    {/* Template Area - auto-fills remaining space */}
                    <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#fff', transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}>

                        {lydpCheckStatus === 'loading' || incomeCertsStatus === 'loading' ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                <CircularProgress />
                            </Box>
                        ) : lydpCheckStatus === 'no_lydp' ? (
                            <LYDPGatePage />
                        ) : (typeof incomeCertsStatus === 'object' && selectedProject.projType === 'ABYIP' && selectedProject.currentStatusID <= 5) ? (
                            <IncomeGatePage 
                                hasEstIncomeCert={incomeCertsStatus.est} 
                                hasIncomeCert={incomeCertsStatus.income} 
                                budget={selectedProject.budget}
                                currentStatusID={selectedProject.currentStatusID}
                            />
                        ) : selectedProject ? (
                            <>
                                {/* Checkpoint 1 portal — shown when status is pre-Checkpoint 2 (statusID 0 or 1) */}
                                {(selectedProject.currentStatusID === 0 || selectedProject.currentStatusID === 1) ? (
                                    <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                                        <ProfilingPortal project={selectedProject} user={user} />
                                    </Box>
                                ) : selectedProject.currentStatusID === 4 ? (
                                    <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                                        <KkAssemblyPortal project={selectedProject} user={user} />
                                    </Box>
                                ) : (
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
                                                    onDeleteRecentRow={handleDeleteRecentRow}
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
                                )}
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
                            refreshTrigger={auditRefreshTrigger}
                            isCollapsed={isRightSidebarCollapsed}
                            onToggleCollapse={() => setIsRightSidebarCollapsed(prev => !prev)}
                        />
                    </Box>
                </Box>
            </Box>

            {/* Verdict Notes Modal — Barangay Captain endorsement/revision */}
            <Dialog
                open={verdictModalOpen}
                onClose={() => !isSubmittingVerdict && setVerdictModalOpen(false)}
                aria-labelledby="verdict-dialog-title"
                PaperProps={{
                    sx: { minWidth: 480, maxWidth: 600, borderRadius: 2 }
                }}
            >
                <DialogTitle
                    id="verdict-dialog-title"
                    sx={{
                        fontWeight: 'bold',
                        color: verdictAction === 'approve' ? '#2e7d32' : '#c62828',
                        borderBottom: '1px solid #f0f0f0',
                        pb: 1.5
                    }}
                >
                    {verdictAction === 'approve' ? '✅ Endorse & Approve Project Plan' : '📝 Request Revisions'}
                </DialogTitle>
                <DialogContent sx={{ pt: 2.5 }}>
                    <DialogContentText sx={{ mb: 2, fontSize: '0.9rem', color: '#555' }}>
                        {verdictAction === 'approve'
                            ? 'Please provide your endorsement notes. These will be logged in the Work Notes & Agenda section and emailed to the SK Council.'
                            : 'Please describe the revisions required. The project will be returned to Checkpoint 2 and your notes will be logged and emailed to the SK Council.'}
                    </DialogContentText>
                    <TextField
                        label="Verdict Notes"
                        placeholder={verdictAction === 'approve'
                            ? 'e.g., The project plan has been reviewed and meets all required standards. Approved for City endorsement.'
                            : 'e.g., The budget allocations for Governance need further justification. Please revise and resubmit.'}
                        multiline
                        rows={5}
                        fullWidth
                        variant="outlined"
                        value={verdictNotes}
                        onChange={(e) => setVerdictNotes(e.target.value)}
                        disabled={isSubmittingVerdict}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                '&.Mui-focused fieldset': {
                                    borderColor: verdictAction === 'approve' ? '#2e7d32' : '#c62828'
                                }
                            },
                            '& label.Mui-focused': {
                                color: verdictAction === 'approve' ? '#2e7d32' : '#c62828'
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0, gap: 1 }}>
                    <Button
                        onClick={() => setVerdictModalOpen(false)}
                        disabled={isSubmittingVerdict}
                        sx={{ color: '#666' }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleVerdictSubmit}
                        disabled={isSubmittingVerdict || !verdictNotes.trim()}
                        startIcon={isSubmittingVerdict ? <CircularProgress size={16} color="inherit" /> : null}
                        sx={{
                            bgcolor: verdictAction === 'approve' ? '#2e7d32' : '#c62828',
                            '&:hover': { bgcolor: verdictAction === 'approve' ? '#1b5e20' : '#b71c1c' },
                            fontWeight: 600,
                            textTransform: 'none',
                            borderRadius: 2,
                            minWidth: 140
                        }}
                    >
                        {isSubmittingVerdict
                            ? 'Submitting...'
                            : verdictAction === 'approve' ? 'Endorse & Approve' : 'Submit Revisions'}
                    </Button>
                </DialogActions>
            </Dialog>



            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteConfirmation.open}
                onClose={() => setDeleteConfirmation({ open: false })}
                aria-labelledby="delete-row-dialog-title"
                aria-describedby="delete-row-dialog-description"
            >
                <DialogTitle id="delete-row-dialog-title" sx={{ color: '#d32f2f', fontWeight: 'bold' }}>
                    Confirm Row Deletion
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="delete-row-dialog-description">
                        Are you sure to delete this row? It consist of data and it couldnt revert back once it was deleted.
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteConfirmation({ open: false })} sx={{ color: '#666' }}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={deleteConfirmation.onConfirm} 
                        variant="contained" 
                        color="error" 
                        autoFocus
                        sx={{ bgcolor: '#d32f2f', '&:hover': { bgcolor: '#b71c1c' } }}
                    >
                        Delete Permanently
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Budget Adjustment Modal */}
            {selectedProject && (
                <BudgetAdjustmentModal
                    open={isBudgetModalOpen}
                    onClose={() => setIsBudgetModalOpen(false)}
                    batchID={selectedProject.batchID}
                    onAdjusted={() => {
                        setAuditRefreshTrigger(prev => prev + 1);
                    }}
                />
            )}

            {/* AI Report Status Snackbar */}
            <Snackbar
                open={aiSnackbar.open}
                autoHideDuration={6000}
                onClose={() => setAiSnackbar(prev => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert onClose={() => setAiSnackbar(prev => ({ ...prev, open: false }))} severity={aiSnackbar.severity} sx={{ width: '100%', border: '1px solid rgba(255,255,255,0.2)' }} variant="filled">
                    {aiSnackbar.message}
                </Alert>
            </Snackbar>

            {/* Save Changes Confirmation Dialog */}
            <Dialog
                open={isExitModalOpen}
                onClose={() => {
                    if (!isSavingSimulated) {
                        setIsExitModalOpen(false);
                        setPendingProjectSelection(null);
                    }
                }}
                aria-labelledby="exit-confirm-dialog-title"
                aria-describedby="exit-confirm-dialog-description"
                PaperProps={{
                    sx: { minWidth: 380, maxWidth: 500 }
                }}
            >
                <DialogTitle id="exit-confirm-dialog-title" sx={{ fontWeight: 'bold' }}>
                    Save Changes?
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="exit-confirm-dialog-description">
                        You have made changes to this project plan. Would you like to save and exit?
                        <br />
                        <span style={{ fontSize: '0.85rem', color: '#666', marginTop: '8px', display: 'block' }}>
                            * Note: Your changes are also automatically synced in real-time with your team.
                        </span>
                    </DialogContentText>

                    {/* Summary of Changes Log */}
                    <Box sx={{ 
                        mt: 2, 
                        maxHeight: 180, 
                        overflowY: 'auto', 
                        border: '1px solid #e0d9c4', 
                        borderRadius: '6px', 
                        bgcolor: '#faf8f5',
                        p: 1.5
                    }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, color: '#4a4435', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Changes in this Session ({sessionChanges.length})</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#888' }}>Auto-Synced</span>
                        </Typography>
                        {sessionChanges.length === 0 ? (
                            <Typography variant="body2" sx={{ color: '#aaa', fontStyle: 'italic' }}>
                                No changes detected.
                            </Typography>
                        ) : (
                            <List dense disablePadding>
                                {sessionChanges.map((change) => (
                                    <ListItem key={change.id} sx={{ py: 0.5, px: 0, borderBottom: '1px solid rgba(224, 217, 196, 0.4)', '&:last-child': { borderBottom: 'none' } }}>
                                        <ListItemText
                                            primary={change.description}
                                            primaryTypographyProps={{ fontSize: '0.8rem', color: '#555', fontWeight: 500 }}
                                            secondary={change.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                            secondaryTypographyProps={{ fontSize: '0.65rem', color: '#999' }}
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button 
                        disabled={isSavingSimulated}
                        onClick={() => {
                            setIsExitModalOpen(false);
                            setPendingProjectSelection(null);
                        }} 
                        sx={{ color: '#666' }}
                    >
                        Cancel
                    </Button>
                    <Button 
                        disabled={isSavingSimulated}
                        variant="contained" 
                        color="primary" 
                        autoFocus
                        onClick={async () => {
                            setIsSavingSimulated(true);
                            // Simulate a brief satisfying saving spinner
                            setTimeout(() => {
                                setIsSavingSimulated(false);
                                setIsExitModalOpen(false);
                                setHasEditedSession(false);
                                
                                if (pendingProjectSelection) {
                                    handleConfirmProjectSwitch(pendingProjectSelection);
                                    setPendingProjectSelection(null);
                                } else {
                                    navigate('/dashboard');
                                }
                            }, 800);
                        }}
                        startIcon={isSavingSimulated ? <CircularProgress size={16} color="inherit" /> : null}
                    >
                        {isSavingSimulated ? 'Saving...' : 'Save & Exit'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ProjectWorkspacePage;
