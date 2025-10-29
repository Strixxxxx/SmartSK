import React from 'react';
import './PdfPreviewModal.css';

interface PdfPreviewModalProps {
    fileUrl: string;
    fileName: string;
    onClose: () => void;
}

const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ fileUrl, fileName, onClose }) => {
    return (
        <div className="pdf-modal-overlay" onClick={onClose}>
            <div className="pdf-modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="pdf-modal-header">
                    <h3 className="pdf-modal-title">{fileName}</h3>
                    <button className="pdf-modal-close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="pdf-modal-body">
                    <iframe className="pdf-modal-iframe" src={fileUrl} title={fileName}></iframe>
                </div>
            </div>
        </div>
    );
};

export default PdfPreviewModal;