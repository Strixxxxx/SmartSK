import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Paper,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemText,
  Chip,
  Skeleton,
  Stack
} from '@mui/material';
import axios from '../../../backend connection/axiosConfig';
import '../Forecast/Forecast.css';
import { ViewBy } from './Graph';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import InsightsIcon from '@mui/icons-material/Insights';

interface AnalysisData {
  summary?: string;
  trends?: Array<{ title?: string; description?: string; type?: 'positive' | 'negative' | 'info'; }>;
  recommendations?: any[]; // Changed from string[] to any[] to be safe
  confidence?: number;
  chartExplanation?: { 
    title?: string; 
    description?: string; 
    howToRead?: string[];
    keyInsights?: string[];
  };
  metadata?: { 
    data_source?: string;
    gemini_used?: boolean;
    generated_at?: string;
    total_projects_analyzed?: number;
    view_by?: string;
  };
  error?: boolean;
  message?: string;
}

interface ResponseProps {
  filters: { view_by: ViewBy; };
}

const AnalysisSkeleton: React.FC = () => (
  <Paper elevation={3} className="response-container">
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        <Skeleton width="60%" />
      </Typography>
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="bold"><Skeleton width="40%" /></Typography>
        <Typography variant="body2"><Skeleton /></Typography>
        <Typography variant="body2"><Skeleton /></Typography>
        <Typography variant="body2"><Skeleton width="80%" /></Typography>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="bold"><Skeleton width="30%" /></Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
          <Skeleton variant="rounded" height={40} />
        </Stack>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" fontWeight="bold"><Skeleton width="35%" /></Typography>
        <Stack spacing={1} sx={{ mt: 1 }}>
          <Skeleton variant="rounded" height={30} />
          <Skeleton variant="rounded" height={30} />
        </Stack>
      </Box>
      <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: 'text.secondary' }}>
        Generating AI insights... This may take a minute.
      </Typography>
    </Box>
  </Paper>
);

const Response: React.FC<ResponseProps> = ({ filters }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

  useEffect(() => {
    if (!filters.view_by) {
      setLoading(false);
      setAnalysisData(null);
      setError(null);
      return;
    }

    const controller = new AbortController();

    const fetchAnalysisData = async () => {
      setLoading(true);
      setAnalysisData(null);
      setError(null);

      try {
        const response = await axios.get('/api/forecast-analysis', {
          params: { view_by: filters.view_by },
          timeout: 180000, // Increased timeout to 3 minutes
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (typeof response.data !== 'object' || response.data === null) {
          throw new Error('Invalid analysis data format: response is not a JSON object.');
        }
        
        if (response.data.error) {
          throw new Error(response.data.message || 'Analysis generation failed in the backend.');
        }
        
        if (!response.data.summary && !response.data.trends && !response.data.recommendations) {
            throw new Error('Analysis response is missing key data (summary, trends, or recommendations).');
        }

        setAnalysisData(response.data);
        setError(null);
        
      } catch (err: any) {
        if (controller.signal.aborted) {
          console.log('Request aborted');
          return;
        }
        console.error('Analysis fetch error:', err);
        
        let errorMessage = 'Failed to fetch analysis.';
        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
            errorMessage = 'The AI analysis took too long to respond. This can happen with large datasets. Please try again later.';
        } else {
            const details = err.response?.data?.details || err.message;
            if (typeof details === 'object') {
                errorMessage = JSON.stringify(details);
            } else if (details) {
                errorMessage = String(details);
            }
        }
        
        setError(errorMessage);
        setAnalysisData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchAnalysisData();

    return () => {
      controller.abort();
    };
  }, [filters]);

  if (loading) {
    return <AnalysisSkeleton />;
  }

  if (error) {
    return (
      <Paper elevation={3} className="response-container">
        <Alert severity="error" sx={{ m: 2 }}>
          <AlertTitle>Analysis Error</AlertTitle>
          {error}
        </Alert>
      </Paper>
    );
  }

  if (analysisData) {
    return (
      <Paper elevation={3} className="response-container">
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <InsightsIcon sx={{ mr: 1 }} /> AI-Powered Budget Analysis
          </Typography>
          
          {analysisData.chartExplanation && (
            <Box sx={{ mb: 4, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2, background: '#f9f9f9' }}>
              <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                {analysisData.chartExplanation.title || "Understanding the Chart"}
              </Typography>
              <Typography variant="body2" paragraph color="text.secondary">
                {analysisData.chartExplanation.description}
              </Typography>
            </Box>
          )}
          
          {analysisData.summary && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="bold">Executive Summary</Typography>
              <Typography variant="body2" paragraph color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {analysisData.summary}
              </Typography>
            </Box>
          )}

          {analysisData.trends && analysisData.trends.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}><TrendingUpIcon sx={{ mr: 1 }}/> Key Trends</Typography>
              <List dense>
                {analysisData.trends.map((trend, index) => (
                  <ListItem key={index} disableGutters>
                    <Chip 
                      label={trend.type || 'info'} 
                      size="small" 
                      sx={{ mr: 2, minWidth: '70px' }} 
                      color={trend.type === 'positive' ? 'success' : trend.type === 'negative' ? 'error' : 'info'} 
                    />
                    <ListItemText 
                      primary={trend.title || 'Untitled Trend'}
                      secondary={trend.description || 'No description provided.'}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {analysisData.recommendations && analysisData.recommendations.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}><LightbulbIcon sx={{ mr: 1 }}/> Recommendations</Typography>
              <List dense>
                {analysisData.recommendations.map((rec, index) => (
                  <ListItem key={index} disableGutters>
                    <CheckCircleIcon color="success" sx={{ fontSize: 20, mr: 1.5 }} />
                    <ListItemText primary={rec.action} />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            {analysisData.confidence !== undefined && analysisData.confidence !== null && (
              <Typography variant="body2" color="text.secondary">
                Confidence: {Math.round(analysisData.confidence * 100)}%
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {analysisData.metadata?.generated_at ? `Generated: ${new Date(analysisData.metadata.generated_at).toLocaleString()}` : ''}
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} className="response-container">
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Select a view (e.g., by Committee) to generate AI-powered analysis.
        </Typography>
      </Box>
    </Paper>
  );
};

export default Response;