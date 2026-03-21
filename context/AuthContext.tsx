import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithGoogle,
  signOut,
  onAuthStateChanged,
  isFirebaseConfigured,
  User,
} from '../services/firebaseService';

interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  firebaseReady: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  firebaseReady: false,
  login: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const firebaseReady = isFirebaseConfigured();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((firebaseUser: User | null) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    setIsLoading(true);
    await signInWithGoogle();
    // User state updated via onAuthStateChanged listener
  };

  const logout = async () => {
    await signOut();
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, firebaseReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);
