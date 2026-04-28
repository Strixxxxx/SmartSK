import React from 'react';
import styles from './AdminProjects.module.css';

interface ProjectBatch {
    batchID: number;
    barangayID: number;
    projType: 'ABYIP' | 'CBYDP';
    projName: string;
    targetYear: string;
    budget: number;
    createdAt: string;
    barangayName: string;
    currentStatusID: number;
    StatusName: string;
}

interface AdminProjectCardProps {
    project: ProjectBatch;
    onArchive: (batchID: number) => void;
    onViewDetails: (batchID: number) => void;
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2
    }).format(amount);
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const AdminProjectCard: React.FC<AdminProjectCardProps> = ({ project, onArchive, onViewDetails }) => {
    const canArchive = project.currentStatusID >= 6;

    return (
        <div className={styles.card} onClick={() => onViewDetails(project.batchID)}>
            <div className={styles.cardHeader}>
                <span className={`${styles.badge} ${project.projType === 'ABYIP' ? styles.badgeabyip : styles.badgecbydp}`}>
                    {project.projType}
                </span>
                <span className={styles.statusBadge}>{project.StatusName}</span>
            </div>
            
            <h3 className={styles.cardTitle}>{project.projName}</h3>
            
            <div className={styles.cardMeta}>
                <div className={styles.metaItem}>
                    <span role="img" aria-label="calendar">📅</span>
                    <span>Year: {project.targetYear}</span>
                </div>
                <div className={styles.metaItem}>
                    <span role="img" aria-label="time">🕒</span>
                    <span>Created: {formatDate(project.createdAt)}</span>
                </div>
            </div>
            
            <div className={styles.budgetAmount}>
                {formatCurrency(project.budget)}
            </div>

            <div className={styles.adminActions}>
                <button 
                    className={styles.detailsBtn} 
                    onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(project.batchID);
                    }}
                >
                    Review Details
                </button>
                {canArchive && (
                    <button 
                        className={styles.archiveBtn}
                        onClick={(e) => {
                            e.stopPropagation();
                            onArchive(project.batchID);
                        }}
                    >
                        Archive
                    </button>
                )}
            </div>
        </div>
    );
};

export default AdminProjectCard;
