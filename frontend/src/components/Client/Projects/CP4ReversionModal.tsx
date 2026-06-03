import React, { useState } from 'react';
import { Warning as WarningIcon } from '@mui/icons-material';
import CircularProgress from '@mui/material/CircularProgress';
import styles from './CP4ReversionModal.module.css';

interface CP4ReversionModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    isReverting: boolean;
    projName: string;
}

const CP4ReversionModal: React.FC<CP4ReversionModalProps> = ({ open, onClose, onConfirm, isReverting, projName }) => {
    const [reason, setReason] = useState('');

    if (!open) return null;

    const handleConfirm = () => {
        if (reason.trim().length >= 20) {
            onConfirm(reason);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={!isReverting ? onClose : undefined}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <WarningIcon className={styles.warningIcon} />
                    <h2 className={styles.title}>Revert to Checkpoint 3 — SK Session</h2>
                </div>

                <div className={styles.body}>
                    <div className={styles.alertBox}>
                        <strong>Warning:</strong> This action resets Checkpoint 4 (KK General Assembly) for <em>{projName}</em>. 
                        The project will return to Checkpoint 3: CBYDP SK Session. The SK Secretary must re-submit all Checkpoint 4 documents once reverted.
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="reasonTextarea" className={styles.label}>Reason for Reversion <span className={styles.required}>*</span></label>
                        <textarea
                            id="reasonTextarea"
                            className={styles.textarea}
                            placeholder="Provide a detailed reason for reverting back to Checkpoint 3..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={isReverting}
                            rows={4}
                        />
                        <div className={styles.charCounter}>
                            {reason.length} / 20 minimum characters
                        </div>
                    </div>
                </div>

                <div className={styles.footer}>
                    <button 
                        className={styles.btnSecondary} 
                        onClick={onClose} 
                        disabled={isReverting}
                    >
                        Cancel
                    </button>
                    <button 
                        className={styles.btnDanger} 
                        onClick={handleConfirm}
                        disabled={reason.trim().length < 20 || isReverting}
                    >
                        {isReverting ? <CircularProgress size={20} color="inherit" /> : 'Revert to Checkpoint 3'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CP4ReversionModal;
