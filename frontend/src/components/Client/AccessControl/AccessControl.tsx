import { useState, useEffect, useCallback } from 'react';
import api from '../../../backend connection/axiosConfig';
import Loading from '../../Loading/Loading';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  Typography,
  Box,
  Alert,
  Snackbar
} from '@mui/material';
import styles from './AccessControl.module.css';
import { formatRoleName } from '../../../utils/roleUtils';

interface AccessControlData {
  userID: number;
  fullName: string;
  position: string;
  templateControl: boolean;
  trackerControl: boolean;
  docsControl: boolean;
  budgetControl: boolean;
}


const AccessControl: React.FC = () => {
  const [data, setData] = useState<AccessControlData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const fetchAccessControlData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/admin/access-control');
      if (response.data.success) {
        setData(response.data.data);
      } else {
        setError(response.data.message || 'Failed to fetch access control data');
      }
    } catch (err: any) {
      setError(`Error fetching data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccessControlData();
  }, [fetchAccessControlData]);

  const handleToggle = async (userID: number, field: keyof AccessControlData) => {
    // Optimistic UI update
    setData(prevData =>
      prevData.map(user =>
        user.userID === userID ? { ...user, [field]: !user[field] } : user
      )
    );

    const userToUpdate = data.find(u => u.userID === userID);
    if (!userToUpdate) return;

    // The payload needs all 3 boolean fields because the backend route expects them to do a full UPSERT.
    const payload = {
      targetUserID: userID,
      templateControl: field === 'templateControl' ? !userToUpdate.templateControl : userToUpdate.templateControl,
      trackerControl: field === 'trackerControl' ? !userToUpdate.trackerControl : userToUpdate.trackerControl,
      docsControl: field === 'docsControl' ? !userToUpdate.docsControl : userToUpdate.docsControl,
      budgetControl: field === 'budgetControl' ? !userToUpdate.budgetControl : userToUpdate.budgetControl
    };

    try {
      const response = await api.post('/api/admin/access-control/update', payload);
      if (response.data.success) {
        setSnackbar({ open: true, message: 'Permissions updated successfully', severity: 'success' });
      } else {
        throw new Error(response.data.message || 'Failed to update permissions');
      }
    } catch (err: any) {
      setSnackbar({ open: true, message: `Failed to update permissions: ${err.message}`, severity: 'error' });
      // Revert optimistic update
      setData(prevData =>
        prevData.map(user =>
          user.userID === userID ? { ...user, [field]: userToUpdate[field] } : user
        )
      );
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  if (loading && data.length === 0) {
    return (
      <div className={styles.container}>
        <Loading />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <Typography variant="h4" className={styles.title}>Access Control</Typography>
          <Typography variant="subtitle1" className={styles.subtitle}>
            Manage permissions for council members
          </Typography>
        </div>

        {error && (
          <Alert severity="error" className={styles.alert}>
            {error}
          </Alert>
        )}

        <Box className={styles.tableCard}>
          <TableContainer component={Paper} elevation={3} className={styles.tableContainer}>
            <Table stickyHeader aria-label="access control table">
              <TableHead>
                <TableRow>
                  <TableCell className={styles.tableHeadCell} sx={{ fontWeight: 'bold' }}>Council Member Name</TableCell>
                  <TableCell className={styles.tableHeadCell} align="center" sx={{ fontWeight: 'bold' }}>Template Creation Control<br /><small>(Create Project Plans)</small></TableCell>
                  <TableCell className={styles.tableHeadCell} align="center" sx={{ fontWeight: 'bold' }}>Project Tracker Control<br /><small>(Update Project Trackers)</small></TableCell>
                  <TableCell className={styles.tableHeadCell} align="center" sx={{ fontWeight: 'bold' }}>Documents Control<br /><small>(Upload Supporting Documents)</small></TableCell>
                  <TableCell className={styles.tableHeadCell} align="center" sx={{ fontWeight: 'bold' }}>Budget Reallocation Control<br /><small>(Adjust Budget Allocations)</small></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body1" sx={{ py: 3, color: 'text.secondary' }}>
                        No council members found for your barangay.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((row) => (
                    <TableRow key={row.userID} hover className={styles.tableRow}>
                      <TableCell component="th" scope="row">
                        <Box>
                          <Typography variant="body1" fontWeight="bold" sx={{ color: '#1e293b' }}>
                            {row.fullName}
                          </Typography>
                          <Typography variant="caption" className={styles.positionSubtitle}>
                            {formatRoleName(row.position)}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={row.templateControl}
                          onChange={() => handleToggle(row.userID, 'templateControl')}
                          color="primary"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={row.trackerControl}
                          onChange={() => handleToggle(row.userID, 'trackerControl')}
                          color="primary"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={row.docsControl}
                          onChange={() => handleToggle(row.userID, 'docsControl')}
                          color="primary"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={row.budgetControl}
                          onChange={() => handleToggle(row.userID, 'budgetControl')}
                          color="primary"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>

      </div>
    </div>
  );
};

export default AccessControl;
