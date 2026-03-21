// firebaseService.ts
// Firebase Authentication wrapper for Lens AI.
// Uses environment variables injected at build time via vite.config.ts.
// If the env vars are not set, all auth functions degrade gracefully
// (isFirebaseConfigured() returns false and sign-in methods are no-ops).

import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getAuth,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User,
} from 'firebase/auth';

// ─── Config ───────────────────────────────────────────────────────────────────
// These are injected as process.env.* by vite.config.ts at build time.
// In production (GitHub Pages) they come from GitHub Actions secrets.
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  appId: process.env.FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

// ─── Init (lazy singleton) ────────────────────────────────────────────────────
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getFirebase(): { app: FirebaseApp; auth: Auth } | null {
  if (!isFirebaseConfigured()) return null;
  if (!app) {
    // Avoid duplicate app initialization in HMR / dev environments
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig as Record<string, string>);
    auth = getAuth(app);
  }
  return { app, auth: auth! };
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export async function signInWithGoogle(): Promise<User | null> {
  const fb = getFirebase();
  if (!fb) {
    console.warn('[Lens AI] Firebase not configured – sign-in skipped.');
    return null;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(fb.auth, provider);
    return result.user;
  } catch (err) {
    console.error('[Lens AI] Google sign-in error:', err);
    return null;
  }
}

export async function signOut(): Promise<void> {
  const fb = getFirebase();
  if (!fb) return;
  try {
    await firebaseSignOut(fb.auth);
  } catch (err) {
    console.error('[Lens AI] Sign-out error:', err);
  }
}

export function onAuthStateChanged(callback: (user: User | null) => void): () => void {
  const fb = getFirebase();
  if (!fb) {
    callback(null);
    return () => {};
  }
  return firebaseOnAuthStateChanged(fb.auth, callback);
}

export type { User };
