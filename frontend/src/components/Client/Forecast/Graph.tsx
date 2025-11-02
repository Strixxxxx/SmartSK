import React, { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Box,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import axios from '../../../backend connection/axiosConfig';
import Loading from '../../Loading/Loading';
import './Graph.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels
);

// --- Interfaces ---
interface ChartData {
  years: string[];
  committees: string[];
  budget_data: Array<{
    year: string;
    data: Array<{ committee: string; budget: number; }>;
  }>;
  colors: string[];
}

interface ForecastApiResponse {
  by_committee: ChartData;
  by_category: ChartData;
}

export type ViewBy = 'committee' | 'category';

interface GraphProps {
  currentView: ViewBy;
  onViewChange: (view: ViewBy) => void;
}

const Graph: React.FC<GraphProps> = ({ currentView, onViewChange }) => {
  const [plotData, setPlotData] = useState<ForecastApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch forecast data on component mount
  const fetchForecastData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get<ForecastApiResponse>('/api/forecast');
      if (import.meta.env.DEV) {
        console.log('Received forecast API response (raw):', response);
        console.log('Received forecast API response (data):', response.data);
      }

      if (!response.data?.by_committee || !response.data?.by_category) {
        throw new Error('Invalid data structure received from server.');
      }
      setPlotData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Forecasting error, please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForecastData();
  }, [fetchForecastData]);

  const handleViewChange = (_event: React.MouseEvent<HTMLElement>, newView: ViewBy | null) => {
    if (newView) {
      onViewChange(newView);
    }
  };

  const activeChartData = plotData ? (currentView === 'committee' ? plotData.by_committee : plotData.by_category) : null;

  const chartData = activeChartData ? {
    labels: activeChartData.years,
    datasets: activeChartData.committees.map((groupName, index) => ({
      label: groupName,
      data: activeChartData.budget_data.map(yearData => 
        yearData.data.find(d => d.committee === groupName)?.budget || 0
      ),
      backgroundColor: activeChartData.colors[index % activeChartData.colors.length],
    })),
  } : null;

  // Pre-calculate the total for each year to use in the x-axis label
  const yearlyTotals = chartData ? chartData.labels.map((_year, index) => {
    return chartData.datasets.reduce((sum, dataset) => sum + (dataset.data[index] || 0), 0);
  }) : [];

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: `Stacked Budget by ${currentView.charAt(0).toUpperCase() + currentView.slice(1)} and Year`,
        font: { size: 18, weight: 'bold' as const },
        color: '#333',
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ₱${context.parsed.y.toLocaleString()}`,
        }
      },
      legend: { position: 'bottom' as const, labels: { font: { size: 11 } } },
      // **MODIFICATION START: The datalabels plugin is now disabled for showing totals.**
      datalabels: {
        display: false, // We are moving the total to the x-axis label instead.
      },
      // **MODIFICATION END**
    },
    scales: {
      // **MODIFICATION START: The X-axis tick callback now formats the label.**
      x: { 
        stacked: true, 
        title: { 
            display: true, 
            text: 'Year',
            font: { size: 14, weight: 'bold' as const }
        },
        ticks: {
          font: { size: 12 },
          // This callback function creates a multi-line label for each year.
          callback: function(_value: any, index: any, _ticks: any) {
            if (!chartData?.labels) return '';
            const yearLabel = chartData.labels[index];
            const totalForYear = yearlyTotals[index];

            if (totalForYear > 0) {
                // Return an array to create two lines: the year and the total.
                const totalString = `Total: ₱${totalForYear.toLocaleString()}`;
                return [yearLabel, totalString];
            }
            
            // If total is 0, just show the year.
            return yearLabel;
          }
        }
      },
      // **MODIFICATION END**
      y: { 
        stacked: true, 
        title: { display: true, text: 'Budget Amount (PHP)' }, 
        ticks: { callback: (value: any) => `₱${value.toLocaleString()}` } 
      },
    },
  };

  return (
    <Paper elevation={3} className="graph-container">
      <Box className="filter-container">
        <ToggleButtonGroup value={currentView} exclusive onChange={handleViewChange}>
          <ToggleButton value="committee">View by Committee</ToggleButton>
          <ToggleButton value="category">View by Category</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <div className="plot-container">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : chartData ? (
          <div style={{ width: '100%', height: '600px' }}>
            <Bar data={chartData} options={options as any} />
          </div>
        ) : (
          <div>No data available.</div>
        )}
      </div>
    </Paper>
  );
};

export default Graph;