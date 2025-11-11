import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

import './Projects.css';
import Loading from '../Loading/Loading';

// Import submodules
import ProjectSubmission from './ProjectSubmission';
import ProjectReview from './ProjectReview';
import AIProjSummary from './AIProjSummary'; // Import the new component

const Projects: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    if (!user) {
      navigate('/home', { replace: true });
    }
  }, [user, navigate]);

  if (!user) {
    return <Loading />;
  }

  const handleTabChange = (newValue: number) => {
    setTabValue(newValue);
  };

  // View for SK Officer (SKO)
  if (user.position === 'SKO') {
    return (
      <div className="projects-container">
        <ProjectSubmission userId={user.id} userRole={user.position} />
      </div>
    );
  }

  // View for SK Chairperson (SKC) with Tabs
  if (user.position === 'SKC') {
    return (
      <div className="projects-container">
        <div className="projects-tabs">
          <button 
            className={tabValue === 0 ? 'active' : ''} 
            onClick={() => handleTabChange(0)}
          >
            AI Review
          </button>
          <button 
            className={tabValue === 1 ? 'active' : ''} 
            onClick={() => handleTabChange(1)}
          >
            Manual Review
          </button>
        </div>
        <div className="projects-content">
          {tabValue === 0 && <AIProjSummary />}
          {tabValue === 1 && <ProjectReview userId={user.id} userFullName={user.fullName} userRole={user.position} />}
        </div>
      </div>
    );
  }

  // Fallback for any other user roles
  return (
    <div className="projects-container">
        <p>You do not have sufficient permissions to view this page.</p>
    </div>
  );
};

export default Projects;