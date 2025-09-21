// API configuration for backend connections
interface ApiConfig {
  baseURL: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

// Environment detection
const isDevelopment = !import.meta.env.PROD;
const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';

// Get the appropriate API base URL
const getApiBaseURL = (): string => {
  if (!isDevelopment) {
    // Production: use relative path
    return '/api';
  }
  
  if (typeof window === 'undefined') {
    // Server-side rendering fallback
    return 'http://localhost:3000/api';
  }
  
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost') {
    return 'http://localhost:3000/api';
  }
  
  // Development with custom hostname (e.g., local network access)
  return `http://${hostname}:3000/api`;
};

// API Configuration
export const API_CONFIG: ApiConfig = {
  baseURL: getApiBaseURL(),
  timeout: 10000, // 10 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
};

// Default export for backward compatibility
const API_BASE_URL = API_CONFIG.baseURL;

// Debug logging only in development
if (isDevelopment) {
  console.log('API Configuration:', {
    baseURL: API_CONFIG.baseURL,
    environment: isDevelopment ? 'development' : 'production',
    isLocalhost,
  });
}

// Export individual values
export { API_BASE_URL };
export default API_BASE_URL;

// Additional configuration constants
export const APP_CONFIG = {
  // Authentication
  AUTH: {
    TOKEN_CACHE_DURATION: 30000, // 30 seconds
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
  },
  
  // API endpoints
  ENDPOINTS: {
    LOGIN: '/login',
    LOGOUT: '/logout',
    REGISTER: '/register',
    USER_DATA: '/user-data',
    CHECK_USERNAME: '/register/check-username',
  },
  
  // UI settings
  UI: {
    TOAST_DURATION: 5000, // 5 seconds
    DEBOUNCE_DELAY: 300, // 300ms for input debouncing
  },
} as const;