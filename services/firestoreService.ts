// firestoreService.ts
// Firestore data layer for Lens AI — user profiles, roles, invitations, analytics events.
// All functions degrade gracefully when Firestore is not configured.

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  getCountFromServer,
} from 'firebase/firestore';
import { getDb } from './firebaseService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = 'Lider' | 'Analista';

export interface ModulePermissions {
  compliance: boolean;
  criminal: boolean;
  generalDashboard: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  modules: ModulePermissions;
  createdAt: number;
  lastLogin: number;
  disabled?: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  createdBy: string;
  createdByEmail: string;
  createdAt: number;
  used: boolean;
  usedBy?: string;
  usedAt?: number;
}

export interface FirestoreAnalyticsEvent {
  id?: string;
  userId: string;
  userEmail: string;
  userName: string;
  module: string;
  eventType: string;
  country?: string;
  hasRisk?: boolean;
  timestamp: number;
}

// ─── User Profiles ────────────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (!docSnap.exists()) return null;
    return docSnap.data() as UserProfile;
  } catch {
    return null;
  }
}

export async function createUserProfile(profile: UserProfile): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', profile.uid), profile);
  } catch (err) {
    console.error('[Lens AI] createUserProfile error:', err);
  }
}

export async function updateUserProfile(uid: string, updates: Partial<UserProfile>): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDoc(doc(db, 'users', uid), updates as any);
  } catch (err) {
    console.error('[Lens AI] updateUserProfile error:', err);
  }
}

export async function getAllUsers(): Promise<UserProfile[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const q = query(collection(db, 'users'), orderBy('createdAt'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as UserProfile);
  } catch {
    return [];
  }
}

export async function getUserCount(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    const snap = await getCountFromServer(collection(db, 'users'));
    return snap.data().count;
  } catch {
    return 0;
  }
}

export async function bootstrapUser(firebaseUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}): Promise<UserProfile> {
  const db = getDb();

  const fallbackProfile: UserProfile = {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName: firebaseUser.displayName ?? '',
    photoURL: firebaseUser.photoURL ?? '',
    role: 'Analista',
    modules: { compliance: true, criminal: true, generalDashboard: true },
    createdAt: Date.now(),
    lastLogin: Date.now(),
  };

  if (!db) return fallbackProfile;

  try {
    const existing = await getUserProfile(firebaseUser.uid);
    if (existing) {
      await updateUserProfile(firebaseUser.uid, { lastLogin: Date.now() });
      return { ...existing, lastLogin: Date.now() };
    }

    const count = await getUserCount();
    let role: UserRole = count === 0 ? 'Lider' : 'Analista';

    // Check for a pending invitation matching this email
    let invitationId: string | null = null;
    if (firebaseUser.email && count > 0) {
      try {
        const invQ = query(
          collection(db, 'invitations'),
          orderBy('createdAt', 'desc'),
        );
        const invSnap = await getDocs(invQ);
        const match = invSnap.docs.find(d => {
          const data = d.data();
          return data.email?.toLowerCase() === firebaseUser.email!.toLowerCase() && !data.used;
        });
        if (match) {
          role = match.data().role as UserRole;
          invitationId = match.id;
        }
      } catch { /* silent — invitation lookup is best-effort */ }
    }

    const newProfile: UserProfile = {
      uid: firebaseUser.uid,
      email: firebaseUser.email ?? '',
      displayName: firebaseUser.displayName ?? '',
      photoURL: firebaseUser.photoURL ?? '',
      role,
      modules: { compliance: true, criminal: true, generalDashboard: true },
      createdAt: Date.now(),
      lastLogin: Date.now(),
    };

    await createUserProfile(newProfile);

    // Mark invitation as used
    if (invitationId) {
      try {
        await updateDoc(doc(db, 'invitations', invitationId), {
          used: true,
          usedBy: firebaseUser.uid,
          usedAt: Date.now(),
        });
      } catch { /* silent */ }
    }

    return newProfile;
  } catch {
    return fallbackProfile;
  }
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function createInvitation(
  email: string,
  role: UserRole,
  createdByUid: string,
  createdByEmail: string,
): Promise<string> {
  const db = getDb();
  if (!db) return '';
  try {
    const ref = await addDoc(collection(db, 'invitations'), {
      email,
      role,
      createdBy: createdByUid,
      createdByEmail,
      createdAt: Date.now(),
      used: false,
    });
    return ref.id;
  } catch (err) {
    console.error('[Lens AI] createInvitation error:', err);
    return '';
  }
}

export async function getInvitations(): Promise<Invitation[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const q = query(collection(db, 'invitations'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Invitation));
  } catch {
    return [];
  }
}

export async function deleteInvitation(id: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'invitations', id));
  } catch (err) {
    console.error('[Lens AI] deleteInvitation error:', err);
  }
}

// ─── Analytics Events ─────────────────────────────────────────────────────────

export async function writeAnalyticsEvent(event: FirestoreAnalyticsEvent): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await addDoc(collection(db, 'analytics'), event);
  } catch {
    // fire and forget — don't throw
  }
}

export async function getAnalyticsEvents(limitCount = 2000): Promise<FirestoreAnalyticsEvent[]> {
  const db = getDb();
  if (!db) return [];
  try {
    const q = query(
      collection(db, 'analytics'),
      orderBy('timestamp', 'desc'),
      limit(limitCount),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreAnalyticsEvent));
  } catch {
    return [];
  }
}
