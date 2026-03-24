import React, { useEffect, useState, useCallback } from 'react';
import {
  getAllUsers,
  updateUserProfile,
  createInvitation,
  getInvitations,
  deleteInvitation,
  getUserCount,
  getAnalyticsEvents,
  UserProfile,
  UserRole,
  Invitation,
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { isFirebaseConfigured } from '../services/firebaseService';

interface AdminModuleProps {
  onBack: () => void;
}

type AdminTab = 'users' | 'invitations' | 'system';

// ─── Toggle switch ────────────────────────────────────────────────────────────
const Toggle: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    onClick={onChange}
    disabled={disabled}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
      checked ? 'bg-indigo-500' : 'bg-slate-600'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-1'
      }`}
    />
  </button>
);

// ─── Users Tab ────────────────────────────────────────────────────────────────
const UsersTab: React.FC<{ currentUid: string }> = ({ currentUid }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const loadUsers = useCallback(() => {
    setLoading(true);
    getAllUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleRoleChange = async (uid: string, role: UserRole) => {
    setSaving(s => ({ ...s, [uid]: true }));
    await updateUserProfile(uid, { role });
    setUsers(prev => prev.map(u => u.uid === uid ? { ...u, role } : u));
    setSaving(s => ({ ...s, [uid]: false }));
  };

  const handleModuleToggle = async (uid: string, key: 'compliance' | 'criminal' | 'generalDashboard', currentModules: UserProfile['modules']) => {
    const newModules = { ...currentModules, [key]: !currentModules[key] };
    setSaving(s => ({ ...s, [`${uid}-${key}`]: true }));
    await updateUserProfile(uid, { modules: newModules });
    setUsers(prev => prev.map(u => u.uid === uid ? { ...u, modules: newModules } : u));
    setSaving(s => ({ ...s, [`${uid}-${key}`]: false }));
  };

  const handleDisable = async (uid: string, disabled: boolean) => {
    setSaving(s => ({ ...s, [`${uid}-disable`]: true }));
    await updateUserProfile(uid, { disabled });
    setUsers(prev => prev.map(u => u.uid === uid ? { ...u, disabled } : u));
    setSaving(s => ({ ...s, [`${uid}-disable`]: false }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400">
        <div className="animate-spin text-2xl mr-3">⏳</div>
        Cargando usuarios…
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-400">{users.length} usuario(s) registrado(s)</p>
        <button onClick={loadUsers} className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700/50 rounded-lg px-3 py-1">🔄 Actualizar</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/60">
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Usuario</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rol</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Compliance</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Perfiles Crim.</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Dashboard Gral.</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.uid} className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">
                        {(user.displayName || user.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-slate-200 text-xs flex items-center gap-1">
                        {user.displayName || '—'}
                        {user.uid === currentUid && (
                          <span className="text-[9px] bg-indigo-600/30 text-indigo-400 border border-indigo-600/40 rounded px-1 py-0.5">Tú</span>
                        )}
                        {user.disabled && (
                          <span className="text-[9px] bg-red-900/30 text-red-400 border border-red-800/40 rounded px-1 py-0.5">Desactivado</span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4">
                  <select
                    value={user.role}
                    disabled={user.uid === currentUid || !!saving[user.uid]}
                    onChange={e => handleRoleChange(user.uid, e.target.value as UserRole)}
                    className="bg-slate-700 text-slate-200 text-xs border border-slate-600 rounded-lg px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="Lider">Líder</option>
                    <option value="Analista">Analista</option>
                  </select>
                </td>
                <td className="py-3 px-4">
                  <Toggle
                    checked={user.modules?.compliance ?? true}
                    onChange={() => handleModuleToggle(user.uid, 'compliance', user.modules ?? { compliance: true, criminal: true, generalDashboard: true })}
                    disabled={!!saving[`${user.uid}-compliance`]}
                  />
                </td>
                <td className="py-3 px-4">
                  <Toggle
                    checked={user.modules?.criminal ?? true}
                    onChange={() => handleModuleToggle(user.uid, 'criminal', user.modules ?? { compliance: true, criminal: true, generalDashboard: true })}
                    disabled={!!saving[`${user.uid}-criminal`]}
                  />
                </td>
                <td className="py-3 px-4">
                  <Toggle
                    checked={user.modules?.generalDashboard ?? true}
                    onChange={() => handleModuleToggle(user.uid, 'generalDashboard', user.modules ?? { compliance: true, criminal: true, generalDashboard: true })}
                    disabled={!!saving[`${user.uid}-generalDashboard`]}
                  />
                </td>
                <td className="py-3 px-4">
                  <button
                    onClick={() => handleDisable(user.uid, !user.disabled)}
                    disabled={user.uid === currentUid || !!saving[`${user.uid}-disable`]}
                    className={`text-xs px-3 py-1 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      user.disabled
                        ? 'border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20'
                        : 'border-red-700/50 text-red-400 hover:bg-red-900/20'
                    }`}
                  >
                    {user.disabled ? 'Activar' : 'Desactivar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Invitations Tab ──────────────────────────────────────────────────────────
const InvitationsTab: React.FC<{ currentUid: string; currentEmail: string }> = ({ currentUid, currentEmail }) => {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('Analista');
  const [creating, setCreating] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [lastInvitedEmail, setLastInvitedEmail] = useState('');
  const appUrl = 'https://bmackenna-g66.github.io/lens-ai/';

  const loadInvitations = useCallback(() => {
    setLoading(true);
    getInvitations()
      .then(setInvitations)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setCreating(true);
    await createInvitation(email.trim(), role, currentUid, currentEmail);
    setLastInvitedEmail(email.trim());
    setEmail('');
    setSuccessMsg('ok');
    await loadInvitations();
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    await deleteInvitation(id);
    setInvitations(prev => prev.filter(inv => inv.id !== id));
  };

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Create form */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Nueva invitación</h3>
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            placeholder="correo@empresa.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="flex-1 bg-slate-700 text-slate-200 placeholder-slate-500 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value as UserRole)}
            className="bg-slate-700 text-slate-200 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            <option value="Analista">Analista</option>
            <option value="Lider">Líder</option>
          </select>
          <button
            type="submit"
            disabled={creating}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            {creating ? 'Creando…' : 'Crear Invitación'}
          </button>
        </form>
        {successMsg === 'ok' && (
          <div className="mt-3 p-3 bg-emerald-950/40 border border-emerald-700/40 rounded-lg">
            <p className="text-xs text-emerald-400 font-semibold mb-1">✅ Invitación registrada para <span className="text-white">{lastInvitedEmail}</span></p>
            <p className="text-xs text-slate-400 mb-2">Comparte este enlace con el usuario. Al ingresar con su cuenta Google recibirá el rol asignado automáticamente:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-slate-800 text-indigo-300 px-2 py-1.5 rounded border border-slate-600 truncate">{appUrl}</code>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(appUrl); }}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded border border-slate-600 transition-colors whitespace-nowrap"
              >
                Copiar link
              </button>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">Invitaciones</h3>
          <button onClick={loadInvitations} className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-700/50 rounded-lg px-3 py-1">🔄 Actualizar</button>
        </div>
        {loading ? (
          <div className="text-center text-slate-400 py-8">Cargando…</div>
        ) : invitations.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-sm">No hay invitaciones</div>
        ) : (
          <div className="rounded-xl border border-slate-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/60">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rol</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Creada por</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fecha</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {invitations.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 text-slate-200 text-xs">{inv.email}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        inv.role === 'Lider'
                          ? 'bg-amber-900/30 text-amber-400 border-amber-700/50'
                          : 'bg-slate-700 text-slate-400 border-slate-600'
                      }`}>{inv.role}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-xs">{inv.createdByEmail}</td>
                    <td className="py-3 px-4 text-slate-400 text-xs">{formatDate(inv.createdAt)}</td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        inv.used
                          ? 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50'
                          : 'bg-slate-700 text-slate-500 border-slate-600'
                      }`}>{inv.used ? 'Usada' : 'Pendiente'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleDelete(inv.id)}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-800/40 rounded-lg px-2 py-0.5 hover:bg-red-900/20 transition-colors"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── System Info Tab ──────────────────────────────────────────────────────────
const SystemTab: React.FC = () => {
  const [userCount, setUserCount] = useState<number | null>(null);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const firebaseReady = isFirebaseConfigured();

  useEffect(() => {
    if (!firebaseReady) return;
    getUserCount().then(setUserCount).catch(() => {});
    getAnalyticsEvents(2000).then(evts => setEventCount(evts.length)).catch(() => {});
  }, [firebaseReady]);

  const projectId = (process.env.FIREBASE_PROJECT_ID as string | undefined) ?? '(no configurado)';

  const recommendedRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      allow read: if request.auth != null;
    }
    match /invitations/{id} {
      allow read, write: if request.auth != null;
    }
    match /analytics/{id} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
    }
  }
}`;

  return (
    <div className="space-y-6">
      {/* Firebase info */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Información del proyecto Firebase</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Project ID</p>
            <code className="text-indigo-300 bg-slate-900/50 rounded px-2 py-0.5 text-xs">{projectId}</code>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Estado</p>
            <span className={`text-xs font-bold ${firebaseReady ? 'text-emerald-400' : 'text-red-400'}`}>
              {firebaseReady ? '✅ Configurado' : '❌ No configurado'}
            </span>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Total usuarios</p>
            <p className="text-slate-200 font-bold">{userCount ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Eventos de analytics almacenados</p>
            <p className="text-slate-200 font-bold">{eventCount ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Firestore rules */}
      <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Reglas de Firestore recomendadas</h3>
        <p className="text-xs text-slate-500 mb-3">Aplica estas reglas en Firebase Console → Firestore → Reglas</p>
        <pre className="text-xs text-emerald-300 bg-slate-900/60 rounded-xl p-4 overflow-x-auto leading-relaxed border border-slate-700">
          {recommendedRules}
        </pre>
      </div>
    </div>
  );
};

// ─── Main AdminModule ─────────────────────────────────────────────────────────

export const AdminModule: React.FC<AdminModuleProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const tabs: { key: AdminTab; label: string; icon: string }[] = [
    { key: 'users', label: 'Usuarios', icon: '👥' },
    { key: 'invitations', label: 'Invitaciones', icon: '✉️' },
    { key: 'system', label: 'Info del Sistema', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-600/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto p-4 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-xs font-semibold bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Inicio
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span>⚙️</span> Administración
            </h1>
            <p className="text-slate-400 text-xs">Gestión de usuarios, roles y módulos · Solo Líderes</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-800/40 rounded-xl p-1 border border-slate-700/50 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-slate-700 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'users' && user && <UsersTab currentUid={user.uid} />}
          {activeTab === 'invitations' && user && (
            <InvitationsTab currentUid={user.uid} currentEmail={user.email ?? ''} />
          )}
          {activeTab === 'system' && <SystemTab />}
        </div>
      </div>
    </div>
  );
};
