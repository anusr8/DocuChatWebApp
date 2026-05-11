'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface CustomUser {
  id: string;
  email: string;
  role?: string;
}

interface AuthContextType {
  user: CustomUser | null;
  loading: boolean;
  login: (userData: CustomUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: () => {},
  signOut: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<CustomUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for existing session
    const savedUser = localStorage.getItem('docuchat_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Failed to parse saved user', e);
        localStorage.removeItem('docuchat_user');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData: CustomUser) => {
    setUser(userData);
    localStorage.setItem('docuchat_user', JSON.stringify(userData));
    localStorage.removeItem('gtm_chat_history'); // Clear chat history on new login
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('docuchat_user');
    localStorage.removeItem('gtm_chat_history'); // Clear chat history on logout
    window.location.href = '/login';
  };


  return (
    <AuthContext.Provider value={{ user, loading, login, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
