import React from 'react';
import './Loading.css';
import LandingSkeleton from '../Portfolio/LandingSkeleton';

interface LoadingProps {
  fullPageSkeleton?: boolean;
}

const Loading: React.FC<LoadingProps> = ({ fullPageSkeleton = false }) => {
  if (fullPageSkeleton) {
    return <LandingSkeleton />;
  }

  return (
    <div className="loading-overlay">
      <div className="loading-spinner"></div>
    </div>
  );
};

export default Loading;
