import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface RouteGuardProps {
  requiredRole?: string;
}

const RouteGuard: React.FC<RouteGuardProps> = ({ requiredRole }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    // You might want to show a loading spinner here
    return <div>Loading...</div>;
  }

  // If user is not authenticated, redirect to login
  if (!user) {
    return <Navigate to="/home" replace />;
  }

  // If a specific role is required and user doesn't have it, check position
  if (requiredRole) {
    const hasRequiredRole = user.position === requiredRole ||
                           (requiredRole === 'admin' && (
                             user.position === 'MA' || 
                             user.position === 'SA' ||
                             user.position?.toLowerCase().includes('admin')
                           ));
    
    if (!hasRequiredRole) {
      // Redirect to an unauthorized page or a generic dashboard
      return <Navigate to="/unauthorized" replace />;
    }
  }

  // If all checks pass, render the protected route
  return <Outlet />;
};

export default RouteGuard;