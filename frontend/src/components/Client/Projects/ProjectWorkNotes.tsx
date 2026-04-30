import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, TextField, Button, Paper, Divider, IconButton, Tooltip } from '@mui/material';
import { PushPin, NoteAlt, Menu as MenuIcon } from '@mui/icons-material';
import axiosInstance from '../../../backend connection/axiosConfig';
import { formatRoleName } from '../../../utils/roleUtils';

interface NoteItem {
    noteID: number;
    batchID: number;
    userID: number;
    content: string;
    createdAt: string;
    fullName: string;
    position: string;
}

interface ProjectWorkNotesProps {
    project: any;
    onPostNote?: (note: NoteItem) => void;
    remoteNotes?: NoteItem[];
    center?: string | null;
    refreshTrigger?: number;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

const ProjectWorkNotes: React.FC<ProjectWorkNotesProps> = ({ project, onPostNote, remoteNotes, center, refreshTrigger = 0, isCollapsed = false, onToggleCollapse }) => {
    const [notes, setNotes] = useState<NoteItem[]>([]);
    const [input, setInput] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Fetch notes on project change
    useEffect(() => {
        if (!project?.batchID) {
            setNotes([]);
            return;
        }
        const fetchNotes = async () => {
            try {
                const res = await axiosInstance.get(`/api/project-notes/${project.batchID}`, {
                    params: { center }
                });
                setNotes(res.data.data ?? []);
            } catch (err) {
                console.error('Failed to load notes:', err);
            }
        };
        fetchNotes();
    }, [project?.batchID, center, refreshTrigger]);

    // Append remote notes received via WebSocket
    useEffect(() => {
        if (remoteNotes && remoteNotes.length > 0) {
            setNotes(prev => {
                const existingIds = new Set(prev.map(n => n.noteID));
                const newNotes = remoteNotes.filter(n => !existingIds.has(n.noteID));
                return newNotes.length > 0 ? [...prev, ...newNotes] : prev;
            });
        }
    }, [remoteNotes]);

    // Auto-scroll to bottom on new notes
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [notes]);

    const handlePost = async () => {
        if (!input.trim() || !project?.batchID) return;
        setIsPosting(true);
        try {
            const res = await axiosInstance.post(`/api/project-notes/${project.batchID}`, {
                content: input.trim(),
                center
            });
            const newNote: NoteItem = res.data.data;
            setNotes(prev => [...prev, newNote]);
            setInput('');
            onPostNote?.(newNote);
        } catch (err) {
            console.error('Failed to post note:', err);
        } finally {
            setIsPosting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handlePost();
        }
    };

    const formatTime = (iso: string) => {
        const cleanIso = iso.replace('Z', '').replace('T', ' ');
        const d = new Date(cleanIso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' +
            d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };

    // Collapsed view: narrow strip with hamburger and vertical label
    return (
        <Box 
            sx={{ 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                background: isCollapsed ? 'linear-gradient(135deg, #eee9e9, #d0c48e)' : '#fefcf3',
                transition: 'background 0.4s ease',
            }}
        >
            {/* ── COLLAPSED VIEW (Vertical Label) ────────────────────────────── */}
            <Box sx={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                pt: 1,
                opacity: isCollapsed ? 1 : 0,
                visibility: isCollapsed ? 'visible' : 'hidden',
                transition: 'opacity 0.3s ease, visibility 0.3s ease',
                zIndex: isCollapsed ? 2 : 1,
            }}>
                <Tooltip title="Expand Notes & Agenda" placement="left">
                    <IconButton onClick={onToggleCollapse} size="small" sx={{ color: '#b59a3b' }}>
                        <MenuIcon />
                    </IconButton>
                </Tooltip>
                <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    mt: 1, 
                    userSelect: 'none',
                    gap: 0.2
                }}>
                    {"NOTES & AGENDA".split("").map((char, i) => (
                        <Typography
                            key={i}
                            sx={{
                                fontSize: char === " " ? '0.4rem' : '0.65rem',
                                fontWeight: 700,
                                color: '#8c7b44',
                                letterSpacing: '0.05em',
                                lineHeight: 1,
                                height: char === " " ? 8 : 'auto'
                            }}
                        >
                            {char}
                        </Typography>
                    ))}
                </Box>
            </Box>

            {/* ── EXPANDED VIEW (Notes Content) ──────────────────────────────── */}
            <Box sx={{ 
                flexGrow: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                height: '100%',
                opacity: isCollapsed ? 0 : 1,
                visibility: isCollapsed ? 'hidden' : 'visible',
                transition: 'opacity 0.2s ease, visibility 0.2s ease',
                width: 280, // Lock width for stability
            }}>
                {/* Header */}
                <Box sx={{ p: 1.5, borderBottom: '1px solid #e0d9c4', display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#faf6e9' }}>
                    <Tooltip title="Collapse Notes">
                        <IconButton onClick={onToggleCollapse} size="small" sx={{ color: '#b59a3b', mr: 0.5 }}>
                            <MenuIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <NoteAlt sx={{ color: '#b59a3b', fontSize: 22 }} />
                    <Typography variant="subtitle1" fontWeight="bold" sx={{ color: '#5a4e2f' }}>Work Notes &amp; Agenda</Typography>
                </Box>

                {/* Notes List */}
                <Box ref={scrollRef} sx={{ flexGrow: 1, p: 1.5, overflowY: 'auto' }}>
                    {!project ? (
                        <Typography variant="body2" sx={{ color: '#aaa', textAlign: 'center', mt: 4 }}>
                            Select a project to view notes.
                        </Typography>
                    ) : notes.length === 0 ? (
                        <Typography variant="body2" sx={{ color: '#aaa', textAlign: 'center', mt: 4 }}>
                            No notes yet. Be the first to post!
                        </Typography>
                    ) : (
                        notes.map((note) => (
                            <Paper
                                key={note.noteID}
                                elevation={0}
                                sx={{
                                    p: 1.5,
                                    mb: 1.5,
                                    bgcolor: '#fff9c4',
                                    border: '1px solid #f0e68c',
                                    borderRadius: '6px',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                    wordBreak: 'break-word',
                                    overflowWrap: 'break-word',
                                }}
                            >
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                    <Typography variant="caption" fontWeight={700} sx={{ color: '#5a4e2f' }}>
                                        {note.fullName}
                                        <Typography component="span" variant="caption" sx={{ color: '#8c7b44', ml: 0.5 }}>
                                            ({formatRoleName(note.position)})
                                        </Typography>
                                    </Typography>
                                </Box>
                                <Divider sx={{ mb: 0.5, borderColor: '#f0e68c' }} />
                                <Typography variant="body2" sx={{ color: '#3e3520', whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: 1.5, mb: 0.5 }}>
                                    {note.content}
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Typography variant="caption" sx={{ color: '#999', fontSize: '10px' }}>
                                        {formatTime(note.createdAt)}
                                    </Typography>
                                </Box>
                            </Paper>
                        ))
                    )}
                </Box>

                {/* Input Area */}
                {project && (
                    <Box sx={{ p: 1.5, borderTop: '1px solid #e0d9c4', bgcolor: '#faf6e9' }}>
                        <TextField
                            fullWidth
                            size="small"
                            multiline
                            maxRows={3}
                            placeholder="Write a note or agenda..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            sx={{
                                mb: 1,
                                '& .MuiOutlinedInput-root': {
                                    bgcolor: '#fffef5',
                                    fontSize: '12px',
                                },
                            }}
                        />
                        <Button
                            variant="contained"
                            size="small"
                            fullWidth
                            startIcon={<PushPin />}
                            disabled={!input.trim() || isPosting}
                            onClick={handlePost}
                            sx={{
                                bgcolor: '#b59a3b',
                                '&:hover': { bgcolor: '#9c8432' },
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '12px',
                            }}
                        >
                            Post Note
                        </Button>
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default ProjectWorkNotes;
