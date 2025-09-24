import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from '../../../backend connection/axiosConfig';
import './sessions.css';

interface Session {
  sessionID: string;
  userName: string;
  fullName: string;
  created_at: string;
  expires_at: string | null;
}

interface SessionsProps {}

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const Sessions: React.FC<SessionsProps> = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchSessions = async (params = {}) => {
    setLoading(true);
    try {
      const response = await axios.get('/api/admin/sessions', { params });
      setSessions(response.data);
    } catch (err) {
      setError('Failed to fetch session logs');
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleFilter = () => {
    const params: any = {};
    if (search) params.search = search;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    fetchSessions(params);
  };

  const handleReload = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    fetchSessions();
  };

  return (
    <div className={`sessions-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <h1>Session Logs</h1>
      <div className="filter-controls">
        <input
          type="text"
          placeholder="Search by username or full name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="date-input"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="date-input"
        />
        <button onClick={handleFilter}>Filter</button>
        <button onClick={handleReload} className="reload-btn">&#x21BB;</button>
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div>{error}</div>
      ) : (
        <table className="sessions-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Logged In</th>
              <th>Logged Out</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.sessionID}>
                <td>{session.userName}</td>
                <td>{session.fullName}</td>
                <td>{session.created_at}</td>
                <td>{session.expires_at ? session.expires_at : 'Active'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Sessions;