import React, { useEffect } from 'react';
import './FlashMessage.css';

interface FlashMessageProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const FlashMessage: React.FC<FlashMessageProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Auto-dismiss after 5 seconds

    return () => {
      clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div className={`flash-message ${type}`}>
      <p>{message}</p>
      <button onClick={onClose} className="close-btn">&times;</button>
    </div>
  );
};

export default FlashMessage;