import React, { useState, useEffect } from 'react';
import axios from '../../../backend connection/axiosConfig';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CircularProgress from '@mui/material/CircularProgress';
import styles from './CheckpointValidationModal.module.css';
import { toast } from 'react-toastify';
import { FilePreviewModal } from './FilePreviewModal';

const CHECKPOINT_FOLDER_MAP: Record<number, string> = {
    4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve'
};

interface ProofFile {
    name: string;
    path: string;
    url: string;
    size: number;
    uploadedAt: string;
    attempt?: string;
}

interface CheckpointValidationModalProps {
    open: boolean;
    batchID: number;
    checkpointID: number;
    onClose: () => void;
    onSuccess: () => void;
}

const CheckpointValidationModal: React.FC<CheckpointValidationModalProps> = ({ open, batchID, checkpointID, onClose, onSuccess }) => {
    const [files, setFiles] = useState<ProofFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [rejecting, setRejecting] = useState(false);
    const [validationNote, setValidationNote] = useState('');
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);

    const fetchFiles = async () => {
        try {
            setLoading(true);
            const res = await axios.get(`/api/project-tracker/checkpoint-proof/${batchID}/${checkpointID}`);
            if (res.data.success) {
                setFiles(res.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch proof files', error);
        } finally {
             setLoading(false);
        }
    };

    useEffect(() => {
        if (open) {
            setValidationNote('');
            setSubmitting(false);
            setRejecting(false);
            fetchFiles();
        }
    }, [open, batchID, checkpointID]);

    if (!open) return null;

    const handleAction = async (action: 'approve' | 'reject') => {
        if (validationNote.trim() === '') {
            toast.error('Please enter remarks/notes.');
            return;
        }

        try {
            if (action === 'approve') {
                setSubmitting(true);
            } else {
                setRejecting(true);
            }

            const res = await axios.post('/api/project-tracker/validate-checkpoint', {
                batchID,
                fromCheckpoint: checkpointID,
                validationNote: validationNote.trim(),
                action
            });
            if (res.data.success) {
                if (action === 'approve') {
                    toast.success(`Checkpoint ${checkpointID} validated successfully.`);
                    if (res.data.aiTriggered) {
                        toast.info('City Approval reached! AI Report generation has been queued and will update shortly.');
                    }
                } else {
                    let revertMsg = '';
                    if (checkpointID >= 4 && checkpointID <= 6) {
                        revertMsg = `Checkpoint rejected. Project reverted to Checkpoint 2.`;
                    } else if (checkpointID >= 7 && checkpointID <= 11) {
                        revertMsg = `Checkpoint rejected. Project reverted to Checkpoint 5 (ABYIP Budget Draft).`;
                    } else if (checkpointID === 12) {
                        revertMsg = `Procurement Phase revisions requested. Remaining at Checkpoint 12.`;
                    } else {
                        revertMsg = `Checkpoint rejected. Project reverted.`;
                    }
                    toast.info(revertMsg);
                }
                onSuccess(); // Triggers a parent refresh
                onClose();
            }
        } catch (error: any) {
            console.error('Checkpoint action failed', error);
            const msg = error.response?.data?.message || 'Failed to process checkpoint action.';
            toast.error(msg);
        } finally {
            setSubmitting(false);
            setRejecting(false);
        }
    };

    const handlePreview = (e: React.MouseEvent, file: ProofFile) => {
        e.preventDefault();
        setPreviewFile({ url: file.url, name: file.name });
        setPreviewOpen(true);
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-PH', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const folderName = CHECKPOINT_FOLDER_MAP[checkpointID];
    
    // Strict client-side isolation to prevent leaks from other checkpoints (fallback)
    const filteredFiles = files.filter(file => {
        if (!folderName) return false;
        return file.path.includes(`Checkpoints/${folderName}/`);
    });

    const hasFiles = filteredFiles.length > 0;

    return (
        <>
            <div className={styles.modalOverlay} onClick={(!submitting && !rejecting) ? onClose : undefined}>
                <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                    <div className={styles.header}>
                        <h2 className={styles.title}>Validate Checkpoint {checkpointID}</h2>
                    </div>

                    <div className={styles.fileListArea}>
                        <h3 className={styles.sectionTitle}>Uploaded Proofs</h3>
                        {loading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px' }}>
                                <CircularProgress size={24} />
                            </div>
                        ) : hasFiles ? (
                            filteredFiles.map((file, idx) => (
                                <div key={idx} className={styles.fileItem}>
                                    <div className={styles.fileInfo}>
                                        <span className={styles.fileName}>
                                            <InsertDriveFileIcon style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4, color: '#1a73e8' }} />
                                            {file.name}
                                        </span>
                                        <span className={styles.fileMeta}>{formatBytes(file.size)} • {formatDate(file.uploadedAt)}</span>
                                    </div>
                                    <button className={styles.downloadBtn} onClick={(e) => handlePreview(e, file)}>
                                        Review File
                                    </button>
                                </div>
                            ))
                        ) : (
                            <p className={styles.noFiles}>Awaiting proof upload from SK Chairperson.</p>
                        )}
                    </div>

                    <div className={styles.noteArea}>
                        <h3 className={styles.sectionTitle}>Validation Remarks <span style={{color: '#dc2626'}}>*</span></h3>
                        <textarea 
                            className={styles.textArea} 
                            placeholder="Enter your validation remarks, observations, or directives..."
                            value={validationNote}
                            onChange={(e) => setValidationNote(e.target.value)}
                            disabled={!hasFiles || submitting || rejecting}
                        />
                    </div>

                    <div className={styles.footer}>
                        <button className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={submitting || rejecting}>
                            Cancel
                        </button>
                        
                        <button 
                            className={`${styles.btn} ${styles.btnDanger}`} 
                            onClick={() => handleAction('reject')} 
                            disabled={!hasFiles || validationNote.trim() === '' || submitting || rejecting}
                            style={{ gap: '6px' }}
                        >
                            {rejecting ? <CircularProgress size={16} color="inherit" /> : <CancelOutlinedIcon fontSize="small" />}
                            {rejecting ? 'Reverting...' : [7, 8, 9, 10, 11, 12].includes(checkpointID) ? 'Request Revisions' : 'Reject & Revert'}
                        </button>

                        <button 
                            className={`${styles.btn} ${styles.btnPrimary}`} 
                            onClick={() => handleAction('approve')} 
                            disabled={!hasFiles || validationNote.trim() === '' || submitting || rejecting}
                            style={{ gap: '6px' }}
                        >
                            {submitting ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon fontSize="small" />}
                            {submitting ? 'Validating...' : 'Validate & Advance'}
                        </button>
                    </div>
                </div>
            </div>

            <FilePreviewModal
                open={previewOpen}
                fileName={previewFile?.name || ''}
                fileUrl={previewFile?.url || ''}
                onClose={() => setPreviewOpen(false)}
            />
        </>
    );
};

export default CheckpointValidationModal;
