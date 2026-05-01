import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { toast } from 'react-toastify';


interface MaintenanceMessage {
  type: 'maintenance_starting' | 'maintenance_ended';
}

interface WebSocketContextType {
  maintenanceMessage: MaintenanceMessage | null;
  postUpdateTimestamp: number; // New state to track post updates
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
  const [postUpdateTimestamp, setPostUpdateTimestamp] = useState<number>(Date.now()); // New state

  useEffect(() => {
    let ws: WebSocket;
    let reconnectInterval: number;

    const connect = () => {
      // Derive WebSocket URL from the VITE_BACKEND_SERVER environment variable
      const backendHttpUrl = import.meta.env.VITE_BACKEND_SERVER;
      if (!backendHttpUrl) {
        if (import.meta.env.DEV) console.error("[WebSocket] Error: VITE_BACKEND_SERVER environment variable not set. WebSocket will not connect.");
        return; // Do not attempt to connect if the URL is not configured
      }
      const wsUrl = backendHttpUrl.replace(/^http/, 'ws');

      if (import.meta.env.DEV) console.log('[WebSocket] Connecting to the Backend Server.');
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (import.meta.env.DEV) console.log('[WebSocket] Connection established.');
        if (reconnectInterval) {
          clearInterval(reconnectInterval);
        }
        // Authenticate the WebSocket connection
        const token = sessionStorage.getItem('token');
        if (token) {
          ws.send(JSON.stringify({ type: 'auth', token }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (import.meta.env.DEV) console.log('[WebSocket] Message received:', message);

          if (message.type === 'maintenance_starting' || message.type === 'maintenance_ended') {
            setMaintenanceMessage(message);
          } else if (message.type === 'job-update') {
            if (message.status === 'completed') {
              toast.success(message.message);
            } else if (message.status === 'failed') {
              toast.error(message.message);
            }
          } else if (message.type === 'POSTS_UPDATED') { // Handle the new message type
            if (import.meta.env.DEV) console.log('[WebSocket] Posts updated, triggering refresh.');
            setPostUpdateTimestamp(Date.now()); // Update timestamp to trigger re-renders
          } else if (message.type === 'user_update') {
            if (import.meta.env.DEV) console.log('[WebSocket] User profile update received.');
            
            if (message.messages && Array.isArray(message.messages)) {
              message.messages.forEach((msg: string) => {
                toast.info(msg, {
                  position: "top-right",
                  autoClose: 6000,
                });
              });
            } else {
              toast.info(message.message || 'Your account settings have been updated.', {
                position: "top-right",
                autoClose: 5000,
              });
            }
            
            // Dispatch custom event for AuthContext to refresh profile
            window.dispatchEvent(new CustomEvent('user-profile-refresh'));
          }

        } catch (error) {
          if (import.meta.env.DEV) console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        if (import.meta.env.DEV) console.log('[WebSocket] Connection closed. Attempting to reconnect...');
        // Simple exponential backoff could be added here
        reconnectInterval = window.setTimeout(connect, 5000); // Try to reconnect every 5 seconds
      };

      ws.onerror = (error) => {
        if (import.meta.env.DEV) console.error('[WebSocket] Error:', error);
        ws.close(); // This will trigger the onclose handler to attempt reconnection
      };
    };

    connect();

    return () => {
      if (reconnectInterval) {
        clearInterval(reconnectInterval);
      }
      if (ws) {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => ws.close();
        } else {
          ws.close();
        }
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
    <WebSocketContext.Provider value={{ maintenanceMessage, postUpdateTimestamp }}>
      {children}
    </WebSocketContext.Provider>
  );
};
