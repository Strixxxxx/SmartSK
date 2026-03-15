import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  checkPotentialSession,
  isUserAuthenticated,
  getCachedUserData,
  clearUserDataCache,
  login as authLogin,
  logout as authLogout
} from '../backend connection/auth';
import Loading from '../components/Loading/Loading';

interface UserInfo {
  id: number;
  username: string;
  fullName: string;
  position: string;
  emailAddress?: string;
  phoneNumber?: string;
  termID?: number;
  barangay?: string;
  role?: string;
  isDefaultPassword?: boolean;
}

interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string; user?: UserInfo }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Custom hook to use the AuthContext
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on app initialization
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsLoading(true);

        const storedHasLoggedIn = sessionStorage.getItem('hasLoggedIn');

        if (storedHasLoggedIn === 'true') {
          // Check if there's an existing session
          const hasSession = await checkPotentialSession();

          if (hasSession) {
            const userData = getCachedUserData();
            if (userData) {
              setUser(userData);
              setIsAuthenticated(true);
            }
          }
        } else {
          // No prior login, so no need to check for session via API
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        if (import.meta.env.DEV) console.error('Failed to initialize authentication:', error);
        // Reset auth state on error
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth errors from axios interceptor
    const handleAuthError = () => {
      setUser(null);
      setIsAuthenticated(false);
      clearUserDataCache();
    };

    window.addEventListener('auth-error', handleAuthError);

    // Cleanup event listener
    return () => {
      window.removeEventListener('auth-error', handleAuthError);
    };
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const result = await authLogin(username, password);

      if (result.success && result.user) {
        setUser(result.user);
        setIsAuthenticated(true);
      }

      return result;
    } catch (error) {
      if (import.meta.env.DEV) console.error('Login error:', error);
      return {
        success: false,
        message: 'Login failed. Please try again.'
      };
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);

      await authLogout();

      // Clear local state
      setUser(null);
      setIsAuthenticated(false);

      // Redirect to login or home page
      window.location.href = '/';
    } catch (error) {
      if (import.meta.env.DEV) console.error('Logout error:', error);
      // Still clear local state even if API call fails
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      if (isUserAuthenticated()) {
        const userData = getCachedUserData();
        if (userData) {
          setUser(userData);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to refresh user data:', error);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Protected Route component
interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  requireAuth?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallback = <div>Please log in to access this page.</div>,
  requireAuth = true
}) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <Loading fullPageSkeleton={true} />;
  }

  if (requireAuth && !isAuthenticated) {
    return <>{fallback}</>;
  }

  if (!requireAuth && isAuthenticated) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

// HOC for protecting components
export const withAuth = <P extends object>(
  Component: React.ComponentType<P>,
  requireAuth: boolean = true
) => {
  const AuthenticatedComponent: React.FC<P> = (props) => {
    return (
      <ProtectedRoute requireAuth={requireAuth}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };

  AuthenticatedComponent.displayName = `withAuth(${Component.displayName || Component.name})`;

  return AuthenticatedComponent;
};