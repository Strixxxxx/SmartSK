import React from 'react';
import styles from './ProjectTemplate.module.css';

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
    'General Administration Program',
    'Maintenance and Other Operating Expenses',
];

interface ProjectSheetTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

const ProjectSheetTabs: React.FC<ProjectSheetTabsProps> = ({ activeTab, onTabChange }) => {
    return (
        <div className={styles['pt-sheet-tabs']}>
            {CATEGORIES.map((cat) => (
                <button
                    key={cat}
                    className={`${styles['pt-sheet-tab']} ${activeTab === cat ? styles.active : ''}`}
                    onClick={() => onTabChange(cat)}
                    title={cat}
                >
                    {cat}
                </button>
            ))}
        </div>
    );
};

export default ProjectSheetTabs;
