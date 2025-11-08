import React, { useState, useCallback, useEffect } from 'react';
import { Container, Typography, CircularProgress, Alert, Box } from '@mui/material';
import axios from '../../../backend connection/axiosConfig';
import Graph, { ViewBy } from './Graph';
import Response from './Response';
import './Forecast.css';

// --- NEW Top-Level Interfaces for the entire forecast report ---
interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor: string[];
}

interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

interface Analysis {
  summary: string;
  trends: any[]; // Can be more specific if structure is known
  forecast_analysis: string;
  recommendations: any[]; // Can be more specific
  confidence: number;
}

interface ReportSection {
  chart_data: ChartData;
  analysis: Analysis;
}

export interface ForecastReport {
  by_committee: ReportSection;
  by_category: ReportSection;
  metadata: {
    data_source: string;
    total_projects_analyzed: number;
    timestamp: string;
    gemini_used: boolean;
    lstm_used: boolean;
  };
}
// --- END NEW Interfaces ---

const Forecast: React.FC = () => {
  const [viewBy, setViewBy] = useState<ViewBy>('committee');
  
  // State for the fetched data
  const [forecastData, setForecastData] = useState<ForecastReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the entire forecast report once on component mount
  useEffect(() => {
    const fetchForecastReport = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await axios.get<ForecastReport>('/api/reports/forecast');
        if (!response.data || !response.data.by_committee || !response.data.by_category) {
          throw new Error('Invalid data structure received from the server.');
        }
        setForecastData(response.data);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to fetch forecast report. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchForecastReport();
  }, []);

  const handleViewChange = useCallback((newView: ViewBy) => {
    setViewBy(newView);
  }, []);

  // Determine which part of the data to pass down based on the current view
  const activeReportSection = forecastData ? forecastData[`by_${viewBy}`] : null;

  return (
    <div className="content-wrapper">
      <Container maxWidth="xl" className="forecast-container">
        <Typography variant="h4" component="h1" gutterBottom className="forecast-title">
          Budget Forecasting
        </Typography>
        
        <div className="forecast-content">
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
              <CircularProgress />
              <Typography sx={{ ml: 2 }}>Loading Forecast Data...</Typography>
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : forecastData && activeReportSection ? (
            <>
              {/* Pass the entire report and view selection down to Graph */}
              <Graph 
                currentView={viewBy} 
                onViewChange={handleViewChange}
                chartData={activeReportSection.chart_data}
              />
              {/* Pass only the relevant analysis object to Response */}
              <Response analysis={activeReportSection.analysis} />
            </>
          ) : (
            <Alert severity="info">No forecast data available.</Alert>
          )}
        </div>
      </Container>
    </div>
  );
};

export default Forecast;