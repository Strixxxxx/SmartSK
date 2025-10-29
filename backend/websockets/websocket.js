const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

let wss;
const clients = new Map(); // Map to store userID -> WebSocket

function initializeWebSocketServer(server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        console.log('[WebSocket] Client connected.');

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'auth') {
                    const decoded = jwt.verify(data.token, JWT_SECRET);
                    clients.set(decoded.userID, ws);
                    ws.userID = decoded.userID; // Associate userID with the ws connection
                    console.log(`[WebSocket] Client authenticated for userID: ${ws.userID}`);
                }
            } catch (error) {
                console.error('[WebSocket] Authentication failed:', error.message);
            }
        });

        ws.on('close', () => {
            if (ws.userID) {
                clients.delete(ws.userID);
                console.log(`[WebSocket] Client for userID: ${ws.userID} disconnected.`);
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
    if (client && client.readyState === require('ws').OPEN) {
        console.log(`[WebSocket] Sending message to userID: ${userId}`)
        client.send(JSON.stringify(message));
    }
}

function broadcast(message) {
    if (!wss) {
        console.error('[WebSocket] WebSocket server not initialized. Cannot broadcast.');
        return;
    }

    console.log(`[WebSocket] Broadcasting message to ${wss.clients.size} clients:`, message);
    const messageString = JSON.stringify(message);

    wss.clients.forEach(client => {
        if (client.readyState === require('ws').OPEN) {
            client.send(messageString);
        }
    });
}

module.exports = { initializeWebSocketServer, broadcast, sendToUser };
