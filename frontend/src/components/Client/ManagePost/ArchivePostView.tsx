import React from 'react';
import api from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import './ActionViews.css';

interface ArchivePostViewProps {
    postId: number;
    onClose: () => void;
    onArchived: () => void; // Callback to refresh list
}

const ArchivePostView: React.FC<ArchivePostViewProps> = ({ postId, onClose, onArchived }) => {

    const handleArchive = async () => {
        try {
            const response = await api.put(`/api/manage-post/archive/${postId}`);
            if (response.data.success) {
                toast.success('Post archived successfully!');
                onArchived();
                onClose();
            } else {
                toast.error(response.data.message || 'Failed to archive post.');
            }
        } catch (err) {
            toast.error('An error occurred while archiving the post.');
            console.error(err);
        }
    };

    return (
        <div className="action-view-container">
            <h4>Archive Post</h4>
            <p>Archiving this post will remove it from the public feed and your main dashboard. You can restore it later from the "View Archived Posts" section.</p>
            <div className="action-buttons">
                <button onClick={handleArchive} className="btn-archive">Confirm Archive</button>
                <button onClick={onClose} className="btn-cancel">Cancel</button>
            </div>
        </div>
    );
};

export default ArchivePostView;
