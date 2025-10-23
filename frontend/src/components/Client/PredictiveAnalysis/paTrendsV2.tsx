import React from 'react';
import {
  Typography, 
  Box,
  Chip,
  Card,
  CardContent,
  LinearProgress,
  List,
  Avatar,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import MemoryIcon from '@mui/icons-material/Memory';
import ConstructionIcon from '@mui/icons-material/Construction';
import CodeIcon from '@mui/icons-material/Code';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import DevicesIcon from '@mui/icons-material/Devices';
import CloudIcon from '@mui/icons-material/Cloud';
import StorageIcon from '@mui/icons-material/Storage';
import SettingsIcon from '@mui/icons-material/Settings';
import SecurityIcon from '@mui/icons-material/Security';
import CitationRenderer from './CitationRenderer';

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

interface TrendsListProps {
  trendsData: TrendData[];
  citations: Citation[];
}

const getCategoryIcon = (category: string) => {
    if (!category) {
      return <SettingsIcon />;
    }
    switch(category.toLowerCase()) {
      case 'education': return <LightbulbIcon />;
      case 'environment': return <CloudIcon />;
      case 'sports': return <ConstructionIcon />;
      case 'technology': return <DevicesIcon />;
      case 'healthcare': return <SecurityIcon />;
      case 'culture': return <MemoryIcon />;
      case 'livelihood': return <CodeIcon />;
      case 'security': return <StorageIcon />;
      case 'training': return <MemoryIcon />;
      default: return <SettingsIcon />;
    }
};

const getTrendIcon = (trend: string) => {
    switch(trend) {
      case 'up': return <TrendingUpIcon sx={{ color: 'success.main' }} />;
      case 'down': return <TrendingDownIcon sx={{ color: 'error.main' }} />;
      case 'stable': return <TrendingFlatIcon sx={{ color: 'info.main' }} />;
      default: return <TrendingFlatIcon sx={{ color: 'info.main' }} />;
    }
};

const getImpactColor = (impact: string) => {
    switch(impact) {
      case 'high': return 'error.main';
      case 'medium': return 'warning.main';
      case 'low': return 'info.main';
      default: return 'info.main';
    }
};

const TrendsList: React.FC<TrendsListProps> = ({ trendsData, citations }) => {
  return (
    <>
      <List>
        {trendsData.map((trend, index) => (
          <Card key={trend.id} sx={{ mb: 2, borderLeft: 6, borderColor: getImpactColor(trend.impact) }}>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'left', md: 'center' }, minWidth: { md: '60px' } }}>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    {index + 1}
                  </Avatar>
                </Box>
                
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography variant="h6" component="h3">
                        {trend.name}
                      </Typography>
                      {getTrendIcon(trend.trend)}
                    </Box>
                    
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {trend.subcategory && trend.subcategory !== trend.category && (
                        <Chip 
                          label={trend.subcategory} 
                          size="small" 
                          variant="outlined"
                          sx={{ textTransform: 'capitalize' }}
                        />
                      )}
                      <Chip 
                        icon={getCategoryIcon(trend.category)} 
                        label={trend.category} 
                        size="small" 
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </Box>
                  </Box>
                  
                  <Typography variant="body1" paragraph color="text.secondary">
                    <CitationRenderer text={trend.description} citations={citations} />
                  </Typography>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ width: '140px' }}>
                      Confidence: {Math.round(trend.confidence * 100)}%
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={trend.confidence * 100} 
                      sx={{ 
                        flexGrow: 1, 
                        height: 8, 
                        borderRadius: 1,
                        bgcolor: 'rgba(0,0,0,0.05)',
                        '& .MuiLinearProgress-bar': {
                          backgroundColor: trend.confidence > 0.9 ? 'success.main' : 
                                           trend.confidence > 0.8 ? 'primary.main' : 'warning.main'
                        }
                      }} 
                    />
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </List>

    </>
  );
};

export default TrendsList;
