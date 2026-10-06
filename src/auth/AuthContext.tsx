import { api } from '../api/client';
import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole = 'Admin' | 'Management' | 'Operations' | 'Viewer';
export type UserStatus = 'Active' | 'Disabled' | 'Pending';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  department: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<boolean>;
  quickLoginAs: (role: UserRole) => Promise<boolean>;
  register: (email: string, pass: string, fullName: string, department: string, role?: UserRole) => Promise<string>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY_TOKEN = 'vigor_auth_token';
const STORAGE_KEY_USER = 'vigor_auth_user';

export const DEMO_CREDENTIALS: Record<UserRole, { email: string; name: string; dept: string; desc: string }> = {
  Admin: {
    email: 'admin@turkysgroup.co.tz',
    name: 'Maryam Arshed',
    dept: 'Information Technology',
    desc: 'System Administrator with full user management & config rights',
  },
  Management: {
    email: 'ceo@turkysgroup.co.tz',
    name: 'Salim H. Turky',
    dept: 'Executive Office',
    desc: 'Executive Management with CEO dashboard, vessel overview, and analytics',
  },
  Operations: {
    email: 'ops.dispatcher@turkysgroup.co.tz',
    name: 'Khamis Ali',
    dept: 'Terminal Operations',
    desc: 'Port Operations Dispatcher with berth control & telemetry logging',
  },
  Viewer: {
    email: 'auditor@turkysgroup.co.tz',
    name: 'Zuwena Nassor',
    dept: 'Compliance & Audit',
    desc: 'Read-only operational stakeholder & audit access',
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN) || sessionStorage.getItem(STORAGE_KEY_TOKEN);
      const savedUser = localStorage.getItem(STORAGE_KEY_USER) || sessionStorage.getItem(STORAGE_KEY_USER);

      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } else {
        // By default, start unauthenticated or initialize with quick demo access if preferred
        // We set to null so the user lands on the corporate login screen, with 1-click demo access ready
        setToken(null);
        setUser(null);
      }
    } catch (e) {
      console.warn('Failed to load cached auth session:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, pass: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@turkysgroup.co.tz')) {
      setError('Access Denied: Only authorized @turkysgroup.co.tz email accounts are permitted.');
      setIsLoading(false);
      return false;
    }

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password: pass }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setUser(data.user);
      setToken(data.token);
      localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(data.user));
      await api.testConnection();
      return true;
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const quickLoginAs = async (role: UserRole): Promise<boolean> => {
    const cred = DEMO_CREDENTIALS[role];
    if (!cred) return false;
    return login(cred.email, 'Turkys@2025');
  };

  const register = async (
    email: string,
    pass: string,
    fullName: string,
    department: string,
    role: UserRole = 'Operations'
  ): Promise<string> => {
    setIsLoading(true);
    setError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@turkysgroup.co.tz')) {
      setIsLoading(false);
      throw new Error('Registration policy: Must be a valid @turkysgroup.co.tz company email.');
    }

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password: pass,
          fullName,
          department,
          requestedRole: role,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      return data.message || 'Registration submitted for administrative approval.';
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    if (token) {
      fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {});
    }

    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_USER);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        error,
        login,
        quickLoginAs,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
