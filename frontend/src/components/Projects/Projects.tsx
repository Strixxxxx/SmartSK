import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Projects.css';

// Import submodules
import ProjectSubmission from './ProjectSubmission';
import ProjectReview from './ProjectReview';

const Projects: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();



  useEffect(() => {
    if (!user) {
      navigate('/home', { replace: true });
    }
  }, [user, navigate]);

  if (!user) {
    return <p>Loading user data...</p>;
  }

  // View for SK Officer (SKO)
  if (user.position === 'SKO') {
    return (
      <div className="projects-container">
        <ProjectSubmission userId={user.id} userRole={user.position} />
      </div>
    );
  }

  // View for SK Chairperson (SKC)
  if (user.position === 'SKC') {
    return (
      <div className="projects-container">
        <ProjectReview userId={user.id} userFullName={user.fullName} userRole={user.position} />
      </div>
    );
  }

  // Fallback for any other user roles (including MA, as it's removed from here)
  return (
    <div className="projects-container">
        <p>You do not have sufficient permissions to view this page.</p>
    </div>
  );
};

export default Projects;