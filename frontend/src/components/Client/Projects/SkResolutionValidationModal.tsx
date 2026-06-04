import React, { useState, useEffect } from 'react';
import axios from '../../../backend connection/axiosConfig';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import CircularProgress from '@mui/material/CircularProgress';
import styles from '../Dashboard/SessionValidationModal.module.css'; // Reusing the excellent modal styling
import AnnexViewingModal from './AnnexViewingModal';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';
import { toastSuccess, toastError, showMilestoneToast } from '../../../utils/ProjectCycleToast';
import { useAuth } from '../../../context/AuthContext';

interface SkResolutionValidationModalProps {
    open: boolean;
    cycleID: number;
    onClose: () => void;
    onSuccess: () => void;
}

const SkResolutionValidationModal: React.FC<SkResolutionValidationModalProps> = ({ open, cycleID, onClose, onSuccess }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [proponent, setProponent] = useState<any>(null);
    const [revisionComment, setRevisionComment] = useState('');

    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);

    useEffect(() => {
        if (open && cycleID) {
            fetchProponentDetails();
        } else {
            setRevisionComment('');
        }
    }, [open, cycleID]);

    const fetchProponentDetails = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/project-tracker/sk-resolution/proponent/${cycleID}`);
            if (res.data.success && res.data.data) {
                setProponent(res.data.data);
            }
        } catch (err) {
            console.error('Failed to load proponent details', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: 'approve' | 'reject') => {
        if (action === 'reject' && !revisionComment.trim()) {
            toastError('Please provide a revision comment.');
            return;
        }

        try {
            setSubmitting(true);
            const res = await axios.post('/api/project-tracker/sk-resolution/validate', {
                cycleID,
                action,
                comment: revisionComment.trim() || 'Approved by SK Chairperson'
            });
            
            if (res.data.success) {
                if (action === 'approve') {
                    showMilestoneToast(7, user?.position || user?.role || '', 'Project Cycle');
                } else {
                    toastSuccess('Revisions requested successfully.');
                }
                setConfirmModalOpen(false);
                onSuccess();
                onClose();
            }
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Failed to process validation.');
        } finally {
            setSubmitting(false);
        }
    };

    const openPreview = () => {
        if (proponent?.fileUrl) {
            setViewModalOpen(true);
        }
    };

    if (!open) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Validate SK Resolution</h3>
                    <button className={styles.closeBtn} onClick={onClose} disabled={submitting}>
                        <CloseIcon />
                    </button>
                </div>

                <div className={styles.content}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
                            <CircularProgress style={{ color: '#4f46e5' }} />
                        </div>
                    ) : proponent && proponent.status === 'SUBMITTED' ? (
                        <>
                            <div className={styles.docsSection}>
                                <span className={styles.docsLabel}>Submitted By</span>
                                <div className={styles.docItem} style={{ backgroundColor: '#ffffff' }}>
                                    <div className={styles.docName}>
                                        {proponent.fullName} ({proponent.position})
                                    </div>
                                </div>
                                
                                <span className={styles.docsLabel} style={{ marginTop: '8px' }}>SK Resolution Document</span>
                                <div className={styles.docItem}>
                                    <div className={styles.docName}>
                                        <DescriptionIcon style={{ color: '#6b7280' }} />
                                        SK Resolution (Attempt {proponent.attemptCount || 1})
                                    </div>
                                    <button
                                        onClick={openPreview}
                                        className={styles.viewBtn}
                                        disabled={!proponent.fileUrl}
                                    >
                                        Preview File
                                    </button>
                                </div>
                            </div>

                            <div className={styles.noteSection}>
                                <span className={styles.docsLabel}>Revision Comment / Rejection Reason</span>
                                <textarea
                                    className={styles.noteTextarea}
                                    placeholder="Enter your remarks here (Required if requesting revision)..."
                                    value={revisionComment}
                                    onChange={(e) => setRevisionComment(e.target.value)}
                                    disabled={submitting}
                                />
                            </div>
                        </>
                    ) : (
                        <p style={{ color: '#6b7280', textAlign: 'center' }}>No SK Resolution available for validation.</p>
                    )}
                </div>

                <div className={styles.footer}>
                    <button 
                        className={`${styles.btn} ${styles.btnReject}`}
                        onClick={() => handleAction('reject')}
                        disabled={submitting || loading || !proponent || proponent.status !== 'SUBMITTED'}
                    >
                        <CancelIcon fontSize="small" />
                        Request Revision
                    </button>
                    <button 
                        className={`${styles.btn} ${styles.btnApprove}`}
                        onClick={() => setConfirmModalOpen(true)}
                        disabled={submitting || loading || !proponent || proponent.status !== 'SUBMITTED'}
                    >
                        <CheckCircleIcon fontSize="small" />
                        Approve Resolution
                    </button>
                </div>
            </div>

            <AnnexViewingModal
                open={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                title="SK Resolution Document"
                type={proponent?.fileUrl?.toLowerCase().split('?')[0].endsWith('.pdf') ? 'pdf' : 'image'}
                urls={proponent?.fileUrl ? [proponent.fileUrl] : []}
            />

            <Dialog open={confirmModalOpen} onClose={() => setConfirmModalOpen(false)}>
                <DialogTitle>Confirm Approval</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to approve this SK Resolution and advance the project to <strong>Checkpoint 7 (City Budget Review)</strong>?
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

export default SkResolutionValidationModal;
