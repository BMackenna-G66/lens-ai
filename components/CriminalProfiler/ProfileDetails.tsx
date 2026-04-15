
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PersonProfile, AnalysisAction, Crime } from '../../types/criminalTypes';
import { analyzeProfile, ChatMessage } from '../../services/criminalGeminiService';
import { generateCriminalProfilePdf } from '../../services/pdfGenerator';
import {
  X, Shield, Calendar, MapPin, Hash, CheckCircle2,
  BrainCircuit, Loader2, FileSearch, ClipboardCheck, Send, Clock,
  Globe, MessageSquare, ExternalLink, Trash2, ShieldX,
  ChevronLeft, ChevronRight, User, Sparkles, AlertTriangle,
  Download, List, GitBranch, FileText
} from 'lucide-react';

interface ProfileDetailsProps {
  profile: PersonProfile;
  onClose: () => void;
  onUpdate: (rut: string, updates: Partial<PersonProfile>) => void;
  onNext?: () => void;
  onPrev?: () => void;
}

type CrimeTab = 'lista' | 'timeline';
type TimelineDir = 'vertical' | 'horizontal';

// Maps preEvaluation.decision → nearest AnalysisAction
function mapDecisionToAction(decision?: string): AnalysisAction {
  if (!decision) return '';
  const d = decision.toLowerCase();
  if (d.includes('bloqueo') || d.includes('blocked') || d.includes('block')) return 'Fully Blocked';
  if (d.includes('liberar') && d.includes('ucr')) return 'Liberar + UCR';
  if (d.includes('liberar') || d.includes('liber')) return 'Liberar';
  if (d.includes('ucr') || d.includes('compliance') || d.includes('revisar') || d.includes('review')) return 'Revisar';
  const valid: AnalysisAction[] = ['Liberar', 'Revisar', 'Liberar + UCR', 'Fully Blocked'];
  return valid.find(a => a.toLowerCase() === d) || '';
}

export const ProfileDetails: React.FC<ProfileDetailsProps> = ({ profile, onClose, onUpdate, onNext, onPrev }) => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [useInternet, setUseInternet] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [localAction, setLocalAction] = useState<AnalysisAction>(
    profile.selectedAction || mapDecisionToAction(profile.preEvaluation?.decision)
  );
  const [localNotes, setLocalNotes] = useState<string>(profile.notes || '');
  const [crimeTab, setCrimeTab] = useState<CrimeTab>('lista');
  const [timelineDir, setTimelineDir] = useState<TimelineDir>('vertical');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Esc key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setChatHistory([]);
    setInputValue('');
    setLocalAction(profile.selectedAction || mapDecisionToAction(profile.preEvaluation?.decision));
    setLocalNotes(profile.notes || '');
    setAnalyzing(false);
  }, [profile.rut, profile.selectedAction, profile.notes, profile.preEvaluation?.decision]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, analyzing]);

  const currentYear = new Date().getFullYear();

  const parseDate = (dateStr: string) => {
    if (!dateStr || dateStr.toLowerCase() === 'undefined' || dateStr === '0') return new Date(0);
    let d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    const parts = dateStr.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    return new Date(0);
  };

  const extractYear = (crime: Crime): number | null => {
    const d = parseDate(crime.fecha);
    if (d.getTime() !== 0) {
      const y = d.getFullYear();
      if (y >= 1900 && y <= currentYear + 1) return y;
    }
    if (crime.rit) {
      const m = crime.rit.match(/\d{4}$/);
      if (m) {
        const y = parseInt(m[0]);
        if (y >= 1900 && y <= currentYear + 1) return y;
      }
    }
    return null;
  };

  const sortedCrimes = useMemo(() => {
    return [...profile.crimes].sort((a, b) => parseDate(b.fecha).getTime() - parseDate(a.fecha).getTime());
  }, [profile.crimes]);

  // Group crimes by year for timeline
  const crimesByYear = useMemo(() => {
    const map = new Map<number | 'Sin Fecha', Crime[]>();
    for (const crime of sortedCrimes) {
      const year = extractYear(crime);
      const key = year ?? 'Sin Fecha';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(crime);
    }
    // Sort: numbers descending, then 'Sin Fecha' at end
    const entries = Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'Sin Fecha') return 1;
      if (b[0] === 'Sin Fecha') return -1;
      return (b[0] as number) - (a[0] as number);
    });
    return entries;
  }, [sortedCrimes]);

  const getYearsAgo = (dateStr: string, rit: string) => {
    let year: number | null = null;
    const d = parseDate(dateStr);
    if (d.getTime() !== 0) {
      year = d.getFullYear();
    } else if (rit) {
      const match = rit.match(/\d{4}$/);
      if (match) year = parseInt(match[0]);
    }
    if (!year || year < 1900 || year > currentYear + 1) return null;
    const diff = currentYear - year;
    if (diff === 0) return 'Este año';
    if (diff < 0) return 'Pendiente';
    return `hace ${diff} ${diff === 1 ? 'año' : 'años'}`;
  };

  const handleSendMessage = async (mode: 'context' | 'internet', overridePrompt?: string) => {
    const prompt = overridePrompt || inputValue;
    if (!prompt && !overridePrompt) return;

    const isInternet = mode === 'internet';
    setUseInternet(isInternet);
    setAnalyzing(true);

    if (!overridePrompt) {
      setChatHistory(prev => [...prev, { role: 'user', text: prompt }]);
      setInputValue('');
    }

    const response = await analyzeProfile(profile, isInternet, prompt, chatHistory);
    setChatHistory(prev => [...prev, response]);
    setAnalyzing(false);
  };

  const handleFinalize = () => {
    onUpdate(profile.rut, {
      selectedAction: localAction,
      status: 'Revisado',
      notes: localNotes,
    });
    if (!onNext) onClose();
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await generateCriminalProfilePdf({ ...profile, notes: localNotes, selectedAction: localAction });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const getRiskBadgeColor = (risk: string) => {
    const r = String(risk || '').toLowerCase();
    if (r === 'crítico' || r === 'critical') return 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
    if (r === 'alto' || r === 'high') return 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800';
    if (r === 'medio' || r === 'medium') return 'bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
    if (r === 'bajo' || r === 'low') return 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600';
  };

  // Score breakdown helpers
  const precedentes = profile.crimes.filter(c => (c.catalogType || '').toUpperCase().includes('PRECEDENTE'));
  const noPrecedentes = profile.crimes.filter(c => !(c.catalogType || '').toUpperCase().includes('PRECEDENTE'));
  const preScore = precedentes.reduce((s, c) => s + (c.catalogValue || 0), 0);
  const noPreScore = noPrecedentes.reduce((s, c) => s + (c.catalogValue || 0), 0);
  const totalScore = preScore + noPreScore;

  const decisionColor = profile.preEvaluation
    ? profile.preEvaluation.decision.toLowerCase().includes('liber')
      ? 'text-emerald-600 dark:text-emerald-400'
      : profile.preEvaluation.decision.toLowerCase().includes('block')
      ? 'text-red-600 dark:text-red-400'
      : 'text-amber-600 dark:text-amber-400'
    : 'text-slate-500';

  const scoreBarColor = profile.preEvaluation
    ? profile.preEvaluation.decision.toLowerCase().includes('block')
      ? 'bg-red-500'
      : profile.preEvaluation.decision.toLowerCase().includes('liber')
      ? 'bg-emerald-500'
      : 'bg-amber-500'
    : 'bg-indigo-500';

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-7xl h-[94vh] overflow-hidden flex flex-col border border-slate-100 dark:border-slate-800">

        {/* 1. Header Fijo */}
        <div className="p-4 px-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-indigo-50 dark:bg-indigo-950 rounded-2xl text-indigo-600 dark:text-indigo-400">
              <User size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  {profile.nombre} {profile.apellido}
                </h2>
                {profile.isPep && (
                  <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-black uppercase tracking-widest border border-amber-200">
                    <AlertTriangle size={10} /> ES PEP
                  </span>
                )}
                {profile.status === 'Revisado' && (
                  <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-black uppercase tracking-widest border border-emerald-200">
                    <CheckCircle2 size={10} /> Revisado
                  </span>
                )}
              </div>
              <p className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-3">
                <span>RUT: {profile.rut}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span>ID: {profile.customerId}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                <span className="text-indigo-500 dark:text-indigo-400 font-black">{profile.nombreCuenta}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* PDF download button */}
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf}
              className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-600 hover:text-white border border-slate-200 dark:border-slate-700 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
              title="Descargar PDF"
            >
              {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              PDF
            </button>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-700">
              <button
                onClick={onPrev}
                disabled={!onPrev}
                className={`p-2 rounded-xl transition-all ${onPrev ? 'hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-300 dark:text-slate-600 opacity-30 cursor-not-allowed'}`}
              >
                <ChevronLeft size={20} />
              </button>
              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1"></div>
              <button
                onClick={onNext}
                disabled={!onNext}
                className={`p-2 rounded-xl transition-all ${onNext ? 'hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-300 dark:text-slate-600 opacity-30 cursor-not-allowed'}`}
              >
                <ChevronRight size={20} />
              </button>
              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1"></div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all text-slate-400 dark:text-slate-500"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* 2. Recomendación Sistema y Acción */}
        <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 p-6 flex flex-col md:flex-row gap-6 items-stretch shrink-0">

          <div className="flex-1 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-indigo-600" />
              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest">Recomendación Sistema (Catálogo)</span>
            </div>
            {profile.preEvaluation ? (
              <>
                <div className="flex items-baseline justify-between">
                  <p className={`text-lg font-black uppercase tracking-tight ${decisionColor}`}>
                    {profile.preEvaluation.decision}
                  </p>
                  <span className="text-[10px] font-black bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg">
                    VALOR TOTAL: {profile.preEvaluation.scoreTotal}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-tight">{profile.preEvaluation.razon}</p>

                {/* Score bar */}
                <div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-2 rounded-full transition-all ${scoreBarColor}`}
                      style={{ width: `${Math.min(100, (totalScore / Math.max(totalScore, 200)) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Score rows */}
                <div className="space-y-1.5">
                  {[
                    { label: 'Precedentes', count: precedentes.length, score: preScore },
                    { label: 'No Precedentes', count: noPrecedentes.length, score: noPreScore },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase w-28 shrink-0">{row.label}</span>
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold w-32 shrink-0">
                        {row.count} × valor = {row.score} pts
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-1.5 bg-indigo-400 rounded-full"
                          style={{ width: totalScore > 0 ? `${(row.score / totalScore) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-slate-400">
                <AlertTriangle size={14} className="text-amber-500" />
                <p className="text-xs italic font-medium">No hay catálogo cargado para pre-evaluación.</p>
              </div>
            )}
          </div>

          <div className="w-full md:w-2/5 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900 shadow-lg shadow-indigo-100/20 flex flex-col gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between ml-1 mb-1">
                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Acción Final Evaluada</label>
                {!profile.selectedAction && mapDecisionToAction(profile.preEvaluation?.decision) && (
                  <span className="text-[8px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                    ✦ Sugerencia motor
                  </span>
                )}
              </div>
              <select
                value={localAction}
                onChange={(e) => setLocalAction(e.target.value as AnalysisAction)}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-sm font-black text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all cursor-pointer"
              >
                <option value="">Seleccionar Acción...</option>
                <option value="Liberar">Liberar</option>
                <option value="Revisar">Revisar</option>
                <option value="Liberar + UCR">Liberar + UCR</option>
                <option value="Fully Blocked">Fully Blocked</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1 mb-1 block flex items-center gap-1">
                <FileText size={10} /> Notas del Analista
              </label>
              <textarea
                value={localNotes}
                onChange={e => setLocalNotes(e.target.value)}
                placeholder="Observaciones adicionales..."
                rows={2}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2 text-[11px] font-medium text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all resize-none"
              />
            </div>
            <button
              onClick={handleFinalize}
              disabled={!localAction}
              className={`w-full px-6 py-3.5 rounded-xl font-black flex items-center justify-center gap-2 transition-all shadow-xl text-[10px] uppercase tracking-widest ${
                localAction ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Send size={14} /> Guardar Acción
            </button>
          </div>
        </div>

        {/* 3. Área Principal */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-slate-50 dark:bg-slate-900/50">

          <div className="flex-1 overflow-y-auto p-8 border-r border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-slate-800 dark:text-white flex items-center gap-2 text-sm uppercase tracking-tight">
                <FileSearch size={18} className="text-indigo-600 dark:text-indigo-400" /> Historial Judicial Detallado
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1 rounded-lg text-slate-500 dark:text-slate-400">
                  TOTAL: {sortedCrimes.length} CAUSAS
                </span>
                <span className="text-[10px] font-black bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-800 px-3 py-1 rounded-lg text-red-600 dark:text-red-400">
                  ALTO RIESGO: {profile.totalHighRiskCrimes}
                </span>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <button
                onClick={() => setCrimeTab('lista')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  crimeTab === 'lista'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <List size={12} /> Lista
              </button>
              <button
                onClick={() => setCrimeTab('timeline')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                  crimeTab === 'timeline'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <GitBranch size={12} /> Línea de Tiempo
              </button>
              {crimeTab === 'timeline' && (
                <button
                  onClick={() => setTimelineDir(d => d === 'vertical' ? 'horizontal' : 'vertical')}
                  title={timelineDir === 'vertical' ? 'Cambiar a horizontal' : 'Cambiar a vertical'}
                  className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-500"
                >
                  {timelineDir === 'vertical' ? '↔ Horizontal' : '↕ Vertical'}
                </button>
              )}
            </div>

            {crimeTab === 'lista' ? (
              <div className="space-y-4">
                {sortedCrimes.map((crime) => (
                  <CrimeCard key={crime.id} crime={crime} getRiskBadgeColor={getRiskBadgeColor} getYearsAgo={getYearsAgo} />
                ))}
              </div>
            ) : timelineDir === 'vertical' ? (
              /* ── Vertical timeline ── */
              <div className="space-y-0">
                {crimesByYear.map(([year, crimes], idx) => (
                  <div key={String(year)} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 dark:bg-indigo-700 flex items-center justify-center shrink-0 z-10">
                        <span className="text-white font-black text-[9px]">{year}</span>
                      </div>
                      {idx < crimesByYear.length - 1 && (
                        <div className="w-0.5 flex-1 bg-indigo-200 dark:bg-indigo-800 mt-1 mb-1 min-h-[20px]" />
                      )}
                    </div>
                    <div className="flex-1 pb-6 space-y-3 pt-1">
                      {crimes.map(crime => (
                        <CrimeCard key={crime.id} crime={crime} getRiskBadgeColor={getRiskBadgeColor} getYearsAgo={getYearsAgo} />
                      ))}
                    </div>
                  </div>
                ))}
                {crimesByYear.length === 0 && (
                  <p className="text-slate-400 text-sm font-medium italic text-center py-8">Sin causas registradas.</p>
                )}
              </div>
            ) : (
              /* ── Horizontal timeline ── */
              <div className="overflow-x-auto pb-4">
                {crimesByYear.length === 0 ? (
                  <p className="text-slate-400 text-sm font-medium italic text-center py-8">Sin causas registradas.</p>
                ) : (
                  <div className="min-w-max">
                    {/* Rail with year nodes */}
                    <div className="flex items-center mb-4">
                      {crimesByYear.map(([year, crimes], idx) => (
                        <div key={String(year)} className="flex items-center">
                          <div className="flex flex-col items-center gap-1">
                            <div className="w-12 h-12 rounded-full bg-indigo-600 dark:bg-indigo-700 flex items-center justify-center shadow-lg">
                              <span className="text-white font-black text-[9px]">{year}</span>
                            </div>
                            <span className="text-[8px] font-black text-indigo-500 dark:text-indigo-400 uppercase">
                              {(crimes as Crime[]).length} causa{(crimes as Crime[]).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          {idx < crimesByYear.length - 1 && (
                            <div className="h-0.5 w-12 bg-indigo-200 dark:bg-indigo-800 mx-1" />
                          )}
                        </div>
                      ))}
                    </div>
                    {/* Crime cards per year in columns */}
                    <div className="flex gap-3 items-start">
                      {crimesByYear.map(([year, crimes]) => (
                        <div key={String(year)} className="flex flex-col gap-2 w-56 shrink-0">
                          {(crimes as Crime[]).map(crime => (
                            <CrimeCard key={crime.id} crime={crime} getRiskBadgeColor={getRiskBadgeColor} getYearsAgo={getYearsAgo} />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar de IA */}
          <div className="w-full md:w-[450px] p-6 flex flex-col bg-white dark:bg-slate-900">
            <div className="bg-slate-900 rounded-[2rem] shadow-2xl flex flex-col h-full border border-slate-800 overflow-hidden relative">
              <div className="p-4 bg-slate-800 flex justify-between items-center border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Analista Criminal AI</h3>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
                {chatHistory.length === 0 && !analyzing && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="p-4 bg-slate-800 rounded-2xl text-indigo-400">
                      <MessageSquare size={24} />
                    </div>
                    <p className="text-white font-black text-xs uppercase tracking-tight">Consultar dudas adicionales</p>
                    <button
                      onClick={() => handleSendMessage('context', '¿Este historial representa un riesgo crítico para la operación?')}
                      className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-[9px] text-white font-black uppercase tracking-widest w-full"
                    >
                      Analizar Peligrosidad
                    </button>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] p-4 rounded-2xl text-[11px] font-medium leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {analyzing && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 border border-slate-700 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                      <Loader2 size={14} className="text-indigo-400 animate-spin" />
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest animate-pulse">Analizando...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-4 bg-slate-800 border-t border-slate-700">
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1">
                  <input
                    type="text"
                    placeholder="Escribe tu duda..."
                    className="flex-1 bg-transparent text-white text-[11px] py-2 focus:outline-none placeholder:text-slate-600 font-black"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage('context')}
                  />
                  <button onClick={() => handleSendMessage('context')} disabled={analyzing || !inputValue} className="p-1.5 text-indigo-500 hover:text-indigo-400 transition-all"><Send size={16} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Extracted CrimeCard for reuse in both views
const CrimeCard: React.FC<{
  crime: Crime;
  getRiskBadgeColor: (risk: string) => string;
  getYearsAgo: (fecha: string, rit: string) => string | null;
}> = ({ crime, getRiskBadgeColor, getYearsAgo }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-6 rounded-2xl shadow-sm hover:shadow-md transition-all group">
    <div className="flex justify-between items-start mb-4">
      <div className="flex flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black text-slate-800 dark:text-white text-sm uppercase leading-tight tracking-tight">{crime.tipo}</span>
          {crime.catalogType && (
            <span className="text-[8px] font-black bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-600 uppercase tracking-widest">
              CAT: {crime.catalogType}
            </span>
          )}
          {crime.catalogValue !== undefined && (
            <span className="text-[9px] font-black bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg border border-indigo-100 dark:border-indigo-800">
              VALOR: {crime.catalogValue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 text-[10px] font-bold">
            <Calendar size={12} /> {crime.fecha !== '0' && crime.fecha !== 'undefined' ? crime.fecha : '(Sin fecha)'}
          </div>
          {getYearsAgo(crime.fecha, crime.rit) && (
            <div className="text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Clock size={10} /> {getYearsAgo(crime.fecha, crime.rit)}
            </div>
          )}
        </div>
      </div>
      <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getRiskBadgeColor(crime.riesgo)}`}>
        {crime.riesgo}
      </span>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px] border-t border-slate-100 dark:border-slate-700 pt-4">
      <div className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-xl">
        <span className="text-slate-400 dark:text-slate-500 uppercase text-[8px] font-black block mb-1">Causa ID (RUC/RIT)</span>
        <p className="font-mono text-slate-700 dark:text-slate-300">{crime.ruc || 'N/A'} / {crime.rit || 'N/A'}</p>
      </div>
      <div className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-xl">
        <span className="text-slate-400 dark:text-slate-500 uppercase text-[8px] font-black block mb-1">Situación Procesal</span>
        <p className="font-black text-indigo-600 dark:text-indigo-400 uppercase">{crime.estado || 'No especificado'}</p>
      </div>
      <div className="bg-slate-50 dark:bg-slate-700/50 p-2 rounded-xl">
        <span className="text-slate-400 dark:text-slate-500 uppercase text-[8px] font-black block mb-1">Tribunal Competente</span>
        <p className="font-bold text-slate-700 dark:text-slate-300 leading-tight">{crime.tribunal || 'Desconocido'}</p>
      </div>
    </div>
  </div>
);
