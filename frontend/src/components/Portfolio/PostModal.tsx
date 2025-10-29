import React, { useState, useEffect } from 'react';
import './PostModal.css';
import api from '../../backend connection/axiosConfig';
import TagProjectsModal from '../Client/Dashboard/TagProjects';

interface Attachment {
    attachmentID: number;
    fileType: string;
    filePath: string;
}

interface TaggedProject {
    projectID: number;
    title: string;
}

interface Post {
    postID: number;
    title: string;
    description: string;
    author: string;
    attachments: Attachment[];
    taggedProjects?: TaggedProject[];
}

interface ProjectDetails extends TaggedProject {
    description: string;
    fileUrl?: string;
    fileName?: string;
}

interface PostModalProps {
    post: Post | null;
    show: boolean;
    onClose: () => void;
}

const PostModal: React.FC<PostModalProps> = ({ post, show, onClose }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [isTagModalOpen, setIsTagModalOpen] = useState(false);
    const [selectedProjectDetails, setSelectedProjectDetails] = useState<ProjectDetails | null>(null);

    useEffect(() => {
        if (show) {
            document.body.style.overflow = 'hidden';
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'ArrowRight') goToNextImage();
                if (e.key === 'ArrowLeft') goToPreviousImage();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = 'auto';
            };
        }
    }, [show, post, onClose]);

    useEffect(() => {
        setCurrentImageIndex(0);
        setIsDescriptionExpanded(false);
    }, [post]);

    if (!show || !post) {
        return null;
    }

    const { attachments, author, description, title, taggedProjects } = post;

    const handleTaggedProjectClick = async (projectID: number) => {
        try {
            const response = await api.get(`/api/projects/details/${projectID}`);
            if (response.data.success) {
                setSelectedProjectDetails(response.data.project);
                setIsTagModalOpen(true);
            }
        } catch (error) {
            console.error("Failed to fetch project details", error);
        }
    };

    const goToNextImage = () => {
        setCurrentImageIndex((prevIndex) => (prevIndex + 1) % attachments.length);
    };

    const goToPreviousImage = () => {
        setCurrentImageIndex((prevIndex) => (prevIndex - 1 + attachments.length) % attachments.length);
    };

    const toggleDescription = () => {
        setIsDescriptionExpanded(!isDescriptionExpanded);
    };

    const renderMedia = (attachment: Attachment) => {
        if (attachment.fileType.startsWith('image')) {
            return <img src={attachment.filePath} alt={title} />;
        }
        if (attachment.fileType.startsWith('video')) {
            return (
                <div className="post-modal-video-wrapper">
                    <video src={attachment.filePath} className="post-modal-video-bg" autoPlay muted loop playsInline />
                    <video src={attachment.filePath} className="post-modal-video-main" controls autoPlay playsInline />
                </div>
            );
        }
        return null;
    };

    const renderTaggedProjects = () => (
        <>
            {taggedProjects && taggedProjects.length > 0 && (
                <div className="tagged-projects-section">
                    <h4>Related Projects</h4>
                    <ul>
                        {taggedProjects.map(p => (
                            <li key={p.projectID}>
                                <a href="#" onClick={(e) => { e.preventDefault(); handleTaggedProjectClick(p.projectID); }}>
                                    {p.title}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    );

    return (
        <>
            <div className="post-modal-overlay" onClick={onClose}>
                <div className="post-modal-content" onClick={(e) => e.stopPropagation()}>
                    
                    <button className="post-modal-close-btn" onClick={onClose} aria-label="Close modal">&times;</button>

                    <div className="post-modal-body">
                        <div className="post-modal-image-section">
                            {attachments.length > 0 && (
                                <>
                                    {renderMedia(attachments[currentImageIndex])}
                                    {attachments.length > 1 && (
                                        <>
                                            <button 
                                                className="post-modal-nav left" 
                                                onClick={goToPreviousImage}
                                                aria-label="Previous image"
                                            >
                                                &#10094;
                                            </button>
                                            <button 
                                                className="post-modal-nav right" 
                                                onClick={goToNextImage}
                                                aria-label="Next image"
                                            >
                                                &#10095;
                                            </button>
                                            <div className="image-counter">{`${currentImageIndex + 1} / ${attachments.length}`}</div>
                                        </>
                                    )}

                                    <div className={`post-modal-bottom-overlay ${isDescriptionExpanded ? 'expanded' : ''}`}>
                                        <div className="post-modal-bottom-content">
                                            <div className="post-modal-header-compact">
                                                <h2 className="post-modal-title-compact">{title}</h2>
                                                <p className="post-modal-author-compact">By: {author}</p>
                                            </div>
                                            
                                            <div className="post-modal-description-compact">
                                                <p className="post-modal-description-text-compact">
                                                    {description}
                                                </p>
                                                {renderTaggedProjects()}
                                            </div>

                                            <button 
                                                className="post-modal-expand-btn"
                                                onClick={toggleDescription}
                                                aria-label={isDescriptionExpanded ? "Collapse" : "Expand"}
                                            >
                                                {isDescriptionExpanded ? '▼' : '▲'}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="post-modal-info-section">
                            <div className="post-modal-header-section">
                                <h2 className="post-modal-title">{title}</h2>
                                <p className="post-modal-author">By: {author}</p>
                            </div>

                            <div className="post-modal-description-section">
                                <p className="post-modal-description-text">{description}</p>
                                {renderTaggedProjects()}
                            </div>

                            {attachments.length > 1 && (
                                <div className="thumbnail-strip">
                                    {attachments.map((att, index) => (
                                        <img
                                            key={att.attachmentID}
                                            src={att.filePath}
                                            alt={`thumbnail-${index}`}
                                            className={index === currentImageIndex ? 'active' : ''}
                                            onClick={() => setCurrentImageIndex(index)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <TagProjectsModal 
                isOpen={isTagModalOpen} 
                onClose={() => setIsTagModalOpen(false)} 
                project={selectedProjectDetails} 
                sourcePost={{ postID: post.postID, title: post.title }}
            />
        </>
    );
};

export default PostModal;