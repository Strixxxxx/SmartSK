import React, { useState } from 'react';
import { Tooltip, Link, Box, Modal, Button, Typography, Paper } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

interface Citation {
  id: number;
  title: string;
  url: string;
  snippet: string;
}

interface CitationRendererProps {
  text: string;
  citations: Citation[];
}

const modalStyle = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 450,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  p: 4,
  borderRadius: 2,
};

/**
 * Component that renders text with clickable citation references
 * Converts [1], [2], etc. into interactive, hoverable links that open a confirmation modal.
 */
export const CitationRenderer: React.FC<CitationRendererProps> = ({ text, citations }) => {
  const [hoveredCitation, setHoveredCitation] = useState<number | null>(null);
  const [modalCitation, setModalCitation] = useState<Citation | null>(null);

  const handleOpenModal = (citation: Citation) => {
    setModalCitation(citation);
  };

  const handleCloseModal = () => {
    setModalCitation(null);
  };

  const handleProceed = () => {
    if (modalCitation) {
      window.open(modalCitation.url, '_blank', 'noopener,noreferrer');
    }
    handleCloseModal();
  };

  if (!text || !citations || citations.length === 0) {
    return <>{text}</>;
  }

  const citationRegex = /\[(\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    const citationNumber = parseInt(match[1]);
    const citation = citations.find(c => c.id === citationNumber);

    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (citation) {
      parts.push(
        <Tooltip
          key={`citation-${citationNumber}-${match.index}`}
          title={
            <Box sx={{ maxWidth: 400 }}>
              <Box sx={{ fontWeight: 'bold', mb: 0.5 }}>{citation.title}</Box>
              <Box sx={{ fontSize: '0.85em', fontStyle: 'italic', mb: 0.5 }}>
                {citation.snippet}
              </Box>
              <Box sx={{ fontSize: '0.75em', color: 'lightblue' }}>
                {citation.url}
              </Box>
            </Box>
          }
          arrow
          placement="top"
          onOpen={() => setHoveredCitation(citationNumber)}
          onClose={() => setHoveredCitation(null)}
        >
          <Link
            component="button"
            variant="body2"
            onClick={(e: React.MouseEvent<HTMLElement>) => {
              e.preventDefault();
              e.stopPropagation();
              handleOpenModal(citation);
            }}
            sx={{
              color: 'primary.main',
              textDecoration: 'none',
              fontWeight: 'bold',
              fontSize: '0.9em',
              verticalAlign: 'super',
              cursor: 'pointer',
              backgroundColor: hoveredCitation === citationNumber ? 'action.hover' : 'transparent',
              padding: '0 2px',
              borderRadius: '2px',
              transition: 'background-color 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '2px',
              border: 'none',
              fontFamily: 'inherit',
              '&:hover': {
                backgroundColor: 'action.hover',
                textDecoration: 'underline',
              }
            }}
          >
            [{citationNumber}]
            <OpenInNewIcon sx={{ fontSize: '0.7em' }} />
          </Link>
        </Tooltip>
      );
    } else {
      parts.push(`[${citationNumber}]`);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return (
    <>
      {parts}
      {modalCitation && (
        <Modal
          open={!!modalCitation}
          onClose={handleCloseModal}
          aria-labelledby="citation-modal-title"
          aria-describedby="citation-modal-description"
        >
          <Paper sx={modalStyle}>
            <Typography id="citation-modal-title" variant="h6" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningAmberIcon color="warning"/>
                External Link Confirmation
            </Typography>
            <Typography id="citation-modal-description" sx={{ mt: 2 }}>
              You are about to navigate to an external website. Please be aware of the content and policies of the destination site.
            </Typography>
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1, wordBreak: 'break-all' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>Link:</Typography>
                <Link href={modalCitation.url} target="_blank" rel="noopener noreferrer">{modalCitation.url}</Link>
            </Box>
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button variant="outlined" onClick={handleCloseModal}>Cancel</Button>
              <Button variant="contained" onClick={handleProceed} autoFocus>Proceed</Button>
            </Box>
          </Paper>
        </Modal>
      )}
    </>
  );
};

/**
 * Helper function to render text with citations
 * Can be used inline in components
 */
export const renderTextWithCitations = (text: string, citations: Citation[]) => {
  return <CitationRenderer text={text} citations={citations} />;
};

export default CitationRenderer;