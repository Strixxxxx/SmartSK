import React from 'react';
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
import './Graph.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels
);

// --- Interfaces ---
// This interface matches the structure of `chart_data` from the new API response
interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor: string[];
  }>;
}

export type ViewBy = 'committee' | 'category';

interface GraphProps {
  currentView: ViewBy;
  onViewChange: (view: ViewBy) => void;
  chartData: ChartData | null; // Receive chart data directly
}

const Graph: React.FC<GraphProps> = ({ currentView, onViewChange, chartData }) => {

  const handleViewChange = (_event: React.MouseEvent<HTMLElement>, newView: ViewBy | null) => {
    if (newView) {
      onViewChange(newView);
    }
  };

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
        text: `Stacked Budget Forecast by ${currentView.charAt(0).toUpperCase() + currentView.slice(1)}`,
        font: { size: 18, weight: 'bold' as const },
        color: '#333',
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.dataset.label}: ₱${context.parsed.y.toLocaleString()}`,
        }
      },
      legend: { position: 'bottom' as const, labels: { font: { size: 11 } } },
      datalabels: {
        display: false, // Totals are shown on the x-axis label
      },
    },
    scales: {
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
        {chartData ? (
          <div style={{ width: '100%', height: '600px' }}>
            <Bar data={chartData} options={options as any} />
          </div>
        ) : (
          <div>No chart data available.</div>
        )}
      </div>
    </Paper>
  );
};

export default Graph;