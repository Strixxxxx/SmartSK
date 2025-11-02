import React, { useState } from 'react';
import ArchivePostView from './ArchivePostView';
import DeletePostView from './DeletePostView';
import EditPostForm from './EditPostForm';
import './PostManagerModal.css';

interface PostManagerModalProps {
    postId: number;
    postReference: string;
    onClose: () => void;
    onBackToList: () => void;
}

const PostManagerModal: React.FC<PostManagerModalProps> = ({ postId, postReference, onClose, onBackToList }) => {
    const [activeSection, setActiveSection] = useState<'edit' | 'archive' | 'delete'>('edit');

    const handleActionComplete = () => {
        // After an action (archive, delete, edit), go back to the list view
        onBackToList();
    };

    const renderSection = () => {
        switch (activeSection) {
            case 'edit':
                return <EditPostForm postId={postId} onClose={onClose} onUpdated={handleActionComplete} />;
            case 'archive':
                return <ArchivePostView postId={postId} onClose={onClose} onArchived={handleActionComplete} />;
            case 'delete':
                return <DeletePostView postId={postId} postReference={postReference} onClose={onClose} onDeleted={handleActionComplete} />;
            default:
                return null;
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content post-manager-modal" onClick={(e) => e.stopPropagation()}>
                <div className="manager-container">
                    <div className="manager-sidebar">
                        <div className="sidebar-header">
                            <h3>Manage Post</h3>
                            <span className="post-id-display">{postReference}</span>
                        </div>
                        <ul>
                            <li className={activeSection === 'edit' ? 'active' : ''} onClick={() => setActiveSection('edit')}>
                                Edit Post
                            </li>
                            <li className={activeSection === 'archive' ? 'active' : ''} onClick={() => setActiveSection('archive')}>
                                Archive Post
                            </li>
                            <li className={activeSection === 'delete' ? 'active' : ''} onClick={() => setActiveSection('delete')}>
                                Delete Post
                            </li>
                        </ul>
                        <div className="sidebar-footer">
                            <button onClick={onBackToList} className="close-manager-btn">Back to List</button>
                        </div>
                    </div>
                    <div className="manager-content">
                        <button onClick={onClose} className="close-modal-btn">&times;</button>
                        {renderSection()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PostManagerModal;
