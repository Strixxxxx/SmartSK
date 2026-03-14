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
    center?: string | null;
    auditRefreshTrigger?: number;
}

/** Format a timestamp to relative time (e.g. "2 min ago") */
function formatRelativeTime(ts: string): string {
    // Strip 'Z' suffix if present to avoid UTC conversion, since DB values are already in PHT
    const cleanTs = ts.endsWith('Z') ? ts.slice(0, -1) : ts;
    const diff = Date.now() - new Date(cleanTs).getTime();
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
        case 'ADD_AGENDA': return 'Added Agenda';
        case 'EDIT': return 'Edited Text';
        case 'EDIT_AGENDA': return 'Edited Agenda';
        default: return action;
    }
}

/** Return a colour for the action badge */
function actionColor(action: string): string {
    switch (action) {
        case 'ADD_ROW': return '#646cff';
        case 'ADD_TEXT': return '#2e7d32';
        case 'ADD_AGENDA': return '#1b5e20'; // Dark Green
        case 'EDIT': return '#ed6c02';
        case 'EDIT_AGENDA': return '#f9a825'; // Dark Yellow
        default: return '#78909c';
    }
}

const ProjectAuditTimeline: React.FC<ProjectAuditTimelineProps> = ({
    batchID,
    projType,
    center,
    auditRefreshTrigger,
}) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchLogs = useCallback(async () => {
        if (!batchID) return;
        setLoading(true);
        try {
            const res = await axiosInstance.get(`/api/project-batch/${batchID}/audit`, {
                params: { center }
            });
            setLogs(res.data.data ?? []);
        } catch (err) {
            console.error('Failed to load audit logs:', err);
        } finally {
            setLoading(false);
        }
    }, [batchID, center]);

    // Fetch on mount and whenever batchID or trigger changes
    useEffect(() => {
        setLogs([]);
        fetchLogs();
    }, [batchID, center, fetchLogs, auditRefreshTrigger]);

    return (
        <Box sx={{
            borderTop: '1px solid rgba(255,255,255,0.1)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '350px', // Independent scroll limit
        }}>
            {/* Header */}
            <Box sx={{ px: 2, py: 1, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <History sx={{ fontSize: 14, color: '#646cff' }} />
                <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#646cff', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                    AUDIT TIMELINE
                </Typography>
            </Box>

            {/* Subtitle */}
            <Box sx={{ px: 2, pb: 0.5, flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: '#aaa', fontSize: '0.6rem' }}>
                    RECENT CHANGES IN {projType?.toUpperCase()} ({center ?? 'GENERAL'})
                </Typography>
            </Box>

            {/* Logs Area */}
            <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1, minHeight: 0 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={20} sx={{ color: '#646cff' }} />
                    </Box>
                ) : logs.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', py: 2, fontSize: '0.75rem' }}>
                        No history found for {center ?? 'this sheet'}.
                    </Typography>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {logs.map((log) => (
                            <Box key={log.auditID} sx={{ position: 'relative', pl: 2, borderLeft: '1px solid rgba(100, 108, 255, 0.3)' }}>
                                {/* Relative Dot */}
                                <Box sx={{
                                    position: 'absolute',
                                    left: -4,
                                    top: 4,
                                    width: 7,
                                    height: 7,
                                    borderRadius: '50%',
                                    bgcolor: actionColor(log.action),
                                    boxShadow: `0 0 8px ${actionColor(log.action)}`
                                }} />

                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: actionColor(log.action), fontSize: '0.65rem' }}>
                                        {actionLabel(log.action)}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#666', fontSize: '0.6rem' }}>
                                        {formatRelativeTime(log.timestamp)}
                                    </Typography>
                                </Box>

                                <Tooltip title={`${log.newValue}`}>
                                    <Typography variant="body2" sx={{
                                        color: '#ccc',
                                        fontSize: '0.7rem',
                                        mt: 0.2,
                                        cursor: 'default',
                                        lineHeight: 1.2,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>
                                        {
                                            (log.action === 'ADD_AGENDA' || log.action === 'EDIT_AGENDA')
                                                ? log.newValue
                                                : `${log.fullName} modified row #${log.rowID || '?'}`
                                        }
                                    </Typography>
                                </Tooltip>
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default ProjectAuditTimeline;
