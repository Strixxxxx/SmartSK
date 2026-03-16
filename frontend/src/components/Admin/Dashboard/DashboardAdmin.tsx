import React, { useEffect, useState } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  ArcElement, 
  Tooltip, 
  Legend, 
  Title 
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import { 
  People, 
  PendingActions, 
  Engineering, 
  ArrowForward 
} from '@mui/icons-material';
import { fetchDashboardStats, fetchDashboardCharts, fetchDashboardActivity } from '../../../backend connection/adminApi';
import styles from './DashboardAdmin.module.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Title
);

const DashboardAdmin: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [chartData, setChartData] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsRes, chartsRes, activityRes] = await Promise.all([
          fetchDashboardStats(),
          fetchDashboardCharts(),
          fetchDashboardActivity()
        ]);

        if (statsRes.success) setStats(statsRes.stats);
        if (chartsRes.success) setChartData(chartsRes);
        if (activityRes.success) setActivity(activityRes.activity);
      } catch (error) {
        console.error('Failed to load dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className={styles.loading}>Initializing Government Dashboard...</div>;
  }

  // Chart Configurations
  const doughnutData = {
    labels: chartData?.distribution.map((d: any) => d.projType) || [],
    datasets: [{
      data: chartData?.distribution.map((d: any) => d.count) || [],
      backgroundColor: ['#0056b3', '#4dabf7'],
      borderWidth: 0,
      cutout: '70%',
    }]
  };

  const lineData = {
    labels: chartData?.trends.map((t: any) => new Date(t.registrationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) || [],
    datasets: [{
      label: 'Registrations',
      data: chartData?.trends.map((t: any) => t.count) || [],
      fill: true,
      borderColor: '#0056b3',
      backgroundColor: 'rgba(0, 86, 179, 0.1)',
      tension: 0.4,
    }]
  };

  const lineOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { display: false } },
      x: { grid: { display: false } }
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      <header className={styles.dashboardHeader}>
        <h1 className={styles.dashboardTitle}>Administrator Console</h1>
        <p className={styles.dashboardSubtitle}>Real-time system oversight and Sk council analytics.</p>
      </header>

      {/* Analytics Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.card}>
          <div className={styles.cardContent}>
            <h3>Total Registered Users</h3>
            <div className={styles.cardStats}>
              <span className={styles.statNumber}>{stats?.totalUsers || 0}</span>
              <People sx={{ color: '#adb5bd', fontSize: 40 }} />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardContent}>
            <h3>Pending Registrations</h3>
            <div className={styles.cardStats}>
              <span className={`${styles.statNumber} ${stats?.pendingRegistrations > 0 ? styles.pulseText : ''}`}>
                {stats?.pendingRegistrations || 0}
              </span>
              <PendingActions sx={{ color: stats?.pendingRegistrations > 0 ? '#fa5252' : '#adb5bd', fontSize: 40 }} />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardContent}>
            <h3>Ongoing Projects</h3>
            <div className={styles.cardStats}>
              <span className={styles.statNumber}>{stats?.ongoingProjects || 0}</span>
              <Engineering sx={{ color: '#0056b3', fontSize: 40 }} />
            </div>
          </div>
        </div>

      </div>

      {/* Charts Grid */}
      <div className={styles.chartGrid}>
        <div className={styles.chartCard} style={{ minHeight: '400px' }}>
          <h3>Registration Trends (Last 30 Days)</h3>
          <div style={{ height: '300px' }}>
            <Line data={lineData} options={lineOptions} />
          </div>
        </div>
        <div className={styles.chartCard}>
          <h3>Project Distribution</h3>
          <div style={{ height: '250px', position: 'relative' }}>
            <Doughnut data={doughnutData} />
            <div style={{ position: 'absolute', top: '55%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#333' }}>
                    {stats?.ongoingProjects || 0}
                </span>
                <br />
                <span style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase' }}>Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent System Activity */}
      <div className={styles.recentActivityContainer}>
        <div className={styles.activityCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3>Recent System Activity</h3>
            <button className={styles.viewAllBtn} onClick={() => navigate('/admin/audit-trail')}>
              View Full Trail <ArrowForward fontSize="small" />
            </button>
          </div>
          <table className={styles.activityTable}>
            <thead>
              <tr>
                <th>Actor</th>
                <th>Module</th>
                <th>Action</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((log) => (
                <tr key={log.auditID}>
                  <td style={{ fontWeight: 600 }}>{log.username}</td>
                  <td><span className={styles.moduleTag}>{log.moduleName}</span></td>
                  <td>{log.actions}</td>
                  <td style={{ color: '#adb5bd' }}>{log.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardAdmin;