import React from 'react';
import ReactDOM from 'react-dom';
import './StatusLegend.css';

interface Status {
  StatusName: string;
  description: string;
}

interface StatusLegendProps {
  currentStatus: string;
  statusList: Status[];
  position: { top: number; left: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const StatusLegend: React.FC<StatusLegendProps> = ({ currentStatus, statusList, position, onMouseEnter, onMouseLeave }) => {
  const modalRoot = document.getElementById('modal-root');

  if (!modalRoot) {
    return null;
  }

  const modalContent = (
    <div 
      className="status-legend-modal" 
      style={{ 
        position: 'fixed', 
        top: `${position.top}px`, 
        left: `${position.left}px`,
        transform: 'translateY(10px)' // Small offset from the element
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="status-legend-header">
        <h4>Status Legend</h4>
      </div>
      <ul className="status-legend-list">
        {statusList.map((status) => (
          <li key={status.StatusName} className={status.StatusName === currentStatus ? 'current-status' : ''}>
            <strong>{status.StatusName}:</strong> {status.description}
          </li>
        ))}
      </ul>
    </div>
  );

  return ReactDOM.createPortal(modalContent, modalRoot);
};

export default StatusLegend;