import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

// Layouts
import ClientMainLayout from './components/Client/Layout/ClientMainLayout';
import AdminLayout from './components/Admin/Layout/LayoutAdmin';

// Guards
import AdminGuard from './components/RouteGuard/AdminGuard';

// Public Pages
import Login from './components/Login/Login';
import ForgotPassword from './components/ForgotPassword/ForgotPassword';
import Unauthorized from './components/Unauthorized/Unauthorized';
import NewAccount from './components/Login/NewAccount';
import Portfolio from './components/Portfolio/Portfolio';
import ProjectList from './components/Portfolio/ProjectList';
import ComingSoon from './components/ComingSoon/ComingSoon';

// Client Pages
import Dashboard from './components/Client/Dashboard/Dashboard';
import Projects from './components/Projects/Projects';
import Forecast from './components/Client/Forecast/Forecast';
import Predictive from './components/Client/PredictiveAnalysis/pa';
import RawDataList from './components/Client/RawData/RawDataList';

// Admin Pages
import DashboardAdmin from './components/Admin/Dashboard/DashboardAdmin';
import AccountCreation from './components/Admin/Account Creation/AccountCreation';
import Roles from './components/Admin/Roles/Roles';
import AdminProjects from './components/Admin/Projects/AdminProjects';
import RawData from './components/Admin/Raw Data/rawdata';
import AuditTrail from './components/Admin/Audit Trail/audit';
import SessionLog from './components/Admin/Session Log/sessions';
import Backup from './components/Admin/Backup/Backup';
import Archive from './components/Admin/Archive/Archive';

const AppRoutes: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024); // Change to 1024 for actual mobile detection

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024); // Change to 1024 for actual mobile detection
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  // If mobile, only show home and project-list, everything else shows ComingSoon
  if (isMobile) {
    return (
      <Routes>
        {/* Root redirects to home on mobile */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        
        {/* Only these two public routes are accessible on mobile */}
        <Route path="/home" element={<Portfolio />} />
        <Route path="/project-list" element={<ProjectList />} />
        
        {/* All other routes (including login) show ComingSoon on mobile */}
        <Route path="*" element={<ComingSoon />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/home" element={<Portfolio />} />
      <Route path="/project-list" element={<ProjectList />} />
      <Route path="/login" element={<Login open={true} onClose={() => {}} barangay={''} />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/change-password" element={<NewAccount open={true} onClose={() => {}} userID={0} currentUsername={''} />} />

      {/* Conditional Root Route based on user role */}
      <Route path="/" element={
        user ? (
          user.position === 'MA' || user.position === 'SA' ? ( // Check if user is Admin
            <Navigate to="/admin/dashboard" replace />
          ) : (
            <ClientMainLayout /> // Default to client layout for other roles
          )
        ) : (
          <Navigate to="/home" replace /> // Redirect to home if not logged in
        )
      }>
        {/* Client sub-routes under the root if not admin */}
        {user && (user.position !== 'MA' && user.position !== 'SA') && (
          <>
            <Route index element={<Navigate to="dashboard" />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="raw-data-list" element={<RawDataList />} />
            <Route path="forecast" element={<Forecast />} />
            <Route path="predictive-analytics" element={<Predictive />} />
          </>
        )}
      </Route>

      {/* Admin Routes (protected by AdminGuard) */}
      <Route element={<AdminGuard />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" />} />
          <Route path="dashboard" element={<DashboardAdmin />} />
          <Route path="account-creation" element={<AccountCreation />} />
          <Route path="roles" element={<Roles />} />
          <Route path="projects" element={<AdminProjects />} />
          <Route path="raw-data" element={<RawData />} />
          <Route path="sessions" element={<SessionLog />} />
          <Route path="audit-trail" element={<AuditTrail />} />
          <Route path="archive" element={<Archive />} />
          <Route path="backup" element={<Backup />} />
        </Route>
      </Route>

      {/* Fallback for any other path */}
      <Route path="*" element={<Navigate to={user ? (user.position === 'MA' || user.position === 'SA' ? "/admin/dashboard" : "/dashboard") : "/home"} />} />
    </Routes>
  );
};

export default AppRoutes;