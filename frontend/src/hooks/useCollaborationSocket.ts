import { useEffect, useRef, useState, useCallback } from 'react';

// Color palette for collaborators — deterministic via userID
const CURSOR_COLORS = [
    '#e53935', '#8e24aa', '#1e88e5', '#00897b',
    '#f4511e', '#6d4c41', '#039be5', '#7cb342',
];

export function getUserColor(userID: number | string): string {
    const n = typeof userID === 'number' ? userID : parseInt(String(userID), 10) || 0;
    return CURSOR_COLORS[Math.abs(n) % CURSOR_COLORS.length];
}

export interface CollaboratorInfo {
    userID: number;
    fullName: string;
    position: string;
    color: string;
    cell: { r: number; c: number } | { cellId: string } | null;
}

interface UseCollaborationSocketOptions {
    batchID: number | null;
    onCellChange?: (changes: any[]) => void;
    onNote?: (note: any) => void;
    onAuditUpdate?: (batchID: number) => void;
}

const WS_URL = (() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_HOST || window.location.hostname;
    const port = import.meta.env.VITE_WS_PORT || '8080';
    return `${protocol}//${host}:${port}`;
})();

export function useCollaborationSocket({ batchID, onCellChange, onNote, onAuditUpdate }: UseCollaborationSocketOptions) {
    const wsRef = useRef<WebSocket | null>(null);
    const [collaborators, setCollaborators] = useState<Map<number, CollaboratorInfo>>(new Map());
    const [isConnected, setIsConnected] = useState(false);
    const batchIDRef = useRef(batchID);

    useEffect(() => { batchIDRef.current = batchID; }, [batchID]);

    // Connect once on mount
    useEffect(() => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            ws.send(JSON.stringify({ type: 'auth', token }));
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'auth_ok') {
                    // After auth, join the current room if batchID is set
                    if (batchIDRef.current) {
                        ws.send(JSON.stringify({ type: 'join_project', batchID: batchIDRef.current }));
                    }
                }

                else if (msg.type === 'room_users') {
                    // Populate collaborators from existing room members
                    setCollaborators(prev => {
                        const next = new Map(prev);
                        (msg.users as any[]).forEach(u => {
                            next.set(u.userID, {
                                userID: u.userID,
                                fullName: u.userInfo?.fullName || 'User',
                                position: u.userInfo?.position || 'SKK1',
                                color: getUserColor(u.userID),
                                cell: null,
                            });
                        });
                        return next;
                    });
                }

                else if (msg.type === 'user_joined') {
                    setCollaborators(prev => {
                        const next = new Map(prev);
                        next.set(msg.userID, {
                            userID: msg.userID,
                            fullName: msg.userInfo?.fullName || 'User',
                            position: msg.userInfo?.position || 'SKK1',
                            color: getUserColor(msg.userID),
                            cell: null,
                        });
                        return next;
                    });
                }

                else if (msg.type === 'user_left') {
                    setCollaborators(prev => {
                        const next = new Map(prev);
                        next.delete(msg.userID);
                        return next;
                    });
                }

                else if (msg.type === 'cursor_move') {
                    setCollaborators(prev => {
                        const next = new Map(prev);
                        const existing = next.get(msg.userID);
                        next.set(msg.userID, {
                            userID: msg.userID,
                            fullName: msg.userInfo?.fullName || existing?.fullName || 'User',
                            position: msg.userInfo?.position || existing?.position || 'SKK1',
                            color: getUserColor(msg.userID),
                            cell: msg.cell || null,
                        });
                        return next;
                    });
                }

                else if (msg.type === 'cell_change') {
                    if (onCellChange && msg.changes) {
                        onCellChange(msg.changes);
                    }
                }

                else if (msg.type === 'project_note') {
                    if (onNote && msg.note) {
                        onNote(msg.note);
                    }
                }

                else if (msg.type === 'audit_update') {
                    if (onAuditUpdate) {
                        onAuditUpdate(Number(msg.batchID));
                    }
                }

            } catch (e) {
                console.error('[WS] Parse error:', e);
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
            setCollaborators(new Map());
        };

        ws.onerror = (e) => console.error('[WS] Error:', e);

        return () => {
            if (ws.readyState === WebSocket.CONNECTING) {
                // If the component unmounts while the WS is still connecting,
                // attaching the close to onopen prevents the "closed before established" error.
                ws.onopen = () => ws.close();
            } else {
                ws.close();
            }
        };
    }, []); // Only connect once

    // Join a new room when batchID changes
    useEffect(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (!batchID) return;
        setCollaborators(new Map());
        wsRef.current.send(JSON.stringify({ type: 'join_project', batchID }));
    }, [batchID]);

    const sendCursorMove = useCallback((cell: { r: number; c: number } | { cellId: string } | null) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'cursor_move', cell, batchID: batchIDRef.current }));
    }, []);

    const sendCellChange = useCallback((changes: any[]) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'cell_change', changes, batchID: batchIDRef.current }));
    }, []);

    const sendNote = useCallback((note: any) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'project_note', note, batchID: batchIDRef.current }));
    }, []);

    return { collaborators, isConnected, sendCursorMove, sendCellChange, sendNote };
}
