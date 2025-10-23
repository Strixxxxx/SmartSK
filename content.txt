import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import './Roles.css';
import { toast } from 'react-toastify';
import axiosInstance from '../../../backend connection/axiosConfig';
import { AxiosError } from 'axios';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormLabel,
  Box
} from '@mui/material';

interface User {
  userID: number;
  fullName: string;
  position: string;
  barangay: string;
  roleName?: string;
  isArchived: boolean;
}

interface Role {
  roleID: number;
  roleName: string;
  description: string;
}

interface RolesProps {}

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const Roles: React.FC<RolesProps> = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [userToArchive, setUserToArchive] = useState<User | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [usersResponse, rolesResponse] = await Promise.all([
          axiosInstance.get('/api/roles/users'),
          axiosInstance.get('/api/roles/all')
        ]);

        if (usersResponse.data.success) {
          setUsers(usersResponse.data.users);
        } else {
          throw new Error(usersResponse.data.message || 'Failed to fetch users');
        }

        if (rolesResponse.data.success) {
          setRoles(rolesResponse.data.roles);
        } else {
          throw new Error(rolesResponse.data.message || 'Failed to fetch roles');
        }

      } catch (error) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response?.status === 401) {
          toast.error('Authentication failed. Please log in again.');
          navigate('/home');
          return;
        }
        
        if (axiosError.response?.status === 403) {
          toast.error('Access denied. You do not have permission to view this page.');
          navigate('/unauthorized');
          return;
        }
        
        toast.error((axiosError.response?.data as any)?.message || axiosError.message || "Failed to fetch data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  useEffect(() => {
    if (userToEdit) {
      setSelectedRole(userToEdit.position || '');
    } else {
      setSelectedRole('');
    }
  }, [userToEdit]);

  const handleEditClick = (user: User) => {
    setUserToEdit(user);
    setShowModal(true);
  };

  const handleCancelClick = () => {
    setUserToEdit(null);
    setShowModal(false);
    setSelectedRole('');
  };

  const handleSave = async () => {
    if (userToEdit && selectedRole) {
      setIsLoading(true);
      try {
        const response = await axiosInstance.post('/api/roles/assignRole', {
          userId: userToEdit.userID,
          position: selectedRole
        });

        if (response.data.success) {
          toast.success(`Role successfully assigned.`);
          const usersResponse = await axiosInstance.get('/api/roles/users');
          if (usersResponse.data.success) {
            setUsers(usersResponse.data.users);
          }
        } else {
          throw new Error(response.data.message || 'Failed to assign role');
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response?.status === 401) {
          toast.error('Authentication failed. Please log in again.');
          navigate('/home');
          return;
        }
        
        if (axiosError.response?.status === 403) {
          toast.error('Access denied. You do not have permission to perform this action.');
          return;
        }
        
        toast.error((axiosError.response?.data as any)?.message || axiosError.message || 'An error occurred while assigning the role');
      } finally {
        setIsLoading(false);
        handleCancelClick();
      }
    }
  };

  const handleArchiveClick = (user: User) => {
    setUserToArchive(user);
    setShowArchiveConfirm(true);
  };

  const handleCancelArchive = () => {
    setUserToArchive(null);
    setShowArchiveConfirm(false);
  };

  const handleConfirmArchive = async () => {
    if (userToArchive) {
      setIsLoading(true);
      try {
        const response = await axiosInstance.post(`/api/admin/archive/accounts/${userToArchive.userID}`);

        if (response.data.success) {
          toast.success(`User ${userToArchive.fullName} archived successfully.`);
          const usersResponse = await axiosInstance.get('/api/roles/users');
          if (usersResponse.data.success) {
            setUsers(usersResponse.data.users);
          }
        } else {
          throw new Error(response.data.message || 'Failed to archive user');
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response?.status === 401) {
          toast.error('Authentication failed. Please log in again.');
          navigate('/home');
          return;
        }
        
        if (axiosError.response?.status === 403) {
          toast.error('Access denied. You do not have permission to perform this action.');
          return;
        }
        
        toast.error((axiosError.response?.data as any)?.message || axiosError.message || 'An error occurred while archiving the user.');
      } finally {
        setIsLoading(false);
        handleCancelArchive();
      }
    }
  };

  const activeUsers = users.filter(user => !user.isArchived);

  if (isLoading) {
    return (
      <div className={`roles-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="loading">Loading users...</div>
      </div>
    );
  }

  return (
    <div className={`roles-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="roles-content">
        <div className="roles-header">
          <h1 className="roles-title">User Role Management</h1>
          <div className="roles-subtitle">
            Assign and manage user roles in the system
          </div>
        </div>

        <div className="roles-summary-grid">
          <div className="summary-card">
            <div className="card-icon">👥</div>
            <div className="card-content">
              <h3>Total Users</h3>
              <div className="card-stats">
                <span className="stat-number">{users.length}</span>
                <span className="stat-label">Registered Users</span>
              </div>
            </div>
          </div>
          
          <div className="summary-card">
            <div className="card-icon">✔️</div>
            <div className="card-content">
              <h3>Active Accounts</h3>
              <div className="card-stats">
                <span className="stat-number">
                  {users.filter(user => !user.isArchived).length}
                </span>
                <span className="stat-label">Active Users</span>
              </div>
            </div>
          </div>
          
          <div className="summary-card">
            <div className="card-icon">🗄️</div>
            <div className="card-content">
              <h3>Archived Accounts</h3>
              <div className="card-stats">
                <span className="stat-number">
                  {users.filter(user => user.isArchived).length}
                </span>
                <span className="stat-label">Archived Users</span>
              </div>
            </div>
          </div>
        </div>

        <div className="roles-main-content">
          <div className="table-card">
            <div className="table-header">
              <h3>🏛️ User Management</h3>
              <p>Manage user roles and permissions</p>
            </div>
            
            <div className="users-table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Full Name</th>
                    <th>Current Role</th>
                    <th>Barangay</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="no-data">No active users found</td>
                    </tr>
                  ) : (
                    activeUsers.map(user => (
                      <tr key={user.userID}>
                        <td>
                          <div className="user-info">
                            <div className="user-avatar">
                              {user.fullName.split(' ').map(name => name[0]).join('')}
                            </div>
                            <span className="user-name">{user.fullName}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`role-badge ${user.position ? 'role-assigned' : 'role-unassigned'}`}>
                            {user.position || 'Not Assigned'}
                          </span>
                        </td>
                        <td>{user.barangay}</td>
                        <td>
                          <span className={`status-badge ${user.isArchived ? 'status-inactive' : 'status-active'}`}>
                            {user.isArchived ? 'Inactive' : 'Active'}
                          </span>
                        </td>
                        <td>
                          <button 
                            className={`action-btn ${!user.position || !['MA', 'SA', 'SKC', 'SKO'].includes(user.position) ? 'add-role' : 'change-role'}`}
                            onClick={() => handleEditClick(user)}
                          >
                            {!user.position || !['MA', 'SA', 'SKC', 'SKO'].includes(user.position) ? '➕ Add Role' : '✏️ Change Role'}
                          </button>
                          <button
                            className="action-btn change-role"
                            onClick={() => handleArchiveClick(user)}
                            style={{ marginLeft: '8px' }}
                          >
                            Archive
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <Dialog 
          open={showModal} 
          onClose={handleCancelClick}
          PaperProps={{
            style: {
              borderRadius: '20px',
              padding: '10px'
            }
          }}
        >
          <DialogTitle sx={{ 
            fontSize: '1.5rem', 
            fontWeight: 600,
            background: 'linear-gradient(135deg, #646cff, #747bff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            {userToEdit ? `🎭 Assign Role for ${userToEdit.fullName}` : 'Assign Role'}
          </DialogTitle>
          <DialogContent>
            {userToEdit ? (
              <Box sx={{ mt: 2 }}>
                <FormLabel component="legend" sx={{ fontWeight: 600, mb: 2, display: 'block' }}>
                  Select Role:
                </FormLabel>
                <RadioGroup
                  aria-label="role"
                  name="roleGroup"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  sx={{ gap: 1 }}
                >
                  {roles.filter(role => ['MA', 'SA', 'SKC', 'SKO'].includes(role.roleName)).map(role => (
                    <FormControlLabel
                      key={role.roleID}
                      value={role.roleName}
                      control={<Radio sx={{ color: '#646cff' }} />}
                      label={
                        <Box>
                          <strong>{role.roleName}</strong>
                          <br />
                          <span style={{ color: '#64748b', fontSize: '0.9rem' }}>
                            {role.description}
                          </span>
                        </Box>
                      }
                      sx={{ 
                        alignItems: 'flex-start',
                        mb: 1,
                        p: 1,
                        borderRadius: '8px',
                        '&:hover': {
                          backgroundColor: 'rgba(100, 108, 255, 0.05)'
                        }
                      }}
                    />
                  ))}
                </RadioGroup>
              </Box>
            ) : (
              <DialogContentText>
                No user selected for role assignment.
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 3, gap: 1 }}>
            <Button 
              onClick={handleCancelClick} 
              sx={{ 
                borderRadius: '12px',
                px: 3,
                color: '#64748b',
                border: '1px solid #e2e8f0'
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              variant="contained"
              disabled={!selectedRole || !userToEdit}
              sx={{ 
                borderRadius: '12px',
                px: 3,
                background: 'linear-gradient(135deg, #646cff, #747bff)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a63f0, #6b73f0)',
                  transform: 'translateY(-1px)',
                  boxShadow: '0 8px 25px rgba(100, 108, 255, 0.4)'
                }
              }}
            >
              Save Changes
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={showArchiveConfirm}
          onClose={handleCancelArchive}
          PaperProps={{
            style: {
              borderRadius: '20px',
              padding: '10px'
            }
          }}
        >
          <DialogTitle sx={{ fontSize: '1.5rem', fontWeight: 600 }}>
            Archive User
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              Are you sure you want to archive the user "{userToArchive?.fullName}"?
            </DialogContentText>
          </DialogContent>
          <DialogActions sx={{ p: 3, gap: 1 }}>
            <Button onClick={handleCancelArchive} sx={{ borderRadius: '12px', px: 3, color: '#64748b', border: '1px solid #e2e8f0' }}>
              Cancel
            </Button>
            <Button onClick={handleConfirmArchive} variant="contained" color="error" sx={{ borderRadius: '12px', px: 3 }}>
              Archive
            </Button>
          </DialogActions>
        </Dialog>
      </div>
    </div>
  );
};

export default Roles;
