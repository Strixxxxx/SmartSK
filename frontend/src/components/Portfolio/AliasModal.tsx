import React, { useState } from 'react';
import './AliasModal.css';

interface AliasModalProps {
    onClose: () => void;
    onSubmit: (alias: string) => void;
}

const AliasModal: React.FC<AliasModalProps> = ({ onClose, onSubmit }) => {
    const [alias, setAlias] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(alias.trim() || 'User'); // Default to 'User' if empty
        onClose();
    };

    return (
        <div className="alias-modal-overlay" onClick={onClose}>
            <div className="alias-modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Enter Your Alias</h2>
                <p>Please provide an alias to post your comment.</p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        className="alias-input-field"
                        placeholder="Enter your alias..."
                        value={alias}
                        onChange={(e) => setAlias(e.target.value)}
                        required
                        autoFocus
                    />
                    <div className="alias-modal-actions">
                        <button type="button" onClick={onClose}>Cancel</button>
                        <button type="submit">Submit</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AliasModal;
