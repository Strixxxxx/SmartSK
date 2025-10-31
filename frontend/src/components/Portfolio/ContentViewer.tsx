import React, { useState, useEffect, useCallback } from 'react';
import './ContentViewer.css';
import api from '../../backend connection/axiosConfig';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { Post, TaggedProject, Attachment } from '../../types/PostTypes';

// --- TYPE DEFINITIONS ---

interface ProjectDetails extends TaggedProject {
    description: string;
    author: string;
    attachments?: Attachment[]; // Projects can also have attachments
}

type ViewMode = 'public_post' | 'secure_attachments' | 'project_details';

// --- HELPER MODALS ---

const ProjectListModal: React.FC<{
    projects: TaggedProject[];
    onSelect: (projectId: number) => void;
    onClose: () => void;
}> = ({ projects, onSelect, onClose }) => {
    const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

    const handleNext = () => {
        if (selectedProjectId !== null) {
            onSelect(selectedProjectId);
        }
    };

    return (
        <div className="secondary-modal-overlay" onClick={onClose}>
            <div className="secondary-modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Tagged Projects</h2>
                <div className="radio-group">
                    {projects.map(p => (
                        <div key={p.projectID} className="radio-option">
                            <input 
                                type="radio" 
                                id={`proj-${p.projectID}`} 
                                name="project-selection" 
                                value={p.projectID} 
                                checked={selectedProjectId === p.projectID}
                                onChange={() => setSelectedProjectId(p.projectID)}
                            />
                            <label htmlFor={`proj-${p.projectID}`}>{p.title}</label>
                        </div>
                    ))}
                </div>
                <div className="form-actions">
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="button" onClick={handleNext} disabled={selectedProjectId === null}>Next</button>
                </div>
            </div>
        </div>
    );
};

const RelatedPostsModal: React.FC<{
    posts: { postID: number; title: string }[];
    onSelect: (postId: number) => void;
    onClose: () => void;
}> = ({ posts, onSelect, onClose }) => {
    const [selectedPostId, setSelectedPostId] = useState<number | null>(null);

    const handleNext = () => {
        if (selectedPostId !== null) {
            onSelect(selectedPostId);
        }
    };

    const handleRadioChange = (postId: number) => {
        setSelectedPostId(postId);
    };

    return (
        <div className="secondary-modal-overlay" onClick={onClose}>
            <div className="secondary-modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Related Posts</h2>
                <div className="radio-group">
                    {posts.map(p => {
                        // Ensure postID is a number, not an array
                        const postId = Array.isArray(p.postID) ? p.postID[0] : p.postID;
                        return (
                            <div key={postId} className="radio-option">
                                <input
                                    type="radio"
                                    id={`post-${postId}`}
                                    name="post-selection"
                                    checked={selectedPostId === postId}
                                    onChange={() => handleRadioChange(postId)}
                                />
                                <label htmlFor={`post-${postId}`}>{p.title}</label>
                            </div>
                        );
                    })}
                </div>
                <div className="form-actions">
                    <button type="button" onClick={onClose}>Cancel</button>
                    <button type="button" onClick={handleNext} disabled={selectedPostId === null}>Next</button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

interface ContentViewerProps {
    post: Post | null;
    show: boolean;
    onClose: () => void;
    onPostChange: (postId: number) => void;
    isAuthenticated: boolean;
}

const ContentViewer: React.FC<ContentViewerProps> = ({ post, show, onClose, onPostChange, isAuthenticated }) => {
    const [currentPost, setCurrentPost] = useState<Post | null>(post);
    const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
    const [relatedPosts, setRelatedPosts] = useState<{ postID: number; title: string }[]>([]);
    const [viewMode, setViewMode] = useState<ViewMode>('public_post');
    const [currentAttachmentIndex, setCurrentAttachmentIndex] = useState(0);
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
    const [showProjectList, setShowProjectList] = useState(false);
    const [showRelatedPosts, setShowRelatedPosts] = useState(false);

    useEffect(() => {
        if (post) {
            setCurrentPost(post);
            setViewMode('public_post');
            setProjectDetails(null);
            setRelatedPosts([]);
            setCurrentAttachmentIndex(0);
        }
    }, [post]);

    const publicAttachments = currentPost?.publicAttachments || [];
    const secureAttachments = currentPost?.secureAttachments || [];
    
    let attachmentsToDisplay: Attachment[] = [];
    if (viewMode === 'public_post') {
        attachmentsToDisplay = publicAttachments;
    } else if (viewMode === 'secure_attachments') {
        attachmentsToDisplay = secureAttachments;
    } else if (viewMode === 'project_details' && projectDetails?.attachments) {
        attachmentsToDisplay = projectDetails.attachments;
    }

    const goToNextAttachment = useCallback(() => {
        if (attachmentsToDisplay.length > 1) {
            setCurrentAttachmentIndex((prev) => (prev + 1) % attachmentsToDisplay.length);
        }
    }, [attachmentsToDisplay.length]);

    const goToPreviousAttachment = useCallback(() => {
        if (attachmentsToDisplay.length > 1) {
            setCurrentAttachmentIndex((prev) => (prev - 1 + attachmentsToDisplay.length) % attachmentsToDisplay.length);
        }
    }, [attachmentsToDisplay.length]);

    useEffect(() => {
        if (show) {
            document.body.style.overflow = 'hidden';
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'ArrowRight') goToNextAttachment();
                if (e.key === 'ArrowLeft') goToPreviousAttachment();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
                document.body.style.overflow = 'auto';
            };
        }
    }, [show, onClose, goToNextAttachment, goToPreviousAttachment]);

    if (!show || !currentPost) {
        return null;
    }

    const handleSelectProject = async (projectId: number) => {
        try {
            const endpoint = isAuthenticated
                ? `/api/tagged-projects/${projectId}`
                : `/api/public-tagged-projects/${projectId}`;

            const response = await api.get(endpoint);

            if (response.data.success) {
                setProjectDetails(response.data.project);
                setViewMode('project_details');
                setShowProjectList(false);
                setCurrentAttachmentIndex(0);
            }
        } catch (error) {
            // console.error("Failed to fetch project details", error);
        }
    };

    const handleFetchRelatedPosts = async () => {
        if (!projectDetails) return;
    
        const endpoint = isAuthenticated 
            ? `/api/tagged-projects/${projectDetails.projectID}/related-posts?currentPostId=${currentPost?.postID}`
            : `/api/public-tagged-projects/${projectDetails.projectID}/related-posts`;
    
        try {
            const response = await api.get(endpoint);
            if (response.data.success) {
                // Sanitize the data to ensure postID is always a number
                const sanitizedPosts = response.data.relatedPosts.map((p: any) => ({
                    postID: Array.isArray(p.postID) ? p.postID[0] : Number(p.postID),
                    title: p.title
                }));

                setRelatedPosts(sanitizedPosts);
                setShowRelatedPosts(true);
            }
        } catch (error) {
            // console.error("Failed to fetch related posts", error);
        }
    };
    
    const handleSelectRelatedPost = (postId: number) => {
        if (typeof postId === 'number' && !isNaN(postId) && postId > 0) {
            onPostChange(postId);
            setShowRelatedPosts(false);
        }
    };

    const toggleDescription = () => {
        setIsDescriptionExpanded(!isDescriptionExpanded);
    };

    const renderMedia = (attachment: Attachment) => {
        const isVideo = attachment.fileType.startsWith('video');
        const isPdf = attachment.fileType === 'application/pdf';
        const isDoc = attachment.fileType.startsWith('application/msword') || attachment.fileType.startsWith('application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        if (isPdf) {
            return <iframe src={attachment.filePath} title="PDF Viewer" width="100%" height="100%"></iframe>;
        }
        if (isVideo) {
            return (
                <div className="post-modal-video-wrapper">
                    <video src={attachment.filePath} className="post-modal-video-bg" autoPlay muted loop playsInline />
                    <video src={attachment.filePath} className="post-modal-video-main" controls autoPlay playsInline />
                </div>
            );
        }
        if (isDoc) {
            return (
                <div className="placeholder-media">
                    <a href={attachment.filePath} download>
                        <FileDownloadIcon style={{ fontSize: 60, color: 'gray' }} />
                    </a>
                </div>
            );
        }
        return <img src={attachment.filePath} alt={currentPost.title} />;
    };

    const renderActionButtons = () => (
        <div className="action-buttons">
            {viewMode === 'public_post' && (
                <>
                    {currentPost.taggedProjects && currentPost.taggedProjects.length > 0 && (
                        <button onClick={() => setShowProjectList(true)}>Tagged Projects</button>
                    )}
                    {secureAttachments.length > 0 && (
                        <button onClick={() => setViewMode('secure_attachments')}>SK Full Disclosure Documents</button>
                    )}
                </>
            )}
            {viewMode === 'secure_attachments' && (
                <button onClick={() => setViewMode('public_post')}>View Public Content</button>
            )}
            {viewMode === 'project_details' && (
                 <>
                    <button onClick={handleFetchRelatedPosts}>Related Posts</button>
                     <button onClick={() => setViewMode('public_post')}>Back to Post</button>
                 </>
            )}
        </div>
    );

    const { author, description, title } = currentPost;

    return (
        <>
            <div className="post-modal-overlay" onClick={onClose}>
                <div className="post-modal-content" onClick={(e) => e.stopPropagation()}>
                    <button className="post-modal-close-btn" onClick={onClose} aria-label="Close modal">&times;</button>
                    <div className="post-modal-body">
                        <div className="post-modal-image-section">
                            {attachmentsToDisplay.length > 0 ? renderMedia(attachmentsToDisplay[currentAttachmentIndex]) : <div className="placeholder-media">No attachments</div>}
                            {attachmentsToDisplay.length > 1 && (
                                <>
                                    <button className="post-modal-nav left" onClick={goToPreviousAttachment} aria-label="Previous image">&#10094;</button>
                                    <button className="post-modal-nav right" onClick={goToNextAttachment} aria-label="Next image">&#10095;</button>
                                    <div className="image-counter">{`${currentAttachmentIndex + 1} / ${attachmentsToDisplay.length}`}</div>
                                </>
                            )}
                        </div>

                        {/* Desktop Info Section */}
                        <div className="post-modal-info-section">
                            <div className="post-modal-header-section">
                                <h2 className="post-modal-title">{viewMode === 'project_details' && projectDetails ? projectDetails.title : title}</h2>
                                <p className="post-modal-author">{viewMode === 'project_details' && projectDetails ? `By: ${projectDetails.author}` : `By: ${author}`}</p>
                            </div>
                            <div className="post-modal-description-section">
                                <p className="post-modal-description-text">{viewMode === 'project_details' && projectDetails ? projectDetails.description : description}</p>
                                {renderActionButtons()}
                            </div>
                            {attachmentsToDisplay.length > 1 && (
                                <div className="thumbnail-strip">
                                    {attachmentsToDisplay.map((att, index) => (
                                        <img
                                            key={att.attachmentID}
                                            src={att.filePath}
                                            alt={`thumbnail-${index}`}
                                            className={index === currentAttachmentIndex ? 'active' : ''}
                                            onClick={() => setCurrentAttachmentIndex(index)}
                                        />
                                    ))}
                               </div>
                            )}
                        </div>
                    </div>
                     {/* Mobile Bottom Overlay */}
                     <div className={`post-modal-bottom-overlay ${isDescriptionExpanded ? 'expanded' : ''}`}>
                        <div className="post-modal-bottom-content">
                            <div className="post-modal-header-compact">
                                <h2 className="post-modal-title-compact">{viewMode === 'project_details' && projectDetails ? projectDetails.title : title}</h2>
                                <p className="post-modal-author-compact">{viewMode === 'project_details' && projectDetails ? `By: ${projectDetails.author}` : `By: ${author}`}</p>
                            </div>
                            <div className="post-modal-description-compact">
                                <p className="post-modal-description-text-compact">
                                    {viewMode === 'project_details' && projectDetails ? projectDetails.description : description}
                                </p>
                                {renderActionButtons()}
                            </div>
                            <button className="post-modal-expand-btn" onClick={toggleDescription} aria-label={isDescriptionExpanded ? "Collapse" : "Expand"}>
                                {isDescriptionExpanded ? '▼' : '▲'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {showProjectList && currentPost.taggedProjects && (
                <ProjectListModal
                    projects={currentPost.taggedProjects}
                    onSelect={handleSelectProject}
                    onClose={() => setShowProjectList(false)}
                />
            )}
            {showRelatedPosts && (
                <RelatedPostsModal
                    posts={relatedPosts}
                    onSelect={handleSelectRelatedPost}
                    onClose={() => setShowRelatedPosts(false)}
                />
            )}
        </>
    );
};
export default ContentViewer;