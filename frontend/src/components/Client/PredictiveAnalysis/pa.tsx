import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Tabs, 
  Tab, 
  Card, 
  CardContent, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Alert,
  CircularProgress
} from '@mui/material';
import axiosInstance from '../../../backend connection/axiosConfig';
import PaCstmResponse, { PaCstmApiResponse } from './paCstmResponse';
import Trends from './paTrends';
import styles from './pa.module.css';

// --- Interfaces ---

type PaAnalysisReport = Record<string, PaCstmApiResponse>;

const PredictiveAnalysis: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0); // MUI Tabs use numeric index
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [analysisReport, setAnalysisReport] = useState<PaAnalysisReport | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<PaCstmApiResponse | null>(null);
  
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>('general');
  const [availableCategories, setAvailableCategories] = useState<Array<{ key: string; name: string }>>([]);

  useEffect(() => {
    const fetchAnalysisReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axiosInstance.get<PaAnalysisReport>('/api/reports/pa-analysis');
        const reportData = response.data;

        if (!reportData || Object.keys(reportData).length === 0) {
          throw new Error('Predictive analysis report is empty or invalid.');
        }

        setAnalysisReport(reportData);
        
        if (reportData.general) {
          setSelectedAnalysis(reportData.general);
          setSelectedCategoryKey('general');
        } else {
          const firstKey = Object.keys(reportData)[0];
          setSelectedAnalysis(reportData[firstKey]);
          setSelectedCategoryKey(firstKey);
        }

        const categories = Object.keys(reportData).map(key => {
          let name = 'General Analysis';
          if (key.startsWith('category_')) {
            name = key.replace('category_', '').replace(/\b\w/g, l => l.toUpperCase());
          }
          return { key, name };
        });
        setAvailableCategories(categories);

      } catch (err: any) {
        const errorMessage = err.response?.data?.message || 'Failed to fetch predictive analysis report.';
        setError(errorMessage);
        if (import.meta.env.DEV) console.error('Error fetching analysis report:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysisReport();
  }, []);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const handleCategoryChange = (event: any) => {
    const newKey = event.target.value as string;
    setSelectedCategoryKey(newKey);
    if (analysisReport && analysisReport[newKey]) {
      setSelectedAnalysis(analysisReport[newKey]);
    }
  };

  const renderAnalysisSelector = () => (
    <Card className={styles.selectorCard}>
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" className={styles.selectorLabel}>
          Select Analysis View
        </Typography>
        <FormControl fullWidth variant="outlined">
          <InputLabel id="category-select-label">Analysis Category</InputLabel>
          <Select
            labelId="category-select-label"
            value={selectedCategoryKey}
            onChange={handleCategoryChange}
            label="Analysis Category"
          >
            {availableCategories.map(cat => (
              <MenuItem key={cat.key} value={cat.key}>{cat.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </CardContent>
    </Card>
  );

  return (
    <Box className={styles.predictiveContainer}>
      <Typography variant="h4" className={styles.title}>
        Predictive Analysis
      </Typography>
      <Typography variant="body1" className={styles.description}>
        Use AI-powered predictive analysis to gain insights into project success factors,
        outcomes, and recommendations based on pre-computed historical data.
      </Typography>

      <Box className={styles.tabsContainer}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange} 
          aria-label="predictive analysis tabs"
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab label="Project Analysis" className={styles.tabButton} />
          <Tab label="Project Trends" className={styles.tabButton} />
        </Tabs>
      </Box>

      <Box className={styles.responseContainer}>
        {activeTab === 0 && (
          <>
            {loading ? (
              <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={10}>
                <CircularProgress size={60} />
                <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary' }}>
                  Processing Intelligence Report...
                </Typography>
              </Box>
            ) : error ? (
              <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
            ) : (
              <>
                {renderAnalysisSelector()}
                <PaCstmResponse
                  analysisResult={selectedAnalysis}
                  isLoading={false} 
                />
              </>
            )}
          </>
        )}
        {activeTab === 1 && (
          <Trends />
        )}
      </Box>
    </Box>
  );
};

export default PredictiveAnalysis;