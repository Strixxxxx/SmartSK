import React from 'react';
import { Typography, Box } from '@mui/material';

interface LegalTextViewerProps {
  text: string;
}

const LegalTextViewer: React.FC<LegalTextViewerProps> = ({ text }) => {
  const lines = text.split('\n').filter(line => line.trim() !== '');

  // This function converts markdown-style bold and list items into HTML tags
  const createMarkup = (line: string) => {
    const htmlLine = line
      .replace(/^\s*-\s/, '• ') // Replace leading dash with a bullet point
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Replace **text** with <strong>text</strong>
    
    return { __html: htmlLine };
  };

  return (
    <Box>
      {lines.map((line, index) => {
        const trimmedLine = line.trim();

        // Full-line headings
        if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
          return (
            <Typography 
              key={index} 
              variant="h6" 
              component="h2" 
              sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}
              dangerouslySetInnerHTML={createMarkup(trimmedLine)}
            />
          );
        }

        // All other lines (paragraphs and list items)
        return (
          <Typography 
            key={index} 
            variant="body2" 
            paragraph 
            dangerouslySetInnerHTML={createMarkup(line)}
          />
        );
      })}
    </Box>
  );
};

export default LegalTextViewer;