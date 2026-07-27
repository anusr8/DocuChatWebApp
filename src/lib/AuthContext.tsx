'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface CustomUser {
  id: string;
  email: string;
  role?: string;
}

interface AuthContextType {
  user: CustomUser | null;
  sessionToken: string | null;
  loading: boolean;
  login: (userData: CustomUser, token: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  sessionToken: null,
  loading: true,
  login: () => {},
  signOut: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore session from localStorage
    const savedUser = localStorage.getItem('docuchat_user');
    const savedToken = localStorage.getItem('docuchat_session_token');
    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser));
        setSessionToken(savedToken);
      } catch (e) {
        console.error('Failed to parse saved session', e);
        localStorage.removeItem('docuchat_user');
        localStorage.removeItem('docuchat_session_token');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData: CustomUser, token: string) => {
    setUser(userData);
    setSessionToken(token);
    localStorage.setItem('docuchat_user', JSON.stringify(userData));
    localStorage.setItem('docuchat_session_token', token);
    localStorage.removeItem('gtm_chat_history'); // Clear chat history on new login
  };

  const signOut = () => {
    setUser(null);
    setSessionToken(null);
    localStorage.removeItem('docuchat_user');
    localStorage.removeItem('docuchat_session_token');
    localStorage.removeItem('gtm_chat_history');
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, sessionToken, loading, login, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
