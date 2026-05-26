import React, { useEffect } from 'react';
import styles from './CheckpointModal.module.css';

interface CheckpointModalProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

const CheckpointModal: React.FC<CheckpointModalProps> = ({ open, onClose, title, children }) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        if (open) {
            document.addEventListener('keydown', handleKeyDown);
        }
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>{title}</h2>
                </div>
                <div className={styles.modalBody}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default CheckpointModal;
