import React, { useState } from 'react';
import ActivePostSelector from './ActivePostSelector';
import ArchivedPostList from './ArchivedPostList';
import PostManagerModal from './PostManagerModal';
import './ManagePostModal.css';

interface ManagePostModalProps {
    onClose: () => void;
}

interface Post {
    postID: number;
    title: string;
    postReference: string;
    createdAt: string;
}

const ManagePostModal: React.FC<ManagePostModalProps> = ({ onClose }) => {
    const [view, setView] = useState<'main' | 'active' | 'archived' | 'manage'>('main');
    const [selectedPost, setSelectedPost] = useState<Post | null>(null);

    const handlePostSelected = (post: Post) => {
        setSelectedPost(post);
        setView('manage');
    };

    // If the view is 'manage', we render the dedicated PostManagerModal and nothing else from this component.
    if (view === 'manage' && selectedPost) {
        return <PostManagerModal 
                    postId={selectedPost.postID} 
                    postReference={selectedPost.postReference} 
                    onClose={onClose} // This will close the entire modal flow
                    onBackToList={() => setView('active')} // This will go back to the list
                />
    }

    const renderContent = () => {
        switch (view) {
            case 'active':
                return <ActivePostSelector onPostSelect={handlePostSelected} onBack={() => setView('main')} />;
            case 'archived':
                return <ArchivedPostList />;
            default:
                return (
                    <div className="main-selection">
                        <h2>Manage Your Posts</h2>
                        <p>Choose an option to view and manage your active or archived posts.</p>
                        <div className="button-group">
                            <button onClick={() => setView('active')} className="selection-btn">View Active Posts</button>
                            <button onClick={() => setView('archived')} className="selection-btn">View Archived Posts</button>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content manage-post-modal" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="modal-close-btn">&times;</button>
                <div className="modal-body-content">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default ManagePostModal;
