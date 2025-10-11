import React from 'react';
import './StatusLegend.css';

interface Status {
  StatusID: number;
  StatusName: string;
  description: string;
}

interface StatusLegendProps {
  currentStatus: string;
  statusList: Status[];
}

const StatusLegend: React.FC<StatusLegendProps> = ({ currentStatus, statusList }) => {
  return (
    <div className="status-legend-modal">
      <div className="status-legend-header">
        <h4>Status Legend</h4>
      </div>
      <ul className="status-legend-list">
        {statusList.map((status) => (
          <li key={status.StatusID} className={status.StatusName === currentStatus ? 'current-status' : ''}>
            <strong>{status.StatusName}:</strong> {status.description}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StatusLegend;
