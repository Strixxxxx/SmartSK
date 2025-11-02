
import React from 'react';
import './AttachmentPreviewModal.css';

interface Attachment {
    attachmentID: number;
    filePath: string;
    fileType: string;
    isPublic: boolean;
    sasUrl?: string;
}

interface AttachmentPreviewModalProps {
    attachment: Attachment | null;
    onClose: () => void;
}

const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({ attachment, onClose }) => {
    if (!attachment || !attachment.sasUrl) {
        return null;
    }

    const renderContent = () => {
        if (attachment.fileType.startsWith('image')) {
            return <img src={attachment.sasUrl} alt="Attachment Preview" />;
        }
        if (attachment.fileType.startsWith('video')) {
            return <video src={attachment.sasUrl} controls autoPlay />;
        }
        if (attachment.fileType === 'application/pdf') {
            return <iframe src={attachment.sasUrl} title="PDF Preview" />;
        }
        // Fallback for other types, though this modal is not intended for them
        return <p>Cannot preview this file type.</p>;
    };

    return (
        <div className="preview-modal-overlay" onClick={onClose}>
            <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="preview-modal-close-btn" onClick={onClose}>&times;</button>
                <div className="preview-modal-body">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default AttachmentPreviewModal;
