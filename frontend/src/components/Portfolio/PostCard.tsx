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

const PostCard: React.FC<PostCardProps> = ({ post, onPostClick }) => {
    const { attachments, title, author, description } = post;
    const imageAttachments = attachments.filter(att => att.fileType.startsWith('image'));
    const visibleImages = imageAttachments.slice(0, 4);
    const remainingCount = imageAttachments.length - 4;

    const renderMedia = (attachment: Attachment, isOverlay: boolean = false) => {
        const media = attachment.fileType.startsWith('image') 
            ? <img src={attachment.filePath} alt={title} className="post-image" />
            : <video src={attachment.filePath} controls className="post-image" />;

        return (
            <div className="post-image-wrapper">
                {media}
                {isOverlay && <div className="more-images-overlay">+{remainingCount}</div>}
            </div>
        );
    };

    return (
        <div className="post-card" onClick={() => onPostClick(post)}>
            <h3 className="post-title">{title}</h3>
            <p className="post-author">By: {author}</p>
            <p className="post-description">{description}</p>
            
            {visibleImages.length > 0 && (
                <div className="post-images-grid">
                    {visibleImages.map((attachment, index) => (
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
