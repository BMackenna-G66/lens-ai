import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithGoogle,
  signOut,
  onAuthStateChanged,
  isFirebaseConfigured,
  User,
} from '../services/firebaseService';
import { bootstrapUser, UserProfile, UserRole } from '../services/firestoreService';
import { setAnalyticsUser } from '../services/analyticsService';

export type { UserProfile, UserRole };

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
  userProfile: UserProfile | null;
  role: UserRole | null;
  profileLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  firebaseReady: false,
  userProfile: null,
  role: null,
  profileLoading: false,
  login: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const firebaseReady = isFirebaseConfigured();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser: User | null) => {
      if (firebaseUser) {
        const authUser: AuthUser = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
        };
        setUser(authUser);
        setIsLoading(false);

        // Bootstrap Firestore profile
        setProfileLoading(true);
        try {
          const profile = await bootstrapUser(firebaseUser);
          setUserProfile(profile);
          setAnalyticsUser(
            firebaseUser.uid,
            firebaseUser.email ?? '',
            firebaseUser.displayName ?? '',
          );
        } catch {
          setUserProfile(null);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUser(null);
        setUserProfile(null);
        setIsLoading(false);
        setProfileLoading(false);
      }
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
    setUserProfile(null);
  };

  const role: UserRole | null = userProfile?.role ?? null;

  return (
    <AuthContext.Provider value={{ user, isLoading, firebaseReady, userProfile, role, profileLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => useContext(AuthContext);
