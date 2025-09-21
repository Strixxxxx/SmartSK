import React, { useState, useCallback, useEffect } from 'react';
import { Card, Button, Form, Row, Col, Spinner, Alert, InputGroup } from 'react-bootstrap';
import axiosInstance from '../../../backend connection/axiosConfig';
import { toast } from 'react-toastify'; // Ensure toast is imported
import PredictiveAnalysisResponse from './paResponse'; // Existing component for general results
import PaCstmResponse, { PaCstmApiResponse } from './paCstmResponse'; // **** ADDED: Import the new component and its main interface ****
import Trends from './paTrends';
import './pa.css';

// --- Interfaces ---

// Define proper types for analysis results (Original/General)
interface GeneralAnalysisResult {
  success_factors?: string[];
  recommendations?: string[];
  risks?: Array<{risk: string, mitigation: string}>;
  resource_allocation?: Record<string, string>; // This type is not used in paResponse.tsx
  predicted_trends?: string[] | Record<string, any>; // Update to handle both array and object
  raw_analysis?: string;
  error?: string;
  analysis_type?: string; // Add this field
  implementation_date?: string; // Add this field
  estimated_duration?: string; // Add this field
  feedback?: string | string[]; // Add this field
  timestamp?: string; // Add this field for error responses
  metadata?: {
    data_source: string; // This type is not used in paResponse.tsx
    internet_sources_consulted: number;
  };
}

// Removed CustomizedAnalysisResult interface as PaCstmApiResponse replaces it

interface ProjectAnalysisResult {
  success_probability?: number;
  challenges?: string[];
  critical_factors?: string[];
  resource_optimization?: string[];
  timeline_prediction?: string;
  raw_analysis?: string;
  error?: string;
}

interface ProjectIdea {
  name: string;
  description: string;
  expected_outcomes: string[];
  resources: string[];
  timeline: string;
  success_metrics: string[];
}

interface RecommendationsResult {
  project_ideas?: ProjectIdea[];
  raw_analysis?: string;
  error?: string;
}

// Add this interface to handle the raw output response from PyBridge
interface RawOutputResult {
  rawOutput: string;
  message: string;
  analysis_id?: string; // Add this field
  analysis_type?: string; // Add this field
}

// **** MODIFIED: Update AnalysisResult to include PaCstmApiResponse and null ****
type AnalysisResult = GeneralAnalysisResult | ProjectAnalysisResult | RecommendationsResult | RawOutputResult | PaCstmApiResponse | null; // Keep this as is

const PredictiveAnalysis: React.FC = () => {
  const [activeTab, setActiveTab] = useState('analysis');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // **** MODIFIED: Update state type to use the new AnalysisResult union ****
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>(null);

  // Form states for customization options
  const [timePeriod, setTimePeriod] = useState<string>('None');
  const [category, setCategory] = useState<string>('None');
  const [categories, setCategories] = useState<string[]>([]); // State for dynamic categories

  // Checkboxes for response customization
  const [includeBudget, setIncludeBudget] = useState<boolean>(true);
  const [includeDuration, setIncludeDuration] = useState<boolean>(true);
  const [includeImplementDate, setIncludeImplementDate] = useState<boolean>(true);
  const [includeRecommendations, setIncludeRecommendations] = useState<boolean>(true);
  const [includeRisks, setIncludeRisks] = useState<boolean>(true);
  const [includeTrends, setIncludeTrends] = useState<boolean>(true);
  const [includeSuccessFactors, setIncludeSuccessFactors] = useState<boolean>(true);
  const [includeFeedback, setIncludeFeedback] = useState<boolean>(true);

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Add state for tracking analysis progress
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{status: string, progress: number} | null>(null);

  // Add state for time period sub-category
  const [timeSubCategory, setTimeSubCategory] = useState<string>('');

  // Function to fetch categories for the dropdown
  const fetchCategories = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/api/rawdata/options');
      if (response.data && Array.isArray(response.data.categories)) {
        setCategories(response.data.categories);
      }
    } catch (error) {
      console.error('Error fetching categories:', (error as Error).message);
    }
  }, []);

  // Function to handle general analysis (moved before useEffect)
  const runGeneralAnalysis = useCallback(async (params: any) => {
    setLoading(true);
    setError(null);
    setAnalysisResult(null); // **** ADDED: Clear previous results ****

    try {
      toast.info(
        "Running general analysis using historical data. This could take some time, please wait...",
        {
          position: "top-right",
          autoClose: 8000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        }
      );

      // Make sure to include time_sub_category in params
      if (!params.time_sub_category && timeSubCategory) {
        params.time_sub_category = timeSubCategory;
      }

      console.log('Running general predictive analysis with options:', params);

      // Always call the predictive-analysis endpoint for general analysis (pa.py)
      // **** MODIFIED: Specify expected type ****
      const response = await axiosInstance.get<GeneralAnalysisResult>('/api/predictive-analysis/trends', { params }); // Corrected endpoint for general analysis
      console.log('Received general analysis response (raw):', response);
      console.log('Received general analysis response (data):', response.data);

      // Set the result (explicitly casting for clarity)
      // **** MODIFIED: Cast result ****
      setAnalysisResult(response.data as GeneralAnalysisResult);

      // Also set the error state if there's an error in the response
      if (response.data && response.data.error) {
        setError(response.data.error);
      }

    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to run general analysis. Please try again.';
      setError(errorMessage);

      // Set a minimal result with the error so paResponse can display it
      // **** MODIFIED: Set minimal error structure ****
      setAnalysisResult({
        error: errorMessage, // This is the error property expected by PredictiveAnalysisResponse
        timestamp: new Date().toISOString()
      } as GeneralAnalysisResult); // Cast to General for paResponse

      console.error('Error running general analysis:', err);
    } finally {
      setLoading(false);
    }
  }, []); // Remove timeSubCategory dependency to prevent auto-refresh

  // Add useEffect to run general analysis and fetch categories on component mount
  useEffect(() => {
    // Prepare general parameters (all true or defaults)
    const generalParams = {
      analysis_type: 'general',
      time_period: 'None',
      category: 'None',
      time_sub_category: '',
      // Explicitly include all sections for general response
      include_budget: true,
      include_duration: true,
      include_implement_date: true,
      include_recommendations: true,
      include_risks: true,
      include_trends: true,
      include_success_factors: true,
      include_feedback: true
    };
    // Run general analysis when component mounts
    runGeneralAnalysis(generalParams);
    fetchCategories(); // Fetch categories on mount
  }, [runGeneralAnalysis, fetchCategories]); // Use empty dependency array to run only on mount

  // Add a function to poll for progress updates (Keep implementation)
  const pollAnalysisProgress = useCallback((id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axiosInstance.get(`/api/predictive-analysis/progress/${id}`);
        setAnalysisProgress(response.data);

        // If progress is complete, stop polling
        if (response.data.status === 'completed' || response.data.progress >= 100) {
          clearInterval(interval);
        }
      } catch (error) {
        console.error("Error polling for progress:", error);
      }
    }, 1000); // Poll every second

    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, []);

  // Function to get time sub-category options based on selected time period (Keep implementation)
  const getTimeSubCategoryOptions = () => {
    const currentYear = new Date().getFullYear();

    if (timePeriod === 'Yearly') {
      // Years from 2025 to 2050
      return Array.from({length: 26}, (_, i) => (2025 + i).toString());
    } else if (timePeriod === 'Quarterly') {
      // Quarters of current year
      return ['1st Quarter', '2nd Quarter', '3rd Quarter', '4th Quarter'];
    } else if (timePeriod === 'Monthly') {
      // Months of current year
      return [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
    }
    return [];
  };

  // Update the existing runAnalysis function (Handles "Apply Filter" for Customized)
  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setAnalysisResult(null);
    setAnalysisProgress(null);

    const analysisType = selectedFile ? 'specified' : 'customized';

    try {
      toast.info(
        analysisType === 'customized'
          ? "Running customized analysis. This could take some time, please wait..."
          : "Analyzing your uploaded file. This could take some time, please wait...",
        {
          position: "top-right",
          autoClose: 8000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        }
      );

      const options = {
        analysis_type: analysisType,
        time_period: timePeriod,
        time_detail: timeSubCategory || '',
        category: category,
        include_budget: includeBudget,
        include_duration: includeDuration,
        include_implement_date: includeImplementDate,
        include_recommendations: includeRecommendations,
        include_risks: includeRisks,
        include_trends: includeTrends,
        include_success_factors: includeSuccessFactors,
        include_feedback: includeFeedback,
      };

      console.log('Running analysis with options:', options);

      if (analysisType === 'customized') {
        const requestData = { options }; // Send options wrapped in an object

        console.log('Sending customized analysis request with data:', requestData);

        const response = await axiosInstance.post<PaCstmApiResponse>(
          `/api/predictive-analysis/custom`,
          requestData
        );

        console.log('Received customized analysis response:', response.data);
        setAnalysisResult(response.data);

        if (response.data.error) {
          setError(response.data.error);
        }

      } else {
        // File upload logic
        const formData = new FormData();
        if(selectedFile) formData.append('file', selectedFile);
        Object.entries(options).forEach(([key, value]) => {
          formData.append(key, String(value));
        });

        const response = await axiosInstance.post<GeneralAnalysisResult>(
          `/api/predictive-analysis/upload`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-2data',
            },
          }
        );
        console.log('Received analysis response (non-customized/file):', response.data);
        setAnalysisResult(response.data);

        if (response.data.error) {
          setError(response.data.error);
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.message || 'Failed to run analysis. Please try again.';
      setError(errorMessage);

      // Create a flat error object that conforms to the PaCstmApiResponse
      setAnalysisResult({
        error: 'Failed to run analysis',
        message: errorMessage,
      });

      console.error('Error running analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  // Add a progress indicator component (Keep implementation)
  const renderProgressIndicator = () => {
    if (!analysisProgress) return null;
    return (
      <div className="analysis-progress mt-3 mb-4">
        <h5>Analysis Progress: {analysisProgress.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h5>
        <div className="progress" style={{ height: '20px' }}>
          <div
            className="progress-bar progress-bar-striped progress-bar-animated"
            role="progressbar"
            style={{ width: `${analysisProgress.progress}%` }}
            aria-valuenow={analysisProgress.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            {analysisProgress.progress}%
          </div>
        </div>
      </div>
    );
  };

  const renderCustomizedAnalysisForm = () => (
    <div className="mb-4">
      <h3 className="forecast-title">Customize Response</h3>
      <div className="forecast-filters">
        <Card className="mb-3" style={{ border: '1px solid #dee2e6', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          <Card.Body className="pb-2">
            <div className="filter-row">
              <div className="filter-group">
                <label>Category</label>
                <div className="select-wrapper">
                  <Form.Select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      // No auto-analysis after selection
                    }}
                  >
                    <option value="None">All Categories</option>
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </Form.Select>
                </div>
              </div>
              {/* Time Period Select */}
              <div className="filter-group">
                <label>Time Period</label>
                <div className="select-wrapper">
                  <Form.Select
                    value={timePeriod}
                    onChange={(e) => {
                      setTimePeriod(e.target.value);
                      setTimeSubCategory('');
                      // No auto-analysis after selection
                    }}
                  >
                    <option value="None">None</option>
                    <option value="Yearly">Yearly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Monthly">Monthly</option>
                  </Form.Select>
                </div>
              </div>
              {/* Time Period Detail Select */}
              <div className="filter-group">
                <label>Time Period Detail</label>
                <div className="select-wrapper">
                  <Form.Select
                    value={timeSubCategory}
                    onChange={(e) => {
                      setTimeSubCategory(e.target.value);
                      // No auto-analysis after selection
                    }}
                    disabled={!timePeriod || timePeriod === 'None'}
                  >
                    <option value="">Select {timePeriod}</option>
                    {getTimeSubCategoryOptions().map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Form.Select>
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>

        <Card style={{ border: '1px solid #dee2e6', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          <Card.Body className="pt-2 pb-3">
            {/* Second row: First set of checkboxes */}
            <div className="filter-row mt-2">
              <div className="checkbox-item">
                <span className="checkbox-label">Success Factors</span>
                <Form.Check type="checkbox" id="include-success-factors" checked={includeSuccessFactors} onChange={(e) => setIncludeSuccessFactors(e.target.checked)} className="custom-checkbox" />
              </div>
              <div className="checkbox-item">
                <span className="checkbox-label">Recommendations</span>
                <Form.Check type="checkbox" id="include-recommendations" checked={includeRecommendations} onChange={(e) => setIncludeRecommendations(e.target.checked)} className="custom-checkbox" />
              </div>
              <div className="checkbox-item">
                <span className="checkbox-label" style={{ fontSize: '0.9em' }}>Risk & Mitigation Strategies</span>
                <Form.Check type="checkbox" id="include-risks" checked={includeRisks} onChange={(e) => setIncludeRisks(e.target.checked)} className="custom-checkbox" />
              </div>
              <div className="checkbox-item">
                <span className="checkbox-label">Predicted Trends</span>
                <Form.Check type="checkbox" id="include-trends" checked={includeTrends} onChange={(e) => setIncludeTrends(e.target.checked)} className="custom-checkbox" />
              </div>
            </div>

            {/* Third row: Second set of checkboxes */}
            <div className="filter-row mt-3">
              <div className="checkbox-item">
                <span className="checkbox-label">Budget</span>
                <Form.Check type="checkbox" id="include-budget" checked={includeBudget} onChange={(e) => setIncludeBudget(e.target.checked)} className="custom-checkbox" />
              </div>
              <div className="checkbox-item">
                <span className="checkbox-label">Implementation Date</span>
                <Form.Check type="checkbox" id="include-implement-date" checked={includeImplementDate} onChange={(e) => setIncludeImplementDate(e.target.checked)} className="custom-checkbox" />
              </div>
              <div className="checkbox-item">
                <span className="checkbox-label">Estimated Duration</span>
                <Form.Check type="checkbox" id="include-duration" checked={includeDuration} onChange={(e) => setIncludeDuration(e.target.checked)} className="custom-checkbox" />
              </div>
              <div className="checkbox-item">
                <span className="checkbox-label">Feedback</span>
                <Form.Check type="checkbox" id="include-feedback" checked={includeFeedback} onChange={(e) => setIncludeFeedback(e.target.checked)} className="custom-checkbox" />
              </div>
            </div>

            {/* Button row - Only Apply Filter button now */}
            <div className="mt-3" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                onClick={runAnalysis} // This calls the function that handles 'customized' type
                disabled={loading}
              >
                {loading ? "Running Analysis..." : "Apply Filter"}
              </Button>
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );

  const isCustomizedResult = (result: AnalysisResult): result is PaCstmApiResponse => {
    // A result is considered "customized" if its metadata explicitly says so.
    return !!(result &&
      typeof result === 'object' &&
      'metadata' in result &&
      result.metadata &&
      typeof result.metadata === 'object' &&
      'analysis_type' in result.metadata &&
      (result.metadata as any).analysis_type === 'customized');
  };

  return (
    <div className="predictive-analysis-container">
      <h2 className="forecast-title">Predictive Analysis</h2>
      <p className="lead">
        Use AI-powered predictive analysis to gain insights into project success factors,
        outcomes, and recommendations.
      </p>

      <div className="forecast-tabs">
        <button
          className={activeTab === 'analysis' ? 'active' : ''}
          onClick={() => setActiveTab('analysis')}
        >
          Project Analysis
        </button>
        <button
          className={activeTab === 'trends' ? 'active' : ''}
          onClick={() => setActiveTab('trends')}
        >
          Project Trends
        </button>
      </div>

      <div className="forecast-content">
        {activeTab === 'analysis' && (
          <>
            {error && !isCustomizedResult(analysisResult) && <Alert variant="danger">{error}</Alert>}

            {renderProgressIndicator()}

            <Card className="mb-4">
              <Card.Body>
                {renderCustomizedAnalysisForm()}
              </Card.Body>
            </Card>

            <div className="analysis-results-section">

              {loading && !analysisResult && (
                  <div className="text-center mt-4">
                      <Spinner animation="border" role="status">
                          <span className="visually-hidden">Loading...</span>
                      </Spinner>
                      <p>Loading analysis results...</p>
                  </div>
              )}

              {!loading && isCustomizedResult(analysisResult) && (
                <PaCstmResponse
                  analysisResult={analysisResult}isLoading={false} 
                />
              )}

              {!loading && !isCustomizedResult(analysisResult) && analysisResult && (
                  <PredictiveAnalysisResponse // Cast to GeneralAnalysisResult
                      analysisResult={analysisResult as any}
                  />
              )}

              {/* Display initial message or message when no results after loading */}
              {!loading && !analysisResult && !error && (
                   <Alert variant="secondary" className="mt-4">Select filters and run analysis to see results.</Alert>
               )}
            </div>
          </>
        )}
        {activeTab === 'trends' && (
          <Trends />
        )}
      </div>
    </div>
  );
};

export default PredictiveAnalysis;