const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { getConnection, sql } = require('../database/database');
const { decrypt } = require('../utils/crypto');

const JWT_SECRET = process.env.JWT_SECRET_KEY; // Must match session.js

let wss;
const clients = new Map();   // userID -> { ws, userInfo, currentRoom }
const rooms = new Map();     // batchID -> Set of userIDs

function getUsersInRoom(batchID) {
    const userIDs = rooms.get(String(batchID));
    if (!userIDs) return [];
    const result = [];
    for (const uid of userIDs) {
        const client = clients.get(uid);
        if (client) result.push({ userID: uid, userInfo: client.userInfo });
    }
    return result;
}

function broadcastToRoom(batchID, message, excludeUserID = null) {
    const userIDs = rooms.get(String(batchID));
    if (!userIDs) return;
    const messageString = JSON.stringify(message);
    for (const uid of userIDs) {
        if (uid === excludeUserID) continue;
        const client = clients.get(uid);
        if (client && client.ws.readyState === require('ws').OPEN) {
            client.ws.send(messageString);
        }
    }
}

function leaveRoom(userID) {
    const client = clients.get(userID);
    if (!client || !client.currentRoom) return;
    const batchID = client.currentRoom;
    const room = rooms.get(String(batchID));
    if (room) {
        room.delete(userID);
        if (room.size === 0) rooms.delete(String(batchID));
        broadcastToRoom(batchID, { type: 'user_left', userID }, userID);
    }
    client.currentRoom = null;
}

async function lookupUserBySessionID(sessionID) {
    try {
        const pool = await getConnection();
        const result = await pool.request()
            .input('sessionID', sql.VarChar, sessionID)
            .query(`
                SELECT u.userID, u.username, u.fullName, r.roleName as position
                FROM sessions s
                JOIN userInfo u ON s.userID = u.userID
                LEFT JOIN roles r ON u.position = r.roleID
                WHERE s.sessionID = @sessionID AND s.expires_at IS NULL
            `);
        if (!result.recordset.length) return null;
        const user = result.recordset[0];
        return {
            userID: user.userID,
            fullName: decrypt(user.fullName),
            position: user.position || 'SKK1',
        };
    } catch (err) {
        console.error('[WebSocket] DB lookup error:', err.message);
        return null;
    }
}

function initializeWebSocketServer(server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        console.log('[WebSocket] Client connected.');

        ws.on('message', async (message) => {
            try {
                const data = JSON.parse(message);

                // --- AUTH ---
                if (data.type === 'auth') {
                    const decoded = jwt.verify(data.token, JWT_SECRET);
                    if (!decoded.sessionID) return;

                    const userInfo = await lookupUserBySessionID(decoded.sessionID);
                    if (!userInfo) {
                        ws.send(JSON.stringify({ type: 'auth_error', message: 'Session not found' }));
                        return;
                    }

                    const { userID } = userInfo;
                    clients.set(userID, { ws, currentRoom: null, userInfo });
                    ws.userID = userID;
                    ws.send(JSON.stringify({ type: 'auth_ok', userID }));
                    console.log(`[WebSocket] Authenticated: userID ${userID} (${userInfo.position})`);
                }

                // --- JOIN PROJECT ROOM ---
                else if (data.type === 'join_project') {
                    if (!ws.userID) return;
                    const batchID = String(data.batchID);
                    const client = clients.get(ws.userID);
                    if (!client) return;

                    leaveRoom(ws.userID);

                    if (!rooms.has(batchID)) rooms.set(batchID, new Set());
                    rooms.get(batchID).add(ws.userID);
                    client.currentRoom = batchID;

                    const existing = getUsersInRoom(batchID).filter(u => u.userID !== ws.userID);
                    ws.send(JSON.stringify({ type: 'room_users', batchID, users: existing }));

                    broadcastToRoom(batchID, {
                        type: 'user_joined',
                        batchID,
                        userID: ws.userID,
                        userInfo: client.userInfo,
                    }, ws.userID);

                    console.log(`[WebSocket] userID ${ws.userID} joined room ${batchID}`);
                }

                // --- CURSOR MOVE ---
                else if (data.type === 'cursor_move') {
                    if (!ws.userID) return;
                    const client = clients.get(ws.userID);
                    if (!client || !client.currentRoom) return;
                    broadcastToRoom(client.currentRoom, {
                        type: 'cursor_move',
                        userID: ws.userID,
                        userInfo: client.userInfo,
                        cell: data.cell,
                        batchID: client.currentRoom,
                    }, ws.userID);
                }

                // --- CELL CHANGE ---
                else if (data.type === 'cell_change') {
                    if (!ws.userID) return;
                    const client = clients.get(ws.userID);
                    if (!client || !client.currentRoom) return;
                    broadcastToRoom(client.currentRoom, {
                        type: 'cell_change',
                        userID: ws.userID,
                        batchID: client.currentRoom,
                        changes: data.changes,
                    }, ws.userID);
                }

                // --- PROJECT NOTE ---
                else if (data.type === 'project_note') {
                    if (!ws.userID) return;
                    const client = clients.get(ws.userID);
                    if (!client || !client.currentRoom) return;
                    broadcastToRoom(client.currentRoom, {
                        type: 'project_note',
                        note: data.note,
                        batchID: client.currentRoom,
                    }, ws.userID);
                }

            } catch (error) {
                console.error('[WebSocket] Message error:', error.message);
            }
        });

        ws.on('close', () => {
            if (ws.userID) {
                leaveRoom(ws.userID);
                clients.delete(ws.userID);
                console.log(`[WebSocket] userID ${ws.userID} disconnected.`);
            } else {
                console.log('[WebSocket] Unauthenticated client disconnected.');
            }
        });

        ws.on('error', (error) => {
            console.error('[WebSocket] Error:', error);
        });
    });

    console.log('[WebSocket] Server initialized.');
}

function sendToUser(userId, message) {
    const client = clients.get(userId);
    if (client && client.ws.readyState === require('ws').OPEN) {
        client.ws.send(JSON.stringify(message));
    }
}

function broadcast(message) {
    if (!wss) return;
    const messageString = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === require('ws').OPEN) {
            client.send(messageString);
        }
    });
}

module.exports = { initializeWebSocketServer, broadcast, sendToUser };
