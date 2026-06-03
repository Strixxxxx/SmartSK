import React, { useState, useEffect } from 'react';
import axios from '../../../backend connection/axiosConfig';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CircularProgress from '@mui/material/CircularProgress';
import styles from './SessionValidationModal.module.css';
import AnnexViewingModal from '../Projects/AnnexViewingModal';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import { useAuth } from '../../../context/AuthContext';
import { toastSuccess, toastError, showMilestoneToast } from '../../../utils/ProjectCycleToast';

interface SessionValidationModalProps {
    open: boolean;
    batchID: number;
    onClose: () => void;
    onSuccess: () => void;
}

const SessionValidationModal: React.FC<SessionValidationModalProps> = ({ open, batchID, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [docs, setDocs] = useState<{ attendanceSheetUrl: string, sessionDocUrl: string | null, photoDocs: {url: string, attempt?: string}[] } | null>(null);
    const [validationNote, setValidationNote] = useState('');

    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [viewTitle, setViewTitle] = useState('');
    const [viewType, setViewType] = useState<'pdf' | 'image' | 'carousel'>('pdf');
    const [viewUrls, setViewUrls] = useState<string[]>([]);

    const [confirmModalOpen, setConfirmModalOpen] = useState(false);

    useEffect(() => {
        if (open) {
            fetchDocs();
        } else {
            setValidationNote('');
        }
    }, [open, batchID]);

    const fetchDocs = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`/api/project-tracker/status/${batchID}`);
            if (res.data.success && res.data.data.sessionDocs) {
                setDocs(res.data.data.sessionDocs);
            }
        } catch (err) {
            console.error('Failed to fetch session docs', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: 'approve' | 'reject') => {
        if (action === 'reject' && !validationNote.trim()) {
            toastError('Please provide a reason for rejecting the session documents.');
            return;
        }

        try {
            setSubmitting(true);
            const res = await axios.post('/api/project-tracker/validate-session', {
                batchID,
                action,
                validationNote: validationNote.trim() || 'Approved by SK Chairperson'
            });

            if (res.data.success) {
                if (action === 'approve') {
                    showMilestoneToast(4, user?.position || user?.role || '', 'Project Cycle');
                } else {
                    toastSuccess('Revisions requested successfully.');
                }
                setConfirmModalOpen(false);
                onSuccess();
            }
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Failed to validate session.');
        } finally {
            setSubmitting(false);
        }
    };

    const openPreview = (type: 'attendance' | 'minutes' | 'photos') => {
        if (!docs) return;
        if (type === 'attendance') {
            setViewTitle('Attendance Sheet');
            setViewType(docs.attendanceSheetUrl.toLowerCase().split('?')[0].endsWith('.pdf') ? 'pdf' : 'image');
            setViewUrls([docs.attendanceSheetUrl]);
            setViewModalOpen(true);
        } else {
            const urls = docs.photoDocs.map(p => p.url).filter(Boolean);
            if (urls.length > 0) {
                setViewTitle('Session Documentation');
                setViewType('carousel');
                setViewUrls(urls);
                setViewModalOpen(true);
            }
        }
    };

    if (!open) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Validate Session Documents</h3>
                    <button className={styles.closeBtn} onClick={onClose} disabled={submitting}>
                        <CloseIcon />
                    </button>
                </div>

                <div className={styles.content}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                            <CircularProgress style={{ color: '#4f46e5' }} />
                        </div>
                    ) : docs ? (
                        <>
                            <div className={styles.docsSection}>
                                <span className={styles.docsLabel}>Submitted Documents</span>
                                
                                <div className={styles.docItem}>
                                        <div className={styles.docName}>
                                            <DescriptionIcon style={{ color: '#6b7280' }} />
                                            Attendance Sheet (Auto-Generated)
                                        </div>
                                        <button
                                            onClick={() => openPreview('attendance')}
                                            className={styles.viewBtn}
                                        >
                                            Preview File
                                        </button>
                                    </div>



                                    <div className={styles.docItem}>
                                        <div className={styles.docName}>
                                            <PhotoLibraryIcon style={{ color: '#6b7280' }} />
                                            Session Documentation (Attempt: {docs.photoDocs?.[0]?.attempt || '1st'} - {docs.photoDocs?.length || 0} Files)
                                        </div>
                                        <button
                                            onClick={() => openPreview('photos')}
                                            className={styles.viewBtn}
                                            disabled={!docs.photoDocs || docs.photoDocs.length === 0}
                                        >
                                            Preview Files
                                        </button>
                                    </div>
                            </div>

                            <div className={styles.noteSection}>
                                <span className={styles.docsLabel}>Validation Note / Rejection Reason</span>
                                <textarea
                                    className={styles.noteTextarea}
                                    placeholder="Enter your remarks here (Required if rejecting)..."
                                    value={validationNote}
                                    onChange={(e) => setValidationNote(e.target.value)}
                                    disabled={submitting}
                                />
                            </div>
                        </>
                    ) : (
                        <p style={{ color: '#6b7280', textAlign: 'center' }}>No documents found.</p>
                    )}
                </div>

                <div className={styles.footer}>
                    <button 
                        className={`${styles.btn} ${styles.btnReject}`}
                        onClick={() => handleAction('reject')}
                        disabled={submitting || loading || !docs}
                    >
                        <CancelIcon fontSize="small" />
                        Reject & Request Revision
                    </button>
                    <button 
                        className={`${styles.btn} ${styles.btnApprove}`}
                        onClick={() => setConfirmModalOpen(true)}
                        disabled={submitting || loading || !docs}
                    >
                        <CheckCircleIcon fontSize="small" />
                        Approve Session
                    </button>
                </div>
            </div>

            <AnnexViewingModal
                open={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                title={viewTitle}
                type={viewType}
                urls={viewUrls}
            />

            <Dialog open={confirmModalOpen} onClose={() => setConfirmModalOpen(false)}>
                <DialogTitle>Confirm Approval</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Do you approve the attendance sheet and session documentation? 
                        This action will advance the project to <strong>Checkpoint 4 (KK General Assembly)</strong>.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmModalOpen(false)} color="inherit" disabled={submitting}>Cancel</Button>
                    <Button onClick={() => handleAction('approve')} variant="contained" color="success" disabled={submitting}>
                        {submitting ? 'Approving...' : 'Yes, Approve'}
                    </Button>
                </DialogActions>
            </Dialog>
        </div>
    );
};

export default SessionValidationModal;
