import React, { createContext, useContext, useState, useCallback } from 'react';

export interface FlashMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface FlashContextType {
  messages: FlashMessage[];
  addFlash: (text: string, type?: 'success' | 'error' | 'info') => void;
  removeFlash: (id: string) => void;
}

const FlashContext = createContext<FlashContextType | undefined>(undefined);

export const FlashProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<FlashMessage[]>([]);

  const addFlash = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2);
    setMessages((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 4000);
  }, []);

  const removeFlash = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <FlashContext.Provider value={{ messages, addFlash, removeFlash }}>
      {children}
    </FlashContext.Provider>
  );
};

export const useFlash = () => {
  const context = useContext(FlashContext);
  if (!context) {
    throw new Error('useFlash must be used within a FlashProvider');
  }
  return context;
};
