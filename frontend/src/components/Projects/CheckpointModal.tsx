import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { FaTimes } from 'react-icons/fa';
import './CheckpointModal.css';

interface Status {
  StatusName: string;
  description: string;
}

interface CheckpointModalProps {
  statusList: Status[];
  onClose: () => void;
}

const CheckpointModal: React.FC<CheckpointModalProps> = ({ statusList, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const modalRoot = document.getElementById('modal-root');
  const mid = Math.ceil(statusList.length / 2);
  const leftColumn = statusList.slice(0, mid);
  const rightColumn = statusList.slice(mid);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!modalRoot) return null;

  const renderColumn = (items: Status[], startIndex: number) => (
    <div className="checkpoint-column">
      {items.map((status, i) => {
        const idx = startIndex + i;
        return (
          <div key={status.StatusName} className="checkpoint-item">
            <div className="checkpoint-marker">
              <div className="checkpoint-dot">
                <span className="checkpoint-number">{idx + 1}</span>
              </div>
              {i < items.length - 1 && <div className="checkpoint-line" />}
            </div>
            <div className="checkpoint-content">
              <h4 className="checkpoint-name">{status.StatusName}</h4>
              <p className="checkpoint-description">{status.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );

  const content = (
    <div className="checkpoint-overlay" onClick={onClose}>
      <div className="checkpoint-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="checkpoint-header">
          <h3 className="checkpoint-title">Project Checkpoints</h3>
          <p className="checkpoint-subtitle">Track the progress stages of a project</p>
        </div>

        <div className="checkpoint-body">
          <div className="checkpoint-grid">
            {renderColumn(leftColumn, 0)}
            {renderColumn(rightColumn, mid)}
          </div>
        </div>

        <div className="checkpoint-footer">
          <button className="checkpoint-close-btn" onClick={onClose}>
            <FaTimes /> Close
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, modalRoot);
};

export default CheckpointModal;
