import React from 'react';
import './ComingSoon.css';
import logo from '../../assets/logo_SB.png';

const ComingSoon: React.FC = () => {
  return (
    <div className="coming-soon-container">
      <div className="coming-soon-content">
        <img src={logo} alt="Logo" className="coming-soon-logo" />
        <h1>Coming Soon</h1>
        <p>This website is not yet available for mobile and tablet devices.</p>
        <p>Please use a desktop or laptop for the best experience.</p>
      </div>
    </div>
  );
};

export default ComingSoon;