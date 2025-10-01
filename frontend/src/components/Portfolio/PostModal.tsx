import React, { useState, useEffect } from 'react';
import './PostModal.css';

interface Attachment {
    attachmentID: number;
    fileType: string;
    filePath: string;
}

interface Post {
    postID: number;
    title: string;
    description: string;
    author: string;
    attachments: Attachment[];
}

interface PostModalProps {
    post: Post | null;
    show: boolean;
    onClose: () => void;
}

const PostModal: React.FC<PostModalProps> = ({ post, show, onClose }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

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
    }, [show, post]);

    if (!show || !post) {
        return null;
    }

    const { attachments, author, description, title } = post;

    const goToNextImage = () => {
        setCurrentImageIndex((prevIndex) => (prevIndex + 1) % attachments.length);
    };

    const goToPreviousImage = () => {
        setCurrentImageIndex((prevIndex) => (prevIndex - 1 + attachments.length) % attachments.length);
    };

    const renderMedia = (attachment: Attachment) => {
        if (attachment.fileType.startsWith('image')) {
            return <img src={attachment.filePath} alt={title} />;
        }
        return <video src={attachment.filePath} controls />;
    };

    return (
        <div className="post-modal-overlay" onClick={onClose}>
            <div className="post-modal-content" onClick={(e) => e.stopPropagation()}>
                
                <button className="post-modal-close-btn" onClick={onClose}>&times;</button>

                <div className="post-modal-body">
                    <div className="post-modal-image-section">
                        {attachments.length > 0 && (
                            <>
                                {renderMedia(attachments[currentImageIndex])}
                                {attachments.length > 1 && (
                                    <>
                                        <button className="post-modal-nav left" onClick={goToPreviousImage}>&#10094;</button>
                                        <button className="post-modal-nav right" onClick={goToNextImage}>&#10095;</button>
                                        <div className="image-counter">{`${currentImageIndex + 1} / ${attachments.length}`}</div>
                                    </>
                                )}
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
    );
};

export default PostModal;