import React, { useEffect, useState, useCallback } from 'react';
import {
    Box, Typography, CircularProgress, Tooltip, IconButton,
} from '@mui/material';
import { History, Add, Remove, SettingsBackupRestore } from '@mui/icons-material';
import axiosInstance from '../../../backend connection/axiosConfig';
import ReversionModal from './ReversionModal';

interface AuditLog {
    auditID: number;
    batchID: number;
    rowID: number | null;
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
    onAuditUpdate?: () => void;
    isReadOnly?: boolean;
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
        case 'DELETE_ROW': return 'Deleted Row';
        case 'REVERT': return 'Restored Value';
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
        case 'DELETE_ROW': return '#d32f2f'; // Red
        case 'REVERT': return '#0288d1'; // Blue
        default: return '#78909c';
    }
}

const ProjectAuditTimeline: React.FC<ProjectAuditTimelineProps> = ({
    batchID,
    projType,
    center,
    auditRefreshTrigger,
    onAuditUpdate,
    isReadOnly = false,
}) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [timelineHeight, setTimelineHeight] = useState(300);
    const [reversionModalOpen, setReversionModalOpen] = useState(false);

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

    // Resizing logic
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = timelineHeight;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaY = startY - moveEvent.clientY;
            const newHeight = Math.max(100, Math.min(600, startHeight + deltaY));
            setTimelineHeight(newHeight);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    return (
        <Box sx={{
            borderTop: '1px solid rgba(0,0,0,0.1)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            height: isExpanded ? `${timelineHeight}px` : 'auto',
            maxHeight: '80vh',
            transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            bgcolor: '#fff',
        }}>
            {/* Resize Handle (only when expanded) */}
            {isExpanded && (
                <Box
                    onMouseDown={handleMouseDown}
                    sx={{
                        position: 'absolute',
                        top: -3,
                        left: 0,
                        right: 0,
                        height: '6px',
                        cursor: 'ns-resize',
                        zIndex: 10,
                        '&:hover': { bgcolor: 'rgba(100, 108, 255, 0.2)' }
                    }}
                />
            )}

            {/* Header */}
            <Box 
                onClick={() => setIsExpanded(!isExpanded)}
                sx={{ 
                    px: 2, 
                    py: 1.2, 
                    bgcolor: 'rgba(0,0,0,0.03)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    flexShrink: 0,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' }
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <History sx={{ fontSize: 16, color: '#646cff' }} />
                    <Typography variant="overline" sx={{ fontWeight: 'bold', color: '#646cff', fontSize: '0.65rem', letterSpacing: '0.1em' }}>
                        AUDIT TIMELINE
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {!isReadOnly && (
                        <Tooltip title="Reversion History (Restore your edits)">
                            <IconButton 
                                size="small" 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setReversionModalOpen(true);
                                }}
                                sx={{ color: '#646cff' }}
                            >
                                <SettingsBackupRestore sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Tooltip>
                    )}
                    <IconButton size="small" sx={{ p: 0.5 }}>
                        {isExpanded ? <Remove sx={{ fontSize: 16 }} /> : <Add sx={{ fontSize: 16 }} />}
                    </IconButton>
                </Box>
            </Box>

            <ReversionModal 
                open={reversionModalOpen}
                onClose={() => setReversionModalOpen(false)}
                batchID={batchID}
                center={center}
                onSuccess={() => {
                    fetchLogs();
                    if (onAuditUpdate) onAuditUpdate();
                }}
            />

            {isExpanded && (
                <>
                    {/* Subtitle */}
                    <Box sx={{ px: 2, py: 0.5, flexShrink: 0, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                        <Typography variant="caption" sx={{ color: '#888', fontSize: '0.6rem', fontWeight: 600 }}>
                            RECENT CHANGES IN {projType?.toUpperCase()} ({center ?? 'GENERAL'})
                        </Typography>
                    </Box>

                    {/* Logs Area */}
                    <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1.5 }}>
                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <CircularProgress size={20} sx={{ color: '#646cff' }} />
                            </Box>
                        ) : logs.length === 0 ? (
                            <Typography variant="body2" sx={{ color: '#999', textAlign: 'center', py: 4, fontSize: '0.75rem', fontStyle: 'italic' }}>
                                No history found for {center ?? 'this sheet'}.
                            </Typography>
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {logs.map((log) => (
                                    <Box key={log.auditID} sx={{ position: 'relative', pl: 2, borderLeft: '1px solid rgba(100, 108, 255, 0.2)' }}>
                                        {/* Relative Dot */}
                                        <Box sx={{
                                            position: 'absolute',
                                            left: -4.5,
                                            top: 4,
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            bgcolor: actionColor(log.action),
                                            boxShadow: `0 0 6px ${actionColor(log.action)}44`,
                                            border: '1.5px solid #fff'
                                        }} />

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: actionColor(log.action), fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                {actionLabel(log.action)}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#999', fontSize: '0.6rem' }}>
                                                {formatRelativeTime(log.timestamp)}
                                            </Typography>
                                        </Box>

                                        <Tooltip title={`${log.newValue}`} arrow placement="left">
                                            <Typography variant="body2" sx={{
                                                color: '#444',
                                                fontSize: '0.72rem',
                                                mt: 0.3,
                                                cursor: 'default',
                                                lineHeight: 1.4,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden'
                                            }}>
                                                {log.newValue}
                                            </Typography>
                                        </Tooltip>
                                        
                                        <Typography variant="caption" sx={{ color: '#aaa', fontSize: '0.6rem', display: 'block', mt: 0.2 }}>
                                            by {log.fullName}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Box>
                </>
            )}
        </Box>
    );
};

export default ProjectAuditTimeline;
