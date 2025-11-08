import React, { useState, useEffect } from 'react';
import { Card, Form, Alert } from 'react-bootstrap';
import axiosInstance from '../../../backend connection/axiosConfig';
import PaCstmResponse, { PaCstmApiResponse } from './paCstmResponse';
import Trends from './paTrends';
import Loading from '../../Loading/Loading';
import './pa.css';

// --- Interfaces ---

// This is the structure of the entire pa_analysis.json file
// It's a dictionary where each key (like 'general' or 'category_health')
// maps to a full analysis report.
type PaAnalysisReport = Record<string, PaCstmApiResponse>;

const PredictiveAnalysis: React.FC = () => {
  const [activeTab, setActiveTab] = useState('analysis');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // State to hold the entire fetched report
  const [analysisReport, setAnalysisReport] = useState<PaAnalysisReport | null>(null);
  // State to hold the currently selected analysis to display
  const [selectedAnalysis, setSelectedAnalysis] = useState<PaCstmApiResponse | null>(null);
  
  // State for the category dropdown
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>('general');
  const [availableCategories, setAvailableCategories] = useState<Array<{ key: string; name: string }>>([]);

  // Fetch the entire analysis report on component mount
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
        
        // Set the initial view to the 'general' report
        if (reportData.general) {
          setSelectedAnalysis(reportData.general);
          setSelectedCategoryKey('general');
        } else {
          // Fallback to the first available report if 'general' doesn't exist
          const firstKey = Object.keys(reportData)[0];
          setSelectedAnalysis(reportData[firstKey]);
          setSelectedCategoryKey(firstKey);
        }

        // Populate the dropdown options from the keys of the report
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

  // Handle changes in the category dropdown
  const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newKey = event.target.value;
    setSelectedCategoryKey(newKey);
    if (analysisReport && analysisReport[newKey]) {
      setSelectedAnalysis(analysisReport[newKey]);
    }
  };

  const renderAnalysisSelector = () => (
    <div className="mb-4">
      <h3 className="forecast-title" style={{ margin: 0, marginBottom: '1rem' }}>Select Analysis View</h3>
      <div className="forecast-filters">
        <Card style={{ border: '1px solid #dee2e6', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          <Card.Body>
            <div className="filter-row">
              <div className="filter-group">
                <label>Analysis Category</label>
                <div className="select-wrapper">
                  <Form.Select
                    value={selectedCategoryKey}
                    onChange={handleCategoryChange}
                    aria-label="Select Analysis Category"
                  >
                    {availableCategories.map(cat => (
                        <option key={cat.key} value={cat.key}>{cat.name}</option>
                    ))}
                  </Form.Select>
                </div>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );

  return (
    <div className="predictive-analysis-container">
      <h2 className="forecast-title">Predictive Analysis</h2>
      <p className="lead">
        Use AI-powered predictive analysis to gain insights into project success factors,
        outcomes, and recommendations based on pre-computed historical data.
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
            {loading ? (
              <div className="text-center mt-4">
                <Loading />
                <p>Loading Analysis Report...</p>
              </div>
            ) : error ? (
              <Alert variant="danger">{error}</Alert>
            ) : (
              <>
                <Card className="mb-4">
                  <Card.Body>
                    {renderAnalysisSelector()}
                  </Card.Body>
                </Card>

                <div className="analysis-results-section">
                  <PaCstmResponse
                    analysisResult={selectedAnalysis}
                    isLoading={false} 
                  />
                </div>
              </>
            )}
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