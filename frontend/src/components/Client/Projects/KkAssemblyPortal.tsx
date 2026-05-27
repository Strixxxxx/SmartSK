import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Alert, Snackbar, LinearProgress } from '@mui/material';
import axiosInstance from '../../../backend connection/axiosConfig';
import styles from './KkAssemblyPortal.module.css';
import AnnexViewingModal from './AnnexViewingModal';
import CampaignProofManageModal from './CampaignProofManageModal';
import AnnexReplaceModal from './AnnexReplaceModal';
import CampaignProofUploadModal from './CampaignProofUploadModal';
import KkValidationModal from './KkValidationModal';
import { useWebSocket } from '../../../context/WebSocketContext';




interface DropZoneProps {
    label: string;
    accept: string;
    multiple?: boolean;
    file: any;
    onFile: (f: any) => void;
    onClear?: () => void;
    hint: string;
}

const DropZone: React.FC<DropZoneProps> = ({ label, accept, multiple, file, onFile, onClear, hint }) => {
    const [dragging, setDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
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
        : (file && file.name ? file.name : '');

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

interface KkAssemblyPortalProps {
    project: any;
    user: any;
}

const KkAssemblyPortal: React.FC<KkAssemblyPortalProps> = ({ project, user }) => {
    const [attendanceSheet, setAttendanceSheet] = useState<File | null>(null);
    const [photoDocs, setCampaignProofs] = useState<File[]>([]);
    const [kkMinutes, setKkMinutes] = useState<File | null>(null);
    
    // Checkpoint 4 file preview states
    const [pendingAttendanceSheet, setPendingAttendanceSheet] = useState<File | null>(null);
    const [noticePreviewModalOpen, setNoticePreviewModalOpen] = useState(false);
    const [pendingKkMinutes, setPendingKkMinutes] = useState<File | null>(null);
    const [datasetConfirmModalOpen, setDatasetConfirmModalOpen] = useState(false);

    // SKC Validation modal state
    const [validationModalOpen, setValidationModalOpen] = useState(false);
    const [hasConsent, setHasConsent] = useState(false);

    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [submissionID, setSubmissionID] = useState<number | null>(null);
    const [submissionStatus, setSubmissionStatus] = useState<string>('INCOMPLETE');
    const [analytics, setAnalytics] = useState<any>(null);
    const [uploadedFiles, setUploadedFiles] = useState<{ attendanceSheet: boolean; kkMinutes: boolean; photoDocs: number }>({ attendanceSheet: false, kkMinutes: false, photoDocs: 0 });
    const [revisionComment, setRevisionComment] = useState<string | null>(null);
    const [photoDocDetails, setPhotoDocDetails] = useState<any[]>([]);

    const [reuseAttendanceSheet, setReuseAttendanceSheet] = useState(true);
    const [reuseKkMinutes, setReuseKkMinutes] = useState(true);
    
    useEffect(() => {
        if (submissionStatus === 'REVISION_REQUESTED') {
            setReuseAttendanceSheet(true);
            setReuseKkMinutes(true);
        }
    }, [submissionStatus]);

    const [attendanceSheetUrl, setAttendanceSheetUrl] = useState<string | null>(null);
    const [kkMinutesUrl, setKkMinutesUrl] = useState<string | null>(null);
    const [photoDocUrls, setPhotoDocUrls] = useState<string[]>([]);

    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [viewTitle, setViewTitle] = useState('');
    const [viewType, setViewType] = useState<'pdf' | 'image' | 'carousel'>('pdf');
    const [viewUrls, setViewUrls] = useState<string[]>([]);

    const [uploadModalOpen, setUploadModalOpen] = useState(false);

    // Replace annex modal state
    const [replaceAnnexOpen, setReplaceAnnexOpen] = useState(false);
    const [replaceAnnexType, setReplaceAnnexType] = useState<'attendanceSheet' | 'kkMinutes' | null>(null);
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
            const res = await axiosInstance.get(`/api/project-tracker/kk-assembly/submission/${project.cycleID}`);
            if (res.data.success && res.data.data) {
                const d = res.data.data;
                setSubmissionID(d.submissionID);
                setSubmissionStatus(d.status);
                setUploadedFiles({
                    attendanceSheet: !!d.attendanceSheetBlobName,
                    kkMinutes: !!d.kkMinutesBlobName,
                    photoDocs: d.photoDocs?.length ?? 0,
                });
                setAttendanceSheetUrl(d.attendanceSheetUrl || null);
                setKkMinutesUrl(d.kkMinutesUrl || null);
                setPhotoDocUrls((d.photoDocs || []).map((p: any) => p.url).filter(Boolean));
                setPhotoDocDetails(d.photoDocs || []);
                setRevisionComment(d.revisionComment || null);
                if (d.analytics) setAnalytics(d.analytics);
                if (d.hasInformedConsentVerified) setHasConsent(true);
            }
        } catch (err) {
            console.error('[KkAssemblyPortal] failed to load submission:', err);
        }
    }, [project?.cycleID]);

    // Load existing submission on mount
    useEffect(() => {
        fetchSubmissionDetails();
    }, [fetchSubmissionDetails]);

    // Real-time: re-fetch when SKS submits documents so SKC's view updates without a manual refresh
    const { kkAssemblyTimestamp } = useWebSocket();
    useEffect(() => {
        if (isSkc && kkAssemblyTimestamp > 0) {
            fetchSubmissionDetails();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [kkAssemblyTimestamp]);

    const handleUpload = async () => {
        if (!attendanceSheet || !kkMinutes || photoDocs.length === 0) {
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
            if (attendanceSheet) formData.append('attendance_sheet', attendanceSheet);
            if (kkMinutes) formData.append('kk_minutes', kkMinutes);
            photoDocs.forEach(f => formData.append('photo_documentation', f));

            setUploadProgress(40);
            const res = await axiosInstance.post('/api/project-tracker/kk-assembly/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadProgress(100);

            if (res.data.success) {
                setAttendanceSheet(null);
                setKkMinutes(null);
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
            const res = await axiosInstance.post('/api/project-tracker/kk-assembly/validate', { submissionID });
            if (res.data.success) {
                setSubmissionStatus('CHECKPOINT_4_COMPLETE');
                setRevisionComment(null);
                setSnackbar({ open: true, message: 'Checkpoint 4 approved. Youth profiling is complete. Analytics computing in the background.', severity: 'success' });
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
            const res = await axiosInstance.post('/api/project-tracker/kk-assembly/request-revision', {
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
            if (replaceAnnexType === 'attendanceSheet') formData.append('attendance_sheet', file);
            if (replaceAnnexType === 'kkMinutes') formData.append('kk_minutes', file);

            const res = await axiosInstance.patch('/api/project-tracker/kk-assembly/replace-annex', formData, {
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

    const handleManagePhotoDocs = async (reusedAttachmentIDs: number[], deletedAttachmentIDs: number[], newFiles: File[]) => {
        setIsManagingProofs(true);
        try {
            const formData = new FormData();
            formData.append('cycleID', String(project.cycleID));
            formData.append('barangayID', String(user?.barangay || project.barangayID));
            formData.append('annexType', 'photoDocs');
            formData.append('reusedAttachmentIDs', JSON.stringify(reusedAttachmentIDs));
            formData.append('deletedAttachmentIDs', JSON.stringify(deletedAttachmentIDs));
            newFiles.forEach(f => formData.append('photo_documentation', f));

            const res = await axiosInstance.patch('/api/project-tracker/kk-assembly/replace-annex', formData, {
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
            if (!reuseAttendanceSheet && attendanceSheet) {
                const formData = new FormData();
                formData.append('cycleID', String(project.cycleID));
                formData.append('barangayID', String(user?.barangay || project.barangayID));
                formData.append('annexType', 'attendanceSheet');
                formData.append('attendance_sheet', attendanceSheet);
                await axiosInstance.patch('/api/project-tracker/kk-assembly/replace-annex', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            }
            setUploadProgress(40);
            
            if (!reuseKkMinutes && kkMinutes) {
                const formData = new FormData();
                formData.append('cycleID', String(project.cycleID));
                formData.append('barangayID', String(user?.barangay || project.barangayID));
                formData.append('annexType', 'kkMinutes');
                formData.append('kk_minutes', kkMinutes);
                await axiosInstance.patch('/api/project-tracker/kk-assembly/replace-annex', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            }
            setUploadProgress(70);
            
            const res = await axiosInstance.post('/api/project-tracker/kk-assembly/submit-revision', { submissionID });
            
            setUploadProgress(100);
            if (res.data.success) {
                setAttendanceSheet(null);
                setKkMinutes(null);
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

    const isComplete = submissionStatus === 'CHECKPOINT_4_COMPLETE';
    const isSubmitted = submissionStatus === 'SUBMITTED';
    const isRevisionRequested = submissionStatus === 'REVISION_REQUESTED';
    const canValidate = uploadedFiles.attendanceSheet && uploadedFiles.kkMinutes && uploadedFiles.photoDocs > 0;
    const canReplace = isSks && (submissionStatus === 'INCOMPLETE' || submissionStatus === 'SUBMITTED');

    const handleAnnexClick = (type: 'notice' | 'dataset' | 'proofs') => {
        if (type === 'notice' && uploadedFiles.attendanceSheet && attendanceSheetUrl) {
            setViewTitle('Attendance Sheet');
            setViewType(attendanceSheetUrl.toLowerCase().split('?')[0].endsWith('.pdf') ? 'pdf' : 'image');
            setViewUrls([attendanceSheetUrl]);
            setViewModalOpen(true);
        } else if (type === 'dataset' && uploadedFiles.kkMinutes && kkMinutesUrl) {
            window.open(kkMinutesUrl, '_blank');
        } else if (type === 'proofs' && uploadedFiles.photoDocs > 0 && photoDocUrls.length > 0) {
            setViewTitle('Photo Documentation');
            setViewType('carousel');
            setViewUrls(photoDocUrls);
            setViewModalOpen(true);
        }
    };

    return (
        <div className={styles.portal}>
            <div className={styles.portalHeader}>
                <div className={styles.portalHeaderLeft}>
                    <span className={styles.stepBadge}>Checkpoint 4</span>
                    <h2 className={styles.portalTitle}>KK General Assembly</h2>
                    <p className={styles.portalSubtitle}>Proof of KK Assembly execution</p>
                </div>
                {isComplete && (
                    <div className={styles.completeBadge}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Checkpoint 4 Complete
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
                        className={`${styles.statusChip} ${uploadedFiles.attendanceSheet ? `${styles.chipDone} ${styles.statusChipInteractive}` : styles.chipPending}`}
                        onClick={() => handleAnnexClick('notice')}
                    >
                        Attendance Sheet {uploadedFiles.attendanceSheet ? '(uploaded - click to view)' : '(required)'}
                    </span>
                    {canReplace && uploadedFiles.attendanceSheet && (
                        <button
                            className={styles.replaceBtn}
                            onClick={() => { setReplaceAnnexType('attendanceSheet'); setReplaceAnnexOpen(true); }}
                        >
                            Replace
                        </button>
                    )}
                </div>

                {/* Annex 2 chip */}
                <div className={styles.chipGroup}>
                    <span
                        className={`${styles.statusChip} ${uploadedFiles.photoDocs > 0 ? `${styles.chipDone} ${styles.statusChipInteractive}` : styles.chipPending}`}
                        onClick={() => handleAnnexClick('proofs')}
                    >
                        Photo Documentation {uploadedFiles.photoDocs > 0 ? `(${uploadedFiles.photoDocs} uploaded - click to view)` : '(required)'}
                    </span>
                    {canReplace && uploadedFiles.photoDocs > 0 && (
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
                        className={`${styles.statusChip} ${uploadedFiles.kkMinutes ? `${styles.chipDone} ${styles.statusChipInteractive}` : styles.chipPending}`}
                        onClick={() => handleAnnexClick('dataset')}
                    >
                        KK Minutes {uploadedFiles.kkMinutes ? '(uploaded - click to download)' : '(required)'}
                    </span>
                    {canReplace && uploadedFiles.kkMinutes && (
                        <button
                            className={styles.replaceBtn}
                            onClick={() => { setReplaceAnnexType('kkMinutes'); setReplaceAnnexOpen(true); }}
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
                            <div className={`${styles.dropZone} ${reuseAttendanceSheet ? styles.dropZoneFilled : ''}`} style={{ cursor: 'default' }}>
                                <div className={styles.dropZoneIcon}>
                                    {reuseAttendanceSheet ? (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                    )}
                                </div>
                                <div className={styles.dropZoneLabel}>Attendance Sheet</div>
                                <div className={styles.dropZoneHint} style={{ marginBottom: '12px' }}>
                                    {reuseAttendanceSheet ? 'Using previously approved file' : (attendanceSheet ? `Selected: ${attendanceSheet.name}` : 'Awaiting replacement')}
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
                                            if (f) { setPendingAttendanceSheet(f); setNoticePreviewModalOpen(true); setReuseAttendanceSheet(false); }
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <DropZone
                                label="Attendance Sheet"
                                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                file={attendanceSheet}
                                onFile={(f) => { setPendingAttendanceSheet(f as File); setNoticePreviewModalOpen(true); }}
                                onClear={() => setAttendanceSheet(null)}
                                hint="PDF, JPEG, or PNG"
                            />
                        )}
                        {isRevisionRequested ? (
                            <div className={`${styles.dropZone} ${styles.dropZoneFilled}`} style={{ cursor: 'default' }}>
                                <div className={styles.dropZoneIcon}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                </div>
                                <div className={styles.dropZoneLabel}>Photo Documentation</div>
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
                                className={`${styles.dropZone} ${photoDocs.length > 0 ? styles.dropZoneFilled : ''}`}
                                onClick={() => setUploadModalOpen(true)}
                                style={{ cursor: 'pointer' }}
                            >
                                <div className={styles.dropZoneIcon}>
                                    {photoDocs.length > 0 ? (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                                    )}
                                </div>
                                <div className={styles.dropZoneLabel}>Photo Documentation</div>
                                {photoDocs.length > 0 ? (
                                    <div className={styles.dropZoneFileName}>{photoDocs.length} images selected</div>
                                ) : (
                                    <div className={styles.dropZoneHint}>Click to manage photo documentation (JPEG/PNG)</div>
                                )}
                            </div>
                        )}
                        {isRevisionRequested ? (
                            <div className={`${styles.dropZone} ${reuseKkMinutes ? styles.dropZoneFilled : ''}`} style={{ cursor: 'default' }}>
                                <div className={styles.dropZoneIcon}>
                                    {reuseKkMinutes ? (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                                    ) : (
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                    )}
                                </div>
                                <div className={styles.dropZoneLabel}>KK Minutes</div>
                                <div className={styles.dropZoneHint} style={{ marginBottom: '12px' }}>
                                    {reuseKkMinutes ? 'Using previously approved file' : (kkMinutes ? `Selected: ${kkMinutes.name}` : 'Awaiting replacement')}
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
                                        accept=".pdf,.jpg,.jpeg,.png" 
                                        style={{ display: 'none' }} 
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) { setPendingKkMinutes(f); setDatasetConfirmModalOpen(true); setReuseKkMinutes(false); }
                                            e.target.value = '';
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <DropZone
                                label="KK Minutes"
                                accept=".pdf,.jpg,.jpeg,.png"
                                file={kkMinutes}
                                onFile={(f) => { setPendingKkMinutes(f as File); setDatasetConfirmModalOpen(true); }}
                                onClear={() => setKkMinutes(null)}
                                hint="PDF, JPEG, or PNG"
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
                            I confirm compliance with the Data Privacy Act of 2012 (RA 10173).
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
                                        Checkpoint 4 Validation Pending
                                    </h3>
                                    <p className={styles.infoText} style={{ color: '#166534' }}>
                                        The SK Secretary has successfully uploaded all required documents. 
                                        As the <strong>SK Chairperson</strong>, please review the uploaded dataset and click the <strong>"Validate Dataset"</strong> button below to run the data checks and complete Checkpoint 4.
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
                                        Only the <strong>SK Secretary</strong> is authorized to upload the required documents. 
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
                                        Required KK general assembly documents have been uploaded successfully. Awaiting data verification and validation by the <strong>SK Chairperson</strong>.
                                    </p>
                                </div>
                            ) : (
                                <div className={styles.infoBox}>
                                    <h3 className={styles.infoTitle}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '6px' }}>
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                        KK General Assembly Upload Portal
                                    </h3>
                                    <p className={styles.infoText}>
                                        Only the <strong>SK Secretary</strong> is authorized to upload the required documents. 
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
                                ? (!hasConsent || (!reuseAttendanceSheet && !attendanceSheet) || (!reuseKkMinutes && !kkMinutes))
                                : (!attendanceSheet || !kkMinutes || photoDocs.length === 0 || !hasConsent))
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
                reuseChecked={reuseAttendanceSheet}
                onReuseChange={setReuseAttendanceSheet}
            />

            <CampaignProofUploadModal
                open={uploadModalOpen}
                onClose={() => setUploadModalOpen(false)}
                files={photoDocs}
                onChange={(files: any) => setCampaignProofs(files)}
            />

            {/* Annex 1 & 4 Replace Modal */}
            <AnnexReplaceModal
                open={replaceAnnexOpen}
                onClose={() => { setReplaceAnnexOpen(false); setReplaceAnnexType(null); }}
                title={replaceAnnexType === 'attendanceSheet' ? 'Replace Attendance Sheet' : 'Replace KK Minutes'}
                annexName={replaceAnnexType === 'attendanceSheet' ? 'Attendance Sheet' : 'KK Minutes'}
                accept=".pdf,.jpg,.jpeg,.png"
                onConfirm={handleReplaceAnnex}
                loading={isReplacing}
            />

            {/* Campaign Proof Manage Modal */}
            <CampaignProofManageModal
                open={proofManageOpen}
                onClose={() => setProofManageOpen(false)}
                existingProofs={photoDocDetails}
                onConfirm={handleManagePhotoDocs}
                loading={isManagingProofs}
            />

            {/* SKS Upload Preview Modals */}
            <Dialog open={noticePreviewModalOpen} onClose={() => setNoticePreviewModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Preview: {pendingAttendanceSheet?.name}</DialogTitle>
                <DialogContent sx={{ p: 2, height: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {pendingAttendanceSheet && (
                        pendingAttendanceSheet.type === 'application/pdf' ? (
                            <iframe src={URL.createObjectURL(pendingAttendanceSheet) + '#toolbar=0'} width="100%" height="100%" title="Notice Preview" />
                        ) : (
                            <img src={URL.createObjectURL(pendingAttendanceSheet)} alt="Notice Preview" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        )
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNoticePreviewModalOpen(false)} color="inherit">Cancel</Button>
                    <Button onClick={() => {
                        if (pendingAttendanceSheet) setAttendanceSheet(pendingAttendanceSheet);
                        setNoticePreviewModalOpen(false);
                    }} variant="contained">Confirm Selection</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={datasetConfirmModalOpen} onClose={() => setDatasetConfirmModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Confirm Master Dataset</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You selected <strong>{pendingKkMinutes?.name}</strong>. Please confirm this is the correct KK Minutes before proceeding.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDatasetConfirmModalOpen(false)} color="inherit">Cancel</Button>
                    <Button onClick={() => {
                        if (pendingKkMinutes) setKkMinutes(pendingKkMinutes);
                        setDatasetConfirmModalOpen(false);
                    }} variant="contained">Confirm File</Button>
                </DialogActions>
            </Dialog>

            {/* Validation Modal for SKC */}
            <KkValidationModal
                open={validationModalOpen}
                onClose={() => setValidationModalOpen(false)}
                onApprove={() => {
                    setValidationModalOpen(false);
                    handleValidate();
                }}
                onRequestRevision={(comment: any) => {
                    setValidationModalOpen(false);
                    handleRequestRevision(comment);
                }}
                isApproving={isApproving}
                isRequestingRevision={isRequestingRevision}
                uploadedFiles={{ 
                    attendanceSheet: !!uploadedFiles.attendanceSheet, 
                    kkMinutes: !!uploadedFiles.kkMinutes, 
                    photoDocs: uploadedFiles.photoDocs 
                }}
                attendanceSheetUrl={attendanceSheetUrl || ''}
                kkMinutesUrl={kkMinutesUrl || ''}
                photoDocUrls={photoDocUrls}
            />
        </div>
    );
};


export default KkAssemblyPortal;
