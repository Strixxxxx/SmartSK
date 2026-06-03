import React from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  List,
  ListItem,
  CircularProgress,
  Divider,
  Stack,
  Alert
} from '@mui/material';
import {
  Summarize,
  Insights,
  TipsAndUpdates,
  WarningAmber,
  TrendingUp,
  AttachMoney,
  Timeline,
  Timer,
  ChatBubbleOutline,
  InfoOutlined
} from '@mui/icons-material';
import CitationRenderer from './CitationRenderer';
import styles from './pa.module.css';

// --- Interfaces ---

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

interface QuantitativeAnalysis {
  predicted_success_probability?: number;
  forecasted_budget_variance?: string;
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
  quantitative_analysis?: QuantitativeAnalysis;
  metadata?: Metadata;
  error?: string;
  message?: string;
}

interface PaCstmResponseProps {
  analysisResult: PaCstmApiResponse | null;
  isLoading?: boolean;
}

// --- COLOUR-CODED SECTION COMPONENT ---

interface DashboardSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  flex?: string | number;
  accentClass?: string;
}

const DashboardSection: React.FC<DashboardSectionProps> = ({
  title, icon, children, flex = 1, accentClass = ''
}) => (
  <Box sx={{ flex, minWidth: 0, display: 'flex' }}>
    <Card className={styles.contentCard} sx={{ width: '100%' }}>
      <Box className={`${styles.cardHeader} ${accentClass}`}>
        <Box sx={{ display: 'flex' }}>{icon}</Box>
        <Typography variant="h6" className={styles.cardHeaderTitle}>{title}</Typography>
      </Box>
      <CardContent className={styles.cardBody}>
        {children}
      </CardContent>
    </Card>
  </Box>
);

// --- MAIN RESPONSE COMPONENT ---

const PaCstmResponse: React.FC<PaCstmResponseProps> = ({ analysisResult, isLoading }) => {
  if (isLoading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={10}>
        <CircularProgress size={60} />
        <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary' }}>
          Assembling your customized report...
        </Typography>
      </Box>
    );
  }

  if (!analysisResult) {
    return <Alert severity="info" sx={{ mt: 4, borderRadius: 2 }}>No customized analysis results to display.</Alert>;
  }

  if (analysisResult.error || analysisResult.message) {
    return (
      <Box mt={4}>
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          <Typography variant="h6" gutterBottom>An Error Occurred During Analysis</Typography>
          <Typography variant="body2">{analysisResult.message || analysisResult.error}</Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            Please try adjusting your filters or contact support if the issue persists.
          </Typography>
        </Alert>
      </Box>
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
    quantitative_analysis,
    metadata
  } = analysisResult;

  const formattedTimestamp = metadata?.timestamp
    ? new Date(metadata.timestamp).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
    : 'N/A';

  const hasContent = summary_report || success_factors || recommendations
    || risk_mitigation_strategies || predicted_trends || budget
    || implementation_date || estimated_duration || feedback || quantitative_analysis;

  if (!hasContent) {
    return <Alert severity="warning" sx={{ mt: 4, borderRadius: 2 }}>The analysis returned no content for the selected filters.</Alert>;
  }


  return (
    <Box className={styles.responseContainer} sx={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* â”€â”€ Row 1: Executive Summary + Success Probability â”€â”€ */}
      {/* ── Row 1: Executive Summary & Success Probability ── */}
      <Box sx={{ width: '100%' }}>
        <Card className={styles.sectionHeaderCard}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, alignItems: { xs: 'flex-start', md: 'center' } }}>
            
            {/* Left: Summary Text */}
            <Box sx={{ flex: 1 }}>
              <Stack direction="row" spacing={2} alignItems="center" mb={2}>
                <Summarize color="primary" fontSize="large" />
                <Typography variant="h5" fontWeight={700} color="#1e293b">
                  Executive Analysis Summary
                </Typography>
              </Stack>
              {summary_report ? (
                <Typography variant="body1" className={styles.summaryText}>
                  <CitationRenderer text={summary_report} citations={citations} />
                </Typography>
              ) : (
                <Typography variant="body1" color="text.secondary" fontStyle="italic">
                  An executive summary was not generated for this customized report.
                </Typography>
              )}
            </Box>

          </Box>
        </Card>
      </Box>

      {/* â”€â”€ Row 2: Success Factors + Recommendations â”€â”€ */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: '24px', alignItems: 'stretch' }}>
        <DashboardSection
          title="Success Factors"
          icon={<Insights sx={{ color: '#2e7d32' }} />}
          accentClass={styles.cardHeaderSuccess}
        >
          <List dense disablePadding>
            {success_factors?.map((item, index) => (
              <ListItem key={index} className={styles.listItem}>
                <CitationRenderer text={item} citations={citations} />
              </ListItem>
            )) || <Typography variant="body2" color="text.secondary">No factors identified.</Typography>}
          </List>
        </DashboardSection>

        <DashboardSection
          title="Recommendations"
          icon={<TipsAndUpdates sx={{ color: '#0288d1' }} />}
          accentClass={styles.cardHeaderRecommend}
        >
          <List dense disablePadding>
            {recommendations?.map((item, index) => (
              <ListItem key={index} className={styles.listItem}>
                <CitationRenderer text={item} citations={citations} />
              </ListItem>
            )) || <Typography variant="body2" color="text.secondary">No specific recommendations.</Typography>}
          </List>
        </DashboardSection>
      </Box>

      {/* â”€â”€ Row 3: Risk Management â”€â”€ */}
      {risk_mitigation_strategies && risk_mitigation_strategies.length > 0 && (
        <DashboardSection
          title="Risks & Mitigation Strategies"
          icon={<WarningAmber sx={{ color: '#d32f2f' }} />}
          accentClass={styles.cardHeaderRisk}
        >
          <TableContainer component={Paper} className={styles.tableContainer} elevation={0}>
            <Table size="medium">
              <TableHead className={styles.tableHeader}>
                <TableRow>
                  <TableCell sx={{ width: '40%' }}>Risk</TableCell>
                  <TableCell>Mitigation Strategy</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {risk_mitigation_strategies.map((item, index) => (
                  <TableRow key={index} hover>
                    <TableCell><CitationRenderer text={item.risk} citations={citations} /></TableCell>
                    <TableCell><CitationRenderer text={item.mitigation} citations={citations} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DashboardSection>
      )}

      {/* â”€â”€ Row 4: Budget + Predicted Trends â”€â”€ */}
      {(budget || (predicted_trends && predicted_trends.length > 0)) && (
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: '24px', alignItems: 'stretch' }}>
          {budget && (
            <DashboardSection
              title="Budgetary Analysis"
              icon={<AttachMoney sx={{ color: '#f57c00' }} />}
              accentClass={styles.cardHeaderBudget}
            >
              <Typography variant="body2" paragraph>
                <CitationRenderer text={budget.analysis} citations={citations} />
              </Typography>
              <Divider sx={{ my: 2 }} />
              {budget.historical_patterns && (
                <Box mb={1}>
                  <Typography variant="subtitle2" component="span" fontWeight="bold">Historical: </Typography>
                  <Typography variant="body2" component="span">
                    <CitationRenderer text={budget.historical_patterns} citations={citations} />
                  </Typography>
                </Box>
              )}
              {budget.recommendations && (
                <Box>
                  <Typography variant="subtitle2" component="span" fontWeight="bold">Strategic Tip: </Typography>
                  <Typography variant="body2" component="span" color="primary.main">
                    <CitationRenderer text={budget.recommendations} citations={citations} />
                  </Typography>
                </Box>
              )}
            </DashboardSection>
          )}

          {predicted_trends && predicted_trends.length > 0 && (
            <DashboardSection
              title="Predicted Trends"
              icon={<TrendingUp sx={{ color: '#7b1fa2' }} />}
              accentClass={styles.cardHeaderTrends}
            >
              <List dense disablePadding>
                {predicted_trends.map((item, index) => (
                  <ListItem key={index} className={styles.listItem}>
                    <CitationRenderer text={item} citations={citations} />
                  </ListItem>
                ))}
              </List>
            </DashboardSection>
          )}
        </Box>
      )}

      {/* â”€â”€ Row 5: Timeline + Duration â”€â”€ */}
      {(implementation_date || estimated_duration) && (
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: '24px', alignItems: 'stretch' }}>
          {implementation_date && (
            <DashboardSection
              title="Implementation Timeline"
              icon={<Timeline sx={{ color: '#00796b' }} />}
              accentClass={styles.cardHeaderTimeline}
            >
              <Typography variant="body2" paragraph>
                <CitationRenderer text={implementation_date.analysis} citations={citations} />
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Stack spacing={1.5}>
                {implementation_date.current_practices && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Standard Practice:</Typography>
                    <Typography variant="body2">
                      <CitationRenderer text={implementation_date.current_practices} citations={citations} />
                    </Typography>
                  </Box>
                )}
                {implementation_date.seasonal_factors && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Seasonal Considerations:</Typography>
                    <Typography variant="body2">
                      <CitationRenderer text={implementation_date.seasonal_factors} citations={citations} />
                    </Typography>
                  </Box>
                )}
              </Stack>
            </DashboardSection>
          )}

          {estimated_duration && (
            <DashboardSection
              title="Project Duration Intelligence"
              icon={<Timer sx={{ color: '#0288d1' }} />}
              accentClass={styles.cardHeaderDuration}
            >
              <Typography variant="body2" paragraph>
                <CitationRenderer text={estimated_duration.analysis} citations={citations} />
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Stack spacing={1.5}>
                {estimated_duration.historical_timeframes && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Historical Reference:</Typography>
                    <Typography variant="body2">
                      <CitationRenderer text={estimated_duration.historical_timeframes} citations={citations} />
                    </Typography>
                  </Box>
                )}
                {estimated_duration.complexity_factors && (
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">Complexity Drivers:</Typography>
                    <Typography variant="body2">
                      <CitationRenderer text={estimated_duration.complexity_factors} citations={citations} />
                    </Typography>
                  </Box>
                )}
              </Stack>
            </DashboardSection>
          )}
        </Box>
      )}

      {/* â”€â”€ Row 6: Community Sentiment â”€â”€ */}
      {feedback && (
        <DashboardSection
          title="Expected Community Feedback"
          icon={<ChatBubbleOutline sx={{ color: '#c2185b' }} />}
          accentClass={styles.cardHeaderFeedback}
        >
          {Array.isArray(feedback) ? (
            <List dense disablePadding>
              {feedback.map((item, index) => (
                <ListItem key={index} className={styles.listItem}>
                  <CitationRenderer text={item} citations={citations} />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2">
              <CitationRenderer text={feedback} citations={citations} />
            </Typography>
          )}
        </DashboardSection>
      )}

      {/* â”€â”€ Footer Metadata â”€â”€ */}
      {metadata && (
        <Box className={styles.footer}>
          <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" mb={0.5}>
            <InfoOutlined fontSize="small" />
            <Typography variant="body2">
              Intelligence generated on {formattedTimestamp}
            </Typography>
          </Stack>
          <Typography variant="caption">
            Source: {metadata.data_source} &nbsp;|&nbsp; Projects Analyzed: {metadata.total_projects_analyzed} &nbsp;|&nbsp; Knowledge Sources: {metadata.internet_sources_consulted}
          </Typography>
        </Box>
      )}

    </Box>
  );
};

export default PaCstmResponse;
