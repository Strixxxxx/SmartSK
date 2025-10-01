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
    const { attachments, title, author, description } = post;
    const visibleAttachments = attachments.slice(0, 4);
    const remainingCount = attachments.length - 4;

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
        </div>
    );
};

export default PostCard;