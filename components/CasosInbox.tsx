import React, { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeCasos, isCasosAvailable, guardarScreening, eliminarCasos, CasoSF } from '../services/casosService';
import {
  sfUpdateDisponible, SFCaseUpdate, SFUpdateResult,
} from '../services/salesforceCaseService';
import { SF_CASE_FIELDS } from '../services/salesforceCaseFields';
import { buscarRemesa, buscarRemesas, RemesaResult, RemesaRow } from '../services/remesasService';
import { screenCaso, esScreenable, runPool, Coincidencia, CasoScreening } from '../services/casosCriminalService';
import { generateCasoPdf, CasoPdfCoincidencia } from '../services/pdfGenerator';
import { normalizarScreening } from '../services/screeningNormalizer';
import { mergeAlertas } from '../services/alertDeduplication';
import type { AlertaScreening, EstadoCaso, PrioridadCaso, TipoCasoCompliance } from '../services/casosComplianceTypes';
import { TRANSICIONES_CASO } from '../services/casosComplianceTypes';
import { inferirTipoCaso } from '../services/casosComplianceMapper';
import { calcularPrioridadPreliminar } from '../services/casePriority';
import { cambiarEstado, tomarCaso, liberarCaso, cambiarPrioridad } from '../services/caseWorkflowService';
import { guardarInvestigacion } from '../services/caseInvestigationService';
import { registrarDecision, resolverAprobacion, requiereAprobacion } from '../services/caseDecisionService';
import { enviarResolucion, conclusionAStatus } from '../services/caseResolutionService';
import { TIPOS_CIERRE, camposDeCierre } from '../services/cierreTipos';
import { TIPOS_CIERRE_ADMIN, OFAC_PROVIDERS, ADMIN_ASSIGNEE_DEFAULT, ADMIN_STATUS_OPTIONS, ADMIN_COMMENT_OPTIONS } from '../services/cierreAdminTipos';
import { enviarCierreAdmin, adminCierreDisponible, AdminCierreResult } from '../services/adminCierreService';
import { registrarAuditoria } from '../services/caseAuditService';
import type { InvestigacionCaso, DecisionCompliance, TipoDecision } from '../services/casosComplianceTypes';
import { useAuth } from '../context/AuthContext';

// Estado del screening criminal por caso (cola OFAC/PEP).
interface ScreeningState {
  estado: 'loading' | 'ok' | 'sin_causas' | 'error' | 'na';  // na = país sin screening (ni Chile ni Colombia)
  fuente?: string;
  delitosUnicos?: number;
  decision?: string;
  razon?: string;
  coincidencias?: Coincidencia[];
  pep?: boolean;
}

type FormState = Record<string, string | boolean>;

// Colas de trabajo (clasificación de casos entrantes por asunto).
type QueueKey = 'ofac' | 'remesa' | 'otros';
type QueuedCaso = CasoSF & { remesa: string };
const QUEUES: { key: QueueKey; label: string }[] = [
  { key: 'ofac', label: 'Coincidencia OFAC' },
  { key: 'remesa', label: 'Remesa' },
  { key: 'otros', label: 'Otros' },
];

// Formulario por defecto: todo vacío salvo el número de caso (prefijado) y PEP.
function defaultForm(c: CasoSF | null): FormState {
  const f: FormState = {};
  for (const field of SF_CASE_FIELDS) f[field.apiName] = field.type === 'checkbox' ? false : '';
  f.CaseNumber = c?.numeroCaso ?? '';
  return f;
}

// Arma el payload final: CaseNumber + solo los campos con valor (omite vacíos),
// más los checkboxes como booleanos. Así el analista cambia solo lo que quiere.
function buildPayload(form: FormState): SFCaseUpdate {
  const payload: SFCaseUpdate = { CaseNumber: String(form.CaseNumber ?? '').trim() };
  for (const field of SF_CASE_FIELDS) {
    if (field.apiName === 'CaseNumber') continue;
    const v = form[field.apiName];
    if (field.type === 'checkbox') payload[field.apiName] = !!v;
    else if (typeof v === 'string' && v.trim() !== '') payload[field.apiName] = v;
  }
  return payload;
}

interface CasosInboxProps {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const fmtFecha = (iso: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
};

// Texto plano de un valor del payload para una celda de tabla.
const cellText = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

// Campos del payload que la cola OFAC "promueve" a columnas propias (con el orden
// pedido); se excluyen del bloque de columnas dinámicas para no duplicarlas.
const OFAC_PROMOVIDAS = ['Número del caso', 'Id interno del usuario', 'Nombre', 'Apellido', 'Nombre completo', 'País Origen', 'País'];

// Nombre a mostrar: "Nombre completo" si viene; si no, Nombre + Apellido; si no, la cuenta.
const nombreCompleto = (c: CasoSF): string => {
  const d = c.datos || {};
  const full = String(d['Nombre completo'] ?? '').trim();
  if (full) return full;
  const partes = [String(d['Nombre'] ?? '').trim(), String(d['Apellido'] ?? '').trim()].filter(Boolean);
  return partes.join(' ') || c.nombreCuenta || '—';
};
const idInterno = (c: CasoSF): string => String(c.datos?.['Id interno del usuario'] ?? '').trim() || '—';
const paisOrigen = (c: CasoSF): string => String(c.datos?.['País Origen'] ?? c.pais ?? '').trim() || '—';
// País del caso → countryCode de admin para el last-step (CL por defecto).
const paisCC = (p: string): string => (/colombia|^co$/i.test(p) ? 'CO' : 'CL');

// Filtro tipo Excel: desplegable con buscador, para elegir un valor de una columna.
const FiltroCombo: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const filtradas = options.filter(o => o.toLowerCase().includes(q.toLowerCase()));
  const activo = !!value;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border ${activo
          ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}
      >
        {label}{activo ? `: ${value}` : ''} <span className="opacity-60">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-60 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…"
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs outline-none focus:border-sky-400 mb-1" />
          <div className="max-h-52 overflow-y-auto">
            <button onClick={() => { onChange(''); setOpen(false); setQ(''); }}
              className={`w-full text-left px-2 py-1 rounded text-xs ${!value ? 'font-bold text-sky-600' : 'text-slate-500 dark:text-slate-400'} hover:bg-slate-100 dark:hover:bg-slate-700/50`}>
              Todos
            </button>
            {filtradas.map(o => (
              <button key={o} onClick={() => { onChange(o); setOpen(false); setQ(''); }}
                className={`w-full text-left px-2 py-1 rounded text-xs truncate ${value === o ? 'font-bold text-sky-600' : 'text-slate-700 dark:text-slate-200'} hover:bg-slate-100 dark:hover:bg-slate-700/50`} title={o}>
                {o}
              </button>
            ))}
            {filtradas.length === 0 && <p className="px-2 py-1 text-xs text-slate-400">Sin coincidencias</p>}
          </div>
        </div>
      )}
    </div>
  );
};

// Fecha a milisegundos para ordenar. Regcheq entrega DD/MM/YYYY.
const parseFechaMs = (f?: string): number => {
  if (!f) return 0;
  const m = f.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  const t = Date.parse(f);
  return Number.isNaN(t) ? 0 : t;
};

// Extrae el RUC del campo detalle ("RUC 2010012536-7" → "2010012536-7").
const rucDeDetalle = (d?: string): string => {
  const m = (d || '').match(/RUC\s*(\S+)/i);
  return m ? m[1] : '';
};

// Tabla de coincidencias AGRUPADA por RUC: cada RUC muestra su causa más
// reciente y colapsa el resto en un desplegable (evita el ruido de RUCs
// repetidos). Los grupos se ordenan por su causa más reciente.
const CoincidenciasAgrupadas: React.FC<{ co: Coincidencia[] }> = ({ co }) => {
  const grupos = useMemo(() => {
    const map = new Map<string, Coincidencia[]>();
    for (const x of co) {
      const key = rucDeDetalle(x.detalle) || x.detalle || x.tipo || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(x);
    }
    const arr = [...map.entries()].map(([ruc, filas]) => {
      const ordenadas = [...filas].sort((a, b) => parseFechaMs(b.fecha) - parseFechaMs(a.fecha));
      return { ruc, filas: ordenadas, reciente: parseFechaMs(ordenadas[0]?.fecha) };
    });
    arr.sort((a, b) => b.reciente - a.reciente);
    return arr;
  }, [co]);

  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const toggle = (ruc: string) => setAbiertos(s => {
    const n = new Set(s);
    if (n.has(ruc)) n.delete(ruc); else n.add(ruc);
    return n;
  });

  const celda = 'py-1 pr-4';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            <th className="py-1 pr-2 font-bold w-6"></th>
            <th className={`${celda} font-bold`}>Delito / Tipo</th>
            <th className={`${celda} font-bold`}>Detalle (RUC)</th>
            <th className={`${celda} font-bold`}>Estado</th>
            <th className={`${celda} font-bold`}>Fecha</th>
            <th className={`${celda} font-bold`}>Fuente</th>
            <th className={`${celda} font-bold`}>Riesgo</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map(g => {
            const top = g.filas[0];
            const extra = g.filas.length - 1;
            const open = abiertos.has(g.ruc);
            return (
              <React.Fragment key={g.ruc}>
                <tr
                  className={`border-t border-slate-100 dark:border-slate-700/50 ${extra > 0 ? 'cursor-pointer hover:bg-indigo-100/40 dark:hover:bg-indigo-900/20' : ''}`}
                  onClick={extra > 0 ? () => toggle(g.ruc) : undefined}
                >
                  <td className="py-1 pr-2 text-indigo-500 dark:text-indigo-400 font-bold">{extra > 0 ? (open ? '▾' : '▸') : ''}</td>
                  <td className={`${celda} text-slate-800 dark:text-slate-200 font-medium`}>{top?.tipo}</td>
                  <td className={`${celda} text-slate-700 dark:text-slate-300 break-words max-w-[280px]`}>
                    {top?.detalle || '—'}
                    {extra > 0 && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 rounded-full bg-indigo-200/70 dark:bg-indigo-800/50 text-indigo-800 dark:text-indigo-200 font-bold text-[10px] whitespace-nowrap">
                        +{extra} causa(s)
                      </span>
                    )}
                  </td>
                  <td className={celda}>{top?.estado || '—'}</td>
                  <td className={`${celda} whitespace-nowrap`}>{top?.fecha || '—'}</td>
                  <td className={celda}>{top?.fuente || '—'}</td>
                  <td className={celda}>{top?.riesgo || '—'}</td>
                </tr>
                {open && g.filas.slice(1).map((x, i) => (
                  <tr key={i} className="bg-indigo-50/40 dark:bg-indigo-950/20 text-slate-600 dark:text-slate-400">
                    <td className="py-1 pr-2"></td>
                    <td className={`${celda} pl-2`}>{x.tipo}</td>
                    <td className={`${celda} break-words max-w-[280px]`}>{x.detalle || '—'}</td>
                    <td className={celda}>{x.estado || '—'}</td>
                    <td className={`${celda} whitespace-nowrap`}>{x.fecha || '—'}</td>
                    <td className={celda}>{x.fuente || '—'}</td>
                    <td className={celda}>{x.riesgo || '—'}</td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Encabezado de sección dentro de la ficha flotante del caso.
const Seccion: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center gap-3 mt-2 mb-3">
    <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">{children}</span>
    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
  </div>
);

export const CasosInbox: React.FC<CasosInboxProps> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const { user } = useAuth();
  const actor = user ? { uid: user.uid, nombre: user.displayName || user.email || user.uid } : null;
  const [casos, setCasos] = useState<CasoSF[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [activeQueue, setActiveQueue] = useState<QueueKey>('ofac');
  const filtrosVacios = { pais: '', estado: '', prioridad: '', conclusion: '', pep: '', numeroCaso: '', dni: '' };
  const [filtros, setFiltros] = useState<Record<string, string>>(filtrosVacios);
  const setFiltroCol = (k: string, v: string) => setFiltros(f => ({ ...f, [k]: v }));
  const [sortCol, setSortCol] = useState<string>('fecha');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const toggleSort = (col: string) =>
    sortCol === col ? setSortDir(d => (d === 'asc' ? 'desc' : 'asc')) : (setSortCol(col), setSortDir('asc'));

  // Selección para borrado masivo.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const toggleSel = (id: string) => setSeleccion(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const limpiarSeleccion = () => { setSeleccion(new Set()); setConfirmarBorrado(false); };
  const borrarSeleccionados = async () => {
    setBorrando(true);
    try { await eliminarCasos([...seleccion]); limpiarSeleccion(); }
    finally { setBorrando(false); }
  };

  // Cierre masivo: aplica la tipificación de un tipo de cierre a los seleccionados
  // y los envía a Salesforce (idempotente, reusa enviarResolucion).
  const [cierreTipo, setCierreTipo] = useState('');
  const [cerrando, setCerrando] = useState(false);
  const [cierreConfirm, setCierreConfirm] = useState(false);
  const [cierreResult, setCierreResult] = useState<string | null>(null);
  const cerrarMasivo = async () => {
    const tipo = TIPOS_CIERRE.find(t => t.id === cierreTipo);
    if (!tipo || seleccion.size === 0) return;
    setCerrando(true); setCierreResult(null);
    const seleccionados = [...seleccion].map(id => casos.find(c => c.id === id)).filter((c): c is CasoSF => !!c);
    let ok = 0, err = 0;
    await runPool(seleccionados, async (c) => {
      try {
        const payload = { CaseNumber: c.numeroCaso, ...camposDeCierre(tipo, c.pais) } as SFCaseUpdate;
        const r = await enviarResolucion(c.id, payload, actor ?? undefined);
        if (r.yaEnviada || r.sf?.ok) ok++; else err++;
      } catch { err++; }
    }, 3);
    setCerrando(false); setCierreConfirm(false);
    setCierreResult(`${ok} enviado(s)${err ? `, ${err} con error` : ''}`);
    if (err === 0) limpiarSeleccion();
  };

  // Cierre masivo en Admin (bloqueo/desbloqueo): mismo patrón que el de SF, pero
  // agrupando por país (el last-step usa countryCode por cliente). Usa el
  // customerId = "Id interno del usuario" de cada caso. ALTO impacto → confirma.
  const [adminMasivoTipo, setAdminMasivoTipo] = useState('');
  const [adminMasivoConfirm, setAdminMasivoConfirm] = useState(false);
  const [adminMasivoSending, setAdminMasivoSending] = useState(false);
  const [adminMasivoResult, setAdminMasivoResult] = useState<string | null>(null);
  const cerrarMasivoAdmin = async () => {
    const tipo = TIPOS_CIERRE_ADMIN.find(t => t.id === adminMasivoTipo);
    if (!tipo || seleccion.size === 0) return;
    setAdminMasivoSending(true); setAdminMasivoResult(null);
    const seleccionados = [...seleccion].map(id => casos.find(c => c.id === id)).filter((c): c is CasoSF => !!c);
    // Agrupa customerIds por país (countryCode del last-step).
    const porPais = new Map<string, string[]>();
    let sinId = 0;
    for (const c of seleccionados) {
      const cid = String(c.datos?.['Id interno del usuario'] ?? '').trim();
      if (!cid) { sinId++; continue; }
      const cc = paisCC(c.pais);
      if (!porPais.has(cc)) porPais.set(cc, []);
      porPais.get(cc)!.push(cid);
    }
    let ok = 0, err = 0;
    for (const [cc, ids] of porPais) {
      try {
        const r = await enviarCierreAdmin({
          customerIds: ids, status: tipo.status, comment: tipo.comment, observation: tipo.observation,
          agent: ADMIN_ASSIGNEE_DEFAULT, ofacFlag: false, ofacProvider: 'REGCHECK',
          countryCode: cc, lastStep: tipo.lastStepDefault,
        });
        for (const res of r.results) { if (res.ok) ok++; else err++; }
        if (r.error && !r.results.length) err += ids.length;
      } catch { err += ids.length; }
    }
    setAdminMasivoSending(false); setAdminMasivoConfirm(false);
    setAdminMasivoResult(`${ok} cliente(s) OK${err ? `, ${err} con error` : ''}${sinId ? `, ${sinId} sin Customer ID` : ''}`);
    if (err === 0 && sinId === 0) limpiarSeleccion();
  };

  useEffect(() => {
    if (!isCasosAvailable()) {
      setError('Firestore no está configurado en esta instancia.');
      setLoading(false);
      return;
    }
    const unsub = subscribeCasos(
      data => { setCasos(data); setLoading(false); },
      msg => { setError(msg); setLoading(false); },
    );
    return () => unsub();
  }, []);

  // ── Clasificación en colas por asunto ──────────────────────────────────────
  // OFAC: asunto = "Coincidencia OFAC" (exacto). Remesa: asunto del bot que
  // detiene una TX ("...DETIENE TX <n>..."). Resto → "Otros" (no se pierde nada).
  const clasificar = (c: QueuedCaso): QueueKey => {
    const a = (c.asunto || '').trim();
    if (a.toLowerCase() === 'coincidencia ofac') return 'ofac';
    if (/DETIENE\s+TX/i.test(a)) return 'remesa';
    return 'otros';
  };
  // Extrae SOLO el número de la TX del asunto para la columna "remesa".
  const extraerRemesa = (asunto: string): string => {
    const m = (asunto || '').match(/TX\s*(\d+)/i);
    return m ? m[1] : '';
  };

  // Agrupa en colas y ordena cada una por fecha de llegada (asc = FIFO).
  const colas = useMemo(() => {
    const g: Record<QueueKey, QueuedCaso[]> = { ofac: [], remesa: [], otros: [] };
    for (const c of casos) {
      const qc: QueuedCaso = { ...c, remesa: extraerRemesa(c.asunto) };
      g[clasificar(qc)].push(qc);
    }
    (Object.keys(g) as QueueKey[]).forEach(k =>
      g[k].sort((a, b) => (a.recibidoEn || '').localeCompare(b.recibidoEn || '')));
    return g;
  }, [casos]);

  // Filtro aplicado dentro de la cola activa.
  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const base = colas[activeQueue];
    if (!q) return base;
    return base.filter(c =>
      [c.numeroCaso, c.asunto, c.nombreCuenta, c.pais, c.remesa].some(v => (v || '').toLowerCase().includes(q)));
  }, [colas, activeQueue, filtro]);

  // Columnas dinámicas = unión de TODOS los campos recibidos en la cola activa.
  const columnas = useMemo(() => {
    const keys: string[] = [];
    for (const c of filtrados) for (const k of Object.keys(c.datos || {})) if (!keys.includes(k)) keys.push(k);
    return keys;
  }, [filtrados]);

  const sel = useMemo(() => filtrados.find(c => c.id === selId) ?? null, [filtrados, selId]);
  const cerrarFicha = () => setSelId(null);

  // Ficha flotante: cerrar con Escape y bloquear el scroll de fondo.
  useEffect(() => {
    if (!selId) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelId(null); };
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [selId]);

  // ── Responder en Salesforce ────────────────────────────────────────────────
  const [showResponder, setShowResponder] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm(null));
  const [sending, setSending] = useState(false);
  const [sfResult, setSfResult] = useState<SFUpdateResult | null>(null);

  // Al cambiar de caso, reinicia el formulario. Pre-llena C_Status__c según la
  // conclusión del motor (Fase 7); el analista completa el resto.
  useEffect(() => {
    const base = defaultForm(sel);
    const sug = conclusionAStatus(sel?.screening?.decision);
    if (sug) base['C_Status__c'] = sug;
    setForm(base);
    setSfResult(null);
    setTipoCierreSel('');
    setBorrarFichaConfirm(false);
  }, [sel?.id]);

  const setField = (k: string, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  // Autocompleta el formulario con la tipificación de un tipo de cierre (mismo
  // mantenedor que el cierre masivo). Parte de un form limpio del caso y aplica
  // los campos del tipo (incluye Country__c según el país del caso).
  const [tipoCierreSel, setTipoCierreSel] = useState('');
  const aplicarTipoAlForm = (tipoId: string) => {
    setTipoCierreSel(tipoId);
    const tipo = TIPOS_CIERRE.find(t => t.id === tipoId);
    if (!tipo || !sel) return;
    const base = defaultForm(sel);
    const campos = camposDeCierre(tipo, sel.pais);
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) base[k] = v as string | boolean;
    setForm(base);
  };

  // ── Segundo cierre: Admin (bloqueo/desbloqueo del cliente en api.global66.com) ─
  interface AdminForm {
    customerIds: string; ofacFlag: boolean; ofacProvider: string; lastStep: boolean;
    countryCode: string; changeTicket: string; agent: string;
    status: string; comment: string; observation: string; pep: boolean;
  }
  const adminFormInicial = (): AdminForm => ({
    customerIds: '', ofacFlag: false, ofacProvider: 'REGCHECK', lastStep: true,
    countryCode: 'CL', changeTicket: '', agent: ADMIN_ASSIGNEE_DEFAULT,
    status: '', comment: '', observation: '', pep: false,
  });
  const [adminTipoSel, setAdminTipoSel] = useState('');
  const [adminForm, setAdminForm] = useState<AdminForm>(adminFormInicial());
  const [adminConfirm, setAdminConfirm] = useState(false);
  const [adminSending, setAdminSending] = useState(false);
  const [adminResult, setAdminResult] = useState<AdminCierreResult | null>(null);
  const setAdmin = (patch: Partial<AdminForm>) => setAdminForm(f => ({ ...f, ...patch }));

  // Reinicia + pre-llena (customerId ← "Id interno del usuario", país del caso) al cambiar de caso.
  useEffect(() => {
    setAdminTipoSel(''); setAdminConfirm(false); setAdminResult(null);
    setAdminForm({
      ...adminFormInicial(),
      customerIds: sel ? String(sel.datos?.['Id interno del usuario'] ?? '').trim() : '',
      countryCode: sel ? paisCC(sel.pais) : 'CL',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const aplicarTipoAdmin = (tipoId: string) => {
    setAdminTipoSel(tipoId); setAdminConfirm(false); setAdminResult(null);
    const t = TIPOS_CIERRE_ADMIN.find(x => x.id === tipoId);
    setAdmin({
      status: t?.status ?? '', comment: t?.comment ?? '', observation: t?.observation ?? '',
      pep: !!t?.pep, lastStep: t?.lastStepDefault ?? true,
    });
  };

  const enviarAdmin = async () => {
    if (!sel || !adminForm.status || !adminForm.comment) return;
    const ids = adminForm.customerIds.split(',').map(s => s.trim()).filter(Boolean);
    if (!ids.length) { setAdminResult({ ok: false, results: [], error: 'Falta el customerId.' }); return; }
    setAdminSending(true); setAdminResult(null);
    try {
      const r = await enviarCierreAdmin({
        customerIds: ids, status: adminForm.status, comment: adminForm.comment,
        observation: adminForm.observation, agent: adminForm.agent,
        ofacFlag: adminForm.ofacFlag, ofacProvider: adminForm.ofacProvider,
        countryCode: adminForm.countryCode, lastStep: adminForm.lastStep,
      });
      setAdminResult(r);
      // Auditoría — incluye metadata que NO va a la API (changeTicket, requestedBy, pep).
      registrarAuditoria(sel.id, {
        tipo: 'CIERRE_ADMIN', actorId: actor?.uid ?? 'system', actorTipo: actor ? 'USER' : 'SYSTEM',
        correlationId: sel.id, versionCaso: 1,
        metadata: {
          tipologia: adminTipoSel, status: adminForm.status, customerIds: ids, ok: r.ok,
          changeTicket: adminForm.changeTicket, requestedBy: actor?.nombre ?? '',
          pep: adminForm.pep, ofacFlag: adminForm.ofacFlag, ofacProvider: adminForm.ofacProvider,
        },
      }).catch(() => {});
    } catch (e) {
      setAdminResult({ ok: false, results: [], error: e instanceof Error ? e.message : String(e) });
    } finally { setAdminSending(false); setAdminConfirm(false); }
  };

  // ── Consulta de remesa en Redshift (cola Remesa) ────────────────────────────
  const [remesaData, setRemesaData] = useState<RemesaResult | null>(null);
  const [remesaLoading, setRemesaLoading] = useState(false);

  // Al seleccionar un caso de la cola Remesa, consulta la TX en Redshift.
  useEffect(() => {
    setRemesaData(null);
    if (activeQueue !== 'remesa' || !sel?.remesa) return;
    let cancelado = false;
    setRemesaLoading(true);
    buscarRemesa(sel.remesa)
      .then(r => { if (!cancelado) setRemesaData(r); })
      .catch(e => { if (!cancelado) setRemesaData({ estado: 'error', notFound: [], mensaje: (e as Error).message }); })
      .finally(() => { if (!cancelado) setRemesaLoading(false); });
    return () => { cancelado = true; };
  }, [sel?.id, sel?.remesa, activeQueue]);

  // Consulta en LOTE de todas las remesas de la cola (para columnas de la tabla).
  const [remesaMap, setRemesaMap] = useState<Record<string, RemesaRow>>({});
  const [remesaMapLoading, setRemesaMapLoading] = useState(false);
  const remesaIdsKey = colas.remesa.map(c => c.remesa).filter(Boolean).join(',');
  useEffect(() => {
    if (activeQueue !== 'remesa') return;
    const faltantes = colas.remesa.map(c => c.remesa).filter(id => id && !(id in remesaMap));
    if (faltantes.length === 0) return;
    let cancelado = false;
    setRemesaMapLoading(true);
    buscarRemesas(faltantes)
      .then(m => { if (!cancelado) setRemesaMap(prev => ({ ...prev, ...m })); })
      .finally(() => { if (!cancelado) setRemesaMapLoading(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, remesaIdsKey]);

  // ── Screening criminal EN VIVO de la cola OFAC/PEP ──────────────────────────
  // Chile → Regcheq (solo DNI) + motor de decisión. Colombia queda pendiente
  // (Inspektor). Se procesa cada caso apenas cae, incrementalmente.
  const [screenMap, setScreenMap] = useState<Record<string, ScreeningState>>({});

  // Aplica un resultado al estado y lo PERSISTE en Firestore (salvo errores, que se
  // reintentan la próxima vez). Compartido entre analistas y sobrevive recargas.
  const aplicarScreening = (caso: QueuedCaso, r: CasoScreening) => {
    setScreenMap(prev => ({ ...prev, [caso.id]: { estado: r.estado, fuente: r.fuente, delitosUnicos: r.delitosUnicos, decision: r.decision, razon: r.razon, coincidencias: r.coincidencias, pep: r.pep } }));
    if (r.estado !== 'error') {
      // Persiste v2: alertas normalizadas + dedupeadas (merge con las previas para
      // conservar `creadaEn`); mantiene los campos legacy para la UI actual.
      const screenedAt = new Date().toISOString();
      const norm = normalizarScreening(r, caso, screenedAt);
      const alertas = mergeAlertas((caso.screening?.alertas as AlertaScreening[]) ?? [], norm.alertas);
      guardarScreening(caso.id, {
        schemaVersion: 2,
        estado: r.estado, fuente: r.fuente, delitosUnicos: r.delitosUnicos,
        decision: r.decision, razon: r.razon, coincidencias: r.coincidencias, pep: r.pep, alertas,
      }).catch(() => {});
    }
  };

  // Semilla desde el screening ya guardado (evita re-consultar las listas al recargar).
  useEffect(() => {
    setScreenMap(prev => {
      let changed = false;
      const next = { ...prev };
      for (const c of casos) {
        if (c.screening && !(c.id in next)) {
          const sc = c.screening;
          next[c.id] = { estado: (sc.estado as ScreeningState['estado']) ?? 'ok', fuente: sc.fuente, delitosUnicos: sc.delitosUnicos, decision: sc.decision, razon: sc.razon, coincidencias: sc.coincidencias as Coincidencia[] | undefined, pep: sc.pep };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [casos]);

  const ofacIdsKey = colas.ofac.map(c => c.id).join(',');
  useEffect(() => {
    if (activeQueue !== 'ofac') return;
    const pendientes = colas.ofac.filter(c => !(c.id in screenMap));
    if (pendientes.length === 0) return;
    let cancelado = false;

    // Estado inicial: loading para los screeneables (Chile/Colombia), 'na' para el resto.
    setScreenMap(prev => {
      const next = { ...prev };
      for (const c of pendientes) next[c.id] = { estado: esScreenable(c) ? 'loading' : 'na' };
      return next;
    });

    // Procesa por País (Chile→Regcheq, Colombia→Inspektor) con concurrencia limitada.
    const aProcesar = pendientes.filter(esScreenable);
    runPool(aProcesar, async c => {
      if (cancelado) return;
      const r = await screenCaso(c);
      if (cancelado) return;
      aplicarScreening(c, r);
    }, 4);
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, ofacIdsKey]);

  // Reconsulta manual de un caso (fuerza volver a pegarle a la lista).
  const reconsultar = async (c: QueuedCaso) => {
    setScreenMap(prev => ({ ...prev, [c.id]: { estado: 'loading' } }));
    const r = await screenCaso(c);
    aplicarScreening(c, r);
  };

  // Color de la conclusión según la decisión del motor.
  const decisionColor = (d?: string): string => {
    const s = (d || '').toUpperCase();
    if (/BLOCK|BLOQ|FORZAR|RECHAZ|PRIORITARIA|CRITIC/.test(s)) return 'text-red-600 dark:text-red-400';
    if (/REVIS|UCR|COMPLIANCE|MANUAL/.test(s)) return 'text-amber-600 dark:text-amber-400';
    if (/LIBER|APROB|OK|SIN CAUSAS/.test(s)) return 'text-emerald-600 dark:text-emerald-400';
    return 'text-slate-600 dark:text-slate-300';
  };

  // ── Workflow (Fase 4b): vista operacional y acciones (actor definido arriba) ──
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [accionMsg, setAccionMsg] = useState<string | null>(null);

  // Vista operacional derivada del caso (con defaults; prioridad preliminar si no
  // está guardada). Lee los bloques que escribe el workflow, sin romper CasoSF.
  const vistaOp = (c: QueuedCaso) => {
    const raw = c as unknown as Record<string, unknown>;
    const tipo = (raw.tipoCasoCompliance as TipoCasoCompliance) ?? inferirTipoCaso(c);
    const estado = (raw.estadoCaso as EstadoCaso) ?? 'NUEVO';
    const asignado = (raw.asignacion as { analistaNombre?: string } | undefined)?.analistaNombre ?? '';
    const tieneCoinc = (screenMap[c.id]?.delitosUnicos ?? 0) > 0;
    const prioridad = (raw.prioridad as PrioridadCaso) ?? calcularPrioridadPreliminar(tipo, tieneCoinc);
    const versionCaso = (raw.versionCaso as number) ?? 1;
    return { tipo, estado, prioridad, asignado, versionCaso };
  };

  const prioColor = (p: PrioridadCaso): string =>
    p === 'CRITICA' ? 'text-red-600 dark:text-red-400'
      : p === 'ALTA' ? 'text-orange-600 dark:text-orange-400'
        : p === 'MEDIA' ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-500 dark:text-slate-400';

  const conAccion = async (fn: () => Promise<void>) => {
    if (!actor) { setAccionMsg('Sesión no disponible.'); return; }
    setAccionEnCurso(true); setAccionMsg(null);
    try { await fn(); } catch (e) { setAccionMsg((e as Error).message); }
    finally { setAccionEnCurso(false); }
  };
  const doTomar = (c: QueuedCaso) => conAccion(() => tomarCaso({ id: c.id, estadoCaso: vistaOp(c).estado, versionCaso: vistaOp(c).versionCaso }, actor!));
  const doLiberar = (c: QueuedCaso) => conAccion(() => liberarCaso({ id: c.id, estadoCaso: vistaOp(c).estado, versionCaso: vistaOp(c).versionCaso }, actor!));
  const doEstado = (c: QueuedCaso, nuevo: EstadoCaso) => conAccion(() => cambiarEstado({ id: c.id, estadoCaso: vistaOp(c).estado, versionCaso: vistaOp(c).versionCaso }, nuevo, actor!));
  const doPrioridad = (c: QueuedCaso, nueva: PrioridadCaso) => conAccion(() => cambiarPrioridad({ id: c.id, prioridadActual: vistaOp(c).prioridad, versionCaso: vistaOp(c).versionCaso }, nueva, actor!));

  // ── Investigación (Fase 5): edición con versionado / concurrencia ────────────
  const [invForm, setInvForm] = useState({ resumen: '', hallazgos: '', recomendacion: '', completa: false });
  const [invVersion, setInvVersion] = useState(0);
  const [invSaving, setInvSaving] = useState(false);
  const [invMsg, setInvMsg] = useState<string | null>(null);
  const invActual = ((sel as unknown as Record<string, unknown> | null)?.investigacion) as InvestigacionCaso | undefined;

  // Carga el form SOLO al cambiar de caso (no al cambiar el contenido en vivo, para
  // no pisar lo que el analista está escribiendo). El conflicto se detecta al guardar.
  useEffect(() => {
    const inv = ((sel as unknown as Record<string, unknown> | null)?.investigacion) as InvestigacionCaso | undefined;
    setInvForm({
      resumen: inv?.resumen ?? '',
      hallazgos: (inv?.hallazgos as string[] | undefined ?? []).join('\n'),
      recomendacion: inv?.recomendacion ?? '',
      completa: inv?.estado === 'COMPLETA',
    });
    setInvVersion(inv?.version ?? 0);
    setInvMsg(null);
  }, [sel?.id]);

  const guardarInv = async () => {
    if (!actor || !sel) { setInvMsg('Sesión no disponible.'); return; }
    if (invForm.completa && !invForm.resumen.trim()) {
      setInvMsg('El resumen es obligatorio para marcar la investigación como completa.');
      return;
    }
    setInvSaving(true); setInvMsg(null);
    try {
      const nueva = await guardarInvestigacion(sel.id, {
        resumen: invForm.resumen.trim(),
        hallazgos: invForm.hallazgos.split('\n').map(s => s.trim()).filter(Boolean),
        recomendacion: invForm.recomendacion.trim(),
        completa: invForm.completa,
      }, invVersion, actor);
      setInvVersion(nueva.version);
      setInvMsg('Guardado ✓');
    } catch (e) { setInvMsg((e as Error).message); }
    finally { setInvSaving(false); }
  };

  // ── Decisión de Compliance (Fase 6) ─────────────────────────────────────────
  const TIPOS_DECISION: { v: TipoDecision; label: string }[] = [
    { v: 'FALSO_POSITIVO', label: 'Falso positivo' },
    { v: 'PEP_CONFIRMADO', label: 'PEP confirmado' },
    { v: 'OFAC_CONFIRMADO', label: 'OFAC confirmado' },
    { v: 'INCONCLUSO', label: 'Inconcluso' },
    { v: 'DUPLICADO', label: 'Duplicado' },
    { v: 'ESCALAR', label: 'Escalar' },
  ];
  const [decForm, setDecForm] = useState<{ tipo: TipoDecision; reasonCode: string; justificacion: string }>({ tipo: 'FALSO_POSITIVO', reasonCode: '', justificacion: '' });
  const [decSaving, setDecSaving] = useState(false);
  const [decMsg, setDecMsg] = useState<string | null>(null);
  const decActual = ((sel as unknown as Record<string, unknown> | null)?.decisionCompliance) as DecisionCompliance | undefined;
  useEffect(() => {
    setDecForm({ tipo: (decActual?.tipo as TipoDecision) ?? 'FALSO_POSITIVO', reasonCode: decActual?.reasonCode ?? '', justificacion: decActual?.justificacion ?? '' });
    setDecMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const doRegistrarDecision = async () => {
    if (!actor || !sel) { setDecMsg('Sesión no disponible.'); return; }
    setDecSaving(true); setDecMsg(null);
    try { await registrarDecision(sel.id, decForm, actor); setDecMsg('Decisión registrada ✓'); }
    catch (e) { setDecMsg((e as Error).message); }
    finally { setDecSaving(false); }
  };
  const doAprobar = async (aprobar: boolean) => {
    if (!actor || !sel) { setDecMsg('Sesión no disponible.'); return; }
    setDecSaving(true); setDecMsg(null);
    try { await resolverAprobacion(sel.id, aprobar, actor); setDecMsg(aprobar ? 'Aprobada ✓' : 'Rechazada'); }
    catch (e) { setDecMsg((e as Error).message); }
    finally { setDecSaving(false); }
  };

  // Valores distintos por columna (para los desplegables de filtro), tomados de la cola.
  const opcionesFiltro = useMemo(() => {
    const base = colas[activeQueue];
    const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    return {
      pais: uniq(base.map(c => c.pais)),
      estado: uniq(base.map(c => vistaOp(c).estado)),
      prioridad: uniq(base.map(c => vistaOp(c).prioridad)),
      conclusion: uniq(base.map(c => screenMap[c.id]?.decision || '')),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colas, activeQueue, screenMap]);

  // Filtros por columna (tipo Excel): se combinan en AND con el buscador global.
  const cumpleFiltros = (c: QueuedCaso): boolean => {
    if (filtros.pais && (c.pais || '') !== filtros.pais) return false;
    if (filtros.estado && vistaOp(c).estado !== filtros.estado) return false;
    if (filtros.prioridad && vistaOp(c).prioridad !== filtros.prioridad) return false;
    if (filtros.conclusion && (screenMap[c.id]?.decision || '') !== filtros.conclusion) return false;
    if (filtros.pep) {
      const p = screenMap[c.id]?.pep;
      if (filtros.pep === 'Sí' && p !== true) return false;
      if (filtros.pep === 'No' && p !== false) return false;
    }
    if (filtros.numeroCaso && !(c.numeroCaso || '').toLowerCase().includes(filtros.numeroCaso.toLowerCase())) return false;
    if (filtros.dni && !String(c.datos?.['Número de DNI'] ?? '').toLowerCase().includes(filtros.dni.toLowerCase())) return false;
    return true;
  };

  // Orden por columna (asc/desc). Cada columna tiene una clave; el valor se obtiene
  // del caso o de los mapas (remesa/screening) según corresponda.
  const ordenados = useMemo(() => {
    const val = (c: QueuedCaso): string | number => {
      switch (sortCol) {
        case 'fecha': return c.recibidoEn || '';
        case 'remesa': return c.remesa || '';
        case 'benef': return remesaMap[c.remesa]?.beneficiary_name || '';
        case 'dni': return remesaMap[c.remesa]?.beneficiary_dni || '';
        case 'tipoenvio': return remesaMap[c.remesa]?.tipo_envio || '';
        case 'delitos': return screenMap[c.id]?.delitosUnicos ?? -1;
        case 'conclusion': return screenMap[c.id]?.decision || '';
        case 'pep': return screenMap[c.id]?.pep ? 1 : 0;
        case 'numeroCaso': return c.numeroCaso || '';
        case 'nombre': return nombreCompleto(c);
        case 'idinterno': return idInterno(c);
        case 'paisorigen': return paisOrigen(c);
        case 'tipo': return vistaOp(c).tipo;
        case 'estado': return vistaOp(c).estado;
        case 'prioridad': return vistaOp(c).prioridad;
        case 'asignado': return vistaOp(c).asignado;
        default: return String(c.datos?.[sortCol] ?? '');
      }
    };
    const cmp = (a: QueuedCaso, b: QueuedCaso) => {
      const va = val(a), vb = val(b);
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), 'es', { numeric: true });
    };
    return filtrados.filter(cumpleFiltros).sort((a, b) => (sortDir === 'asc' ? cmp(a, b) : -cmp(a, b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, sortCol, sortDir, remesaMap, screenMap, filtros]);

  // Selección "todos" sobre la vista actual (cola + filtro + orden).
  const allSel = ordenados.length > 0 && ordenados.every(c => seleccion.has(c.id));
  const toggleAll = () => setSeleccion(prev => {
    const todos = ordenados.length > 0 && ordenados.every(c => prev.has(c.id));
    const n = new Set(prev);
    ordenados.forEach(c => (todos ? n.delete(c.id) : n.add(c.id)));
    return n;
  });

  // Navegación prev/next dentro de la cola visible (misma vista de la tabla).
  const idxEnCola = useMemo(() => ordenados.findIndex(c => c.id === selId), [ordenados, selId]);
  const navegar = (delta: number) => {
    const n = idxEnCola + delta;
    if (n >= 0 && n < ordenados.length) setSelId(ordenados[n].id);
  };

  // Borrado del caso desde la ficha (individual). Mismo efecto que el borrado masivo.
  const [borrarFichaConfirm, setBorrarFichaConfirm] = useState(false);
  const borrarFicha = async () => {
    if (!sel) return;
    setBorrando(true);
    try { await eliminarCasos([sel.id]); setBorrarFichaConfirm(false); setSelId(null); }
    finally { setBorrando(false); }
  };

  // Descarga la ficha del caso como PDF (Info + Perfil + Investigación + Decisión + payload).
  const [pdfGen, setPdfGen] = useState(false);
  const descargarPdf = async () => {
    if (!sel) return;
    setPdfGen(true);
    try {
      const op = vistaOp(sel);
      const sc = screenMap[sel.id];
      const d = decActual;
      await generateCasoPdf({
        numeroCaso: sel.numeroCaso,
        recibidoEn: fmtFecha(sel.recibidoEn),
        origen: sel.origen,
        pais: sel.pais,
        tipo: op.tipo,
        prioridad: op.prioridad,
        estado: op.estado,
        asignado: op.asignado,
        screening: sc && sc.estado !== 'loading' && sc.estado !== 'na'
          ? { fuente: sc.fuente, decision: sc.decision, delitosUnicos: sc.delitosUnicos, pep: sc.pep, coincidencias: (sc.coincidencias ?? []) as CasoPdfCoincidencia[] }
          : undefined,
        investigacion: { resumen: invForm.resumen, hallazgos: invForm.hallazgos, recomendacion: invForm.recomendacion, completa: invForm.completa, version: invVersion },
        decision: d ? { estado: d.estado, tipo: TIPOS_DECISION.find(t => t.v === d.tipo)?.label ?? d.tipo, justificacion: d.justificacion, reasonCode: d.reasonCode, decididoPor: d.decididoPor, aprobadoPor: d.aprobadoPor } : undefined,
        respuestaSF: sfResult ? { estado: sfResult.ok ? 'ENVIADA' : `ERROR (HTTP ${sfResult.status})`, completadoEn: null } : undefined,
        payload: Object.entries(sel.datos).map(([k, v]) => [k, typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)]),
      });
    } finally { setPdfGen(false); }
  };

  // Encabezado clickeable para ordenar por esa columna.
  const Th = (col: string, label: string, extra = '') => (
    <th key={col} onClick={() => toggleSort(col)}
      className={`px-3 py-2 font-bold whitespace-nowrap cursor-pointer select-none hover:text-sky-600 dark:hover:text-sky-400 ${extra}`}>
      {label}{sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </th>
  );

  const enviarRespuesta = async () => {
    if (!sel) return;
    setSending(true);
    setSfResult(null);
    try {
      // Fase 7: idempotente + persiste respuestaSalesforce + auditoría.
      const { sf, yaEnviada, mensaje } = await enviarResolucion(sel.id, buildPayload(form), actor ?? undefined);
      if (yaEnviada) setSfResult({ ok: true, status: 200, raw: null, warnings: [mensaje ?? 'Ya enviada'] } as SFUpdateResult);
      else if (sf) setSfResult(sf);
    } catch (e) {
      setSfResult({ ok: false, status: 0, errors: [(e as Error).message], raw: null });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 p-4 md:p-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Inicio
        </button>
        <div className="text-center flex-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">📥 Bandeja de Casos</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Casos OFAC/PEP + Transacciones recibidos desde Salesforce · en vivo
          </p>
        </div>
        <button onClick={onToggleDarkMode} className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {darkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Tabs de colas */}
      {!loading && !error && casos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {QUEUES.filter(q => q.key !== 'otros' || colas.otros.length > 0).map(q => {
            const activa = activeQueue === q.key;
            return (
              <button
                key={q.key}
                onClick={() => { setActiveQueue(q.key); setSelId(null); limpiarSeleccion(); setFiltros(filtrosVacios); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors border ${activa
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-sky-300'}`}
              >
                {q.label}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activa ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>
                  {colas[q.key].length}
                </span>
              </button>
            );
          })}
          <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> en vivo
          </span>
        </div>
      )}

      {/* Buscador global + filtros por columna (tipo Excel) */}
      {!loading && !error && casos.length > 0 && (() => {
        const hayFiltros = Object.values(filtros).some(Boolean);
        const inp = 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-sky-400 w-32';
        return (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-3">
              <input
                value={filtro}
                onChange={e => setFiltro(e.target.value)}
                placeholder="Buscador global (número, asunto, cuenta, país, remesa…)"
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-indigo-400"
              />
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {ordenados.length} caso(s)
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FiltroCombo label="País" value={filtros.pais} options={opcionesFiltro.pais} onChange={v => setFiltroCol('pais', v)} />
              {activeQueue === 'ofac' && <FiltroCombo label="Estado" value={filtros.estado} options={opcionesFiltro.estado} onChange={v => setFiltroCol('estado', v)} />}
              {activeQueue === 'ofac' && <FiltroCombo label="Prioridad" value={filtros.prioridad} options={opcionesFiltro.prioridad} onChange={v => setFiltroCol('prioridad', v)} />}
              {activeQueue === 'ofac' && <FiltroCombo label="Conclusión" value={filtros.conclusion} options={opcionesFiltro.conclusion} onChange={v => setFiltroCol('conclusion', v)} />}
              {activeQueue === 'ofac' && <FiltroCombo label="PEP" value={filtros.pep} options={['Sí', 'No']} onChange={v => setFiltroCol('pep', v)} />}
              <input value={filtros.numeroCaso} onChange={e => setFiltroCol('numeroCaso', e.target.value)} placeholder="Nº caso" className={inp} />
              <input value={filtros.dni} onChange={e => setFiltroCol('dni', e.target.value)} placeholder="DNI" className={inp} />
              {hayFiltros && (
                <button onClick={() => setFiltros(filtrosVacios)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-sky-600 underline">
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {loading && <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center">Cargando bandeja…</p>}
      {error && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && casos.length === 0 && (
        <div className="text-center text-slate-400 dark:text-slate-500 py-16 text-sm">
          Todavía no llegó ningún caso. Cuando Salesforce haga <code>POST /casos</code>, aparecerán acá al instante.
        </div>
      )}

      {!loading && !error && casos.length > 0 && (
        <>
          {/* Barra de borrado masivo (aparece al seleccionar) */}
          {seleccion.size > 0 && (
            <div className="flex items-center gap-3 mb-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-red-700 dark:text-red-300">{seleccion.size} seleccionado(s)</span>
              {!confirmarBorrado ? (
                <button onClick={() => setConfirmarBorrado(true)} className="font-bold text-red-600 dark:text-red-400 hover:underline">🗑 Borrar</button>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-red-700 dark:text-red-300">¿Borrar {seleccion.size} caso(s)? No se puede deshacer.</span>
                  <button onClick={borrarSeleccionados} disabled={borrando} className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50">
                    {borrando ? 'Borrando…' : 'Sí, borrar'}
                  </button>
                  <button onClick={() => setConfirmarBorrado(false)} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600">Cancelar</button>
                </span>
              )}
              <button onClick={limpiarSeleccion} className="ml-auto text-xs text-slate-500 dark:text-slate-400 hover:underline">Limpiar selección</button>
            </div>
          )}

          {/* Barra de cierre masivo en Salesforce (solo cola OFAC/PEP) */}
          {seleccion.size > 0 && activeQueue === 'ofac' && sfUpdateDisponible() && (
            <div className="flex flex-wrap items-center gap-3 mb-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">Cerrar en Salesforce</span>
              <select
                value={cierreTipo}
                onChange={e => { setCierreTipo(e.target.value); setCierreConfirm(false); setCierreResult(null); }}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              >
                <option value="">Tipo de cierre…</option>
                {TIPOS_CIERRE.map(t => (
                  <option key={t.id} value={t.id}>{t.label}{t.completo ? '' : ' (tipificación preliminar)'}</option>
                ))}
              </select>
              {cierreTipo && !cierreConfirm && (
                <button onClick={() => setCierreConfirm(true)} disabled={cerrando} className="font-bold text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50">
                  Aplicar a {seleccion.size} caso(s)
                </button>
              )}
              {cierreTipo && cierreConfirm && (
                <span className="flex items-center gap-2">
                  <span className="text-emerald-800 dark:text-emerald-200">
                    ¿Enviar «{TIPOS_CIERRE.find(t => t.id === cierreTipo)?.label}» a {seleccion.size} caso(s)?
                    {!TIPOS_CIERRE.find(t => t.id === cierreTipo)?.completo && ' Tipificación preliminar.'}
                  </span>
                  <button onClick={cerrarMasivo} disabled={cerrando} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50">
                    {cerrando ? 'Enviando…' : 'Sí, enviar'}
                  </button>
                  <button onClick={() => setCierreConfirm(false)} disabled={cerrando} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600">Cancelar</button>
                </span>
              )}
              {cierreResult && <span className="text-emerald-800 dark:text-emerald-200 font-medium">{cierreResult}</span>}
            </div>
          )}

          {/* Barra de cierre masivo en Admin — bloqueo/desbloqueo (solo cola OFAC) */}
          {seleccion.size > 0 && activeQueue === 'ofac' && adminCierreDisponible() && (
            <div className="flex flex-wrap items-center gap-3 mb-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-rose-700 dark:text-rose-300">Cerrar en Admin (bloqueo/desbloqueo)</span>
              <select
                value={adminMasivoTipo}
                onChange={e => { setAdminMasivoTipo(e.target.value); setAdminMasivoConfirm(false); setAdminMasivoResult(null); }}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              >
                <option value="">Tipo de cierre…</option>
                {TIPOS_CIERRE_ADMIN.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              {adminMasivoTipo && !adminMasivoConfirm && (
                <button onClick={() => setAdminMasivoConfirm(true)} disabled={adminMasivoSending} className="font-bold text-rose-700 dark:text-rose-400 hover:underline disabled:opacity-50">
                  Aplicar a {seleccion.size} cliente(s)
                </button>
              )}
              {adminMasivoTipo && adminMasivoConfirm && (
                <span className="flex items-center gap-2">
                  <span className="text-rose-800 dark:text-rose-200">
                    ¿Aplicar «{TIPOS_CIERRE_ADMIN.find(t => t.id === adminMasivoTipo)?.label}» a {seleccion.size} cliente(s) en Admin? OFAC=No · <b>bloquea/desbloquea clientes reales</b>.
                  </span>
                  <button onClick={cerrarMasivoAdmin} disabled={adminMasivoSending} className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50">
                    {adminMasivoSending ? 'Enviando…' : 'Sí, aplicar'}
                  </button>
                  <button onClick={() => setAdminMasivoConfirm(false)} disabled={adminMasivoSending} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600">Cancelar</button>
                </span>
              )}
              {adminMasivoResult && <span className="text-rose-800 dark:text-rose-200 font-medium">{adminMasivoResult}</span>}
            </div>
          )}

          {/* Tabla de la cola de trabajo (ordenada por fecha de llegada) */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-x-auto max-h-[55vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                <tr className="text-left text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2 w-8">
                    <input type="checkbox" checked={allSel} onChange={toggleAll} className="w-4 h-4 cursor-pointer align-middle" title="Seleccionar todo" />
                  </th>
                  {activeQueue !== 'ofac' && Th('fecha', 'Fecha llegada')}
                  {activeQueue === 'remesa' && (
                    <>
                      {Th('remesa', 'remesa')}
                      {Th('benef', 'Beneficiario')}
                      {Th('dni', 'DNI')}
                      {Th('tipoenvio', 'Tipo de envío')}
                    </>
                  )}
                  {activeQueue === 'ofac' && (
                    <>
                      {/* Columnas clave, en el orden pedido */}
                      {Th('numeroCaso', 'Nº caso')}
                      {Th('nombre', 'Nombre')}
                      {Th('idinterno', 'Id interno')}
                      {Th('paisorigen', 'País origen')}
                      {Th('conclusion', 'Conclusión')}
                      {Th('delitos', 'Delitos únicos', 'text-center')}
                      {Th('prioridad', 'Prioridad')}
                      {/* Resto de columnas útiles */}
                      {Th('estado', 'Estado')}
                      {Th('asignado', 'Asignado')}
                      {Th('pep', 'PEP', 'text-center')}
                      {Th('tipo', 'Tipo')}
                      {Th('fecha', 'Fecha llegada')}
                    </>
                  )}
                  {(activeQueue === 'ofac' ? columnas.filter(k => !OFAC_PROMOVIDAS.includes(k)) : columnas).map(k => Th(k, k))}
                </tr>
              </thead>
              <tbody>
                {ordenados.length === 0 && (
                  <tr>
                    <td colSpan={columnas.length + (activeQueue === 'remesa' ? 6 : activeQueue === 'ofac' ? 13 : 2)} className="py-8 text-center text-slate-400">
                      Sin casos en esta cola.
                    </td>
                  </tr>
                )}
                {ordenados.map(c => {
                  const activo = sel?.id === c.id;
                  const r = c.remesa ? remesaMap[c.remesa] : undefined;
                  const rCell = (v: string | undefined) => r ? (v || '—') : (remesaMapLoading ? '…' : '—');
                  const s = screenMap[c.id];
                  const op = activeQueue === 'ofac' ? vistaOp(c) : null;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelId(c.id)}
                      className={`cursor-pointer border-b border-slate-100 dark:border-slate-700/50 ${activo ? 'bg-sky-50 dark:bg-sky-950/40' : seleccion.has(c.id) ? 'bg-red-50/60 dark:bg-red-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                    >
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => toggleSel(c.id)} className="w-4 h-4 cursor-pointer align-middle" />
                      </td>
                      {activeQueue !== 'ofac' && <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtFecha(c.recibidoEn)}</td>}
                      {activeQueue === 'remesa' && (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-sky-700 dark:text-sky-400">{c.remesa || '—'}</td>
                          <td className="px-3 py-2 max-w-[220px] truncate text-slate-700 dark:text-slate-200" title={r?.beneficiary_name}>{rCell(r?.beneficiary_name)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{r ? `${r.beneficiary_dni_type} ${r.beneficiary_dni}` : (remesaMapLoading ? '…' : '—')}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{rCell(r?.tipo_envio)}</td>
                        </>
                      )}
                      {activeQueue === 'ofac' && op && (
                        <>
                          {/* Columnas clave, en el orden pedido */}
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-800 dark:text-slate-100">{c.numeroCaso || '—'}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-slate-700 dark:text-slate-200" title={nombreCompleto(c)}>{nombreCompleto(c)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{idInterno(c)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{paisOrigen(c)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap font-semibold ${decisionColor(s?.decision)}`} title={s?.razon}>
                            {!s || s.estado === 'loading' ? 'consultando…'
                              : s.estado === 'na' ? 'No aplica'
                              : s.estado === 'error' ? 'Error'
                              : s.estado === 'sin_causas' ? 'Sin causas'
                              : (s.decision || '—')}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center font-bold text-slate-800 dark:text-slate-200">
                            {!s || s.estado === 'loading' ? '…' : s.estado === 'na' ? '—' : s.estado === 'error' ? '⚠️' : (s.delitosUnicos ?? 0)}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap font-bold ${prioColor(op.prioridad)}`}>{op.prioridad}</td>
                          {/* Resto de columnas útiles */}
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{op.estado}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300 max-w-[160px] truncate" title={op.asignado}>{op.asignado || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-center">
                            {!s || s.estado === 'loading' ? '…'
                              : s.fuente !== 'Regcheq' ? '—'
                              : s.pep ? <span className="font-bold text-red-600 dark:text-red-400">Sí</span>
                              : <span className="text-slate-500 dark:text-slate-400">No</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{op.tipo}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtFecha(c.recibidoEn)}</td>
                        </>
                      )}
                      {(activeQueue === 'ofac' ? columnas.filter(k => !OFAC_PROMOVIDAS.includes(k)) : columnas).map(k => {
                        const t = cellText(c.datos[k]);
                        return <td key={k} title={t} className="px-3 py-2 max-w-[220px] truncate text-slate-700 dark:text-slate-200">{t}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Ficha flotante del caso (al seleccionar una fila) */}
          {sel && (
            <div
              className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-slate-900/50 dark:bg-black/60 backdrop-blur-sm"
              onClick={cerrarFicha}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="relative w-full max-w-[112rem] max-h-[92vh] flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl"
                onClick={e => e.stopPropagation()}
              >
                {/* Header fijo */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">{sel.numeroCaso || '(sin número)'}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Recibido {fmtFecha(sel.recibidoEn)} · origen {sel.origen}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {/* Navegación dentro de la cola */}
                    <div className="flex items-center gap-1 mr-1">
                      <button
                        onClick={() => navegar(-1)}
                        disabled={idxEnCola <= 0}
                        title="Caso anterior"
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ◀
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap px-1">
                        {idxEnCola >= 0 ? idxEnCola + 1 : '—'} / {ordenados.length}
                      </span>
                      <button
                        onClick={() => navegar(1)}
                        disabled={idxEnCola < 0 || idxEnCola >= ordenados.length - 1}
                        title="Caso siguiente"
                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ▶
                      </button>
                    </div>
                    {/* Descargar PDF */}
                    <button
                      onClick={descargarPdf}
                      disabled={pdfGen}
                      title="Descargar ficha en PDF"
                      className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold disabled:opacity-50"
                    >
                      {pdfGen ? 'Generando…' : '⬇ PDF'}
                    </button>
                    {/* Borrar caso */}
                    <button
                      onClick={() => setBorrarFichaConfirm(true)}
                      title="Borrar caso de la cola"
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      🗑
                    </button>
                    <button
                      onClick={cerrarFicha}
                      aria-label="Cerrar ficha"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 dark:hover:text-white text-lg"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Confirmación de borrado del caso */}
                {borrarFichaConfirm && (
                  <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800/50 text-sm">
                    <span className="text-red-700 dark:text-red-300 font-semibold">¿Borrar el caso {sel.numeroCaso || ''} de la cola? No se puede deshacer.</span>
                    <button onClick={borrarFicha} disabled={borrando} className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50">
                      {borrando ? 'Borrando…' : 'Sí, borrar'}
                    </button>
                    <button onClick={() => setBorrarFichaConfirm(false)} disabled={borrando} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600">Cancelar</button>
                  </div>
                )}

                {/* Cuerpo con scroll */}
                <div className="overflow-y-auto p-5">
                <Seccion>📁 Info del caso</Seccion>

                {/* Datos de la remesa desde Redshift (solo cola Remesa) */}
                {activeQueue === 'remesa' && (
                  <div className="mb-5 rounded-xl border border-sky-200 dark:border-sky-800/50 bg-sky-50/60 dark:bg-sky-950/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-black text-sky-800 dark:text-sky-300">
                        💸 Remesa {sel.remesa || '—'} · datos de Redshift
                      </h3>
                      {remesaLoading && <span className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Consultando… (~3-8s)</span>}
                    </div>

                    {!sel.remesa && <p className="text-xs text-amber-600 dark:text-amber-400">No se pudo extraer el nº de TX del asunto.</p>}

                    {!remesaLoading && remesaData?.estado === 'ok' && remesaData.row && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                        {([
                          ['Beneficiario', remesaData.row.beneficiary_name],
                          ['DNI', `${remesaData.row.beneficiary_dni_type} ${remesaData.row.beneficiary_dni}`],
                          ['Customer ID', remesaData.row.customer_id],
                          ['Email', remesaData.row.beneficiary_email],
                          ['Tipo de envío', remesaData.row.tipo_envio],
                          ['Origen → Destino', `${remesaData.row.origin_country} → ${remesaData.row.destiny_country}`],
                          ['Monto USD', remesaData.row.destiny_amount_usd],
                          ['Estado TX', remesaData.row.tx_status],
                          ['Fecha TX', remesaData.row.start_date],
                        ] as [string, string | number][]).map(([k, v]) => (
                          <div key={k}>
                            <p className="font-semibold text-slate-500 dark:text-slate-400">{k}</p>
                            <p className="text-slate-800 dark:text-slate-200 break-words">{v === '' || v == null ? '—' : String(v)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {!remesaLoading && remesaData?.estado === 'not_found' && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">La transacción <b>{sel.remesa}</b> no existe en la base.</p>
                    )}
                    {!remesaLoading && remesaData?.estado === 'cluster_unavailable' && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">Redshift no disponible: {remesaData.mensaje}</p>
                    )}
                    {!remesaLoading && remesaData?.estado === 'error' && (
                      <p className="text-xs text-red-600 dark:text-red-400">Error: {remesaData.mensaje}</p>
                    )}
                  </div>
                )}

                {/* Estado y asignación del caso */}
                {(() => {
                  const op = vistaOp(sel);
                  const esMio = !!actor && op.asignado === actor.nombre;
                  const selectCls = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-sm outline-none focus:border-sky-400';
                  return (
                    <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-4">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                        <span className="text-slate-500 dark:text-slate-400">Tipo: <b className="text-slate-800 dark:text-slate-200">{op.tipo}</b></span>
                        <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          Prioridad:
                          <select
                            value={op.prioridad}
                            disabled={accionEnCurso}
                            onChange={e => e.target.value !== op.prioridad && doPrioridad(sel, e.target.value as PrioridadCaso)}
                            className={`${selectCls} font-bold ${prioColor(op.prioridad)}`}
                            title="Editar prioridad manualmente (incluye CRÍTICA)"
                          >
                            {(['CRITICA', 'ALTA', 'MEDIA', 'BAJA'] as PrioridadCaso[]).map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          Estado:
                          <select
                            value={op.estado}
                            disabled={accionEnCurso}
                            onChange={e => e.target.value !== op.estado && doEstado(sel, e.target.value as EstadoCaso)}
                            className={selectCls}
                          >
                            <option value={op.estado}>{op.estado}</option>
                            {TRANSICIONES_CASO[op.estado].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </label>
                        <span className="text-slate-500 dark:text-slate-400">Asignado: <b className="text-slate-800 dark:text-slate-200">{op.asignado || '—'}</b></span>
                        {esMio ? (
                          <button onClick={() => doLiberar(sel)} disabled={accionEnCurso} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-semibold disabled:opacity-50">Liberar</button>
                        ) : (
                          <button onClick={() => doTomar(sel)} disabled={accionEnCurso} className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold disabled:opacity-50">Tomar caso</button>
                        )}
                        {accionMsg && <span className="text-xs text-red-600 dark:text-red-400">{accionMsg}</span>}
                      </div>
                    </div>
                  );
                })()}

                {/* Perfil criminal / coincidencias detectadas (cola OFAC) */}
                {activeQueue === 'ofac' && screenMap[sel.id] && (
                  <div className="mb-5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/60 dark:bg-indigo-950/30 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-black text-indigo-800 dark:text-indigo-300">
                        ⚖️ Perfil criminal{screenMap[sel.id]?.fuente && screenMap[sel.id]?.fuente !== '—' ? ` · ${screenMap[sel.id]?.fuente}` : ''}
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold ${decisionColor(screenMap[sel.id]?.decision)}`}>
                          {screenMap[sel.id]?.estado === 'loading' ? 'consultando…'
                            : screenMap[sel.id]?.estado === 'na' ? 'No aplica'
                            : (screenMap[sel.id]?.decision || '—')}
                        </span>
                        {esScreenable(sel) && (
                          <button
                            onClick={() => reconsultar(sel)}
                            disabled={screenMap[sel.id]?.estado === 'loading'}
                            title="Volver a consultar la lista (Regcheq/Inspektor)"
                            className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-40"
                          >
                            ↻ Reconsultar
                          </button>
                        )}
                      </div>
                    </div>
                    {(() => {
                      const sc = screenMap[sel.id];
                      if (!sc || sc.estado === 'loading') return <p className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Consultando lista…</p>;
                      if (sc.estado === 'na') return <p className="text-xs text-slate-500 dark:text-slate-400">País sin lista configurada (ni Chile ni Colombia).</p>;
                      if (sc.estado === 'error') return <p className="text-xs text-red-600 dark:text-red-400">Error en la consulta.</p>;
                      const co = sc.coincidencias ?? [];
                      if (co.length === 0) return <p className="text-xs text-emerald-600 dark:text-emerald-400">Sin coincidencias / causas penales.</p>;
                      return (
                        <>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{sc.delitosUnicos} delito(s) único(s) · {co.length} coincidencia(s) · agrupadas por RUC</p>
                          <CoincidenciasAgrupadas co={co} />
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Datos del payload recibido (parte de "Info del caso") */}
                <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-2">🗂 Datos del payload</h3>
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(sel.datos).length === 0 && (
                        <tr><td className="py-2 text-slate-400">Sin datos en el payload.</td></tr>
                      )}
                      {Object.entries(sel.datos).map(([k, v]) => (
                        <tr key={k} className="border-b border-slate-100 dark:border-slate-700/50">
                          <td className="py-2 pr-4 font-semibold text-slate-500 dark:text-slate-400 align-top whitespace-nowrap">{k}</td>
                          <td className="py-2 text-slate-800 dark:text-slate-200 break-words">
                            {typeof v === 'object' && v !== null
                              ? <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
                              : String(v)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Seccion>🧭 Investigación + Decisión de Compliance</Seccion>

                {/* Investigación del analista (Fase 5) */}
                <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">📝 Investigación</h3>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {invVersion > 0 ? `v${invVersion}${invActual?.actualizadaEn ? ' · ' + fmtFecha(invActual.actualizadaEn) : ''}` : 'sin iniciar'}
                    </span>
                  </div>
                  {(() => {
                    const ta = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400';
                    return (
                      <>
                        <label className="text-xs block mb-2">
                          <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Resumen</span>
                          <textarea value={invForm.resumen} onChange={e => setInvForm(f => ({ ...f, resumen: e.target.value }))} rows={2} className={ta} />
                        </label>
                        <label className="text-xs block mb-2">
                          <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Hallazgos (uno por línea)</span>
                          <textarea value={invForm.hallazgos} onChange={e => setInvForm(f => ({ ...f, hallazgos: e.target.value }))} rows={3} className={ta} />
                        </label>
                        <label className="text-xs block mb-2">
                          <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Recomendación</span>
                          <textarea value={invForm.recomendacion} onChange={e => setInvForm(f => ({ ...f, recomendacion: e.target.value }))} rows={2} className={ta} />
                        </label>
                        <label className="text-xs flex items-center gap-2 mb-3 text-slate-600 dark:text-slate-300">
                          <input type="checkbox" checked={invForm.completa} onChange={e => setInvForm(f => ({ ...f, completa: e.target.checked }))} className="w-4 h-4" />
                          Marcar investigación como completa
                        </label>
                        <div className="flex items-center gap-3">
                          <button onClick={guardarInv} disabled={invSaving} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold">
                            {invSaving ? 'Guardando…' : 'Guardar investigación'}
                          </button>
                          {invMsg && <span className={`text-xs ${invMsg.includes('✓') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{invMsg}</span>}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* Decisión de Compliance (Fase 6) */}
                <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-3">⚖️ Decisión de Compliance</h3>
                  {(() => {
                    const inp = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400';
                    const d = decActual;
                    const esMaker = !!d && !!actor && d.decididoPor === actor.uid;
                    const Msg = () => decMsg ? <span className={`text-xs ${decMsg.includes('✓') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{decMsg}</span> : null;

                    if (d && (d.estado === 'APROBADA' || d.estado === 'RECHAZADA')) {
                      return (
                        <div className="text-sm space-y-1">
                          <p><b className={d.estado === 'APROBADA' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>{d.estado}</b> · {TIPOS_DECISION.find(t => t.v === d.tipo)?.label ?? d.tipo}</p>
                          {d.reasonCode && <p className="text-xs text-slate-500 dark:text-slate-400">Reason code: {d.reasonCode}</p>}
                          <p className="text-xs text-slate-600 dark:text-slate-300">{d.justificacion}</p>
                          <p className="text-[11px] text-slate-400">Decidió: {d.decididoPor}{d.aprobadoPor ? ` · Aprobó: ${d.aprobadoPor}` : ''}</p>
                        </div>
                      );
                    }

                    if (d && d.estado === 'PENDIENTE_APROBACION') {
                      return (
                        <div className="text-sm space-y-2">
                          <p><b className="text-amber-600 dark:text-amber-400">PENDIENTE DE APROBACIÓN</b> · {TIPOS_DECISION.find(t => t.v === d.tipo)?.label ?? d.tipo}</p>
                          <p className="text-xs text-slate-600 dark:text-slate-300">{d.justificacion}</p>
                          {esMaker ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400">Registrada por vos — requiere aprobación de <b>otro</b> analista (maker-checker).</p>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => doAprobar(true)} disabled={decSaving} className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50">Aprobar</button>
                              <button onClick={() => doAprobar(false)} disabled={decSaving} className="px-3 py-1 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-sm font-bold disabled:opacity-50">Rechazar</button>
                            </div>
                          )}
                          <Msg />
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="text-xs"><span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Decisión</span>
                            <select value={decForm.tipo} onChange={e => setDecForm(f => ({ ...f, tipo: e.target.value as TipoDecision }))} className={inp}>
                              {TIPOS_DECISION.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                            </select>
                          </label>
                          <label className="text-xs"><span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Reason code <span className="text-slate-400">(catálogo pendiente)</span></span>
                            <input value={decForm.reasonCode} onChange={e => setDecForm(f => ({ ...f, reasonCode: e.target.value }))} className={inp} />
                          </label>
                        </div>
                        <label className="text-xs block"><span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Justificación (obligatoria)</span>
                          <textarea value={decForm.justificacion} onChange={e => setDecForm(f => ({ ...f, justificacion: e.target.value }))} rows={2} className={inp} />
                        </label>
                        {requiereAprobacion(decForm.tipo) && <p className="text-[11px] text-amber-600 dark:text-amber-400">Esta decisión requerirá aprobación de otro analista (maker-checker).</p>}
                        <div className="flex items-center gap-3">
                          <button onClick={doRegistrarDecision} disabled={decSaving} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold">
                            {decSaving ? 'Registrando…' : 'Registrar decisión'}
                          </button>
                          <Msg />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ── Sección: Responder en Salesforce (botón que despliega) ── */}
                <Seccion>📨 Responder en Salesforce</Seccion>
                <div>
                  <button
                    onClick={() => setShowResponder(s => !s)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold"
                  >
                    <span>{showResponder ? '▾' : '▸'}</span> Responder en Salesforce
                  </button>

                  {showResponder && (
                    <div className="mt-4">
                      {!sfUpdateDisponible() && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                          Proxy no configurado en esta instancia (EMPRESADOCS_PROXY_URL).
                        </p>
                      )}

                      {/* Tipología de cierre: autocompleta los campos de abajo */}
                      <div className="flex flex-wrap items-center gap-2 mb-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 rounded-xl px-3 py-2">
                        <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">Tipología de cierre</span>
                        <select
                          value={tipoCierreSel}
                          onChange={e => aplicarTipoAlForm(e.target.value)}
                          className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                        >
                          <option value="">Elegir para autocompletar…</option>
                          {TIPOS_CIERRE.map(t => (
                            <option key={t.id} value={t.id}>{t.label}{t.completo ? '' : ' (preliminar)'}</option>
                          ))}
                        </select>
                        {tipoCierreSel && <span className="text-xs text-slate-500 dark:text-slate-400">Campos autocompletados — revisa y envía.</span>}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {SF_CASE_FIELDS.filter(f => f.type !== 'textarea').map(field => {
                          const val = form[field.apiName];
                          const inputCls = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400';
                          return (
                            <label key={field.apiName} className="text-xs">
                              <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">{field.label}</span>
                              {field.type === 'picklist' ? (
                                <select value={String(val ?? '')} onChange={e => setField(field.apiName, e.target.value)} className={inputCls}>
                                  <option value="">— (sin cambio) —</option>
                                  {field.options!.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                              ) : field.type === 'checkbox' ? (
                                <span className="flex items-center gap-2 h-[34px]">
                                  <input type="checkbox" checked={!!val} onChange={e => setField(field.apiName, e.target.checked)} className="w-4 h-4" />
                                  <span className="text-slate-500 dark:text-slate-400">Sí</span>
                                </span>
                              ) : (
                                <input value={String(val ?? '')} onChange={e => setField(field.apiName, e.target.value)} className={inputCls} />
                              )}
                            </label>
                          );
                        })}
                      </div>

                      {/* Campos textarea a ancho completo */}
                      {SF_CASE_FIELDS.filter(f => f.type === 'textarea').map(field => (
                        <label key={field.apiName} className="text-xs block mt-3">
                          <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">{field.label}</span>
                          <textarea
                            value={String(form[field.apiName] ?? '')}
                            onChange={e => setField(field.apiName, e.target.value)}
                            rows={2}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-sky-400"
                          />
                        </label>
                      ))}

                      <button
                        onClick={enviarRespuesta}
                        disabled={sending || !sfUpdateDisponible() || !String(form.CaseNumber ?? '').trim()}
                        className="mt-4 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold"
                      >
                        {sending ? 'Enviando…' : 'Enviar a Salesforce'}
                      </button>

                      {/* Resultado */}
                      {sfResult && (
                        <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${sfResult.ok
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300'
                          : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300'}`}>
                          <p className="font-bold">
                            {sfResult.ok ? '✅ Caso actualizado en Salesforce' : `❌ No se pudo actualizar (HTTP ${sfResult.status})`}
                          </p>
                          {sfResult.errors?.length ? (
                            <ul className="list-disc ml-5 mt-1">{sfResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                          ) : null}
                          {sfResult.warnings?.length ? (
                            <p className="mt-1 text-amber-700 dark:text-amber-400">⚠️ {sfResult.warnings.join('; ')}</p>
                          ) : null}
                          {sfResult.updatedFields?.length ? (
                            <p className="mt-1 text-xs opacity-80">Campos actualizados: {sfResult.updatedFields.join(', ')}</p>
                          ) : null}
                          {sfResult.closed !== undefined && (
                            <p className="mt-1 text-xs opacity-80">Caso cerrado: {sfResult.closed ? 'sí' : 'no'}{sfResult.caseId ? ` · ${sfResult.caseId}` : ''}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Sección: Cierre en Admin (bloqueo/desbloqueo del cliente) ── */}
                <Seccion>📛 Cierre en Admin (bloqueo/desbloqueo)</Seccion>
                {(() => {
                  const inp = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-rose-400';
                  const lbl = 'text-xs block';
                  const cap = 'block font-semibold text-slate-500 dark:text-slate-400 mb-1';
                  const tipoAdmin = TIPOS_CIERRE_ADMIN.find(t => t.id === adminTipoSel);
                  const habraLastStep = adminForm.lastStep && ['NORMAL', 'UNDER_COMPLIANCE_REVIEW', 'UNDER_COMPLIANCE_REVIEW_2'].includes(adminForm.status);
                  return (
                    <div className="rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50/40 dark:bg-rose-950/20 p-4">
                      <p className="text-[11px] text-rose-700 dark:text-rose-300 mb-3 font-semibold">⚠️ Cambia el estado del cliente en Admin (producción). Verifica el Customer ID antes de enviar.</p>
                      {!adminCierreDisponible() && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">Proxy no configurado (EMPRESADOCS_PROXY_URL).</p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tipología</span>
                        <select value={adminTipoSel} onChange={e => aplicarTipoAdmin(e.target.value)} className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm">
                          <option value="">Elegir…</option>
                          {TIPOS_CIERRE_ADMIN.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                        {tipoAdmin && adminForm.pep && <span className="text-[11px] text-slate-500 dark:text-slate-400">PEP ✓ (metadata)</span>}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className={lbl}><span className={cap}>Status</span>
                          <select value={adminForm.status} onChange={e => setAdmin({ status: e.target.value })} className={inp}>
                            <option value="">— elegir —</option>
                            {ADMIN_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </label>
                        <label className={lbl}><span className={cap}>Comment</span>
                          <input list="admin-comment-opts" value={adminForm.comment} onChange={e => setAdmin({ comment: e.target.value })} placeholder="ej: NO_COMMENTS" className={inp} />
                          <datalist id="admin-comment-opts">{ADMIN_COMMENT_OPTIONS.map(c => <option key={c} value={c} />)}</datalist>
                        </label>
                        <label className={lbl}><span className={cap}>Customer ID(s)</span>
                          <input value={adminForm.customerIds} onChange={e => setAdmin({ customerIds: e.target.value })} placeholder="ej: 2702355, 2702356" className={inp} />
                        </label>
                        <label className={lbl}><span className={cap}>País (last-step)</span>
                          <select value={adminForm.countryCode} onChange={e => setAdmin({ countryCode: e.target.value })} className={inp}>
                            <option value="CL">CL</option><option value="CO">CO</option>
                          </select>
                        </label>
                        <label className={lbl}><span className={cap}>OFAC (blacklistFlag)</span>
                          <select value={adminForm.ofacFlag ? 'si' : 'no'} onChange={e => setAdmin({ ofacFlag: e.target.value === 'si' })} className={inp}>
                            <option value="no">No (false)</option><option value="si">Sí (true)</option>
                          </select>
                        </label>
                        <label className={lbl}><span className={cap}>Provider</span>
                          <select value={adminForm.ofacProvider} onChange={e => setAdmin({ ofacProvider: e.target.value })} className={inp}>
                            {OFAC_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </label>
                        <label className={lbl}><span className={cap}>Last step</span>
                          <select value={adminForm.lastStep ? 'si' : 'no'} onChange={e => setAdmin({ lastStep: e.target.value === 'si' })} className={inp}>
                            <option value="si">Sí</option><option value="no">No</option>
                          </select>
                        </label>
                        <label className={lbl}><span className={cap}>Change ticket</span>
                          <input value={adminForm.changeTicket} onChange={e => setAdmin({ changeTicket: e.target.value })} placeholder="TICKET-1234" className={inp} />
                        </label>
                        <label className={lbl}><span className={cap}>Agent / assignee</span>
                          <input value={adminForm.agent} onChange={e => setAdmin({ agent: e.target.value })} className={inp} />
                        </label>
                      </div>
                      <label className={`${lbl} mt-3`}><span className={cap}>Observation</span>
                        <textarea value={adminForm.observation} onChange={e => setAdmin({ observation: e.target.value })} rows={2} className={inp} />
                      </label>

                      {!adminConfirm ? (
                        <button onClick={() => setAdminConfirm(true)} disabled={!adminForm.status || !adminForm.comment || !adminCierreDisponible()} className="mt-4 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold">
                          Enviar a Admin…
                        </button>
                      ) : (
                        <div className="mt-4 rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm">
                          <p className="font-bold text-rose-800 dark:text-rose-200">¿Aplicar «{tipoAdmin?.label ?? 'cierre manual'}» en Admin?</p>
                          <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">
                            Cliente(s): <b>{adminForm.customerIds || '—'}</b> · status <b>{adminForm.status}</b> · comment <b>{adminForm.comment}</b> · país {adminForm.countryCode}<br />
                            Pasos: OFAC (flag={adminForm.ofacFlag ? 'Sí' : 'No'}, {adminForm.ofacProvider}) → Compliance{habraLastStep ? ' → Last-step' : ''}. <b>Bloquea/desbloquea clientes reales.</b>
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <button onClick={enviarAdmin} disabled={adminSending} className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50">
                              {adminSending ? 'Enviando…' : 'Sí, aplicar'}
                            </button>
                            <button onClick={() => setAdminConfirm(false)} disabled={adminSending} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600">Cancelar</button>
                          </div>
                        </div>
                      )}

                      {adminResult && (
                        <div className={`mt-4 rounded-xl px-4 py-3 text-sm border ${adminResult.ok
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300'
                          : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-300'}`}>
                          <p className="font-bold">{adminResult.ok ? '✅ Aplicado en Admin' : '❌ No se pudo aplicar en Admin'}</p>
                          {adminResult.error && <p className="mt-1">{adminResult.error}</p>}
                          {adminResult.results.map(r => (
                            <div key={r.customerId} className="text-xs mt-2">
                              <p className="font-semibold">Cliente {r.customerId}: {r.ok ? 'OK' : 'falló'}</p>
                              {Object.keys(r.steps).length === 0 && <p className="ml-2 opacity-80">sin pasos</p>}
                              {Object.entries(r.steps).map(([k, v]) => {
                                const step = v as { ok?: boolean; status?: number; data?: unknown };
                                const detalle = step.data == null ? '' : (typeof step.data === 'string' ? step.data : JSON.stringify(step.data));
                                return (
                                  <div key={k} className="ml-2 mt-0.5">
                                    <span>{step.ok ? '✅' : '❌'} {k} — HTTP {step.status}</span>
                                    {!step.ok && detalle && (
                                      <pre className="mt-0.5 whitespace-pre-wrap break-words opacity-80 text-[11px] max-h-40 overflow-auto">{detalle}</pre>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
