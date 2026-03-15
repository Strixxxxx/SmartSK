import React from 'react';
import styles from './DigitalBulletin.module.css';

interface ProjectBatch {
    batchID: number;
    barangayID: number;
    projType: 'ABYIP' | 'CBYDP';
    projName: string;
    targetYear: string;
    budget: number;
    createdAt: string;
    barangayName: string;
    StatusID: number;
    StatusName: string;
}

interface DisclosureCardProps {
    project: ProjectBatch;
    customName?: string;
    onClick?: () => void;
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

const DisclosureCard: React.FC<DisclosureCardProps> = ({ project, customName, onClick }) => {
    return (
        <div className={styles.card} onClick={onClick}>
            <div className={styles.cardHeader}>
                <span className={`${styles.badge} ${project.projType === 'ABYIP' ? styles.badgeabyip : styles.badgecbydp}`}>
                    {project.projType}
                </span>
                <span className={styles.statusBadge}>{project.StatusName}</span>
            </div>
            
            <h3 className={styles.cardTitle}>{customName || project.projName}</h3>
            
            <div className={styles.cardMeta}>
                <div className={styles.metaItem}>
                    <span role="img" aria-label="location">📍</span>
                    <span>{project.barangayName}</span>
                </div>
                <div className={styles.metaItem}>
                    <span role="img" aria-label="calendar">📅</span>
                    <span>Year: {project.targetYear}</span>
                </div>
                <div className={styles.metaItem}>
                    <span role="img" aria-label="time">🕒</span>
                    <span>Disclosed: {formatDate(project.createdAt)}</span>
                </div>
            </div>
            
            <div className={styles.budgetAmount}>
                {formatCurrency(project.budget)}
            </div>
        </div>
    );
};

export default DisclosureCard;
