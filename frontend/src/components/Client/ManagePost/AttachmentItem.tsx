
import React from 'react';
import { FaFilePdf, FaFileVideo, FaFileWord, FaFileImage } from 'react-icons/fa';
import './AttachmentItem.css';

interface Attachment {
    attachmentID: number;
    filePath: string;
    fileType: string;
    isPublic: boolean;
    sasUrl?: string;
}

interface AttachmentItemProps {
    attachment: Attachment;
    onRemove: (id: number, isPublic: boolean) => void;
    onPreview: (attachment: Attachment) => void;
}

const AttachmentItem: React.FC<AttachmentItemProps> = ({ attachment, onRemove, onPreview }) => {
    const getFileIcon = () => {
        if (attachment.fileType.startsWith('image')) return <FaFileImage />;
        if (attachment.fileType.startsWith('video')) return <FaFileVideo />;
        if (attachment.fileType === 'application/pdf') return <FaFilePdf />;
        if (attachment.fileType.includes('word')) return <FaFileWord />;
        return <FaFileImage />; // Default icon
    };

    const handlePreview = () => {
        onPreview(attachment);
    };

    const fileName = attachment.filePath.split('-').slice(2).join('-') || 'attachment';


    return (
        <div className="existing-attachment-item" onClick={handlePreview}>
            <div className="file-icon-container">{getFileIcon()}</div>
            <div className="file-name" title={fileName}>{fileName}</div>
            <div className="attachment-actions">
                <button type="button" className="remove-attachment-btn" onClick={(e) => { e.stopPropagation(); onRemove(attachment.attachmentID, attachment.isPublic); }} title="Remove">
                    &times;
                </button>
            </div>
        </div>
    );
};

export default AttachmentItem;
