import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Paper, 
  Box,
  CircularProgress,
  Alert,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  FormHelperText,
  Tooltip,
  IconButton
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InfoIcon from '@mui/icons-material/Info';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CategoryIcon from '@mui/icons-material/Category';
import axiosInstance from '../../../backend connection/axiosConfig';
import TrendsList from './paTrendsV2';

// --- Interfaces matching the new pa_trends.json structure ---

interface Citation {
  id: number;
  title: string;
  url: string;
  snippet: string;
}

interface TrendData {
  id: number;
  name: string;
  description: string;
  confidence: number;
  trend: 'up' | 'down' | 'stable';
  category: string;
  subcategory?: string;
  impact: 'high' | 'medium' | 'low';
}

// Represents a single section in the JSON file (e.g., the "General" or "Health" object)
interface TrendReportSection {
  trends: TrendData[];
  citations?: Citation[];
  metadata?: {
    data_source: string;
    total_projects_analyzed: number;
    category_filter: string;
    timestamp: string;
    gemini_used: boolean;
  };
  error?: boolean;
  message?: string;
}

// Represents the entire pa_trends.json file
type PaTrendsReport = Record<string, TrendReportSection>;


const Trends: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for the entire fetched report
  const [trendsReport, setTrendsReport] = useState<PaTrendsReport | null>(null);
  
  // State for the data currently being displayed
  const [displayedTrends, setDisplayedTrends] = useState<TrendData[]>([]);
  const [displayedCitations, setDisplayedCitations] = useState<Citation[]>([]);
  const [displayedMetadata, setDisplayedMetadata] = useState<TrendReportSection['metadata'] | undefined>(undefined);

  // State for the dropdown
  const [availableCategories, setAvailableCategories] = useState<{ key: string; name: string }[]>([]);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>("General");

  useEffect(() => {
    const fetchTrendsReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axiosInstance.get<PaTrendsReport>('/api/reports/pa-trends');
        const reportData = response.data;

        if (!reportData || Object.keys(reportData).length === 0) {
          throw new Error('Trends report is empty or invalid.');
        }

        setTrendsReport(reportData);

        // Set the initial view to "General"
        const initialSection = reportData.General;
        if (initialSection) {
          setDisplayedTrends(initialSection.trends || []);
          setDisplayedCitations(initialSection.citations || []);
          setDisplayedMetadata(initialSection.metadata);
          setSelectedCategoryKey('General');
        } else {
          // Fallback if "General" is missing
          const firstKey = Object.keys(reportData)[0];
          const firstSection = reportData[firstKey];
          setDisplayedTrends(firstSection.trends || []);
          setDisplayedCitations(firstSection.citations || []);
          setDisplayedMetadata(firstSection.metadata);
          setSelectedCategoryKey(firstKey);
        }

        // Populate dropdown options
        const categories = Object.keys(reportData).map(key => ({ key, name: key }));
        setAvailableCategories(categories);

      } catch (err: any) {
        const errorMessage = err.response?.data?.message || 'Failed to fetch project trends report.';
        setError(errorMessage);
        if (import.meta.env.DEV) console.error('Error fetching trends report:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrendsReport();
  }, []);
  
  const handleCategoryChange = (event: SelectChangeEvent) => {
    const newKey = event.target.value;
    setSelectedCategoryKey(newKey);

    if (trendsReport && trendsReport[newKey]) {
      const newSection = trendsReport[newKey];
      setDisplayedTrends(newSection.trends || []);
      setDisplayedCitations(newSection.citations || []);
      setDisplayedMetadata(newSection.metadata);
    }
  };
  
  return (
    <div style={{ width: '100%', marginTop: '24px' }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <CategoryIcon sx={{ mr: 1, color: 'primary.main' }} />
          Select Trend Category
        </Typography>
        
        <Grid container spacing={3}>
          <Box sx={{ width: { xs: '100%', md: '50%' }, pr: { md: 1.5 } }}>
            <FormControl fullWidth>
              <InputLabel id="trends-category-label">Category</InputLabel>
              <Select
                labelId="trends-category-label"
                id="trends-category-select"
                value={selectedCategoryKey}
                label="Category"
                onChange={handleCategoryChange}
                disabled={loading}
              >
                {availableCategories.map((category) => (
                  <MenuItem key={category.key} value={category.key}>{category.name}</MenuItem>
                ))}
              </Select>
              <FormHelperText>Select a category to view its specific project trends.</FormHelperText>
            </FormControl>
          </Box>
        </Grid>
      </Paper>
      
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 0 }}>
            <TrendingUpIcon sx={{ mr: 1, color: 'primary.main' }} />
            Predictive Project Trends for {selectedCategoryKey}
          </Typography>
          
          {displayedMetadata && (
            <Tooltip title={
              <>
                <Typography variant="body2"><strong>Generated:</strong> {new Date(displayedMetadata.timestamp).toLocaleString()}</Typography>
                <Typography variant="body2"><strong>Category:</strong> {displayedMetadata.category_filter}</Typography>
                <Typography variant="body2"><strong>Projects Analyzed:</strong> {displayedMetadata.total_projects_analyzed}</Typography>
                <Typography variant="body2"><strong>Data Source:</strong> {displayedMetadata.data_source}</Typography>
              </>
            }>
              <IconButton size="small">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        
        <Typography variant="body1" sx={{ mb: 3 }}>
          Based on historical data, here are the top predictive project trends for the selected category. 
          Each trend includes a confidence score indicating the reliability of the prediction.
        </Typography>
        
        {loading ? (
          <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="400px">
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Loading Project Trends...</Typography>
          </Box>
        ) : displayedTrends.length === 0 ? (
          <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" sx={{ py: 6 }}>
            <ErrorOutlineIcon color="action" sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              No Trend Data Available
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ maxWidth: 600 }}>
              There is no trend data available for the selected category in the report.
            </Typography>
          </Box>
        ) : (
          <TrendsList trendsData={displayedTrends} citations={displayedCitations} />
        )}
      </Paper>
    </div>
  );
};

export default Trends;