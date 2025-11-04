import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './CommentModal.css';
import api from '../../backend connection/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { Comment as CommentType } from '../../types/PostTypes';
import AliasModal from './AliasModal';

// --- Helper Components ---

const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZone: 'UTC'
    });
};

interface CommentFormProps {
    postID: number;
    parentCommentID?: number | null;
    isAuthenticated: boolean;
    onCommentPosted: () => void;
    isReplyForm?: boolean;
}

const CommentForm: React.FC<CommentFormProps> = ({ postID, parentCommentID = null, isAuthenticated, onCommentPosted, isReplyForm = false }) => {
    const { user } = useAuth();
    const [text, setText] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(!isAuthenticated);
    const [submitting, setSubmitting] = useState(false);
    const [isAliasModalOpen, setIsAliasModalOpen] = useState(false);

    const submitComment = async (aliasOverride?: string) => {
        if (!text.trim()) return;
        setSubmitting(true);
        try {
            const payload = {
                commentText: text,
                isAnonymous: !isAuthenticated,
                alias: !isAuthenticated ? (aliasOverride || 'Anonymous') : null,
                userID: isAuthenticated ? user?.id : null,
                parentCommentID,
            };
            await api.post(`/api/posts/${postID}/comments`, payload);
            setText('');
            onCommentPosted();
        } catch (err) {
            alert('Failed to post comment.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAuthenticated && !isAnonymous) {
            setIsAliasModalOpen(true);
        } else {
            submitComment();
        }
    };

    const handleAliasSubmit = (alias: string) => {
        submitComment(alias);
        setIsAliasModalOpen(false);
    };

    return (
        <>
            <form onSubmit={handleSubmit} className={`comment-form ${isReplyForm ? 'reply-form' : ''}`}>
                <textarea
                    className="comment-textarea"
                    placeholder={isAuthenticated ? `Commenting as ${user?.fullName}...` : 'Write a comment...'}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required
                />
                <div className="comment-form-options">
                    {!isAuthenticated && (
                        <label className="anonymous-checkbox">
                            <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} />
                            Post as anonymous
                        </label>
                    )}
                    <div className="comment-submit-wrapper">
                        <button type="submit" className="comment-submit-btn" disabled={submitting || !text.trim()}>
                            {submitting ? 'Posting...' : (isReplyForm ? 'Post Reply' : 'Post Comment')}
                        </button>
                    </div>
                </div>
            </form>
            {isAliasModalOpen && (
                <AliasModal onClose={() => setIsAliasModalOpen(false)} onSubmit={handleAliasSubmit} />
            )}
        </>
    );
};

interface CommentProps {
    comment: CommentType;
    postID: number;
    isAuthenticated: boolean;
    onCommentPosted: () => void;
    depth: number;
}

const Comment: React.FC<CommentProps> = ({ comment, postID, isAuthenticated, onCommentPosted, depth }) => {
    const { user } = useAuth();
    const [isReplying, setIsReplying] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(comment.commentText);

    const authorName = comment.isAnonymous ? (comment.alias || 'Anonymous') : comment.fullName;
    const initial = authorName ? authorName.charAt(0) : '?';
    const isUserAuthor = isAuthenticated && user?.id === comment.userID;

    const handleReplySuccess = () => {
        setIsReplying(false);
        onCommentPosted();
    }

    const handleUpdate = async () => {
        if (editText.trim() === comment.commentText) {
            setIsEditing(false);
            return;
        }
        try {
            await api.put(`/api/comments/${comment.commentID}`, { commentText: editText });
            setIsEditing(false);
            onCommentPosted(); // Refetch all comments to show the update
        } catch (error) {
            alert('Failed to update comment.');
        }
    };

    return (
        <div className="comment-item">
            <div className={`comment-avatar ${comment.isAnonymous ? 'anonymous' : ''}`}>
                {initial}
            </div>
            <div className="comment-content">
                <div className="comment-header">
                    <span className="comment-author">{authorName}</span>
                    <span className="comment-timestamp">{formatTimestamp(comment.createdAt)}</span>
                </div>

                {!isEditing ? (
                    <p className="comment-text">{comment.commentText}</p>
                ) : (
                    <div className="edit-form">
                        <textarea 
                            className="comment-textarea edit-textarea"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                        />
                    </div>
                )}

                <div className="comment-actions">
                    {depth < 2 && (
                         <button className="reply-btn" onClick={() => setIsReplying(!isReplying)}>
                            {isReplying ? 'Cancel' : 'Reply'}
                        </button>
                    )}
                    {isUserAuthor && !isEditing && (
                        <button className="reply-btn" onClick={() => setIsEditing(true)}>Edit</button>
                    )}
                    {isEditing && (
                        <>
                            <button className="reply-btn" onClick={handleUpdate}>Save</button>
                            <button className="reply-btn cancel-btn" onClick={() => setIsEditing(false)}>Cancel</button>
                        </>
                    )}
                </div>

                {isReplying && (
                    <CommentForm
                        postID={postID}
                        parentCommentID={comment.commentID}
                        isAuthenticated={isAuthenticated}
                        onCommentPosted={handleReplySuccess}
                        isReplyForm={true}
                    />
                )}

                {comment.replies && comment.replies.length > 0 && (
                    <div className="replies-container">
                        {comment.replies.map(reply => (
                            <Comment 
                                key={reply.commentID} 
                                comment={reply} 
                                postID={postID} 
                                isAuthenticated={isAuthenticated} 
                                onCommentPosted={onCommentPosted} 
                                depth={depth + 1}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Main Modal Component ---

interface CommentModalProps {
    postID: number | null;
    show: boolean;
    onClose: () => void;
    onCommentPosted: (postID: number) => void;
    isAuthenticated: boolean;
}

const CommentModal: React.FC<CommentModalProps> = ({ postID, show, onClose, onCommentPosted, isAuthenticated }) => {
    const [comments, setComments] = useState<CommentType[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchComments = useCallback(async () => {
        if (!postID) return;
        setLoading(true);
        try {
            const response = await api.get(`/api/posts/${postID}/comments`);
            setComments(response.data);
        } catch (err) {
            setError('Failed to load comments.');
        } finally {
            setLoading(false);
        }
    }, [postID]);

    useEffect(() => {
        if (show && postID) {
            fetchComments();
        }
    }, [show, postID, fetchComments]);

    const handleCommentPosted = () => {
        if(postID) onCommentPosted(postID);
        fetchComments();
    };

    const nestedComments = useMemo(() => {
        const commentMap: Record<number, CommentType & { replies: CommentType[] }> = {};
        const rootComments: CommentType[] = [];
        comments.forEach(comment => {
            commentMap[comment.commentID] = { ...comment, replies: [] };
        });
        comments.forEach(comment => {
            if (comment.parentCommentID && commentMap[comment.parentCommentID]) {
                commentMap[comment.parentCommentID].replies.push(commentMap[comment.commentID]);
            } else {
                rootComments.push(commentMap[comment.commentID]);
            }
        });
        return rootComments;
    }, [comments]);

    if (!show || !postID) {
        return null;
    }

    return (
        <div className="comment-modal-overlay" onClick={onClose}>
            <div className="comment-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="comment-modal-header">
                    <h2>Comments</h2>
                    <button className="comment-modal-close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="comment-modal-body">
                    {loading && <div className="loading-comments">Loading...</div>}
                    {error && <div className="no-comments">{error}</div>}
                    {!loading && !error && comments.length === 0 && (
                        <div className="no-comments">Be the first to comment!</div>
                    )}
                    {!loading && nestedComments.length > 0 && (
                        <div className="comment-list">
                            {nestedComments.map(comment => (
                                <Comment 
                                    key={comment.commentID} 
                                    comment={comment} 
                                    postID={postID} 
                                    isAuthenticated={isAuthenticated} 
                                    onCommentPosted={handleCommentPosted} 
                                    depth={0}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="comment-form-container">
                    <CommentForm 
                        postID={postID}
                        isAuthenticated={isAuthenticated}
                        onCommentPosted={handleCommentPosted}
                    />
                </div>
            </div>
        </div>
    );
};

export default CommentModal;
