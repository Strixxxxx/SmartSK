import axiosInstance from './axiosConfig';
import { AxiosError } from 'axios';

interface LoginResponse {
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: number;
    username: string;
    fullName: string;
    position: string;
    barangay?: string;
    role?: string;
    isDefaultPassword?: boolean;
    permissions?: {
      templateControl: boolean;
      trackerControl: boolean;
      docsControl: boolean;
      budgetControl: boolean;
    };
  };
}

interface UserInfo {
  id: number;
  username: string;
  fullName: string;
  position: string;
  emailAddress?: string;
  phoneNumber?: string;
  barangay?: string;
  role?: string;
  permissions?: {
    templateControl: boolean;
    trackerControl: boolean;
    docsControl: boolean;
    budgetControl: boolean;
  };
}

// Add authentication state tracking
let isAuthenticated = false;
let userDataCache: UserInfo | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30000; // 30 seconds

// Check if user is authenticated (without making API calls)
export const isUserAuthenticated = (): boolean => {
  return isAuthenticated;
};

// Set authentication state
const setAuthenticationState = (authenticated: boolean) => {
  isAuthenticated = authenticated;
  if (!authenticated) {
    userDataCache = null;
    lastFetchTime = 0;
    // ONLY use sessionStorage - clears when tab/browser closes
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('hasLoggedIn');
    // Clear localStorage completely to avoid confusion
    localStorage.removeItem('token');
    localStorage.removeItem('hasLoggedIn');
  }
};

// Set token ONLY in sessionStorage and axios headers
const setAuthToken = (token: string | null) => {
  if (token) {
    axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    // ONLY store in sessionStorage - this persists through refresh but clears on tab/browser close
    sessionStorage.setItem('token', token);
    // Remove from localStorage to ensure we're only using sessionStorage
    localStorage.removeItem('token');
  } else {
    delete axiosInstance.defaults.headers.common['Authorization'];
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
  }
};

// Initialize token from sessionStorage ONLY on app start
const initializeAuth = () => {
  // ONLY check sessionStorage - localStorage should not be used
  const token = sessionStorage.getItem('token');
  if (token) {
    // Set token in axios headers
    axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
  
  // Clear any old localStorage tokens to avoid confusion
  localStorage.removeItem('token');
  localStorage.removeItem('hasLoggedIn');
};

// Call this when the module loads
initializeAuth();

export const fetchUserData = async (skipCache = false): Promise<UserInfo | null> => {
  // Return cached data if it's still fresh (unless skipCache is true)
  if (!skipCache && userDataCache && (Date.now() - lastFetchTime) < CACHE_DURATION) {
    return userDataCache;
  }

  try {
    const response = await axiosInstance.get('/api/user-data');
    if (response.data && response.data.userInfo) {
      const userInfo = response.data.userInfo;
      const position = userInfo.position?.toLowerCase() || '';
      let role = '';
      if (position.includes('admin')) {
        role = 'MA, SA';
      } else if (position.includes('chairperson') || position === 'skc') {
        role = 'SKC';
      } else if (position.includes('official') || position.startsWith('skk')) {
        role = 'SKO';
      }
      
      const userData = { 
        id: userInfo.userID,
        username: userInfo.username,
        fullName: userInfo.fullName,
        position: userInfo.position,
        emailAddress: userInfo.emailAddress,
        phoneNumber: userInfo.phoneNumber,
        barangay: userInfo.barangay,
        role,
        permissions: userInfo.permissions
      };
      userDataCache = userData;
      lastFetchTime = Date.now();
      
      // Set authentication state to true if we successfully got user data
      setAuthenticationState(true);
      
      return userData;
    }
    return null;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    
    // Clear cache and auth state on auth errors
    if (axiosError.response?.status === 401) {
      setAuthenticationState(false);
      setAuthToken(null);
    }
    
    // Only log unexpected errors (not auth-related ones)
    if (!(axiosError.response?.status === 401)) {
      if (import.meta.env.DEV) console.error('Failed to fetch user data', axiosError.response?.data || axiosError.message);
    }
    return null;
  }
};

// Clear the cache when user logs out
export const clearUserDataCache = () => {
  userDataCache = null;
  lastFetchTime = 0;
  setAuthenticationState(false);
  setAuthToken(null);
};

// Helper function to determine role from position
const getRoleFromPosition = (position: string): string => {
  const pos = position?.toLowerCase() || '';
  if (pos.includes('admin')) {
    return 'MA';
  } else if (pos.includes('chairperson') || pos === 'skc') {
    return 'SKC';
  } else if (pos.includes('official') || pos.startsWith('skk')) {
    return 'SKO';
  }
  return '';
};

// Updated login function with sessionStorage only
export const login = async (username: string, password: string): Promise<LoginResponse> => {
  try {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    const response = await axiosInstance.post('/api/login', {
      identifier: trimmedUsername,
      password: trimmedPassword
    });
    
    if (response.data.success) {
      // Set the token if provided - ONLY in sessionStorage
      if (response.data.token) {
        setAuthToken(response.data.token);
      }
      
      // Set authentication state to true
      setAuthenticationState(true);
      
      // Clear any old cached data
      userDataCache = null;
      lastFetchTime = 0;
      
      // Use sessionStorage for login flag too
      sessionStorage.setItem('hasLoggedIn', 'true');
      
      // Add role to user data if not present
      if (response.data.user && !response.data.user.role) {
        response.data.user.role = getRoleFromPosition(response.data.user.position);
      }

      if (response.data.user && response.data.user.userId) {
        response.data.user.id = response.data.user.userId;
        delete response.data.user.userId;
      }
      
      return response.data;
    }
    
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    if (axiosError.response) {
      return {
        success: false,
        message: axiosError.response.data?.message || `Error: ${axiosError.response.status} ${axiosError.response.statusText}`
      };
    } else if (axiosError.request) {
      return {
        success: false,
        message: 'No response from server. Please check your connection.'
      };
    } else {
      return {
        success: false,
        message: axiosError.message || 'An unknown error occurred'
      };
    }
  }
};

// Updated logout to clear authentication state
export const logout = async (): Promise<{ success: boolean; message: string }> => {
  try {
    // Try to notify the backend about logout first (before clearing client state)
    try {
      await axiosInstance.post('/api/logout');
    } catch (apiError) {
      if (import.meta.env.DEV) console.error('API logout error:', apiError);
      // Continue with client-side logout even if API call fails
    }
    
    // Clear authentication state and cache
    setAuthenticationState(false);
    setAuthToken(null);
    sessionStorage.removeItem('hasLoggedIn');
    
    return { 
      success: true, 
      message: 'Logged out successfully' 
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error('Logout error:', error);
    
    // Always clear client-side state even if there's an error
    setAuthenticationState(false);
    setAuthToken(null);
    sessionStorage.removeItem('hasLoggedIn');
    
    return {
      success: true,
      message: 'Logged out successfully'
    };
  }
};

// Token validation - only check sessionStorage
export const validateTokenWithBackend = async (): Promise<boolean> => {
  // ONLY check sessionStorage
  const token = sessionStorage.getItem('token');
  
  if (!token) {
    setAuthenticationState(false);
    return false;
  }

  // Set the token in headers if it's not already set
  if (!axiosInstance.defaults.headers.common['Authorization']) {
    axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  try {
    // Try to fetch user data to validate the token
    const user = await fetchUserData(true); // Skip cache for validation
    if (user) {
      setAuthenticationState(true);
      return true;
    }
    
    // If no user data, token is invalid
    setAuthenticationState(false);
    setAuthToken(null);
    return false;
  } catch (error) {
    setAuthenticationState(false);
    setAuthToken(null);
    return false;
  }
};

// Check for session on page refresh - ONLY sessionStorage
export const checkPotentialSession = async (): Promise<boolean> => {
  try {
    // ONLY check sessionStorage - this will be empty if user closed tab/browser
    const token = sessionStorage.getItem('token');
    if (!token) {
      setAuthenticationState(false);
      return false;
    }

    // Set the token in headers
    axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    // Validate the token by fetching user data
    const response = await axiosInstance.get('/api/user-data');
    if (response.data && response.data.userInfo) {
      setAuthenticationState(true);
      const userInfo = response.data.userInfo;
      
      // Process and cache the user data
      const position = userInfo.position?.toLowerCase() || '';
      let role = '';
      if (position.includes('admin')) {
        role = 'MA, SA';
      } else if (position.includes('chairperson') || position === 'skc') {
        role = 'SKC';
      } else if (position.includes('official') || position.startsWith('skk')) {
        role = 'SKO';
      }
      
      const userData = { 
        id: userInfo.userID,
        username: userInfo.userName,
        fullName: userInfo.fullName,
        position: userInfo.position,
        emailAddress: userInfo.emailAddress,
        phoneNumber: userInfo.phoneNumber,
        barangay: userInfo.barangay,
        role,
        permissions: userInfo.permissions
      };
      userDataCache = userData;
      lastFetchTime = Date.now();
      
      return true;
    }
    return false;
  } catch (error) {
    const axiosError = error as AxiosError;
    // Don't log 401 errors as they're expected when not logged in
    if (axiosError.response?.status !== 401) {
      if (import.meta.env.DEV) console.error('Session check failed:', axiosError.response?.data || axiosError.message);
    }
    setAuthenticationState(false);
    setAuthToken(null);
    return false;
  }
};

// Add a function to check authentication status without making API calls
export const isUserCached = (): boolean => {
  return isAuthenticated && userDataCache !== null && (Date.now() - lastFetchTime) < CACHE_DURATION;
};

// Add a function to get cached user data without API call
export const getCachedUserData = (): UserInfo | null => {
  if (isAuthenticated && userDataCache && (Date.now() - lastFetchTime) < CACHE_DURATION) {
    return userDataCache;
  }
  return null;
};

export const register = async (userData: {
  username: string;
  password: string;
  fullName: string;
  position: string;
  barangay: string;
  emailAddress: string;
  phoneNumber: string;
}): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await axiosInstance.post('/api/register', userData);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<{ message?: string }>;
    if (axiosError.response) {
      return {
        success: false,
        message: axiosError.response.data?.message || `Server error: ${axiosError.response.status} ${axiosError.response.statusText}`
      };
    } else if (axiosError.request) {
      return {
        success: false,
        message: 'No response from server. Please check your connection.'
      };
    } else {
      return {
        success: false,
        message: axiosError.message || 'Network error occurred. Please check your connection.'
      };
    }
  }
};

export const checkUsername = async (username: string): Promise<{ available: boolean; message?: string }> => {
  try {
    const response = await axiosInstance.get(`/api/register/check-username?username=${encodeURIComponent(username)}`);
    return {
      available: response.data.available,
      message: response.data.message
    };
  } catch (error) {
    const axiosError = error as AxiosError<{ available?: boolean; message?: string }>;
    if (axiosError.response) {
      return {
        available: false,
        message: axiosError.response.data?.message || 'Error checking username'
      };
    } else if (axiosError.request) {
      return {
        available: false,
        message: 'No response from server. Please check your connection.'
      };
    } else {
      return {
        available: false,
        message: axiosError.message || 'Network error occurred. Please check your connection.'
      };
    }
  }
};