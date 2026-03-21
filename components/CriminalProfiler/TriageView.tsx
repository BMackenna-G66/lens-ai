import React, { useState, useMemo } from 'react';
import { PersonProfile, AnalysisAction } from '../../types/criminalTypes';
import {
  ArrowLeft, Zap, CheckCircle2, ChevronRight, AlertTriangle,
  SkipForward
} from 'lucide-react';

interface TriageViewProps {
  profiles: PersonProfile[];
  onUpdateProfile: (rut: string, updates: Partial<PersonProfile>) => void;
  onBack: () => void;
}

const ACTION_BUTTONS: { action: AnalysisAction; label: string; color: string; bg: string; border: string }[] = [
  { action: 'Liberar', label: 'Liberar', color: 'text-white', bg: 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600', border: 'border-emerald-600' },
  { action: 'Liberar + UCR', label: 'Liberar + UCR', color: 'text-white', bg: 'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700', border: 'border-indigo-700' },
  { action: 'Revisar', label: 'Revisar', color: 'text-white', bg: 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600', border: 'border-amber-600' },
  { action: 'Fully Blocked', label: 'Fully Blocked', color: 'text-white', bg: 'bg-red-500 hover:bg-red-400 active:bg-red-600', border: 'border-red-600' },
];

const RISK_BADGE: Record<string, string> = {
  crítico: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  critical: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
  alto: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  high: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  medio: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  medium: 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  bajo: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
  low: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800',
};

const getRiskBadge = (risk: string) =>
  RISK_BADGE[(risk || '').toLowerCase()] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700';

const getDecisionColor = (decision: string) => {
  const d = (decision || '').toLowerCase();
  if (d.includes('liber')) return 'text-emerald-600 dark:text-emerald-400';
  if (d.includes('block')) return 'text-red-600 dark:text-red-400';
  return 'text-amber-600 dark:text-amber-400';
};

export const TriageView: React.FC<TriageViewProps> = ({ profiles, onUpdateProfile, onBack }) => {
  const pendingProfiles = useMemo(
    () => profiles.filter(p => p.status === 'Pendiente'),
    [profiles]
  );

  const [cursor, setCursor] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);
  const [summaryStats, setSummaryStats] = useState({ liberar: 0, ucr: 0, revisar: 0, blocked: 0, skipped: 0 });

  // Build queue: pending not skipped, then skipped ones at end
  const queue = useMemo(() => {
    const main = pendingProfiles.filter(p => !skipped.has(p.rut));
    const tail = pendingProfiles.filter(p => skipped.has(p.rut));
    return [...main, ...tail];
  }, [pendingProfiles, skipped]);

  const profile = queue[cursor] ?? null;
  const reviewed = cursor;
  const total = queue.length;

  const handleAction = (action: AnalysisAction) => {
    if (!profile) return;
    onUpdateProfile(profile.rut, { selectedAction: action, status: 'Revisado' });

    const newStats = { ...summaryStats };
    if (action === 'Liberar') newStats.liberar++;
    else if (action === 'Liberar + UCR') newStats.ucr++;
    else if (action === 'Revisar') newStats.revisar++;
    else if (action === 'Fully Blocked') newStats.blocked++;
    setSummaryStats(newStats);

    if (cursor + 1 >= queue.length) {
      setDone(true);
    } else {
      setCursor(c => c + 1);
    }
  };

  const handleSkip = () => {
    if (!profile) return;
    setSkipped(prev => new Set([...prev, profile.rut]));
    setSummaryStats(prev => ({ ...prev, skipped: prev.skipped + 1 }));
    if (cursor + 1 >= queue.length) {
      setDone(true);
    } else {
      setCursor(c => c + 1);
    }
  };

  if (pendingProfiles.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
        <TriageHeader onBack={onBack} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <CheckCircle2 size={64} className="text-emerald-500" />
          <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">No hay perfiles pendientes</h2>
          <p className="text-slate-400 dark:text-slate-500 font-medium">Todos los perfiles han sido revisados.</p>
          <button onClick={onBack} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-500 transition-all">
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
        <TriageHeader onBack={onBack} />
        <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
          <div className="p-6 bg-emerald-50 dark:bg-emerald-950 rounded-full border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 size={56} className="text-emerald-500" />
          </div>
          <div className="text-center">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">¡Triage Completado!</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Resumen de acciones tomadas</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-xl">
            {[
              { label: 'Liberar', value: summaryStats.liberar, color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Liberar + UCR', value: summaryStats.ucr, color: 'text-indigo-600 dark:text-indigo-400' },
              { label: 'Revisar', value: summaryStats.revisar, color: 'text-amber-600 dark:text-amber-400' },
              { label: 'Fully Blocked', value: summaryStats.blocked, color: 'text-red-600 dark:text-red-400' },
              { label: 'Omitidos', value: summaryStats.skipped, color: 'text-slate-500 dark:text-slate-400' },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 text-center">
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>
          <button onClick={onBack} className="bg-indigo-600 text-white px-10 py-3.5 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-500 transition-all shadow-xl active:scale-95">
            Volver al Dashboard
          </button>
        </div>
      </div>
    );
  }

  const MAX_DISPLAY_CRIMES = 5;
  const displayedCrimes = profile?.crimes.slice(0, MAX_DISPLAY_CRIMES) ?? [];
  const extraCrimes = (profile?.crimes.length ?? 0) - MAX_DISPLAY_CRIMES;
  const progressPct = total > 0 ? (reviewed / total) * 100 : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-950">
      <TriageHeader onBack={onBack} />

      <main className="flex-1 max-w-3xl mx-auto w-full p-4 md:p-8 flex flex-col gap-6">
        {/* Progress */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Progreso de Triage</span>
            <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">{reviewed} de {total} pendientes revisados</span>
          </div>
          <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-3 bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Profile Card */}
        {profile && (
          <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-2xl overflow-hidden">
            {/* Top: Identity */}
            <div className="p-8 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {profile.nombre} {profile.apellido}
                  </h2>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.2em] mt-1">
                    RUT: {profile.rut}
                  </p>
                  {profile.isPep && (
                    <span className="inline-flex items-center gap-1 mt-2 text-[9px] bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full font-black uppercase tracking-widest border border-amber-200 dark:border-amber-800">
                      <AlertTriangle size={10} /> ES PEP
                    </span>
                  )}
                </div>
                {profile.preEvaluation && (
                  <div className="text-right shrink-0">
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest mb-1">Recomendación</p>
                    <p className={`text-base font-black uppercase ${getDecisionColor(profile.preEvaluation.decision)}`}>
                      {profile.preEvaluation.decision}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">Score: {profile.preEvaluation.scoreTotal}</p>
                  </div>
                )}
              </div>

              {/* Score bar */}
              {profile.preEvaluation && (
                <div className="mt-4">
                  <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        profile.preEvaluation.decision.toLowerCase().includes('block') ? 'bg-red-500' :
                        profile.preEvaluation.decision.toLowerCase().includes('liber') ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, (profile.preEvaluation.scoreTotal / 200) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-widest">Score total: {profile.preEvaluation.scoreTotal}</p>
                </div>
              )}
            </div>

            {/* Crime list (abbreviated) */}
            <div className="p-8 pt-5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                Causas ({profile.crimes.length})
              </h3>
              <div className="space-y-2">
                {displayedCrimes.map(crime => (
                  <div key={crime.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 px-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase leading-tight flex-1 mr-4 line-clamp-1">{crime.tipo}</span>
                    <span className={`shrink-0 text-[9px] px-2 py-0.5 rounded-md font-black uppercase border ${getRiskBadge(crime.riesgo)}`}>
                      {crime.riesgo}
                    </span>
                  </div>
                ))}
                {extraCrimes > 0 && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-bold px-4">
                    <ChevronRight size={12} /> +{extraCrimes} causas más
                  </div>
                )}
                {profile.crimes.length === 0 && (
                  <p className="text-[11px] text-slate-400 italic font-medium px-4">Sin antecedentes registrados</p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-8 pt-6">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Acción Final</p>
              <div className="grid grid-cols-2 gap-3">
                {ACTION_BUTTONS.map(btn => (
                  <button
                    key={btn.action}
                    onClick={() => handleAction(btn.action)}
                    className={`${btn.bg} ${btn.color} border ${btn.border} px-4 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 shadow-lg`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-colors px-4 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <SkipForward size={14} /> Omitir por ahora
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const TriageHeader: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <header className="bg-white dark:bg-indigo-950 text-slate-900 dark:text-white py-4 px-6 sticky top-0 z-40 shadow-xl border-b border-slate-200 dark:border-indigo-900">
    <div className="max-w-3xl mx-auto flex items-center gap-4">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-white transition-colors text-xs font-black uppercase tracking-widest bg-slate-100 dark:bg-indigo-900/50 px-3 py-2 rounded-xl border border-slate-200 dark:border-indigo-800"
      >
        <ArrowLeft size={16} /> Volver
      </button>
      <div className="p-2.5 bg-indigo-100 dark:bg-indigo-500/20 rounded-xl border border-indigo-200 dark:border-indigo-500/30">
        <Zap size={22} className="text-indigo-600 dark:text-indigo-300" />
      </div>
      <div>
        <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Modo Triage</h1>
        <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-[0.2em]">Revisión rápida de perfiles pendientes</p>
      </div>
    </div>
  </header>
);
