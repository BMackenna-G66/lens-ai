
import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";

interface ApiKeyContextType {
  apiKey: string | null;
  isKeyValid: boolean;
  isLoading: boolean;
  showApiKeyModal: boolean;
  setApiKey: (key: string) => Promise<boolean>;
  setShowApiKeyModal: (show: boolean) => void;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export const ApiKeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setStoredApiKey] = useState<string | null>(null);
  const [isKeyValid, setIsKeyValid] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);

  const validateAndSetKey = useCallback(async (key: string | null) => {
    if (!key) {
      setIsKeyValid(false);
      setIsLoading(false);
      setShowApiKeyModal(true);
      return false;
    }

    setIsLoading(true);
    try {
      // Use a very lightweight model/method for validation
      const ai = new GoogleGenAI({ apiKey: key });
      await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: "test" });
      
      localStorage.setItem('gemini_api_key', key);
      setStoredApiKey(key);
      setIsKeyValid(true);
      setShowApiKeyModal(false);
      console.log("API Key validated successfully.");
      return true;
    } catch (error) {
      console.error("API Key validation failed:", error);
      localStorage.removeItem('gemini_api_key');
      setStoredApiKey(null);
      setIsKeyValid(false);
      setShowApiKeyModal(true); // Always show modal on failure
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    validateAndSetKey(storedKey);
  }, [validateAndSetKey]);

  const setApiKey = async (key: string): Promise<boolean> => {
    return await validateAndSetKey(key);
  };

  const value = {
    apiKey,
    isKeyValid,
    isLoading,
    showApiKeyModal,
    setApiKey,
    setShowApiKeyModal,
  };

  return (
    <ApiKeyContext.Provider value={value}>
      {children}
    </ApiKeyContext.Provider>
  );
};

export const useApiKey = (): ApiKeyContextType => {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
};
