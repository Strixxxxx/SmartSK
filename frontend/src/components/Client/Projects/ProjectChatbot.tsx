import React from 'react';
import { Box, Typography, TextField, IconButton, Paper } from '@mui/material';
import { Send, SmartToy } from '@mui/icons-material';

interface ProjectChatbotProps {
    project: any;
}

const ProjectChatbot: React.FC<ProjectChatbotProps> = ({ project }) => {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#ffffff' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 1 }}>
                <SmartToy color="primary" />
                <Typography variant="h6" fontWeight="bold">Project AI Assistant</Typography>
            </Box>

            {/* Chat Messages */}
            <Box sx={{ flexGrow: 1, p: 2, overflowY: 'auto', bgcolor: '#fcfcfc' }}>
                <Paper sx={{ p: 1.5, mb: 2, maxWidth: '85%', bgcolor: '#f0f4f8' }}>
                    <Typography variant="body2">
                        Hello! I am your assistant for {project?.projType} {project?.targetYear}. I can help you with budgeting rules, thematic areas, and project forecasting.
                    </Typography>
                </Paper>
            </Box>

            {/* Input area */}
            <Box sx={{ p: 2, borderTop: '1px solid #e0e0e0' }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Ask AI about this project..."
                    InputProps={{
                        endAdornment: (
                            <IconButton color="primary" size="small">
                                <Send />
                            </IconButton>
                        )
                    }}
                />
            </Box>
        </Box>
    );
};

export default ProjectChatbot;
