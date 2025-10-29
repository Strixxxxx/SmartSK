import React from 'react';
import './PostCard.css';

export interface Attachment {
    attachmentID: number;
    fileType: string;
    filePath: string;
}

export interface Post {
    postID: number;
    title: string;
    description: string;
    author: string;
    attachments: Attachment[];
    taggedProjects?: { projectID: number; title: string }[];
}

interface PostCardProps {
    post: Post;
    onPostClick: (post: Post) => void;
}

const PostDescription: React.FC<{ description: string; onShowMore: () => void }> = ({ description, onShowMore }) => {
    const maxLength = 100;

    if (description.length <= maxLength) {
        return <p className="post-description">{description}</p>;
    }

    const truncated = description.substring(0, maxLength) + '...';

    return (
        <p className="post-description">
            {truncated}
            <span 
                className="show-more-link" 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    onShowMore(); 
                }}
            >
                show more...
            </span>
        </p>
    );
};

const PostCard: React.FC<PostCardProps> = ({ post, onPostClick }) => {
    const { attachments, title, author, description, taggedProjects } = post;
    const mediaAttachments = attachments.filter(att => att.fileType.startsWith('image') || att.fileType.startsWith('video'));
    const documentAttachments = attachments.filter(att => !att.fileType.startsWith('image') && !att.fileType.startsWith('video'));

    const visibleAttachments = mediaAttachments.slice(0, 4);
    const remainingCount = mediaAttachments.length - 4;

    const renderMedia = (attachment: Attachment, isOverlay: boolean = false) => {
        const isVideo = attachment.fileType.startsWith('video');
        
        return (
            <div className={`post-image-wrapper ${isVideo ? 'video-wrapper' : ''}`}>
                {isVideo ? (
                    <>
                        <video src={attachment.filePath} className="post-image-background" muted loop playsInline />
                        <video src={attachment.filePath} className="post-image" />
                    </>
                ) : (
                    <img src={attachment.filePath} alt={title} className="post-image" />
                )}
                {isVideo && <div className="play-icon-overlay"><div className="play-icon-shape"></div></div>}
                {isOverlay && <div className="more-images-overlay">+{remainingCount}</div>}
            </div>
        );
    };

    return (
        <div className="post-card" onClick={() => onPostClick(post)}>
            <div className="post-content">
                <h3 className="post-title">{title}</h3>
                <p className="post-author">By: {author}</p>
                <PostDescription description={description} onShowMore={() => onPostClick(post)} />
            </div>
            
            {visibleAttachments.length > 0 && (
                <div className="post-images-grid">
                    {visibleAttachments.map((attachment, index) => (
                        <React.Fragment key={attachment.attachmentID}>
                            {renderMedia(attachment, index === 3 && remainingCount > 0)}
                        </React.Fragment>
                    ))}
                </div>
            )}

            {taggedProjects && taggedProjects.length > 0 && (
                <div className="tagged-projects-section">
                    <h4>Related Projects:</h4>
                    <ul>
                        {taggedProjects.map(p => <li key={p.projectID}>{p.title}</li>)}
                    </ul>
                </div>
            )}

            {documentAttachments.length > 0 && (
                <div className="secure-documents-section">
                    <h4>Secure Documents:</h4>
                    <ul>
                        {documentAttachments.map(doc => (
                            <li key={doc.attachmentID}>
                                <a href={doc.filePath} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                    {doc.filePath.split('/').pop()}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default PostCard;