/**
 * Username Context Provider
 * 
 * Manages username state with localStorage persistence.
 * Provides username to all components throughout the app.
 * 
 * @author ARYA RAG Team
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Context type definition
interface UsernameContextType {
  username: string;
  setUsername: (username: string) => void;
  isUsernameSet: boolean;
}

// Create context with default values
const UsernameContext = createContext<UsernameContextType>({
  username: '',
  setUsername: () => {},
  isUsernameSet: false,
});

// Custom hook to use username context
export const useUsername = () => {
  const context = useContext(UsernameContext);
  if (!context) {
    throw new Error('useUsername must be used within a UsernameProvider');
  }
  return context;
};

interface UsernameProviderProps {
  children: ReactNode;
}

// Username Provider Component
export const UsernameProvider: React.FC<UsernameProviderProps> = ({ children }) => {
  // Initialize username from localStorage or empty string
  const [username, setUsernameState] = useState<string>(() => {
    const stored = localStorage.getItem('arya-rag-username');
    return stored || '';
  });

  // Update localStorage whenever username changes
  useEffect(() => {
    if (username) {
      localStorage.setItem('arya-rag-username', username);
    } else {
      localStorage.removeItem('arya-rag-username');
    }
  }, [username]);

  // Wrapper function to update username
  const setUsername = (newUsername: string) => {
    // Trim whitespace and validate
    const trimmed = newUsername.trim();
    setUsernameState(trimmed);
  };

  // Check if username is set
  const isUsernameSet = username.length > 0;

  const value: UsernameContextType = {
    username,
    setUsername,
    isUsernameSet,
  };

  return (
    <UsernameContext.Provider value={value}>
      {children}
    </UsernameContext.Provider>
  );
};