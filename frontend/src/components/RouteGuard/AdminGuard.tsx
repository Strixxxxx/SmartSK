import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminGuard: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  // If user is not authenticated, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is admin by position or role
  const isAdmin = user.position === 'MA' || 
                  user.position === 'SA' ||
                  user.position?.toLowerCase().includes('admin');

  // If user is not an admin, redirect to dashboard
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // If user is admin, render the protected route
  return <Outlet />;
};

export default AdminGuard;