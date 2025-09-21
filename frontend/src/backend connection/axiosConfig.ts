import axios from 'axios';

// Get base URL from config
const getBaseURL = (): string => {
  if (import.meta.env.PROD) {
    return ''; // In production, use relative path
  }
  
  const hostname = window.location.hostname;
  if (hostname === 'localhost') {
    return 'http://localhost:3000';
  }
  
  return `http://${hostname}:3000`;
};

// Create axios instance instead of modifying global defaults
const axiosInstance = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true, // Send cookies with requests
  timeout: 300000, // Extended to 5 minutes (300 seconds)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor - Enhanced with file upload handling
axiosInstance.interceptors.request.use(
  (config) => {
    // Add auth tokens to every request - ONLY from sessionStorage
    const token = sessionStorage.getItem('token'); // Only sessionStorage
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Special handling for file uploads with extended timeout
    if (config.headers['Content-Type'] === 'multipart/form-data') {
      config.timeout = 600000; // 10 minutes for file uploads
      
      // Add upload progress tracking
      config.onUploadProgress = (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Upload Progress: ${percentCompleted}%`);
          
          // Dispatch custom event for progress tracking
          window.dispatchEvent(new CustomEvent('uploadProgress', {
            detail: { progress: percentCompleted }
          }));
        }
      };
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor - Enhanced error handling with timeout support
axiosInstance.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (axios.isCancel(error)) {
      // Don't log cancellation errors as they are expected during component unmounts
      return Promise.reject(error);
    }
    // Handle timeout errors specifically
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.error('Network timeout - no response received:', error);
      
      // Dispatch custom event for timeout handling
      window.dispatchEvent(new CustomEvent('networkTimeout', {
        detail: { 
          message: 'Request timed out. The server might be processing a large amount of data.',
          originalError: error
        }
      }));
      
      return Promise.reject({
        ...error,
        userMessage: 'Request timed out. Please try again or contact support if the issue persists.'
      });
    }
    
    // Handle different types of errors
    if (error.response) {
      // Server responded with error status
      const isAuthError = error.response.status === 401;
      const isServerError = error.response.status >= 500;
      const isClientError = error.response.status >= 400 && error.response.status < 500;
      
      // Only log non-auth errors to avoid console spam
      if (!isAuthError) {
        if (isServerError) {
          console.error('Server error:', error.response.status, error.response.data);
        } else if (isClientError && error.response.status !== 401) {
          console.error('Client error:', error.response.status, error.response.data);
        }
      }
      
      // For auth errors, clear ONLY sessionStorage
      if (isAuthError) {
        // Clear token from sessionStorage only
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('hasLoggedIn');
        // Dispatch custom event for auth errors that components can listen to
        window.dispatchEvent(new CustomEvent('auth-error', { 
          detail: { status: 401, message: 'Authentication required' }
        }));
      }
      
    } else if (error.request) {
      // Request made but no response received
      console.error('Network error - no response received:', error.request);
    } else {
      // Something else happened in setting up the request
      console.error('Request setup error:', error.message);
    }
    
    // Always reject with the original error to maintain axios error structure
    return Promise.reject(error);
  }
);

export default axiosInstance;