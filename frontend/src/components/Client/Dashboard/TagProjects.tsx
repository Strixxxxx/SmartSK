import React from 'react';
import './TagProjects.css';

interface Project {
    projectID: number;
    title: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
}

interface TagProjectsModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
    sourcePost: { postID: number; title: string; };
}

const TagProjectsModal: React.FC<TagProjectsModalProps> = ({ isOpen, onClose, project, sourcePost }) => {
    if (!isOpen || !project) {
        return null;
    }

    return (
        <div className="tag-projects-modal-overlay" onClick={onClose}>
            <div className="tag-projects-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="tag-projects-modal-header">
                    <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }}>
                        &larr; Back to post: {sourcePost.title}
                    </a>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="tag-projects-modal-body">
                    <h3>{project.title}</h3>
                    <p>{project.description}</p>
                    {project.fileUrl && (
                        <div className="project-attachment">
                            <h4>Project Document</h4>
                            <a href={project.fileUrl} target="_blank" rel="noopener noreferrer">
                                {project.fileName || 'Download Document'}
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TagProjectsModal;