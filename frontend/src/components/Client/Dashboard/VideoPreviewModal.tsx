import React from 'react';
import './VideoPreviewModal.css';

interface VideoPreviewModalProps {
    videoUrl: string;
    onClose: () => void;
}

const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({ videoUrl, onClose }) => {
    return (
        <div className="video-modal-overlay" onClick={onClose}>
            <div className="video-modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="video-modal-close-btn" onClick={onClose}>&times;</button>
                <video src={videoUrl} controls autoPlay />
            </div>
        </div>
    );
};

export default VideoPreviewModal;
