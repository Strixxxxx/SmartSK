import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Paper, 
  Box,
  CircularProgress,
  Alert,
  
  Chip,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  List,
  
  
  
  Avatar,
  Tooltip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  SelectChangeEvent,
  FormHelperText,
  Snackbar,
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
import InfoIcon from '@mui/icons-material/Info';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

import FilterAltIcon from '@mui/icons-material/FilterAlt';
import CategoryIcon from '@mui/icons-material/Category';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import axiosInstance from '../../../backend connection/axiosConfig';

interface TrendData {
  id: number;
  name: string;
  description: string;
  confidence: number;
  trend: 'up' | 'down' | 'stable';
  category: string;
  subcategory?: string;  // For custom trends
  impact: 'high' | 'medium' | 'low';
}

interface TrendsApiResponse {
  trends: TrendData[];
  forecast_year?: number;
  category?: string;  // For custom trends
  categories?: string[]; // For dynamic categories
  error?: boolean;
  message?: string;
  metadata?: {
    generated_at: string;
    historical_data_points?: number;
    internet_sources_used: number;
    spreadsheet_data_sources?: string[];
    primary_data_count?: number;
    filters_applied: any;
    forecast_year?: number;
    category?: string;
    note?: string;
    error?: string;
    error_details?: string;
    is_custom_category?: boolean;
    custom_category_type?: string;
    user_defined_category?: string;
    data_weighting?: string;  // Information about data source weighting
  }
}

interface TrendsProps {
  filters?: {
    category?: string;
    budget?: string;
    startDate?: string;
    endDate?: string;
  };
}

// Generate available forecast years (2025-2050)
const generateForecastYears = () => {
  const years = [];
  const currentYear = new Date().getFullYear();
  
  // First option is always "Next Year" (default)
  years.push({ value: "", label: `Next Year (${currentYear + 1})` });
  
  // Add years from 2025 to 2050
  for (let year = 2025; year <= 2050; year++) {
    years.push({ value: year.toString(), label: year.toString() });
  }
  
  return years;
};

const FORECAST_YEARS = generateForecastYears();

const Trends: React.FC<TrendsProps> = ({ filters }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [trendsData, setTrendsData] = useState<TrendData[]>([]);
  const [metadata, setMetadata] = useState<TrendsApiResponse['metadata']>(undefined);
  const [forecastYear, setForecastYear] = useState<number>(new Date().getFullYear() + 1);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [isCustomForecasting, setIsCustomForecasting] = useState<boolean>(false);
  const [dynamicCategories, setDynamicCategories] = useState<{ value: string; label: string }[]>([
    { value: "", label: "General Trends" },
    { value: "Others", label: "Others (Custom)" }
  ]);
  
  // Custom forecasting filters
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [otherCategory, setOtherCategory] = useState<string>("");
  const [customCategoryVisible, setCustomCategoryVisible] = useState<boolean>(false);
  const [otherCategoryError, setOtherCategoryError] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  
  // List of inappropriate terms to block
  const inappropriateTerms = [
    "idiot", "stupid", "dumb", "moron", "ass", "fuck", "shit", "bitch", "damn", 
    "hell", "bastard", "cunt", "dick", "pussy", "cock", "slut", "whore", "nigger", 
    "faggot", "retard", "asshole", "jackass", "bullshit", "fag", "sex", "porn", 
    "nazi", "motherfucker", "wtf", "piss", "crap", "jerk", "nsfw", "xxx"
  ];
  
  useEffect(() => {
    fetchTrendsData();
  }, [filters]);
  
  const handleCategoryChange = (event: SelectChangeEvent) => {
    const category = event.target.value;
    setSelectedCategory(category);
    setCustomCategoryVisible(category === "Others");
    
    // Clear any existing errors when changing category
    if (category !== "Others") {
      setOtherCategoryError(null);
    }
  };
  
  const handleYearChange = (event: SelectChangeEvent) => {
    setSelectedYear(event.target.value);
  };
  
  const handleOtherCategoryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setOtherCategory(value);
    
    // Validate the input for inappropriate content
    if (value) {
      const lowerValue = value.toLowerCase();
      for (const term of inappropriateTerms) {
        if (lowerValue.includes(term)) {
          setOtherCategoryError("Please use appropriate terms related to SK youth development programs.");
          return;
        }
      }
      
      // List of inherently youth-relevant categories that don't need the "youth" prefix
      const inherentlyRelevantCategories = [
        "livelihood", "entrepreneurship", "education", "training", "skills", 
        "healthcare", "environment", "sports", "culture", "leadership", 
        "governance", "technology", "digital", "community", "civic", "service", 
        "volunteering", "empowerment", "mentoring", "learning", "development"
      ];
      
      // Check if the category contains any of the inherently relevant terms
      let isInherentlyRelevant = false;
      for (const term of inherentlyRelevantCategories) {
        if (lowerValue.includes(term)) {
          isInherentlyRelevant = true;
          break;
        }
      }
      
      // Only check for general youth relevance if not already inherently relevant
      if (!isInherentlyRelevant) {
        // Check for terms that specifically mention youth
        const youthSpecificTerms = [
          "youth", "young", "teen", "adolescent", "student", "kabataan", 
          "children", "SK", "sangguniang"
        ];
        
        let hasYouthReference = false;
        for (const term of youthSpecificTerms) {
          if (lowerValue.includes(term)) {
            hasYouthReference = true;
            break;
          }
        }
        
        // If neither inherently relevant nor has youth reference, suggest adding "youth"
        if (!hasYouthReference && value.length > 3) {
          setOtherCategoryError("This will be automatically prefixed with 'Youth' if you proceed, or you can add it yourself.");
        } else {
          setOtherCategoryError(null);
        }
      } else {
        // Category is inherently relevant, so no error
        setOtherCategoryError(null);
      }
    } else {
      setOtherCategoryError(null);
    }
  };
  
  const handleApplyFilters = () => {
    // Check for errors before applying filters
    if (selectedCategory === "Others" && otherCategoryError) {
      return; // Don't proceed if there are validation errors
    }
    
    if (selectedCategory === "Others" && !otherCategory.trim()) {
      setOtherCategoryError("Please enter a custom category when 'Others' is selected.");
      return;
    }
    
    // Allow year-only or category-only requests
    const hasCategory = !!selectedCategory;
    const hasYear = !!selectedYear;
    
    // At least one of category or year must be selected
    if (!hasCategory && !hasYear) {
      alert("Please select at least a category or year to customize your forecast.");
      return;
    }
    
    setIsCustomForecasting(hasCategory || hasYear);
    fetchTrendsData(true);
  };
  
  const fetchTrendsData = async (isCustomRequest = false) => {
    try {
      setLoading(true);
      setError(null);
      setApiErrorMessage(null);
      
      // Build query parameters from filters
      const queryParams = new URLSearchParams();
      
      // Add base filters
      if (filters) {
        if (filters.budget && filters.budget !== 'all') queryParams.append('budget', filters.budget);
        if (filters.startDate) queryParams.append('startDate', filters.startDate);
        if (filters.endDate) queryParams.append('endDate', filters.endDate);
      }
      
      // For custom forecasting, add custom parameters
      if (isCustomRequest) {
        console.log('Creating custom forecast request with params:', {
          selectedCategory,
          selectedYear,
          otherCategory: selectedCategory === "Others" ? otherCategory : null
        });
        
        // For specific category forecasting
        if (selectedCategory) {
          queryParams.append('customCategory', selectedCategory);
          
          // For "Others" category with custom text input
          if (selectedCategory === "Others" && otherCategory.trim()) {
            queryParams.append('otherCategory', otherCategory.trim());
          }
        }
        
        // For specific year forecasting
        if (selectedYear) {
          queryParams.append('year', selectedYear);
        }
      } else if (filters?.category && filters.category !== 'all') {
        // Use category from base filters if not custom request
        queryParams.append('category', filters.category);
      }
      
      // Add a timestamp to prevent caching issues
      queryParams.append('_t', Date.now().toString());
      
      const url = isCustomRequest ? '/api/custom-project-trends' : '/api/project-trends';
      
      try {
        const response = await axiosInstance.get(url, { params: queryParams });
        const data: TrendsApiResponse = response.data;

        if (data.categories && !isCustomRequest) {
          const formattedCategories = data.categories.map((cat: string) => ({
            value: cat,
            label: cat,
          }));
          setDynamicCategories([
            { value: "", label: "General Trends" },
            ...formattedCategories,
            { value: "Others", label: "Others (Custom)" }
          ]);
        }
        
        // Set next year as forecast year
        const nextYear = new Date().getFullYear() + 1;
        
        // Check if the response contains an error flag
        if (data.error) {
          const errorMessage = data.message || 'Failed to generate trend forecast';
          console.error('API returned error:', errorMessage);
          if (errorMessage.includes('inappropriate language')) {
              setSnackbarMessage('Inappropriate word detected. Cannot be processed.');
              setSnackbarOpen(true);
              setApiErrorMessage(null); // Don't show the main error box
          } else {
              setApiErrorMessage(errorMessage);
          }
          setTrendsData([]);
          if (data.forecast_year) {
            setForecastYear(data.forecast_year);
          } else {
            setForecastYear(nextYear);
          }
          if (data.metadata) {
            setMetadata(data.metadata);
          }
          setLoading(false);
          return;
        }
        
        // Check if the response has the expected structure
        if (data && data.trends && Array.isArray(data.trends)) {
          setTrendsData(data.trends);
          
          // Set forecast year from response or fallback to next year
          if (data.forecast_year) {
            setForecastYear(data.forecast_year);
          } else if (data.metadata?.forecast_year) {
            setForecastYear(data.metadata.forecast_year);
          }
          else {
            setForecastYear(nextYear);
          }
          
          if (data.metadata) {
            setMetadata(data.metadata);
          }
        } else {
          console.error('Unexpected API response format:', data);
          setError('Unexpected API response format. Expected trends array is missing.');
        }
      } catch (fetchError: any) {
        console.error('API fetch error:', fetchError);
        const errorMessage = fetchError.response?.data?.message || 'Failed to connect to trends forecast API. Please try again later.';
        if (errorMessage && errorMessage.includes('inappropriate language')) {
            setSnackbarMessage('Inappropriate word detected. Cannot be processed.');
            setSnackbarOpen(true);
        } else {
            setError(errorMessage);
        }
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error in fetchTrendsData:', error);
      setError('An unexpected error occurred while fetching trends data.');
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    // If category is undefined or null, return default icon
    if (!category) {
      return <SettingsIcon />;
    }
    
    switch(category.toLowerCase()) {
      case 'education':
        return <LightbulbIcon />;
      case 'environment':
        return <CloudIcon />;
      case 'sports':
        return <ConstructionIcon />;
      case 'technology':
        return <DevicesIcon />;
      case 'healthcare':
        return <SecurityIcon />;
      case 'culture':
        return <MemoryIcon />;
      case 'livelihood':
        return <CodeIcon />;
      case 'security':
        return <StorageIcon />;
      case 'training':
        return <MemoryIcon />;
      default:
        return <SettingsIcon />;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch(trend) {
      case 'up':
        return <TrendingUpIcon sx={{ color: 'success.main' }} />;
      case 'down':
        return <TrendingDownIcon sx={{ color: 'error.main' }} />;
      case 'stable':
        return <TrendingFlatIcon sx={{ color: 'info.main' }} />;
      default:
        return <TrendingFlatIcon sx={{ color: 'info.main' }} />;
    }
  };

  const getImpactColor = (impact: string) => {
    switch(impact) {
      case 'high':
        return 'error.main';
      case 'medium':
        return 'warning.main';
      case 'low':
        return 'info.main';
      default:
        return 'info.main';
    }
  };

  return (
    <div style={{ width: '100%', marginTop: '24px' }}>
      <Snackbar
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={() => setSnackbarOpen(false)}
      >
        <Alert onClose={() => setSnackbarOpen(false)} severity="error" sx={{ width: '100%' }}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      {/* Custom Forecast Options Panel */}
      <Paper elevation={3} className="trends-paper" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 0 }}>
            <FilterAltIcon sx={{ mr: 1, color: 'primary.main' }} />
            Customize Project Trends
          </Typography>
        </Box>
        
        <Typography variant="body1" sx={{ mb: 3 }}>
          Select specific options to customize your SK project trends or leave as default for general next-year trends.
        </Typography>
        
        <Grid container spacing={3} sx={{ mb: 2 }}>
          <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 4' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <CategoryIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="subtitle2">Select Category:</Typography>
            </Box>
            <FormControl fullWidth>
              <InputLabel id="forecast-category-label">Forecast Category</InputLabel>
              <Select
                labelId="forecast-category-label"
                id="forecast-category"
                value={selectedCategory}
                label="Forecast Category"
                onChange={handleCategoryChange}
              >
                {dynamicCategories.map((category) => (
                  <MenuItem key={category.value} value={category.value}>{category.label}</MenuItem>
                ))}
              </Select>
              <FormHelperText>Choose a specific forecast category</FormHelperText>
            </FormControl>
          </Grid>
          
          <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 4' } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <CalendarTodayIcon fontSize="small" sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="subtitle2">Select Year:</Typography>
            </Box>
            <FormControl fullWidth>
              <InputLabel id="forecast-year-label">Forecast Year</InputLabel>
              <Select
                labelId="forecast-year-label"
                id="forecast-year"
                value={selectedYear}
                label="Forecast Year"
                onChange={handleYearChange}
              >
                {FORECAST_YEARS.map((year) => (
                  <MenuItem key={year.value} value={year.value}>{year.label}</MenuItem>
                ))}
              </Select>
              <FormHelperText>Choose a specific forecast year</FormHelperText>
            </FormControl>
          </Grid>
          
          <Grid sx={{ gridColumn: { xs: 'span 12', md: 'span 4' }, display: customCategoryVisible ? 'block' : 'none' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">Custom Category Name:</Typography>
            </Box>
            <TextField
              fullWidth
              id="other-category"
              label="Custom Category"
              variant="outlined"
              value={otherCategory}
              onChange={handleOtherCategoryChange}
              placeholder="Enter custom SK youth category"
              disabled={!customCategoryVisible}
              helperText={otherCategoryError || "Enter a youth development category like 'livelihood', 'technology', etc."}
              error={!!otherCategoryError}
            />
          </Grid>
        </Grid>
        
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleApplyFilters}
            startIcon={<FilterAltIcon />}
            size="large"
            sx={{ mt: 2, px: 3, py: 1 }}
            disabled={selectedCategory === "Others" && (!!otherCategoryError || !otherCategory.trim())}
          >
            Apply Filter
          </Button>
        </Box>
      </Paper>
      
      {/* Trends Forecast Results Panel */}
      <Paper elevation={3} className="trends-paper" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 0 }}>
            <TrendingUpIcon sx={{ mr: 1, color: 'primary.main' }} />
            {isCustomForecasting && (
              metadata?.category ? 
                `${metadata.category} Trends Forecast for ${forecastYear}` : 
                `SK Predictive Project Trends for ${forecastYear}`
            )}
            {!isCustomForecasting && `SK Predictive Project Trends fo ${forecastYear}`}
          </Typography>
          
          {metadata && (
            <Tooltip title={
              <>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>Forecast Information:</Typography>
                <Typography variant="body2">Generated: {new Date(metadata.generated_at).toLocaleString()}</Typography>
                <Typography variant="body2">Forecast Year: {metadata.forecast_year || forecastYear}</Typography>
                {metadata.category && <Typography variant="body2">Category: {metadata.category}</Typography>}
                
                <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1.5, mb: 0.5 }}>Data Sources:</Typography>
                
                {/* Primary Data Source Information */}
                <Typography variant="body2" sx={{ fontWeight: '500', mt: 1, color: 'primary.main' }}>
                  Primary Data (Database):
                </Typography>
                {metadata.historical_data_points && (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    Data points: {metadata.historical_data_points}
                  </Typography>
                )}
                
                {/* Secondary Data Source Information */}
                <Typography variant="body2" sx={{ fontWeight: '500', mt: 1, color: 'primary.main' }}>
                  Secondary Data (Internet):
                </Typography>
                <Typography variant="body2" sx={{ ml: 1 }}>
                  Sources: {metadata.internet_sources_used || 0}
                </Typography>
                
                {metadata.note && (
                  <Typography variant="body2" sx={{ mt: 1 }}>Note: {metadata.note}</Typography>
                )}
                
                {metadata.data_weighting && (
                  <Typography variant="body2" sx={{ mt: 1 }}>{metadata.data_weighting}</Typography>
                )}

                {metadata.error_details && (
                  <Typography variant="body2" sx={{ mt: 1, color: 'error.main' }}>Error details: {metadata.error_details}</Typography>
                )}
              </>
            }>
              <IconButton size="small">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        
        {!apiErrorMessage && (
          <Typography variant="body1" sx={{ mb: 3 }}>
            {isCustomForecasting && metadata?.category ? 
              `Based on current trends and historical data, here are the top ${trendsData.length} predictive ${metadata.category} trends for ${forecastYear}.` :
              `Based on historical project data from Sangguniang Kabataan of District 5, Quezon City, here are the top ${trendsData.length} predictive project trends for ${forecastYear}.`
            }
            Each trend includes a confidence score indicating the reliability of the prediction.
          </Typography>
        )}
        
        {loading ? (
          <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" height="400px">
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>
              {isCustomForecasting ? 
                `Analyzing data and generating ${selectedCategory ? selectedCategory + ' ' : ''}trends for ${selectedYear ? selectedYear : forecastYear}...` :
                `Analyzing historical data and generating trends for ${forecastYear}...`
              }
            </Typography>
          </Box>
        ) : apiErrorMessage ? (
          <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" sx={{ py: 6 }}>
            <ErrorOutlineIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="h6" color="error.main" gutterBottom align="center">
              AI Forecast Generation Failed
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ maxWidth: 600, mb: 2 }}>
              {apiErrorMessage}
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ maxWidth: 600 }}>
              The AI system was unable to generate forecast trends. This system only returns AI-generated responses without using fallback sample data.
            </Typography>
            {metadata && metadata.note && (
              <Alert severity="info" sx={{ mt: 3, maxWidth: 600 }}>
                <Typography variant="body2">{metadata.note}</Typography>
              </Alert>
            )}
            {metadata && metadata.error_details && (
              <Alert severity="error" sx={{ mt: 2, maxWidth: 600 }}>
                <Typography variant="body2"><strong>Error details:</strong> {metadata.error_details}</Typography>
              </Alert>
            )}
          </Box>
        ) : trendsData.length === 0 ? (
          <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" sx={{ py: 6 }}>
            <ErrorOutlineIcon color="error" sx={{ fontSize: 64, mb: 2 }} />
            <Typography variant="h6" color="error.main" gutterBottom>
              No AI-Generated Trend Data Available
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ maxWidth: 600, mb: 2 }}>
              The system received a response without any trend data. This indicates that the AI forecast generation process was not successful.
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ maxWidth: 600 }}>
              This system is configured to only return AI-generated forecasts without fallback to sample data.
            </Typography>
            {metadata && metadata.note && (
              <Alert severity="info" sx={{ mt: 3, maxWidth: 600 }}>
                <Typography variant="body2">{metadata.note}</Typography>
              </Alert>
            )}
          </Box>
        ) : (
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
                        {trend.description}
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
        )}
        
        {!apiErrorMessage && trendsData.length > 0 && (
          <Box mt={3} p={2} bgcolor="rgba(240, 248, 255, 0.6)" borderRadius={1}>
            <Typography variant="caption" color="text.secondary">
              <strong>Note:</strong> The forecast is based 70% on primary data (Database) and 30% on secondary data (Internet Sources).
            </Typography>
          </Box>
        )}
      </Paper>
    </div>
  );
};

export default Trends;