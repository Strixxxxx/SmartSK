import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Tab, Tabs, Paper, Typography } from '@mui/material';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import UserAccounts from './UserAccounts';
import RegistrationSummary from './RegistrationSummary';
import './AccountManagement.css';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`account-management-tabpanel-${index}`}
      aria-labelledby={`account-management-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

interface OutletContextType {
  sidebarCollapsed: boolean;
}

const AccountManagement: React.FC = () => {
  const { sidebarCollapsed } = useOutletContext<OutletContextType>();
  const [value, setValue] = useState(0);

  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  return (
    <div className={`account-management-container ${sidebarCollapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}`}>
      <div className="account-management-content">
        <div className="page-header">
          <Typography variant="h3" component="h1" className="page-title">
            Account Management
          </Typography>
          <Typography variant="h6" component="p" className="page-subtitle">
            Manage user accounts, assign roles, and review new registrations.
          </Typography>
        </div>

        <Paper elevation={3} className="tabs-paper">
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs 
              value={value} 
              onChange={handleChange} 
              aria-label="Account Management Tabs"
              variant="fullWidth"
            >
              <Tab icon={<PeopleAltIcon />} iconPosition="start" label="User Accounts" id="account-management-tab-0" />
              <Tab icon={<HourglassEmptyIcon />} iconPosition="start" label="Registration Summary" id="account-management-tab-1" />
            </Tabs>
          </Box>
          <TabPanel value={value} index={0}>
            <UserAccounts />
          </TabPanel>
          <TabPanel value={value} index={1}>
            <RegistrationSummary />
          </TabPanel>
        </Paper>
      </div>
    </div>
  );
};

export default AccountManagement;
