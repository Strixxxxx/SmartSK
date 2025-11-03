import React from 'react';
import ArchivedPostList from './ArchivedPostList';
import './ManagePostModal.css';

interface ManagePostModalProps {
    onClose: () => void;
}

const ManagePostModal: React.FC<ManagePostModalProps> = ({ onClose }) => {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content manage-post-modal" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="modal-close-btn">&times;</button>
                <div className="modal-body-content">
                    <ArchivedPostList />
                </div>
            </div>
        </div>
    );
};

export default ManagePostModal;
