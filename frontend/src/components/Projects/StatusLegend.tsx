import React, { useEffect, useRef, useState, RefObject } from 'react';
import ReactDOM from 'react-dom';
import './StatusLegend.css';

interface Status {
  StatusName: string;
  description: string;
}

interface StatusLegendProps {
  statusList: Status[];
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
}

const StatusLegend: React.FC<StatusLegendProps> = ({ statusList, onClose, triggerRef }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const modalRoot = document.getElementById('modal-root');
  const modalWidth = 250; // Approximate width of the modal

  useEffect(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      
      // Attempt to position to the left of the trigger
      let left = rect.left - modalWidth;
      
      // If positioning to the left would push it off-screen, position it to the right
      if (left < 0) {
        left = rect.right;
      }

      setPosition({ top: rect.bottom + window.scrollY + 5, left: left + window.scrollX });
    }
  }, [triggerRef, modalWidth]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!position || !modalRoot) {
    return null;
  }

  const modalContent = (
    <div
      ref={modalRef}
      className="status-legend-modal"
      style={{
        position: 'absolute',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 1000,
        width: `${modalWidth}px`
      }}
    >
      <div className="status-legend-header">
        <h4>Status Legend</h4>
      </div>
      <ul className="status-legend-list">
        {statusList.map((status) => (
          <li key={status.StatusName}>
            <strong>{status.StatusName}:</strong> {status.description}
          </li>
        ))}
      </ul>
    </div>
  );

  return ReactDOM.createPortal(modalContent, modalRoot);
};

export default StatusLegend;
