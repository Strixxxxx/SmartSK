const { WebSocketServer } = require('ws');

let wss;

function initializeWebSocketServer(server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        console.log('[WebSocket] Client connected.');

        // When a new client connects, check if maintenance just finished.
        if (global.maintenanceJustFinished) {
            console.log('[WebSocket] Notifying client about recent maintenance completion.');
            ws.send(JSON.stringify({ type: 'maintenance_ended' }));
            // Reset the flag after notifying clients, so they only get the message once.
            global.maintenanceJustFinished = false; 
        }

        ws.on('close', () => {
            console.log('[WebSocket] Client disconnected.');
        });

        ws.on('error', (error) => {
            console.error('[WebSocket] Error:', error);
        });
    });

    console.log('[WebSocket] Server initialized.');
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

module.exports = { initializeWebSocketServer, broadcast };
