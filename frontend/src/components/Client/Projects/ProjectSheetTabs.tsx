import React from 'react';
import './ProjectTemplate.css';

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

interface ProjectSheetTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

const ProjectSheetTabs: React.FC<ProjectSheetTabsProps> = ({ activeTab, onTabChange }) => {
    return (
        <div className="pt-sheet-tabs">
            {CATEGORIES.map((cat) => (
                <button
                    key={cat}
                    className={`pt-sheet-tab ${activeTab === cat ? 'active' : ''}`}
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
