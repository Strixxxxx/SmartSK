import React from 'react';
import { 
  Box, 
  Typography, 
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider
} from '@mui/material';
import '../Forecast/Forecast.css';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import InsightsIcon from '@mui/icons-material/Insights';
import ReactMarkdown from 'react-markdown';

// Interface for the analysis object, matching the new JSON structure
interface Analysis {
  summary: string;
  trends: string[] | Array<{ description?: string; category_impact?: string }>;
  forecast_analysis: string;
  recommendations: string[] | Array<{ recommendation?: string; category_focus?: string }>;
  confidence: number;
}

interface ResponseProps {
  analysis: Analysis | null;
}

const Response: React.FC<ResponseProps> = ({ analysis }) => {
  // This component no longer fetches data. It just renders what it's given.
  // Loading and error states are handled by the parent component.

  if (!analysis) {
    return (
      <Paper elevation={3} className="response-container">
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1" color="text.secondary">
            Analysis data is not available.
          </Typography>
        </Box>
      </Paper>
    );
  }

  // Helper to render trend items which can be strings or objects
  const renderTrend = (trend: any, index: number) => {
    if (typeof trend === 'string') {
      return <ListItemText primary={<ReactMarkdown>{trend}</ReactMarkdown>} />;
    }
    if (typeof trend === 'object' && trend.description) {
      return <ListItemText primary={<ReactMarkdown>{trend.description}</ReactMarkdown>} secondary={trend.category_impact ? `Impact: ${trend.category_impact}` : ''} />;
    }
    return <ListItemText primary={`Invalid trend format at index ${index}`} />;
  };

  // Helper to render recommendation items which can be strings or objects
  const renderRecommendation = (rec: any, index: number) => {
    if (typeof rec === 'string') {
      return <ListItemText primary={rec} />;
    }
    if (typeof rec === 'object' && rec.recommendation) {
      return <ListItemText primary={rec.recommendation} secondary={rec.category_focus ? `Focus: ${rec.category_focus}` : ''} />;
    }
    // Fallback for the older format that had `action`
    if (typeof rec === 'object' && rec.action) {
      return <ListItemText primary={rec.action} />;
    }
    return <ListItemText primary={`Invalid recommendation format at index ${index}`} />;
  };

  return (
    <Paper elevation={3} className="response-container">
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
          <InsightsIcon sx={{ mr: 1.5, color: 'primary.main' }} /> AI-Powered Budget Analysis
        </Typography>
        <Divider sx={{ mb: 3 }} />
        
        {analysis.summary && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Executive Summary</Typography>
            <Typography variant="body1" paragraph color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {analysis.summary}
            </Typography>
          </Box>
        )}

        {analysis.trends && analysis.trends.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}><TrendingUpIcon sx={{ mr: 1.5, color: 'info.main' }}/> Key Trends</Typography>
            <List dense>
              {analysis.trends.map((trend, index) => (
                <ListItem key={index} disableGutters>
                  <ListItemIcon sx={{ minWidth: 40 }}><TrendingUpIcon color="action" /></ListItemIcon>
                  {renderTrend(trend, index)}
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {analysis.forecast_analysis && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom>Forecast Analysis</Typography>
            <Typography variant="body1" paragraph color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
              {analysis.forecast_analysis}
            </Typography>
          </Box>
        )}

        {analysis.recommendations && analysis.recommendations.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}><LightbulbIcon sx={{ mr: 1.5, color: 'warning.main' }}/> Recommendations</Typography>
            <List dense>
              {analysis.recommendations.map((rec, index) => (
                <ListItem key={index} disableGutters>
                  <ListItemIcon sx={{ minWidth: 40 }}><CheckCircleIcon color="success" /></ListItemIcon>
                  {renderRecommendation(rec, index)}
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        <Divider sx={{ mt: 3, mb: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          {analysis.confidence !== undefined && analysis.confidence !== null && (
            <Typography variant="body2" color="text.secondary">
              AI Confidence: <strong>{Math.round(analysis.confidence * 100)}%</strong>
            </Typography>
          )}
        </Box>
      </Box>
    </Paper>
  );
};

export default Response;