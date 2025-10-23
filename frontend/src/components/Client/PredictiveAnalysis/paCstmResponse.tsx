import React from 'react';
import { Container, Row, Col, Card, Alert, Table, ListGroup, Spinner } from 'react-bootstrap';
import CitationRenderer from './CitationRenderer';

// --- UNIFIED TYPE DEFINITIONS (similar to paResponse.tsx) ---

interface Citation {
  id: number;
  title: string;
  url: string;
  snippet: string;
}

interface Risk {
  risk: string;
  mitigation: string;
}

interface Budget {
  analysis: string;
  historical_patterns?: string;
  current_trends?: string;
  recommendations?: string;
}

interface ImplementationDate {
  analysis: string;
  historical_patterns?: string;
  current_practices?: string;
  seasonal_factors?: string;
  resource_considerations?: string;
}

interface EstimatedDuration {
  analysis: string;
  historical_timeframes?: string;
  complexity_factors?: string;
  current_standards?: string;
  dependencies?: string;
}

interface Metadata {
  timestamp: string;
  analysis_type: string;
  data_source: string;
  total_projects_analyzed: number;
  internet_sources_consulted: number;
  gemini_used: boolean;
  filters_applied: Record<string, any>;
}

// This interface now represents the flat structure from the new paCstm.py
export interface PaCstmApiResponse {
  summary_report?: string;
  success_factors?: string[];
  recommendations?: string[];
  risk_mitigation_strategies?: Risk[];
  predicted_trends?: string[];
  budget?: Budget;
  implementation_date?: ImplementationDate;
  estimated_duration?: EstimatedDuration;
  feedback?: string | string[];
  citations?: Citation[];
  metadata?: Metadata;
  error?: string; // For top-level errors
  message?: string; // Often comes with 'error'
}

interface PaCstmResponseProps {
  analysisResult: PaCstmApiResponse | null;
  isLoading?: boolean;
}

// --- REUSABLE SECTION COMPONENT ---

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Card className="mb-4 shadow-sm">
    <Card.Header className="p-3 bg-light bg-gradient border-bottom-0">
      <h4 className="mb-0 fw-normal">{title}</h4>
    </Card.Header>
    <Card.Body className="p-4">
      {children}
    </Card.Body>
  </Card>
);

// --- MAIN RESPONSE COMPONENT ---

const PaCstmResponse: React.FC<PaCstmResponseProps> = ({ analysisResult, isLoading }) => {
  if (isLoading) {
    return (
        <div className="text-center mt-4">
            <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
            </Spinner>
            <p>Loading customized analysis results...</p>
        </div>
    );
  }

  if (!analysisResult) {
    return <Alert variant="secondary" className="mt-4">No customized analysis results to display.</Alert>;
  }

  console.log("Analysis Result in paCstmResponse:", analysisResult);

  // Handle errors returned from the backend
  if (analysisResult.error || analysisResult.message) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>An Error Occurred During Analysis</Alert.Heading>
          <p>{analysisResult.message || analysisResult.error}</p>
          <p className="small mb-0">Please try adjusting your filters or contact support if the issue persists.</p>
        </Alert>
      </Container>
    );
  }

  const {
    summary_report,
    success_factors,
    recommendations,
    risk_mitigation_strategies,
    predicted_trends,
    budget,
    implementation_date,
    estimated_duration,
    feedback,
    citations = [],
    metadata
  } = analysisResult;

  const formattedTimestamp = metadata?.timestamp
    ? new Date(metadata.timestamp).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'N/A';

  // Check if there are any results to display besides metadata
  const hasContent = summary_report || success_factors || recommendations || risk_mitigation_strategies || predicted_trends || budget || implementation_date || estimated_duration || feedback;

  if (!hasContent) {
      return <Alert variant="warning" className="mt-4">The customized analysis returned no content based on the selected filters. Please try different options.</Alert>;
  }

  return (
    <Container fluid className="predictive-analysis-response mt-4">
      <Row className="justify-content-center">
        <Col lg={11} xl={10}>
          <Card className="mb-4 shadow-sm bg-white">
            <Card.Body className="p-4">
              <h2 className="mb-3 text-dark">Customized Analysis</h2>
              {summary_report ? (
                <p className="lead text-body-secondary"><CitationRenderer text={summary_report} citations={citations} /></p>
              ) : (
                <p className="lead text-muted">An executive summary was not generated for this customized report.</p>
              )}
            </Card.Body>
          </Card>

          {success_factors && success_factors.length > 0 && (
            <SectionCard title="Success Factors">
              <ListGroup variant="flush">
                {success_factors.map((item, index) => (
                  <ListGroup.Item key={index} className="px-0 border-0"><CitationRenderer text={item} citations={citations} /></ListGroup.Item>
                ))}
              </ListGroup>
            </SectionCard>
          )}

          {recommendations && recommendations.length > 0 && (
            <SectionCard title="Recommendations">
              <ListGroup variant="flush">
                {recommendations.map((item, index) => (
                  <ListGroup.Item key={index} className="px-0 border-0"><CitationRenderer text={item} citations={citations} /></ListGroup.Item>
                ))}
              </ListGroup>
            </SectionCard>
          )}

          {risk_mitigation_strategies && risk_mitigation_strategies.length > 0 && (
            <SectionCard title="Risks & Mitigation Strategies">
              <Table striped bordered hover responsive="sm" className="m-0">
                <thead className="table-light">
                  <tr>
                    <th className="w-50">Risk</th>
                    <th>Mitigation Strategy</th>
                  </tr>
                </thead>
                <tbody>
                  {risk_mitigation_strategies.map((item, index) => (
                    <tr key={index}>
                      <td><CitationRenderer text={item.risk} citations={citations} /></td>
                      <td><CitationRenderer text={item.mitigation} citations={citations} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </SectionCard>
          )}

          {predicted_trends && predicted_trends.length > 0 && (
            <SectionCard title="Predicted Trends">
              <ListGroup variant="flush">
                {predicted_trends.map((item, index) => (
                  <ListGroup.Item key={index} className="px-0 border-0"><CitationRenderer text={item} citations={citations} /></ListGroup.Item>
                ))}
              </ListGroup>
            </SectionCard>
          )}

          {budget && (
            <SectionCard title="Budget Analysis">
              <p><CitationRenderer text={budget.analysis} citations={citations} /></p>
              {budget.historical_patterns && <><hr /><p><strong>Historical Patterns:</strong> <CitationRenderer text={budget.historical_patterns} citations={citations} /></p></>}
              {budget.current_trends && <p><strong>Current Trends:</strong> <CitationRenderer text={budget.current_trends} citations={citations} /></p>}
              {budget.recommendations && <p><strong>Recommendations:</strong> <CitationRenderer text={budget.recommendations} citations={citations} /></p>}
            </SectionCard>
          )}

          {implementation_date && (
            <SectionCard title="Implementation Timeline">
              <p><CitationRenderer text={implementation_date.analysis} citations={citations} /></p>
              {implementation_date.historical_patterns && <><hr /><p><strong>Historical Patterns:</strong> <CitationRenderer text={implementation_date.historical_patterns} citations={citations} /></p></>}
              {implementation_date.current_practices && <p><strong>Current Practices:</strong> <CitationRenderer text={implementation_date.current_practices} citations={citations} /></p>}
              {implementation_date.seasonal_factors && <p><strong>Seasonal Factors:</strong> <CitationRenderer text={implementation_date.seasonal_factors} citations={citations} /></p>}
              {implementation_date.resource_considerations && <p><strong>Resource Considerations:</strong> <CitationRenderer text={implementation_date.resource_considerations} citations={citations} /></p>}
            </SectionCard>
          )}

          {estimated_duration && (
            <SectionCard title="Project Duration Analysis">
              <p><CitationRenderer text={estimated_duration.analysis} citations={citations} /></p>
              {estimated_duration.historical_timeframes && <><hr /><p><strong>Historical Timeframes:</strong> <CitationRenderer text={estimated_duration.historical_timeframes} citations={citations} /></p></>}
              {estimated_duration.complexity_factors && <p><strong>Complexity Factors:</strong> <CitationRenderer text={estimated_duration.complexity_factors} citations={citations} /></p>}
              {estimated_duration.current_standards && <p><strong>Current Standards:</strong> <CitationRenderer text={estimated_duration.current_standards} citations={citations} /></p>}
              {estimated_duration.dependencies && <p><strong>Dependencies:</strong> <CitationRenderer text={estimated_duration.dependencies} citations={citations} /></p>}
            </SectionCard>
          )}

          {feedback && (
            <SectionCard title="Expected Community Feedback">
              {Array.isArray(feedback) ? <ListGroup variant='flush'>{feedback.map((item, index) => <ListGroup.Item key={index} className="px-0 border-0"><CitationRenderer text={item} citations={citations} /></ListGroup.Item>)}</ListGroup> : <p><CitationRenderer text={feedback} citations={citations} /></p>}
            </SectionCard>
          )}



          {metadata && (
            <div className="text-center mt-4 text-muted small">
              <p className="mb-1">Analysis generated on {formattedTimestamp} ({metadata.analysis_type})</p>
              <p className="mb-0">Source: {metadata.data_source} | Projects Analyzed: {metadata.total_projects_analyzed} | Internet Sources: {metadata.internet_sources_consulted}</p>
            </div>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default PaCstmResponse;