import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Modal,
    TextField,
    CircularProgress,
    Alert,
    Tooltip,
    TablePagination,
} from '@mui/material';
import { Edit, Save, Cancel, VpnKey } from '@mui/icons-material';
import axios from '../../backend connection/axiosConfig';
import { useAuth } from '../../context/AuthContext';

const modalStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '60%',
    bgcolor: 'background.paper',
    border: '2px solid #000',
    boxShadow: 24,
    p: 4,
};

const AIProjSummary = () => {
    const { user } = useAuth();
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [rulesModalOpen, setRulesModalOpen] = useState(false);
    const [rulesContent, setRulesContent] = useState('');
    const [editingRules, setEditingRules] = useState(false);
    const [rulesLoading, setRulesLoading] = useState(false);
    const [overrideModalOpen, setOverrideModalOpen] = useState(false);
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const [justification, setJustification] = useState('');
    const [newDecision, setNewDecision] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const fetchAuditLogs = useCallback(async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/projectaudit/audit');
            if (response.data.success) {
                setAuditLogs(response.data.data);
            } else {
                setError('Failed to fetch audit logs.');
            }
        } catch (err) {
            setError('An error occurred while fetching audit logs.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAuditLogs();
    }, [fetchAuditLogs]);

    const handleOpenRulesModal = async () => {
        setRulesModalOpen(true);
        setRulesLoading(true);
        try {
            const response = await axios.get('/api/projectaudit/ai-rules');
            if (response.data.success) {
                const content = response.data.content;
                // If content is empty or just whitespace, initialize with a dash
                if (!content || content.trim() === '') {
                    setRulesContent('- ');
                } else {
                    setRulesContent(content);
                }
            } else {
                setRulesContent('- '); // Start with a dash if no rules file is found
            }
        } catch (err) {
            setRulesContent('An error occurred while fetching the rules.');
            console.error(err);
        } finally {
            setRulesLoading(false);
        }
    };

    const handleRulesKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            const target = event.target as HTMLTextAreaElement;
            const { selectionStart, selectionEnd, value } = target;
            
            const newValue = 
                value.substring(0, selectionStart) + 
                '\n- ' + 
                value.substring(selectionEnd);
            
            setRulesContent(newValue);

            // This is a trick to move the cursor to the end of the newly inserted text
            setTimeout(() => {
                target.selectionStart = target.selectionEnd = selectionStart + 3;
            }, 0);
        }
    };

    const handleSaveRules = async () => {
        setRulesLoading(true);
        try {
            await axios.post('/api/projectaudit/ai-rules', { rules: rulesContent });
            setEditingRules(false);
        } catch (err) {
            alert('Failed to save rules.');
            console.error(err);
        } finally {
            setRulesLoading(false);
        }
    };

    const handleOpenOverrideModal = (log: any, decision: 'approved' | 'rejected') => {
        setSelectedLog(log);
        setNewDecision(decision);
        setOverrideModalOpen(true);
    };

    const handleConfirmOverride = async () => {
        if (!justification || !selectedLog) return;
        try {
            await axios.post('/projectaudit/manual-override', {
                auditID: selectedLog.auditID,
                newDecision,
                justification,
            });
            setOverrideModalOpen(false);
            setJustification('');
            setSelectedLog(null);
            fetchAuditLogs(); // Refresh the logs
        } catch (err) {
            alert('Failed to perform override.');
            console.error(err);
        }
    };

    const handleChangePage = (_event: unknown, newPage: number) => {
        setPage(newPage);
    };

    const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    if (loading) {
        return <CircularProgress />;
    }

    if (error) {
        return <Alert severity="error">{error}</Alert>;
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5">AI Project Review Summary</Typography>
                {user?.position === 'SKC' && (
                    <Button
                        variant="contained"
                        startIcon={<VpnKey />}
                        onClick={handleOpenRulesModal}
                    >
                        Manage AI Rules
                    </Button>
                )}
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Project Title</TableCell>
                            <TableCell>Submitted By</TableCell>
                            <TableCell>AI Decision</TableCell>
                            <TableCell>Processed At</TableCell>
                            <TableCell>Details</TableCell>
                            {user?.position === 'SKC' && <TableCell>Actions</TableCell>}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {auditLogs.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((log) => (
                            <TableRow key={log.auditID}>
                                <TableCell>{log.projectTitle}</TableCell>
                                <TableCell>{log.proposerName}</TableCell>
                                <TableCell>
                                    <Typography color={log.decision === 'approved' ? 'green' : 'red'}>
                                        {log.decision.toUpperCase()}
                                    </Typography>
                                </TableCell>
                                <TableCell>{new Date(log.processedAt).toLocaleString()}</TableCell>
                                <TableCell>
                                    <Tooltip title={<pre style={{ whiteSpace: 'pre-wrap' }}>{log.verificationReport}</pre>}>
                                        <Button size="small">View Report</Button>
                                    </Tooltip>
                                </TableCell>
                                {user?.position === 'SKC' && (
                                    <TableCell>
                                        <Button
                                            size="small"
                                            color="success"
                                            onClick={() => handleOpenOverrideModal(log, 'approved')}
                                            disabled={log.decision === 'approved'}
                                        >
                                            Approve
                                        </Button>
                                        <Button
                                            size="small"
                                            color="error"
                                            onClick={() => handleOpenOverrideModal(log, 'rejected')}
                                            disabled={log.decision === 'rejected'}
                                        >
                                            Reject
                                        </Button>
                                    </TableCell>
                                )}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                <TablePagination
                    rowsPerPageOptions={[10, 25, 50]}
                    component="div"
                    count={auditLogs.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={handleChangePage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                />
            </TableContainer>

            {/* AI Rules Modal */}
            <Modal open={rulesModalOpen} onClose={() => setRulesModalOpen(false)}>
                <Box sx={modalStyle}>
                    <Typography variant="h6" component="h2" color="text.primary">
                        Rules for AI Process
                    </Typography>
                    {rulesLoading ? <CircularProgress /> : (
                        <TextField
                            multiline
                            fullWidth
                            rows={15}
                            value={rulesContent}
                            onChange={(e) => setRulesContent(e.target.value)}
                            onKeyDown={editingRules ? handleRulesKeyDown : undefined}
                            InputProps={{ readOnly: !editingRules }}
                            variant="outlined"
                            sx={{ mt: 2, mb: 2, backgroundColor: editingRules ? '#fff' : '#f0f0f0' }}
                        />
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 1 }}>
                        {editingRules ? (
                            <>
                                <Button onClick={handleSaveRules} variant="contained" startIcon={<Save />}>Save</Button>
                                <Button onClick={() => setEditingRules(false)} variant="outlined" startIcon={<Cancel />}>Cancel</Button>
                            </>
                        ) : (
                            <Button onClick={() => setEditingRules(true)} variant="contained" startIcon={<Edit />}>Edit Rules</Button>
                        )}
                    </Box>
                </Box>
            </Modal>

            {/* Manual Override Modal */}
            <Modal open={overrideModalOpen} onClose={() => setOverrideModalOpen(false)}>
                <Box sx={modalStyle}>
                    <Typography variant="h6">Manual Override</Typography>
                    <Typography sx={{ mt: 2 }}>
                        You are about to manually change the status of project "{selectedLog?.projectTitle}" to <strong>{newDecision.toUpperCase()}</strong>.
                    </Typography>
                    <TextField
                        label="Justification"
                        multiline
                        fullWidth
                        rows={4}
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        sx={{ mt: 2, mb: 2 }}
                        required
                    />
                    <Button onClick={handleConfirmOverride} variant="contained" color="primary" disabled={!justification}>
                        Confirm Override
                    </Button>
                    <Button onClick={() => setOverrideModalOpen(false)} sx={{ ml: 1 }}>
                        Cancel
                    </Button>
                </Box>
            </Modal>
        </Box>
    );
};

export default AIProjSummary;
