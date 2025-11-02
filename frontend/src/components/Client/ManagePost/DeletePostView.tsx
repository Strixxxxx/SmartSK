import React, { useState } from 'react';
import api from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify';
import './ActionViews.css';

interface DeletePostViewProps {
    postId: number;
    postReference: string; // Accept postReference as a prop
    onClose: () => void;
    onDeleted: () => void;
}

const DeletePostView: React.FC<DeletePostViewProps> = ({ postId, postReference, onClose, onDeleted }) => {
    const [confirmInput, setConfirmInput] = useState('');

    const handleDelete = async () => {
        if (confirmInput !== postReference) {
            toast.error('The entered reference number does not match.');
            return;
        }
        try {
            const response = await api.delete(`/api/manage-post/${postId}`);
            if (response.data.success) {
                toast.success('Post deleted permanently!');
                onDeleted();
                onClose();
            } else {
                toast.error(response.data.message || 'Failed to delete post.');
            }
        } catch (err) {
            toast.error('An error occurred while deleting the post.');
            console.error(err);
        }
    };

    return (
        <div className="action-view-container">
            <h4>Delete Post</h4>
            <p className="warning-text">This action is irreversible. To confirm deletion, please type the post's reference number in the box below.</p>
            
            <div className="reference-display">
                Reference Number: <strong>{postReference}</strong>
            </div>

            <div className="form-group">
                <input 
                    type="text"
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    placeholder="Type reference number here..."
                    className="confirm-input"
                />
            </div>

            <div className="action-buttons">
                <button onClick={handleDelete} className="btn-delete" disabled={confirmInput !== postReference}>
                    Confirm Deletion
                </button>
                <button onClick={onClose} className="btn-cancel">Cancel</button>
            </div>
        </div>
    );
};

export default DeletePostView;
