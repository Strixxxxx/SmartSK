import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axiosInstance from '../../../backend connection/axiosConfig';
import { AxiosError } from 'axios';
import { toast } from 'react-toastify';
import './audit.css';

interface AuditLog {
  auditID: string;
  username: string;
  moduleName: string;
  actions: string;
  descriptions: string;
  old_value: string;
  new_value: string;
  created_at: string;
}

interface AuditTrailProps {}

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const AuditTrail: React.FC<AuditTrailProps> = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [auditTrail, setAuditTrail] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAuditTrail = async () => {
      setLoading(true);
      try {
        const response = await axiosInstance.get<AuditLog[]>('/api/audit');
        setAuditTrail(response.data);
        setLoading(false);
      } catch (err) {
        const axiosError = err as AxiosError;
        
        if (axiosError.response?.status === 401) {
          setError('Authentication failed. Please log in again.');
          toast.error('Authentication failed. Please log in again.');
          navigate('/home');
          return;
        }
        
        if (axiosError.response?.status === 403) {
          setError('Access denied. You do not have permission to view this page.');
          toast.error('Access denied. You do not have permission to view this page.');
          navigate('/unauthorized');
          return;
        }
        
        const errorMessage = (axiosError.response?.data as { message?: string })?.message || axiosError.message || 'An unexpected error occurred';
        setError(errorMessage);
        toast.error(`Error fetching audit trail: ${errorMessage}`);
        setLoading(false);
      }
    };

    fetchAuditTrail();
  }, [navigate]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div>Error fetching audit trail: {error}</div>;
  }

  return (
    <div className={`audit-trail-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
        <div className="audit-trail-content">
            <div className="page-header">
                <h1 className="page-title">Audit Trail</h1>
                <p className="page-subtitle">Track all system activities and changes.</p>
            </div>
            <div className="table-card">
                <div className="table-header">
                    <h3>System Logs</h3>
                </div>
                <div className="table-container">
                    <table className="audit-trail-table">
                    <thead>
                        <tr>
                        <th>Audit ID</th>
                        <th>Username</th>
                        <th>Module</th>
                        <th>Action</th>
                        <th>Description</th>
                        <th>Old Value</th>
                        <th>New Value</th>
                        <th>Timestamp</th>
                        </tr>
                    </thead>
                    <tbody>
                        {auditTrail.map((log: AuditLog, index: number) => (
                        <tr key={index}>
                            <td>{log.auditID}</td>
                            <td>{log.username || 'N/A'}</td>
                            <td>{log.moduleName}</td>
                            <td>{log.actions}</td>
                            <td>{log.descriptions}</td>
                            <td>{log.old_value}</td>
                            <td>{log.new_value}</td>
                            <td>{log.created_at}</td>
                        </tr>
                        ))}
                    </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
  );
};

export default AuditTrail;
