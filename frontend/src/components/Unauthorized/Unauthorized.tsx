import React from 'react';
import { Link } from 'react-router-dom';
import './Unauthorized.css';

const Unauthorized: React.FC = () => {
  return (
    <div className="unauthorized-container">
      <div className="unauthorized-content">
        <h1>Access Denied</h1>
        <div className="unauthorized-icon">
          <i className="fas fa-exclamation-triangle"></i>
        </div>
        <p>You do not have permission to access this page.</p>
        <p>Please contact your administrator if you believe this is an error.</p>
        <div className="unauthorized-actions">
          <Link to="/dashboard" className="btn-primary">
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;