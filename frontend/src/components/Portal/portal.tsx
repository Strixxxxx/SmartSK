import React from 'react';
import './portal.css';

interface PortalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarangaySelect: (barangay: string) => void;
}

const Portal: React.FC<PortalProps> = ({ isOpen, onClose, onBarangaySelect }) => {
  if (!isOpen) {
    return null;
  }

  const handleBarangaySelect = (barangay: string) => {
    onBarangaySelect(barangay);
  };

  return (
    <div className="portal-modal-overlay" onClick={onClose}>
      <div className="portal-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="portal-close-btn" onClick={onClose}>&times;</button>
        <div className="portal-modal-header">
          <h2>Select Your Barangay</h2>
          <p>Please choose your barangay to proceed with login.</p>
        </div>
        <div className="portal-buttons">
          <button className="portal-btn" onClick={() => handleBarangaySelect('San Bartolome')}>
            San Bartolome
          </button>
          <button className="portal-btn" onClick={() => handleBarangaySelect('Nagkaisang Nayon')}>
            Nagkaisang Nayon
          </button>
        </div>
        <div className="portal-footer">
          <a href="/forgot-password">Forgot password?</a>
        </div>
      </div>
    </div>
  );
};

export default Portal;