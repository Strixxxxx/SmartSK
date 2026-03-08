import React, { useEffect, useState, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Tooltip,
} from '@mui/material';
import { History } from '@mui/icons-material';
import axiosInstance from '../../../backend connection/axiosConfig';

interface AuditLog {
    auditID: number;
    batchID: number;
    rowID: number;
    action: string;
    oldValue: string | null;
    newValue: string;
    timestamp: string;
    fullName: string;
}

interface ProjectAuditTimelineProps {
    batchID: number | null;
    projType?: string;
    targetYear?: string;
    auditRefreshTrigger?: number;
}

/** Format a timestamp to relative time (e.g. "2 min ago") */
function formatRelativeTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/** Return a short action label for display */
function actionLabel(action: string): string {
    switch (action) {
        case 'ADD_ROW': return 'Added Row';
        case 'ADD_TEXT': return 'Added Text';
        case 'EDIT': return 'Edited';
        default: return action;
    }
}

/** Return a colour for the action badge */
function actionColor(action: string): string {
    switch (action) {
        case 'ADD_ROW': return '#646cff';
        case 'ADD_TEXT': return '#2e7d32';
        case 'EDIT': return '#ed6c02';
        default: return '#78909c';
    }
}

const ProjectAuditTimeline: React.FC<ProjectAuditTimelineProps> = ({
    batchID,
    projType,
    targetYear,
    auditRefreshTrigger,
}) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchLogs = useCallback(async () => {
        if (!batchID) return;
        setLoading(true);
        try {
            const res = await axiosInstance.get(`/api/project-batch/${batchID}/audit`);
            setLogs(res.data.data ?? []);
        } catch (err) {
            console.error('Failed to load audit logs:', err);
        } finally {
            setLoading(false);
        }
    }, [batchID]);

    // Fetch on mount and whenever batchID or trigger changes
    useEffect(() => {
        setLogs([]);
        fetchLogs();
    }, [batchID, fetchLogs, auditRefreshTrigger]);

    return (
        <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box sx={{ px: 2, py: 1, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <History sx={{ fontSize: 14, color: '#646cff' }} />
                <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#646cff', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                    AUDIT TIMELINE
                </Typography>
            </Box>

            {/* Subtitle */}
            <Box sx={{ px: 2, pb: 0.5, flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: '#88939e' }}>
                    {batchID
                        ? `Showing logs for ${projType ?? ''} ${targetYear ?? ''}`
                        : 'Select a project to view logs.'
                    }
                </Typography>
            </Box>

            {/* Log list - Fixed height for 3 items (~42px each including padding/border) */}
            <Box sx={{
                height: 140, // Fixed height to show approx 3 items
                overflowY: 'auto',
                flexShrink: 0,
                px: 1.5,
                pb: 1,
                '&::-webkit-scrollbar': { width: '4px' },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }
            }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5 }}>
                        <CircularProgress size={16} />
                    </Box>
                ) : logs.length === 0 ? (
                    <Typography variant="caption" sx={{ color: '#88939e', display: 'block', pt: 1.5, textAlign: 'center' }}>
                        No activity yet.
                    </Typography>
                ) : (
                    logs.map((log) => (
                        <Tooltip
                            key={log.auditID}
                            title={log.newValue}
                            placement="right"
                            arrow
                            componentsProps={{
                                tooltip: {
                                    sx: {
                                        bgcolor: '#1e1e2e',
                                        color: '#e0e0e0',
                                        fontSize: '0.7rem',
                                        maxWidth: 260,
                                        border: '1px solid rgba(100,108,255,0.3)',
                                        lineHeight: 1.5,
                                    }
                                },
                                arrow: { sx: { color: '#1e1e2e' } }
                            }}
                        >
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 1,
                                    height: 42, // Consistent height for 3-item visibility
                                    py: 0.8,
                                    cursor: 'default',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    '&:last-child': { borderBottom: 'none' },
                                    '&:hover': { bgcolor: 'rgba(100,108,255,0.06)', borderRadius: 1 },
                                }}
                            >
                                {/* Coloured dot */}
                                <Box
                                    sx={{
                                        mt: 0.6,
                                        width: 7,
                                        height: 7,
                                        borderRadius: '50%',
                                        bgcolor: actionColor(log.action),
                                        flexShrink: 0,
                                    }}
                                />
                                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: '#cdd6f4',
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            display: 'block',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            lineHeight: 1.2
                                        }}
                                    >
                                        {actionLabel(log.action)} — {log.fullName}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#888', fontSize: '0.6rem', lineHeight: 1 }}>
                                        {formatRelativeTime(log.timestamp)}
                                    </Typography>
                                </Box>
                            </Box>
                        </Tooltip>
                    ))
                )}
            </Box>
        </Box>
    );
};

export default ProjectAuditTimeline;
