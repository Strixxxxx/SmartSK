import React from 'react';
import './Maintenance.css';
import logo from '../../assets/logo_SB.png';

const Maintenance: React.FC = () => {
  return (
    <div className="maintenance-container">
      <div className="maintenance-content">
        <img src={logo} alt="Logo" className="maintenance-logo" />
        <h1>System Maintenance</h1>
        <p>The system is currently undergoing maintenance. We apologize for any inconvenience.</p>
        <p>Please check back later.</p>
      </div>
    </div>
  );
};

export default Maintenance;
