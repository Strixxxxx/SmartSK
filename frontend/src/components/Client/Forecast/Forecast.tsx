import React, { useState, useCallback, useMemo } from 'react';
import Graph, { ViewBy } from './Graph'; // Import ViewBy type from Graph
import Response from './Response';
import { Container, Typography } from '@mui/material';
import './Forecast.css';

// Define filter options for the Response component
interface ResponseFilterOptions {
  view_by: ViewBy;
}

const Forecast: React.FC = () => {
  // Shared state for the current view ('committee' or 'category')
  const [viewBy, setViewBy] = useState<ViewBy>('committee');

  // Handler for when the user changes the view in the Graph component
  const handleViewChange = useCallback((newView: ViewBy) => {
    setViewBy(newView);
  }, []);
  
  // Memoize the filters for the Response component to prevent unnecessary re-renders
  const responseFilters = useMemo((): ResponseFilterOptions => ({
    view_by: viewBy,
  }), [viewBy]);

  return (
      <div className="content-wrapper">
        <Container maxWidth="lg" className="forecast-container">
          <Typography variant="h4" component="h1" gutterBottom className="forecast-title">
            Budget Forecasting
          </Typography>
          
          <div className="forecast-content">
            {/* Pass the current view and the handler to the Graph component */}
            <Graph currentView={viewBy} onViewChange={handleViewChange} />
            {/* Pass the current view to the Response component */}
            <Response filters={responseFilters} />
          </div>
        </Container>
      </div>
  );
};

export default Forecast;