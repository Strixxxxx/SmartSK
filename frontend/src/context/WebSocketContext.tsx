import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface MaintenanceMessage {
  type: 'maintenance_starting' | 'maintenance_ended';
}

interface WebSocketContextType {
  maintenanceMessage: MaintenanceMessage | null;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [maintenanceMessage, setMaintenanceMessage] = useState<MaintenanceMessage | null>(null);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectInterval: number;

    const connect = () => {
      // Dynamically determine WebSocket protocol and host
      const protocol = window.location.protocol === 'https' ? 'wss' : 'ws';
      const host = process.env.NODE_ENV === 'production' ? window.location.host : 'localhost:8080';
      const wsUrl = `${protocol}://${host}`;

      console.log('[WebSocket] Connecting to', wsUrl);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WebSocket] Connection established.');
        if (reconnectInterval) {
          clearInterval(reconnectInterval);
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[WebSocket] Message received:', message);
          if (message.type === 'maintenance_starting' || message.type === 'maintenance_ended') {
            setMaintenanceMessage(message);
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Connection closed. Attempting to reconnect...');
        // Simple exponential backoff could be added here
        reconnectInterval = window.setTimeout(connect, 5000); // Try to reconnect every 5 seconds
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        ws.close(); // This will trigger the onclose handler to attempt reconnection
      };
    };

    connect();

    return () => {
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
      }
      if (ws) {
        ws.close();
      }
    };
  }, []);

  // Function to clear the message after it has been displayed
  useEffect(() => {
    if (maintenanceMessage?.type === 'maintenance_ended') {
      const timer = setTimeout(() => {
        setMaintenanceMessage(null);
      }, 15000); // Show the 'ended' message for 15 seconds
      return () => clearTimeout(timer);
    }
  }, [maintenanceMessage]);

  return (
    <WebSocketContext.Provider value={{ maintenanceMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
};
