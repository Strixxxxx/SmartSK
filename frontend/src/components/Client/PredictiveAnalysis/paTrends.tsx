import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Paper, 
  Box,
  CircularProgress,
  Alert,
  Grid,
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
  Tooltip,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InfoIcon from '@mui/icons-material/Info';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import CategoryIcon from '@mui/icons-material/Category';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import axiosInstance from '../../../backend connection/axiosConfig';
import TrendsList from './paTrendsV2';

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

interface TrendsApiResponse {
  trends: TrendData[];
  citations?: Citation[];
  forecast_year?: number;
  category?: string;
  categories?: string[];
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
    data_weighting?: string;
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

const generateForecastYears = () => {
  const years = [];
  const currentYear = new Date().getFullYear();
  years.push({ value: "", label: `Next Year (${currentYear + 1})` });
  for (let year = 2025; year <= 2050; year++) {
    years.push({ value: year.toString(), label: year.toString() });
  }
  return years;
};

const FORECAST_YEARS = generateForecastYears();

const inappropriateTerms = [
  "idiot", "stupid", "dumb", "moron", "ass", "fuck", "shit", "bitch", "damn", 
  "hell", "bastard", "cunt", "dick", "pussy", "cock", "slut", "whore", "nigger", 
  "faggot", "retard", "asshole", "jackass", "bullshit", "fag", "sex", "porn", 
  "nazi", "motherfucker", "wtf", "piss", "crap", "jerk", "nsfw", "xxx"
];

const Trends: React.FC<TrendsProps> = ({ filters }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [trendsData, setTrendsData] = useState<TrendData[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [metadata, setMetadata] = useState<TrendsApiResponse['metadata']>(undefined);
  const [forecastYear, setForecastYear] = useState<number>(new Date().getFullYear() + 1);
  const [apiErrorMessage, setApiErrorMessage] = useState<string | null>(null);
  const [isCustomForecasting, setIsCustomForecasting] = useState<boolean>(false);
  const [dynamicCategories, setDynamicCategories] = useState<{ value: string; label: string }[]>([
    { value: "", label: "General Trends" },
    { value: "Others", label: "Others (Custom)" }
  ]);
  
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [otherCategory, setOtherCategory] = useState<string>("");
  const [customCategoryVisible, setCustomCategoryVisible] = useState<boolean>(false);
  const [otherCategoryError, setOtherCategoryError] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  
  useEffect(() => {
    fetchTrendsData();
  }, [filters]);
  
  const handleCategoryChange = (event: SelectChangeEvent) => {
    const category = event.target.value;
    setSelectedCategory(category);
    setCustomCategoryVisible(category === "Others");
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
    
    if (value) {
      const lowerValue = value.toLowerCase();
      for (const term of inappropriateTerms) {
        if (lowerValue.includes(term)) {
          setOtherCategoryError("Please use appropriate terms related to SK youth development programs.");
          return;
        }
      }
      
      const inherentlyRelevantCategories = [
        "livelihood", "entrepreneurship", "education", "training", "skills", 
        "healthcare", "environment", "sports", "culture", "leadership", 
        "governance", "technology", "digital", "community", "civic", "service", 
        "volunteering", "empowerment", "mentoring", "learning", "development"
      ];
      
      let isInherentlyRelevant = false;
      for (const term of inherentlyRelevantCategories) {
        if (lowerValue.includes(term)) {
          isInherentlyRelevant = true;
          break;
        }
      }
      
      if (!isInherentlyRelevant) {
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
        
        if (!hasYouthReference && value.length > 3) {
          setOtherCategoryError("This will be automatically prefixed with 'Youth' if you proceed, or you can add it yourself.");
        } else {
          setOtherCategoryError(null);
        }
      } else {
        setOtherCategoryError(null);
      }
    } else {
      setOtherCategoryError(null);
    }
  };
  
  const handleApplyFilters = () => {
    if (selectedCategory === "Others" && otherCategoryError) {
      return;
    }
    
    if (selectedCategory === "Others" && !otherCategory.trim()) {
      setOtherCategoryError("Please enter a custom category when 'Others' is selected.");
      return;
    }
    
    const hasCategory = !!selectedCategory;
    const hasYear = !!selectedYear;
    
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
      
      const queryParams = new URLSearchParams();
      
      if (filters) {
        if (filters.budget && filters.budget !== 'all') queryParams.append('budget', filters.budget);
        if (filters.startDate) queryParams.append('startDate', filters.startDate);
        if (filters.endDate) queryParams.append('endDate', filters.endDate);
      }
      
      if (isCustomRequest) {
        console.log('Creating custom forecast request with params:', {
          selectedCategory,
          selectedYear,
          otherCategory: selectedCategory === "Others" ? otherCategory : null
        });
        
        if (selectedCategory) {
          queryParams.append('customCategory', selectedCategory);
          if (selectedCategory === "Others" && otherCategory.trim()) {
            queryParams.append('otherCategory', otherCategory.trim());
          }
        }
        
        if (selectedYear) {
          queryParams.append('year', selectedYear);
        }
      } else if (filters?.category && filters.category !== 'all') {
        queryParams.append('category', filters.category);
      }
      
      queryParams.append('_t', Date.now().toString());
      
      const url = isCustomRequest ? '/api/custom-project-trends' : '/api/project-trends';
      
      try {
        const response = await axiosInstance.get(url, { params: queryParams });
        const data: TrendsApiResponse = response.data;

        console.log("Trends data received:", JSON.stringify(data, null, 2));
        console.log("Citations in response:", data.citations);
        console.log("Metadata:", data.metadata);

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
        
        const nextYear = new Date().getFullYear() + 1;
        
        if (data.error) {
          const errorMessage = data.message || 'Failed to generate trend forecast';
          console.error('API returned error:', errorMessage);
          if (errorMessage.includes('inappropriate language')) {
              setSnackbarMessage('Inappropriate word detected. Cannot be processed.');
              setSnackbarOpen(true);
              setApiErrorMessage(null);
          } else {
              setApiErrorMessage(errorMessage);
          }
          setTrendsData([]);
          setCitations([]);
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
        
        if (data && data.trends && Array.isArray(data.trends)) {
          setTrendsData(data.trends);
          setCitations(data.citations || []);
          
          if (data.forecast_year) {
            setForecastYear(data.forecast_year);
          } else if (data.metadata?.forecast_year) {
            setForecastYear(data.metadata.forecast_year);
          } else {
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
              <InputLabel id="forecast-year-label">Time Period</InputLabel>
              <Select
                labelId="forecast-year-label"
                id="forecast-year"
                value={selectedYear}
                label="Time Period"
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
      
      <Paper elevation={3} className="trends-paper" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="h5" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 0 }}>
            <TrendingUpIcon sx={{ mr: 1, color: 'primary.main' }} />
            {isCustomForecasting && (
              metadata?.category ? 
                `${metadata.category} Trends Forecast for ${forecastYear}` : 
                `SK Predictive Project Trends for ${forecastYear}`
            )}
            {!isCustomForecasting && `SK Predictive Project Trends for ${forecastYear}`}
          </Typography>
          
          {metadata && (
            <Tooltip title={
              <>
                <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>Forecast Information:</Typography>
                <Typography variant="body2">Generated: {new Date(metadata.generated_at).toLocaleString()}</Typography>
                <Typography variant="body2">Forecast Year: {metadata.forecast_year || forecastYear}</Typography>
                {metadata.category && <Typography variant="body2">Category: {metadata.category}</Typography>}
                
                <Typography variant="body2" sx={{ fontWeight: 'bold', mt: 1.5, mb: 0.5 }}>Data Sources:</Typography>
                <Typography variant="body2" sx={{ fontWeight: '500', mt: 1, color: 'primary.main' }}>
                  Primary Data (Database):
                </Typography>
                {metadata.historical_data_points && (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    Data points: {metadata.historical_data_points}
                  </Typography>
                )}
                
                <Typography variant="body2" sx={{ fontWeight: '500', mt: 1, color: 'primary.main' }}>
                  Secondary Data (Internet):
                </Typography>
                <Typography variant="body2" sx={{ ml: 1 }}>
                  Sources: {metadata.internet_sources_used || 0}
                </Typography>
                
                {citations && citations.length > 0 && (
                  <Typography variant="body2" sx={{ ml: 1 }}>
                    Citations: {citations.length}
                  </Typography>
                )}
                
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
          <TrendsList trendsData={trendsData} citations={citations} />
        )}
        
        {!apiErrorMessage && trendsData.length > 0 && (
          <Box mt={3} p={2} bgcolor="rgba(240, 248, 255, 0.6)" borderRadius={1}>
            <Typography variant="caption" color="text.secondary">
              <strong>Note:</strong> The forecast is based 70% on primary data (Database) and 30% on secondary data (Internet Sources).
              {citations && citations.length > 0 && ` This analysis includes ${citations.length} cited sources.`}
            </Typography>
          </Box>
        )}
      </Paper>
    </div>
  );
};

export default Trends;