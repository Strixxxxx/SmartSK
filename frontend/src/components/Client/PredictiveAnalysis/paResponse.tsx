import React from 'react';
import { Container, Row, Col, Card, Alert, Table, ListGroup } from 'react-bootstrap';
import CitationRenderer from './CitationRenderer'; // Import the citation component

// --- UNIFIED TYPE DEFINITIONS ---

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
  data_source: string;
  internet_sources_consulted: number;
}

export interface AnalysisResult {
  summary_report?: string;
  success_factors?: string[];
  recommendations?: string[];
  risk_mitigation_strategies?: Risk[];
  predicted_trends?: string[];
  budget?: Budget;
  implementation_date?: ImplementationDate;
  estimated_duration?: EstimatedDuration;
  feedback?: string | string[];
  citations?: Citation[]; // NEW: Citations array
  metadata?: Metadata;
  error?: string;
}

interface PredictiveAnalysisResponseProps {
  analysisResult: AnalysisResult | null;
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

const PredictiveAnalysisResponse: React.FC<PredictiveAnalysisResponseProps> = ({ analysisResult }) => {
  if (!analysisResult) {
    return null;
  }

  console.log("Analysis Result in paResponse:", analysisResult);

  if (analysisResult.error) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>An Error Occurred During Analysis</Alert.Heading>
          <p>{analysisResult.error}</p>
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
    citations = [], // Default to empty array if not provided
    metadata 
  } = analysisResult;

  const formattedTimestamp = metadata?.timestamp 
    ? new Date(metadata.timestamp).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'N/A';

  return (
    <Container fluid className="predictive-analysis-response mt-4">
      <Row className="justify-content-center">
        <Col lg={11} xl={10}>
          {summary_report && (
            <Card className="mb-4 shadow-sm bg-white">
              <Card.Body className="p-4">
                <h2 className="mb-3 text-dark">General Analysis Summary</h2>
                <p className="lead text-body-secondary">
                  <CitationRenderer text={summary_report} citations={citations} />
                </p>
              </Card.Body>
            </Card>
          )}

          {success_factors && success_factors.length > 0 && (
            <SectionCard title="Success Factors">
              <ListGroup variant="flush">
                {success_factors.map((item, index) => (
                  <ListGroup.Item key={index} className="px-0 border-0">
                    <CitationRenderer text={item} citations={citations} />
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </SectionCard>
          )}

          {recommendations && recommendations.length > 0 && (
            <SectionCard title="Recommendations">
              <ListGroup variant="flush">
                {recommendations.map((item, index) => (
                  <ListGroup.Item key={index} className="px-0 border-0">
                    <CitationRenderer text={item} citations={citations} />
                  </ListGroup.Item>
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
                  <ListGroup.Item key={index} className="px-0 border-0">
                    <CitationRenderer text={item} citations={citations} />
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </SectionCard>
          )}

          {budget && (
            <SectionCard title="Budget Analysis">
              <p><CitationRenderer text={budget.analysis} citations={citations} /></p>
              <hr />
              {budget.historical_patterns && (
                <p><strong>Historical Patterns:</strong> <CitationRenderer text={budget.historical_patterns} citations={citations} /></p>
              )}
              {budget.current_trends && (
                <p><strong>Current Trends:</strong> <CitationRenderer text={budget.current_trends} citations={citations} /></p>
              )}
              {budget.recommendations && (
                <p><strong>Recommendations:</strong> <CitationRenderer text={budget.recommendations} citations={citations} /></p>
              )}
            </SectionCard>
          )}

          {implementation_date && (
            <SectionCard title="Implementation Timeline">
              <p><CitationRenderer text={implementation_date.analysis} citations={citations} /></p>
              <hr />
              {implementation_date.historical_patterns && (
                <p><strong>Historical Patterns:</strong> <CitationRenderer text={implementation_date.historical_patterns} citations={citations} /></p>
              )}
              {implementation_date.current_practices && (
                <p><strong>Current Practices:</strong> <CitationRenderer text={implementation_date.current_practices} citations={citations} /></p>
              )}
              {implementation_date.seasonal_factors && (
                <p><strong>Seasonal Factors:</strong> <CitationRenderer text={implementation_date.seasonal_factors} citations={citations} /></p>
              )}
              {implementation_date.resource_considerations && (
                <p><strong>Resource Considerations:</strong> <CitationRenderer text={implementation_date.resource_considerations} citations={citations} /></p>
              )}
            </SectionCard>
          )}

          {estimated_duration && (
            <SectionCard title="Project Duration Analysis">
              <p><CitationRenderer text={estimated_duration.analysis} citations={citations} /></p>
              <hr />
              {estimated_duration.historical_timeframes && (
                <p><strong>Historical Timeframes:</strong> <CitationRenderer text={estimated_duration.historical_timeframes} citations={citations} /></p>
              )}
              {estimated_duration.complexity_factors && (
                <p><strong>Complexity Factors:</strong> <CitationRenderer text={estimated_duration.complexity_factors} citations={citations} /></p>
              )}
              {estimated_duration.current_standards && (
                <p><strong>Current Standards:</strong> <CitationRenderer text={estimated_duration.current_standards} citations={citations} /></p>
              )}
              {estimated_duration.dependencies && (
                <p><strong>Dependencies:</strong> <CitationRenderer text={estimated_duration.dependencies} citations={citations} /></p>
              )}
            </SectionCard>
          )}

          {feedback && (
            <SectionCard title="Expected Community Feedback">
              {Array.isArray(feedback) ? (
                <ListGroup variant='flush'>
                  {feedback.map((item, index) => (
                    <ListGroup.Item key={index} className="px-0 border-0">
                      <CitationRenderer text={item} citations={citations} />
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              ) : (
                <p><CitationRenderer text={feedback} citations={citations} /></p>
              )}
            </SectionCard>
          )}

          
          {metadata && (
            <div className="text-center mt-4 text-muted small">
              <p className="mb-1">Analysis generated on {formattedTimestamp}</p>
              <p className="mb-0">
                Source: {metadata.data_source} | Internet Sources: {metadata.internet_sources_consulted}
                {citations && citations.length > 0 && ` | Citations: ${citations.length}`}
              </p>
            </div>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default PredictiveAnalysisResponse;