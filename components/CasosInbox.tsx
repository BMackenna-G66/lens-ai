import React, { useEffect, useMemo, useRef, useState } from 'react';
import { screeningVigente, SCREENING_SCHEMA, subscribeCasos, isCasosAvailable, guardarScreening, guardarRemesaRow, guardarRemesaRows, guardarScreeningBeneficiario, eliminarCasos, CasoSF } from '../services/casosService';
import { traerCasosCola, importarCasos, CasoSFRemoto } from '../services/salesforceColaService';
import { TIPOS_CIERRE_REMESA, tipoRemesaPorId, camposDeCierreRemesa } from '../services/cierreRemesaTipos';
import { enviarCierreRemesaAdmin, remesaAdminDisponible, resumenRemesaAdmin } from '../services/remesaAdminService';
// Solo lo que MUESTRA la decisión: ejecutar es del Lambda.
import { evaluarRemesaAuto, retenidoPorDelitoRemesa, motivoRemesaLegible } from '../services/flujoRemesaEngine';
import {
  sfUpdateDisponible, SFCaseUpdate, SFUpdateResult,
} from '../services/salesforceCaseService';
import { SF_CASE_FIELDS } from '../services/salesforceCaseFields';
import { buscarRemesa, buscarRemesas, RemesaResult, RemesaRow } from '../services/remesasService';
import { screenBeneficiario, flujoDeBeneficiario, nombreBeneficiario } from '../services/remesaScreeningService';
import type { RemesaScreening } from '../services/remesaScreeningService';
import { screenCaso, esScreenable, runPool, Coincidencia, CasoScreening } from '../services/casosCriminalService';
import { generateCasoPdf, CasoPdfCoincidencia } from '../services/pdfGenerator';
import { normalizarScreening } from '../services/screeningNormalizer';
import { mergeAlertas } from '../services/alertDeduplication';
import type { AlertaScreening, EstadoCaso, PrioridadCaso, TipoCasoCompliance } from '../services/casosComplianceTypes';
import { TRANSICIONES_CASO } from '../services/casosComplianceTypes';
import { inferirTipoCaso } from '../services/casosComplianceMapper';
import { calcularPrioridadPreliminar } from '../services/casePriority';
import { cambiarEstado, tomarCaso, liberarCaso, cambiarPrioridad, asignarCaso } from '../services/caseWorkflowService';
import { notificar, subscribeNotificaciones, marcarTodasLeidas, marcarLeida } from '../services/notificacionesService';
import type { Notificacion } from '../services/notificacionesService';
import { statusDeCaso, setStatusCaso, registrarCierreCanal, STATUS_CASO_VALORES } from '../services/caseStatusService';
import type { StatusCaso } from '../services/caseStatusService';
import { subscribeFlujoConfig, guardarFlujoConfig, flujoConfigDisponible, FLUJO_CONFIG_DEFAULT, PAISES_FLUJO } from '../services/flujoAutomaticoService';
// La extracción de la TX del asunto es compartida con el flujo desatendido.
import { extraerRemesa, clasificarCola } from '../services/flujoDecision';
import { CATEGORIAS_SENSIBLES } from '../services/delitosSensibles';
import type { FlujoConfig } from '../services/flujoAutomaticoService';
import { evaluarCasoAuto, motivosRetencion, retenidoPorDelito } from '../services/flujoAutomaticoEngine';
import { correrFlujoAhora, subscribeUltimasCorridas, subscribeLatido, disparadorDisponible, corridaConProblema, haceCuanto, type ResumenCorrida, type LatidoFlujo } from '../services/flujoCorridasService';
import { guardarInvestigacion } from '../services/caseInvestigationService';
import { enviarResolucion, conclusionAStatus } from '../services/caseResolutionService';
import { TIPOS_CIERRE, camposDeCierre } from '../services/cierreTipos';
import { TIPOS_CIERRE_ADMIN, OFAC_PROVIDERS, ADMIN_ASSIGNEE_DEFAULT, ADMIN_STATUS_OPTIONS, ADMIN_COMMENT_OPTIONS, RISK_LEVELS, PEP_PROVIDER_DEFAULT, ofacFlagPara } from '../services/cierreAdminTipos';
import { enviarCierreAdmin, adminCierreDisponible, AdminCierreResult } from '../services/adminCierreService';
import { registrarAuditoria, leerAuditoria } from '../services/caseAuditService';
import { logCierre, logHistorial, logConfigFlujo, logScreening, sincronizarAnalistas, filasBackfillCaso, enviarLote, reintentarPendientes, pendientesEnBuffer, logLiberacionRemesa } from '../services/colasLogService';
import { getAllUsers } from '../services/firestoreService';
import type { InvestigacionCaso } from '../services/casosComplianceTypes';
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
  otrasListas?: Array<{ clave: string; lista: string; riesgo?: string }>;
  mensaje?: string;   // motivo cuando estado = 'error'
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

// Igual para la cola Remesa: lo que ya se muestra en columnas propias no se repite
// en el bloque de columnas dinámicas del payload.
const REMESA_PROMOVIDAS = ['Número del caso', 'Id interno del usuario', 'Nombre', 'Apellido', 'Nombre completo', 'Email', 'Correo', 'País Origen', 'País'];

// Correo del cliente (el que envía), no el del beneficiario.
const correoCliente = (c: CasoSF): string => {
  const d = c.datos || {};
  const mail = String(d['Email'] ?? d['Correo'] ?? d['Mail'] ?? '').trim();
  if (mail) return mail;
  return /@/.test(c.nombreCuenta || '') ? c.nombreCuenta : '—';
};

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
// Coincidencias en listas que NO entran en la conclusión del catálogo (que en
// Chile se arma solo con causas penales + PEP). Se muestran igual: un
// beneficiario puede estar en OFAC o GAFI sin tener ninguna causa penal, y eso
// el analista tiene que verlo. Sirve para OFAC, remesas Chile e internacional.
const OtrasListas: React.FC<{ listas?: Array<{ clave?: string; lista: string; riesgo?: string }> }> = ({ listas }) => {
  if (!listas?.length) return null;
  const color = (r?: string) => {
    const v = (r ?? '').toLowerCase();
    if (v === 'high' || v === 'alto') return 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300';
    if (v === 'medium' || v === 'medio') return 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  };
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
        Coincidencias en otras listas ({listas.length}) — no entran en la conclusión del catálogo
      </p>
      <div className="flex flex-wrap gap-1.5">
        {listas.map(l => (
          <span key={l.clave ?? l.lista} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${color(l.riesgo)}`}>
            {l.lista}{l.riesgo ? ` · ${l.riesgo}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

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
  const actor = user ? { uid: user.uid, nombre: user.displayName || user.email || user.uid, email: user.email ?? undefined } : null;
  const [casos, setCasos] = useState<CasoSF[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [activeQueue, setActiveQueue] = useState<QueueKey>('ofac');
  const filtrosVacios = { pais: '', estado: '', prioridad: '', conclusion: '', pep: '', numeroCaso: '', dni: '', status: '', tipoEnvio: '', flujoBenef: '' };
  // Los casos CERRADOS salen de la cola; este toggle los vuelve a mostrar.
  const [verCerrados, setVerCerrados] = useState(false);
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
        if (r.yaEnviada || r.sf?.ok) {
          ok++;
          // Status del caso: canal SF cerrado (sale de la cola si Admin también).
          await registrarCierreCanal(c.id, 'sf', { ok: true, tipologia: tipo.id }, actor ?? undefined).catch(() => {});
          logCierre(c, activeQueue, { canal: 'SF', ok: true, tipologia: tipo.id }, actor ?? undefined);
        } else err++;
      } catch { err++; }
    }, 3);
    setCerrando(false); setCierreConfirm(false);
    setCierreResult(`${ok} enviado(s)${err ? `, ${err} con error` : ''}`);
    if (err === 0) limpiarSeleccion();
  };

  // ── Cierre masivo de la cola REMESA ────────────────────────────────────────
  // Aparte del de OFAC a propósito: acá se cierra el caso en Salesforce con la
  // tipificación de remesa y se libera la TRANSACCIÓN en Admin (no se toca al
  // cliente). Se manda todo en una sola llamada por lote.
  const [remesaMasivoTipo, setRemesaMasivoTipo] = useState('');
  const [remesaMasivoConfirm, setRemesaMasivoConfirm] = useState(false);
  const [remesaMasivoSending, setRemesaMasivoSending] = useState(false);
  const [remesaMasivoResult, setRemesaMasivoResult] = useState<string | null>(null);

  // Una sola acción libera los DOS canales: primero Admin (una llamada con todas
  // las transacciones del lote) y después Salesforce. Antes había que elegir canal
  // y correr el masivo dos veces.
  //
  // Admin va primero a propósito: es el que mueve la plata. Si falla, no tiene
  // sentido cerrar el caso en Salesforce diciendo que se liberó, así que ese caso
  // se saltea en el canal SF.
  const cerrarMasivoRemesa = async () => {
    const tipo = tipoRemesaPorId(remesaMasivoTipo);
    if (!tipo || seleccion.size === 0) return;
    setRemesaMasivoSending(true); setRemesaMasivoResult(null);
    const seleccionados = [...seleccion]
      .map(id => colas.remesa.find(c => c.id === id))
      .filter((c): c is QueuedCaso => !!c);

    try {
      // ── 1) Admin: libera las transacciones ──
      const conTx = seleccionados.filter(c => c.remesa);
      const sinTx = seleccionados.length - conTx.length;
      const pendientesAdmin = conTx.filter(c => c.cierres?.admin?.ok !== true);

      let rAdmin: Awaited<ReturnType<typeof enviarCierreRemesaAdmin>> = { ok: true, results: [] };
      if (pendientesAdmin.length > 0) {
        rAdmin = await enviarCierreRemesaAdmin({
          transactionIds: pendientesAdmin.map(c => c.remesa),
          targetStatusDB: tipo.statusDB,
          targetStatusLabel: tipo.statusLabel,
          requestedBy: actor?.nombre ?? '',
        });
      }
      const resPorTx = new Map(rAdmin.results.map(x => [String(x.transactionId), x]));
      for (const c of pendientesAdmin) {
        const res = resPorTx.get(String(c.remesa));
        if (!res?.ok) continue;
        await registrarCierreCanal(c.id, 'admin', { ok: true, tipologia: tipo.id }, actor ?? undefined).catch(() => {});
        logCierre(c, 'remesa', { canal: 'ADMIN', ok: true, tipologia: tipo.id, statusEnviado: tipo.statusDB }, actor ?? undefined);
      }

      // ── 2) Salesforce: solo los casos cuya plata quedó liberada ──
      const adminOk = (c: QueuedCaso) =>
        c.cierres?.admin?.ok === true || resPorTx.get(String(c.remesa))?.ok === true;
      const paraSF = seleccionados.filter(c => adminOk(c) && c.cierres?.sf?.ok !== true);
      let sfOk = 0, sfErr = 0;
      await runPool(paraSF, async c => {
        try {
          const payload = { CaseNumber: c.numeroCaso, ...camposDeCierreRemesa(tipo, c.pais) } as SFCaseUpdate;
          const r = await enviarResolucion(c.id, payload, actor ?? undefined);
          if (r.yaEnviada || r.sf?.ok) {
            sfOk++;
            await registrarCierreCanal(c.id, 'sf', { ok: true, tipologia: tipo.id }, actor ?? undefined).catch(() => {});
            logCierre(c, 'remesa', { canal: 'SF', ok: true, tipologia: tipo.id }, actor ?? undefined);
          } else sfErr++;
        } catch { sfErr++; }
      }, 3);

      // ── 3) Auditoría de la liberación (una fila por caso, con la evidencia) ──
      for (const c of seleccionados) {
        const res = resPorTx.get(String(c.remesa));
        logLiberacionRemesa(c, {
          transaccionId: c.remesa || null,
          tipologia: tipo.id,
          adminOk: c.cierres?.admin?.ok === true || res?.ok === true,
          adminOmitido: res?.omitido ?? false,
          estadoAnterior: res?.estadoAnterior ?? null,
          estadoNuevo: res?.ok ? tipo.statusDB : null,
          sfOk: adminOk(c) && c.cierres?.sf?.ok !== true ? undefined : c.cierres?.sf?.ok,
          requestedBy: actor?.nombre ?? null,
          detalleError: res && !res.ok ? (res.detalle ?? `paso ${res.paso}`) : null,
        }, remesaMap[c.remesa], benefMap[c.id], actor ?? undefined);
      }

      const partes = [
        resumenRemesaAdmin(rAdmin),
        `${sfOk} cerrado(s) en Salesforce${sfErr ? `, ${sfErr} con error` : ''}`,
        sinTx ? `${sinTx} sin N° de transacción` : '',
      ].filter(Boolean);
      setRemesaMasivoResult(partes.join(' · '));
      if (rAdmin.ok && sfErr === 0 && !sinTx) limpiarSeleccion();
    } catch (e) {
      setRemesaMasivoResult(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRemesaMasivoSending(false);
      setRemesaMasivoConfirm(false);
    }
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
    // Agrupa customerIds por país (countryCode del last-step) y guarda el mapa
    // customerId → casos, para poder marcar el status de cada caso al volver.
    const porPais = new Map<string, string[]>();
    const casosPorCustomer = new Map<string, string[]>();
    let sinId = 0;
    for (const c of seleccionados) {
      const cid = String(c.datos?.['Id interno del usuario'] ?? '').trim();
      if (!cid) { sinId++; continue; }
      const cc = paisCC(c.pais);
      if (!porPais.has(cc)) porPais.set(cc, []);
      porPais.get(cc)!.push(cid);
      if (!casosPorCustomer.has(cid)) casosPorCustomer.set(cid, []);
      casosPorCustomer.get(cid)!.push(c.id);
    }
    let ok = 0, err = 0;
    for (const [cc, ids] of porPais) {
      try {
        const r = await enviarCierreAdmin({
          customerIds: ids, status: tipo.status, comment: tipo.comment, observation: tipo.observation,
          agent: ADMIN_ASSIGNEE_DEFAULT, ofacFlag: ofacFlagPara(tipo.status), ofacProvider: 'REGCHECK',
          countryCode: cc, lastStep: tipo.lastStepDefault,
          // Risk/PEP solo si la tipología los define explícitamente (hoy: ninguna) — el
          // masivo no cambia PEP/riesgo de clientes reales sin revisión por ficha.
          pepEnabled: tipo.pepValue !== undefined,
          pepValue: !!tipo.pepValue, pepProvider: PEP_PROVIDER_DEFAULT, pepCountryCode: cc, pepPosition: null,
          riskEnabled: !!tipo.riskLevel, riskLevel: tipo.riskLevel || undefined,
        });
        for (const res of r.results) {
          if (res.ok) {
            ok++;
            // Status del caso: canal Admin cerrado (sale de la cola si SF también).
            for (const caseId of casosPorCustomer.get(String(res.customerId)) ?? []) {
              await registrarCierreCanal(caseId, 'admin', { ok: true, tipologia: tipo.id }, actor ?? undefined).catch(() => {});
              const caso = seleccionados.find(x => x.id === caseId);
              if (caso) logCierre(caso, activeQueue, { canal: 'ADMIN', ok: true, tipologia: tipo.id, statusEnviado: tipo.status, ofacFlag: ofacFlagPara(tipo.status) }, actor ?? undefined);
            }
          } else err++;
        }
        if (r.error && !r.results.length) err += ids.length;
      } catch { err += ids.length; }
    }
    setAdminMasivoSending(false); setAdminMasivoConfirm(false);
    setAdminMasivoResult(`${ok} cliente(s) OK${err ? `, ${err} con error` : ''}${sinId ? `, ${sinId} sin Customer ID` : ''}`);
    if (err === 0 && sinId === 0) limpiarSeleccion();
  };

  // ── Mantenedor del flujo automático (config compartida en Firestore) ─────────
  const [flujoCfg, setFlujoCfg] = useState<FlujoConfig>(FLUJO_CONFIG_DEFAULT);
  const [showFlujo, setShowFlujo] = useState(false);
  const [flujoDraft, setFlujoDraft] = useState<FlujoConfig>(FLUJO_CONFIG_DEFAULT);
  const [flujoSaving, setFlujoSaving] = useState(false);
  const [flujoMsg, setFlujoMsg] = useState<string | null>(null);
  // Mensaje del disparador manual y resumen de la última corrida del Lambda. Los
  // dos refs que había acá (`autoRunning`, `autoHechos`) desaparecieron con el
  // ejecutor: eran guardas POR PESTAÑA, y por eso no podían evitar que dos
  // pestañas cerraran el mismo caso.
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [corriendoFlujo, setCorriendoFlujo] = useState(false);
  const [ultimaCorrida, setUltimaCorrida] = useState<ResumenCorrida | null>(null);
  useEffect(() => subscribeUltimasCorridas(cs => setUltimaCorrida(cs[0] ?? null), 1), []);
  const [latido, setLatido] = useState<LatidoFlujo | null>(null);
  useEffect(() => subscribeLatido(setLatido), []);
  const [verDetalleCorrida, setVerDetalleCorrida] = useState(false);

  // Dispara una corrida del Lambda ahora, sin esperar el próximo tick del cron.
  // El candado del Lambda impide que se pise con una del cron: si hay una en
  // curso, vuelve con `corrio: false` y el motivo.
  const correrAhora = async () => {
    setCorriendoFlujo(true); setAutoMsg(null);
    try {
      // Dispara y vuelve: el resultado llega por la suscripción a las corridas,
      // no por esta respuesta. Con Colombia prendida una corrida tarda minutos y
      // esperarla daba 524 desde Cloudflare.
      const r = await correrFlujoAhora();
      setAutoMsg(r.disparada
        ? '🚀 Corrida arrancada. El resultado aparece acá abajo cuando termine (puede tardar unos minutos).'
        : '⏸️ No se pudo disparar la corrida.');
    } catch (e) {
      setAutoMsg(`❌ ${(e as Error).message}`);
    } finally { setCorriendoFlujo(false); }
  };

  // `camposAusentes`: qué campos de la config están cayendo al default. El flujo
  // desatendido los reporta en el resumen de su corrida, pero ese documento no lo
  // mira nadie — un aviso solo sirve donde está quien puede arreglarlo.
  const [flujoCamposAusentes, setFlujoCamposAusentes] = useState<string[]>([]);
  useEffect(() => subscribeFlujoConfig((cfg, ausentes) => {
    setFlujoCfg(cfg); setFlujoDraft(cfg); setFlujoCamposAusentes(ausentes ?? []);
  }), []);

  // Usuarios de Lens: sirven para asignar casos y como diccionario de analistas en
  // Redshift (para poder leer los logs por nombre/correo).
  const [usuarios, setUsuarios] = useState<{ uid: string; nombre: string; email: string }[]>([]);
  useEffect(() => {
    getAllUsers()
      .then(us => {
        const activos = us.filter(u => !u.disabled);
        setUsuarios(activos.map(u => ({ uid: u.uid, nombre: u.displayName || u.email || u.uid, email: u.email })));
        sincronizarAnalistas(us.map(u => ({ uid: u.uid, email: u.email, displayName: u.displayName, role: u.role, disabled: u.disabled })));
      })
      .catch(() => {});
  }, []);

  // Reintento del log pendiente: si Redshift estuvo pausado o caído, las filas
  // quedaron guardadas en el navegador. Se reintentan al abrir y cada 5 minutos,
  // así el analista no depende de acordarse de sincronizar.
  const [pendientes, setPendientes] = useState(0);
  useEffect(() => {
    const correr = async () => {
      if (pendientesEnBuffer() === 0) { setPendientes(0); return; }
      const r = await reintentarPendientes();
      setPendientes(r.quedan);
    };
    correr();
    const t = setInterval(correr, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Notificaciones del analista logueado (campanita).
  const [notis, setNotis] = useState<Notificacion[]>([]);
  const [showNotis, setShowNotis] = useState(false);
  useEffect(() => {
    if (!actor?.uid) return;
    return subscribeNotificaciones(actor.uid, setNotis);
  }, [actor?.uid]);
  const notisSinLeer = notis.filter(n => !n.leida);

  // ── Asignación de casos a otro analista ────────────────────────────────────
  const [asignarA, setAsignarA] = useState('');
  const [asignando, setAsignando] = useState(false);
  const [asignarMsg, setAsignarMsg] = useState<string | null>(null);

  // Asigna una lista de casos y le avisa al destinatario (una sola notificación).
  const asignarCasos = async (lista: QueuedCaso[], destinoUid: string) => {
    const destino = usuarios.find(u => u.uid === destinoUid);
    if (!destino || !actor || lista.length === 0) return;
    setAsignando(true); setAsignarMsg(null);
    let ok = 0, err = 0;
    for (const c of lista) {
      try {
        const anterior = vistaOp(c).asignado || null;
        await asignarCaso({ id: c.id, estadoCaso: vistaOp(c).estado, versionCaso: vistaOp(c).versionCaso }, destino, actor);
        logHistorial(c, 'ASIGNACION', anterior, destino.nombre, actor);
        ok++;
      } catch { err++; }
    }
    if (ok > 0) {
      await notificar(destino.uid, {
        tipo: 'CASOS_ASIGNADOS',
        titulo: `Te asignaron ${ok} caso(s)`,
        detalle: `${actor.nombre} te asignó ${ok} caso(s) de la cola.`,
        casos: lista.slice(0, 20).map(c => c.numeroCaso),
        creadaPorNombre: actor.nombre,
      });
    }
    setAsignando(false);
    setAsignarMsg(`${ok} caso(s) asignado(s) a ${destino.nombre}${err ? `, ${err} con error` : ''}`);
    if (err === 0) { limpiarSeleccion(); setAsignarA(''); }
  };

  const abrirFlujo = () => { setFlujoDraft(flujoCfg); setFlujoMsg(null); setShowFlujo(s => !s); };

  // Sincroniza a Redshift el histórico ya ocurrido (casos, su auditoría y los
  // cierres). Hace falta para los cierres automáticos de la primera corrida, que
  // se hicieron antes de que el motor los registrara. Es idempotente.
  const [backfillRun, setBackfillRun] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);
  const sincronizarHistorico = async () => {
    setBackfillRun(true); setBackfillMsg('Leyendo casos…');
    const nombrePorUid: Record<string, string> = {};
    try {
      const us = await getAllUsers();
      for (const u of us) nombrePorUid[u.uid] = u.displayName || u.email || u.uid;
    } catch { /* sin diccionario: los uid quedan sin nombre */ }

    // 1) Lee la auditoría de cada caso (esto sí en paralelo: es Firestore).
    const todos = casos.map(c => ({ ...c, remesa: extraerRemesa(c.asunto) } as QueuedCaso));
    const filas: ReturnType<typeof filasBackfillCaso> = [];
    let leidos = 0, errores = 0;
    await runPool(todos, async c => {
      try {
        const eventos = await leerAuditoria(c.id);
        filas.push(...filasBackfillCaso(c, clasificar(c), eventos, nombrePorUid));
      } catch { errores++; }
      leidos++;
      if (leidos % 10 === 0) setBackfillMsg(`Leyendo casos… ${leidos}/${todos.length}`);
    }, 4);

    // 2) Manda TODO en lotes grandes y secuenciales: la Data API tiene una cuota
    //    de statements activos por cuenta y el paralelismo la hacía saltar.
    const r = await enviarLote(filas, (hechas, total) =>
      setBackfillMsg(`Enviando… ${hechas}/${total} filas`));
    setBackfillRun(false);
    setBackfillMsg(
      r.fallidas === 0 && r.escritas > 0
        ? `✅ ${todos.length} caso(s) · ${r.escritas} fila(s) escritas en Redshift`
        : `⚠️ ${r.escritas} escritas, ${r.fallidas} fallidas${errores ? ` · ${errores} caso(s) no se pudieron leer` : ''}${r.error ? ` · ${r.error}` : ''}`,
    );
  };
  const guardarFlujo = async () => {
    setFlujoSaving(true); setFlujoMsg(null);
    try {
      await guardarFlujoConfig(flujoDraft, actor ?? undefined);
      // Deja registro en Redshift de quién prendió/apagó la automatización.
      logConfigFlujo('ofac', {
        habilitado: flujoDraft.ofac.enabled,
        paises: Object.entries(flujoDraft.ofac.paises ?? {}).filter(([, v]) => v).map(([k]) => k),
        cerrarSF: flujoDraft.ofac.cerrarSF, cerrarAdmin: flujoDraft.ofac.cerrarAdmin,
        tipologias: { liberar: flujoDraft.ofac.tipoLiberarNormal, ucr: flujoDraft.ofac.tipoLiberarUcr, bloquear: flujoDraft.ofac.tipoBloquear },
      }, actor ?? undefined);
      logConfigFlujo('remesa', { habilitado: flujoDraft.remesa.enabled }, actor ?? undefined);
      setFlujoMsg('Guardado ✓');
    }
    catch (e) { setFlujoMsg((e as Error).message); }
    finally { setFlujoSaving(false); }
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
  // La clasificación por asunto es compartida con el flujo desatendido: las dos
  // colas no se pueden mezclar y la regla tiene que ser una sola.
  const clasificar = (c: QueuedCaso): QueueKey => clasificarCola(c.asunto) as QueueKey;

  // Agrupa en colas y ordena cada una por fecha de llegada (asc = FIFO).
  // Los casos CERRADOS salen de la cola (status del caso); `verCerrados` permite
  // volver a mostrarlos sin perder el acceso al historial.
  const colas = useMemo(() => {
    const g: Record<QueueKey, QueuedCaso[]> = { ofac: [], remesa: [], otros: [] };
    for (const c of casos) {
      if (!verCerrados && statusDeCaso(c) === 'CERRADO') continue;
      const qc: QueuedCaso = { ...c, remesa: extraerRemesa(c.asunto) };
      g[clasificar(qc)].push(qc);
    }
    (Object.keys(g) as QueueKey[]).forEach(k =>
      g[k].sort((a, b) => (a.recibidoEn || '').localeCompare(b.recibidoEn || '')));
    return g;
  }, [casos, verCerrados]);

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
  // La Investigación va colapsada (el cierre es lo que más se usa en la ficha).
  const [showInvestigacion, setShowInvestigacion] = useState(false);
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
  // Cada cola tiene su propio juego de tipologías: OFAC cierra sobre el cliente y
  // Remesa sobre la transacción, con tipificaciones distintas en Salesforce.
  const tiposSFdeCola = (q: QueueKey) =>
    q === 'remesa'
      ? TIPOS_CIERRE_REMESA.map(t => ({ id: t.id, label: t.label, completo: true }))
      : TIPOS_CIERRE.map(t => ({ id: t.id, label: t.label, completo: t.completo }));

  const aplicarTipoAlForm = (tipoId: string) => {
    setTipoCierreSel(tipoId);
    if (!sel) return;
    const base = defaultForm(sel);
    let campos: Record<string, unknown> | null = null;
    if (activeQueue === 'remesa') {
      const t = tipoRemesaPorId(tipoId);
      if (t) campos = camposDeCierreRemesa(t, sel.pais);
    } else {
      const t = TIPOS_CIERRE.find(x => x.id === tipoId);
      if (t) campos = camposDeCierre(t, sel.pais);
    }
    if (!campos) return;
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) base[k] = v as string | boolean;
    setForm(base);
  };

  // ── Segundo cierre: Admin (bloqueo/desbloqueo del cliente en api.global66.com) ─
  interface AdminForm {
    customerIds: string; ofacFlag: boolean; ofacProvider: string; lastStep: boolean;
    countryCode: string; changeTicket: string; agent: string;
    status: string; comment: string; observation: string;
    pepEnabled: boolean; pepValue: boolean; riskLevel: string;
  }
  const adminFormInicial = (): AdminForm => ({
    customerIds: '', ofacFlag: false, ofacProvider: 'REGCHECK', lastStep: true,
    countryCode: 'CL', changeTicket: '', agent: ADMIN_ASSIGNEE_DEFAULT,
    status: '', comment: '', observation: '',
    pepEnabled: false, pepValue: false, riskLevel: '',
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
      // PEP se ejecuta solo si la tipología define isPep explícito (pepValue); el flag
      // legacy `pep` es solo etiqueta ("requiere formulario PEP"), no dispara el PUT.
      pepEnabled: t?.pepValue !== undefined, pepValue: !!t?.pepValue, riskLevel: t?.riskLevel ?? '',
      lastStep: t?.lastStepDefault ?? true,
      // OFAC/blacklist se deriva del status (true solo en FULLY_BLOCKED); editable.
      ofacFlag: ofacFlagPara(t?.status ?? ''),
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
        pepEnabled: adminForm.pepEnabled, pepValue: adminForm.pepValue,
        pepProvider: PEP_PROVIDER_DEFAULT, pepCountryCode: adminForm.countryCode, pepPosition: null,
        riskEnabled: !!adminForm.riskLevel, riskLevel: adminForm.riskLevel || undefined,
      });
      setAdminResult(r);
      // Status del caso: marca el canal Admin. Si SF también quedó OK → CERRADO.
      if (r.ok) {
        await registrarCierreCanal(sel.id, 'admin', { ok: true, tipologia: adminTipoSel || null }, actor ?? undefined).catch(() => {});
      }
      logCierre(sel, activeQueue, {
        canal: 'ADMIN', ok: r.ok, tipologia: adminTipoSel || null, statusEnviado: adminForm.status,
        ofacFlag: adminForm.ofacFlag, pepEnviado: adminForm.pepEnabled, riskLevel: adminForm.riskLevel || null,
        lastStep: adminForm.lastStep, detalleError: r.ok ? null : (r.error ?? null),
      }, actor ?? undefined);
      // Auditoría — incluye metadata que NO va a la API (changeTicket, requestedBy).
      registrarAuditoria(sel.id, {
        tipo: 'CIERRE_ADMIN', actorId: actor?.uid ?? 'system', actorTipo: actor ? 'USER' : 'SYSTEM',
        correlationId: sel.id, versionCaso: 1,
        metadata: {
          tipologia: adminTipoSel, status: adminForm.status, customerIds: ids, ok: r.ok,
          changeTicket: adminForm.changeTicket, requestedBy: actor?.nombre ?? '',
          pepEnabled: adminForm.pepEnabled, pepValue: adminForm.pepValue, riskLevel: adminForm.riskLevel,
          ofacFlag: adminForm.ofacFlag, ofacProvider: adminForm.ofacProvider,
        },
      }).catch(() => {});
    } catch (e) {
      setAdminResult({ ok: false, results: [], error: e instanceof Error ? e.message : String(e) });
    } finally { setAdminSending(false); setAdminConfirm(false); }
  };

  // ── Consulta de remesa en Redshift (cola Remesa) ────────────────────────────
  const [remesaData, setRemesaData] = useState<RemesaResult | null>(null);
  const [remesaLoading, setRemesaLoading] = useState(false);

  // Al seleccionar un caso de la cola Remesa, muestra la TX. Si ya está cacheada
  // en el caso (o en memoria) NO se vuelve a consultar Redshift: solo se re-consulta
  // con el botón Reconsultar.
  useEffect(() => {
    setRemesaData(null);
    if (activeQueue !== 'remesa' || !sel?.remesa) return;
    const cacheada = (sel.remesaRow as unknown as RemesaRow | undefined) ?? remesaMap[sel.remesa];
    if (cacheada) { setRemesaData({ estado: 'ok', notFound: [], row: cacheada }); return; }
    let cancelado = false;
    setRemesaLoading(true);
    buscarRemesa(sel.remesa)
      .then(r => { if (!cancelado) setRemesaData(r); })
      .catch(e => { if (!cancelado) setRemesaData({ estado: 'error', notFound: [], mensaje: (e as Error).message }); })
      .finally(() => { if (!cancelado) setRemesaLoading(false); });
    return () => { cancelado = true; };
  }, [sel?.id, sel?.remesa, activeQueue]);


  // ── Screening del BENEFICIARIO (cola Remesa) ────────────────────────────────
  // Se dispara cuando ya llegaron los datos de la TX, porque el flujo depende del
  // país del beneficiario: Chile → Regcheq, Colombia → Inspektor, resto → listas.
  const [benefScreen, setBenefScreen] = useState<RemesaScreening | null>(null);
  const [benefLoading, setBenefLoading] = useState(false);
  useEffect(() => {
    setBenefScreen(null);
    const row = remesaData?.estado === 'ok' ? remesaData.row : undefined;
    if (activeQueue !== 'remesa' || !row || !sel) return;
    // Si el caso ya tiene screening guardado, se muestra ese (no se re-consulta).
    const guardado = (sel.screeningBeneficiario as unknown as RemesaScreening | undefined) ?? benefMap[sel.id];
    if (guardado) { setBenefScreen(guardado); return; }
    let cancelado = false;
    setBenefLoading(true);
    screenBeneficiario(row)
      .then(r => {
        if (cancelado) return;
        setBenefScreen(r);
        setBenefMap(prev => ({ ...prev, [sel.id]: r }));
        if (r.estado !== 'error') guardarScreeningBeneficiario(sel.id, r);
      })
      .catch(e => { if (!cancelado) setBenefScreen({ estado: 'error', flujo: flujoDeBeneficiario(row), fuente: '—', decision: '—', delitosUnicos: 0, coincidencias: [], listas: [], mensaje: (e as Error).message }); })
      .finally(() => { if (!cancelado) setBenefLoading(false); });
    return () => { cancelado = true; };
  }, [remesaData, activeQueue]);

  // Screening EN LOTE de los beneficiarios de la cola. Arranca cuando ya llegaron
  // los datos de la TX desde Redshift, porque el flujo depende del país del
  // beneficiario. Concurrencia baja: son APIs externas y el flujo internacional
  // crea la ficha en Regcheq.
  const [benefMap, setBenefMap] = useState<Record<string, RemesaScreening>>({});
  const [benefMapLoading, setBenefMapLoading] = useState(false);

  // Consulta en LOTE de todas las remesas de la cola (para columnas de la tabla).
  const [remesaMap, setRemesaMap] = useState<Record<string, RemesaRow>>({});
  const [remesaMapLoading, setRemesaMapLoading] = useState(false);
  const remesaIdsKey = colas.remesa.map(c => c.remesa).filter(Boolean).join(',');
  useEffect(() => {
    if (activeQueue !== 'remesa') return;
    // Solo se consultan las TX que no están en memoria NI cacheadas en el caso.
    const faltantes = colas.remesa
      .filter(c => c.remesa && !(c.remesa in remesaMap) && !c.remesaRow)
      .map(c => c.remesa);
    if (faltantes.length === 0) return;
    let cancelado = false;
    setRemesaMapLoading(true);
    buscarRemesas(faltantes)
      .then(m => {
        if (cancelado) return;
        setRemesaMap(prev => ({ ...prev, ...m }));
        // Se cachea en UN SOLO commit: escrituras sueltas dispararían un snapshot
        // por caso y la tabla se re-renderiza hasta trabarse.
        guardarRemesaRows(
          colas.remesa
            .filter(c => c.remesa && m[c.remesa])
            .map(c => ({ caseId: c.id, row: m[c.remesa] })),
        );
      })
      .finally(() => { if (!cancelado) setRemesaMapLoading(false); });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, remesaIdsKey]);

  // Fuerza volver a consultar Redshift y las listas para un caso puntual. Es la
  // única forma de refrescar, porque el resultado se cachea hasta el cierre.
  const reconsultarRemesa = async (c: QueuedCaso) => {
    if (!c.remesa) return;
    setRemesaLoading(true); setBenefScreen(null); setBenefLoading(true);
    try {
      const r = await buscarRemesa(c.remesa);
      setRemesaData(r);
      if (r.estado === 'ok' && r.row) {
        setRemesaMap(prev => ({ ...prev, [c.remesa]: r.row! }));
        guardarRemesaRow(c.id, r.row);
        const sc = await screenBeneficiario(r.row);
        setBenefScreen(sc);
        setBenefMap(prev => ({ ...prev, [c.id]: sc }));
        if (sc.estado !== 'error') guardarScreeningBeneficiario(c.id, sc);
      }
    } finally { setRemesaLoading(false); setBenefLoading(false); }
  };

  // Semilla de la cola Remesa desde lo ya cacheado en el caso: la fila de la TX y
  // el screening del beneficiario. Evita volver a pagar Redshift y los proveedores
  // de listas en cada recarga. Se mantiene hasta que el caso se cierre o se borre.
  useEffect(() => {
    const filas: Record<string, RemesaRow> = {};
    const screens: Record<string, RemesaScreening> = {};
    for (const c of casos) {
      const tx = extraerRemesa(c.asunto);
      if (tx && c.remesaRow) filas[tx] = c.remesaRow as unknown as RemesaRow;
      if (screeningVigente(c.screeningBeneficiario)) screens[c.id] = c.screeningBeneficiario as unknown as RemesaScreening;
    }
    // Solo se actualiza el estado si hay algo nuevo: si no, cada snapshot de
    // Firestore crearía objetos nuevos y volvería a renderizar toda la tabla.
    setRemesaMap(prev => {
      const nuevos = Object.keys(filas).filter(k => !(k in prev));
      if (nuevos.length === 0) return prev;
      const next = { ...prev };
      for (const k of nuevos) next[k] = filas[k];
      return next;
    });
    setBenefMap(prev => {
      const nuevos = Object.keys(screens).filter(k => !(k in prev));
      if (nuevos.length === 0) return prev;
      const next = { ...prev };
      for (const k of nuevos) next[k] = screens[k];
      return next;
    });
  }, [casos]);

  // Dispara el screening de los beneficiarios que ya tienen datos de TX y aún no
  // fueron consultados.
  //
  // OJO con las dependencias: la lista de pendientes se achica con cada resultado,
  // así que NO puede ser la llave del efecto. Si lo es, cada screening que termina
  // cambia la llave, el efecto se vuelve a montar, cancela el pool en vuelo y
  // arranca otro con lo que queda: el trabajo a medio hacer se tira, se re-consulta
  // y la cola nunca converge (eso es lo que dejaba la Bandeja pegada). Acá el pool
  // se arranca UNA vez, se marca lo ya tomado en un ref, y al terminar el efecto
  // vuelve a correr para recoger lo que haya quedado.
  const benefRunning = useRef(false);
  const benefTomados = useRef<Set<string>>(new Set());
  // Cambia cuando llegan casos nuevos o filas de TX nuevas, no con cada resultado.
  const benefTriggerKey = `${remesaIdsKey}|${Object.keys(remesaMap).length}`;
  useEffect(() => {
    if (activeQueue !== 'remesa' || benefRunning.current) return;
    const pendientes = colas.remesa.filter(c =>
      c.remesa && remesaMap[c.remesa] && !benefTomados.current.has(c.id)
      && !(c.id in benefMap) && !screeningVigente(c.screeningBeneficiario));
    if (pendientes.length === 0) return;
    benefRunning.current = true;
    pendientes.forEach(c => benefTomados.current.add(c.id));
    setBenefMapLoading(true);
    runPool(pendientes, async c => {
      const row = remesaMap[c.remesa];
      try {
        const r = await screenBeneficiario(row);
        setBenefMap(prev => ({ ...prev, [c.id]: r }));
        // Se cachea en el caso: no se vuelve a consultar en la próxima sesión.
        if (r.estado !== 'error') guardarScreeningBeneficiario(c.id, r);
        else benefTomados.current.delete(c.id);   // error → se puede reintentar
      } catch (e) {
        benefTomados.current.delete(c.id);
        setBenefMap(prev => ({ ...prev, [c.id]: {
          estado: 'error', flujo: flujoDeBeneficiario(row), fuente: '—', decision: '—',
          delitosUnicos: 0, coincidencias: [], listas: [], mensaje: (e as Error).message } }));
      }
    }, 2).finally(() => {
      benefRunning.current = false;
      setBenefMapLoading(false);   // el re-render deja que el efecto tome el resto
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, benefTriggerKey, benefMap]);

  // ── El flujo automático de REMESAS tampoco corre acá ────────────────────────
  // Se movió al mismo Lambda, por los mismos dos motivos que el de OFAC (ver el
  // comentario más abajo). Las reglas siguen siendo las mismas funciones —
  // `evaluarRemesaAuto` de `services/flujoDecision.ts`— incluido que la marca PEP
  // del beneficiario NO retiene una remesa, que es la diferencia con OFAC y lo que
  // se habría perdido si el Lambda las reimplementara.

  // ── Recuperación de la cola desde Salesforce ────────────────────────────────
  // El receptor solo empuja: si la Bandeja se vacía, los casos que siguen abiertos
  // en Salesforce no vuelven solos. Acá se consulta Salesforce y se reconstruyen.
  // Es en dos pasos a propósito: primero se muestra QUÉ hay y recién con la
  // confirmación se escribe, para no meter cientos de casos sin querer.
  type ImpEstado = 'idle' | 'validando' | 'listo' | 'importando' | 'error';
  const [impEstado, setImpEstado] = useState<ImpEstado>('idle');
  const [impMsg, setImpMsg] = useState('');
  const [impRemotos, setImpRemotos] = useState<CasoSFRemoto[]>([]);

  const validarCasosSF = async () => {
    setImpEstado('validando'); setImpMsg(''); setImpRemotos([]);
    try {
      const remotos = await traerCasosCola();
      setImpRemotos(remotos);
      setImpEstado(remotos.length > 0 ? 'listo' : 'error');
      if (remotos.length === 0) setImpMsg('Salesforce no devolvió casos abiertos en las colas de trabajo.');
    } catch (e) {
      setImpEstado('error');
      setImpMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // Qué colas se importan. La cola "Compliance" de Salesforce mezcla las remesas
  // del bot con casos de otro tipo, así que se puede elegir para no llenar la
  // Bandeja de casos que no se gestionan acá.
  const [impColas, setImpColas] = useState<Record<QueueKey, boolean>>({ ofac: true, remesa: true, otros: true });

  // Desglose de lo encontrado: por cola de la Bandeja y cuántos ya están.
  const impResumen = useMemo(() => {
    const enBandeja = new Set(casos.map(c => c.id));
    const porCola: Record<QueueKey, number> = { ofac: 0, remesa: 0, otros: 0 };
    const elegidos: CasoSFRemoto[] = [];
    let nuevos = 0;
    for (const r of impRemotos) {
      const q = clasificar({ asunto: r.asunto } as QueuedCaso);   // clasificar solo mira el asunto
      porCola[q]++;
      if (!impColas[q]) continue;
      elegidos.push(r);
      if (!enBandeja.has(r.numeroCaso.replace(/\//g, '-'))) nuevos++;
    }
    return { porCola, nuevos, elegidos, total: impRemotos.length, enBandeja };
  }, [impRemotos, casos, impColas]);

  const confirmarImportacion = async () => {
    setImpEstado('importando');
    try {
      const r = await importarCasos(impResumen.elegidos, impResumen.enBandeja);
      setImpEstado('idle');
      setImpRemotos([]);
      setImpMsg(`✅ ${r.nuevos} caso(s) nuevo(s) y ${r.actualizados} actualizado(s).`);
    } catch (e) {
      setImpEstado('error');
      setImpMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // ── Cierre en Admin de la cola REMESA (libera la transacción) ───────────────
  const [remesaAdminTipo, setRemesaAdminTipo] = useState('');
  const [remesaAdminIds, setRemesaAdminIds] = useState('');
  const [remesaAdminBy, setRemesaAdminBy] = useState('');
  const [remesaAdminTicket, setRemesaAdminTicket] = useState('');
  const [remesaAdminConfirm, setRemesaAdminConfirm] = useState(false);
  const [remesaAdminSending, setRemesaAdminSending] = useState(false);
  const [remesaAdminMsg, setRemesaAdminMsg] = useState('');

  // Al cambiar de caso se pre-llena con el N° de transacción del asunto y el
  // usuario logueado, y se limpia lo de la ficha anterior.
  useEffect(() => {
    setRemesaAdminTipo(TIPOS_CIERRE_REMESA[0]?.id ?? '');
    setRemesaAdminIds(sel?.remesa ?? '');
    setRemesaAdminBy(actor?.email ?? actor?.nombre ?? '');
    setRemesaAdminTicket('');
    setRemesaAdminConfirm(false);
    setRemesaAdminMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const enviarRemesaAdmin = async () => {
    const tipo = tipoRemesaPorId(remesaAdminTipo);
    const ids = remesaAdminIds.split(',').map(s => s.trim()).filter(Boolean);
    if (!tipo || !sel || ids.length === 0) return;
    setRemesaAdminSending(true); setRemesaAdminMsg('');
    try {
      const r = await enviarCierreRemesaAdmin({
        transactionIds: ids,
        targetStatusDB: tipo.statusDB,
        targetStatusLabel: tipo.statusLabel,
        requestedBy: remesaAdminBy,
        changeTicket: remesaAdminTicket,
      });
      setRemesaAdminMsg(resumenRemesaAdmin(r));
      if (r.ok) {
        // Mismo circuito que OFAC: el canal cerrado saca el caso de la cola
        // cuando ambos (SF + Admin) quedaron OK.
        await registrarCierreCanal(sel.id, 'admin', { ok: true, tipologia: tipo.id }, actor ?? undefined).catch(() => {});
      }
      logCierre(sel, clasificar(sel), {
        canal: 'ADMIN', ok: r.ok, tipologia: tipo.id, statusEnviado: tipo.statusDB,
        detalleError: r.ok ? null : (r.error ?? null),
      });
      // Auditoría de la liberación, con la transacción y la evidencia.
      const primero = r.results[0];
      logLiberacionRemesa(sel, {
        transaccionId: ids[0] ?? null, tipologia: tipo.id,
        adminOk: r.ok, adminOmitido: primero?.omitido ?? false,
        estadoAnterior: primero?.estadoAnterior ?? null,
        estadoNuevo: r.ok ? tipo.statusDB : null,
        sfOk: sel.cierres?.sf?.ok,
        requestedBy: remesaAdminBy || null, changeTicket: remesaAdminTicket || null,
        detalleError: r.ok ? null : (r.error ?? primero?.detalle ?? null),
      }, remesaMap[sel.remesa], benefMap[sel.id], actor ?? undefined);
      registrarAuditoria(sel.id, {
        tipo: 'CIERRE_ADMIN_REMESA', actorId: actor?.uid ?? 'system', actorTipo: actor ? 'USER' : 'SYSTEM',
        correlationId: sel.id, versionCaso: 1,
        metadata: {
          tipologia: tipo.id, statusDB: tipo.statusDB, transactionIds: ids, ok: r.ok,
          // requestedBy/changeTicket NO viajan a la API (el script de referencia
          // manda el objeto de la transacción tal cual): quedan como trazabilidad.
          requestedBy: remesaAdminBy, changeTicket: remesaAdminTicket,
          resultados: r.results,
        },
      }).catch(() => {});
    } catch (e) {
      setRemesaAdminMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRemesaAdminSending(false);
      setRemesaAdminConfirm(false);
    }
  };

  // Se dibuja en la barra de colas y también en el estado vacío.
  const botonTraerSF = (
    <button
      onClick={validarCasosSF}
      disabled={impEstado === 'validando' || impEstado === 'importando'}
      title="Consulta Salesforce y trae los casos abiertos de las colas de trabajo"
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-colors bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-sky-300 disabled:opacity-60"
    >
      {impEstado === 'validando' ? '⏳ Consultando…'
        : impEstado === 'importando' ? '⏳ Importando…'
        : '📡 Traer casos de Salesforce'}
    </button>
  );

  // ── Screening criminal EN VIVO de la cola OFAC/PEP ──────────────────────────
  // Chile → Regcheq (solo DNI) + motor de decisión. Colombia queda pendiente
  // (Inspektor). Se procesa cada caso apenas cae, incrementalmente.
  const [screenMap, setScreenMap] = useState<Record<string, ScreeningState>>({});

  // Aplica un resultado al estado y lo PERSISTE en Firestore (salvo errores, que se
  // reintentan la próxima vez). Compartido entre analistas y sobrevive recargas.
  const aplicarScreening = (caso: QueuedCaso, r: CasoScreening) => {
    setScreenMap(prev => ({ ...prev, [caso.id]: { estado: r.estado, fuente: r.fuente, delitosUnicos: r.delitosUnicos, decision: r.decision, razon: r.razon, coincidencias: r.coincidencias, pep: r.pep, otrasListas: r.otrasListas, mensaje: r.mensaje } }));
    if (r.estado === 'error') {
      // El error NO se cachea (así se reintenta), pero SÍ se registra: antes los
      // fallos no dejaban rastro en ninguna parte y un caso que fallaba se veía
      // igual que uno que nunca se consultó. Se libera para el próximo intento.
      ofacTomados.current.delete(caso.id);
      logScreening(caso, clasificar(caso), {
        fuente: r.fuente, estado: 'error',
        decision: (r.mensaje ?? 'error sin detalle').slice(0, 200),
        delitosUnicos: 0,
      });
    }
    if (r.estado !== 'error') {
      // Persiste v2: alertas normalizadas + dedupeadas (merge con las previas para
      // conservar `creadaEn`); mantiene los campos legacy para la UI actual.
      const screenedAt = new Date().toISOString();
      const norm = normalizarScreening(r, caso, screenedAt);
      const alertas = mergeAlertas((caso.screening?.alertas as AlertaScreening[]) ?? [], norm.alertas);
      guardarScreening(caso.id, {
        schemaVersion: SCREENING_SCHEMA,
        estado: r.estado, fuente: r.fuente, delitosUnicos: r.delitosUnicos,
        decision: r.decision, razon: r.razon, coincidencias: r.coincidencias, pep: r.pep,
        otrasListas: r.otrasListas, alertas,
      }).catch(() => {});
      // Espejo analítico: deja la conclusión del motor y si el caso quedó retenido
      // por delito sensible (lo que hay que poder auditar con el flujo automático).
      logScreening(caso, clasificar(caso), {
        fuente: r.fuente, estado: r.estado, decision: r.decision,
        delitosUnicos: r.delitosUnicos, pep: r.pep,
        categoriasSensibles: retenidoPorDelito(r),
        coincidencias: r.coincidencias,
      });
    }
  };

  // Semilla desde el screening ya guardado (evita re-consultar las listas al recargar).
  useEffect(() => {
    setScreenMap(prev => {
      let changed = false;
      const next = { ...prev };
      for (const c of casos) {
        if (screeningVigente(c.screening) && c.screening && !(c.id in next)) {
          const sc = c.screening;
          next[c.id] = { estado: (sc.estado as ScreeningState['estado']) ?? 'ok', fuente: sc.fuente, delitosUnicos: sc.delitosUnicos, decision: sc.decision, razon: sc.razon, coincidencias: sc.coincidencias as Coincidencia[] | undefined, pep: sc.pep, otrasListas: sc.otrasListas as ScreeningState['otrasListas'] };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [casos]);

  // Control de la tanda de screening de OFAC (ver el comentario del efecto).
  const ofacRunning = useRef(false);
  const ofacTomados = useRef<Set<string>>(new Set());
  const [ofacRun, setOfacRun] = useState(0);

  const ofacIdsKey = colas.ofac.map(c => c.id).join(',');
  useEffect(() => {
    if (activeQueue !== 'ofac' || ofacRunning.current) return;
    // Ojo: `screenMap` puede estar vacío todavía aunque el caso ya tenga screening
    // guardado (la semilla se aplica en el mismo commit y el estado aún no se
    // actualizó). Por eso se mira TAMBIÉN `c.screening`: si no, se re-consultan
    // las listas en cada recarga, que es lento y se cobra por consulta.
    //
    // El pendiente se decide con un ref, NO con screenMap: antes el efecto marcaba
    // todos los pendientes como 'loading' de una y, si se remontaba a mitad de la
    // tanda (basta que llegue o se cierre un caso: cambia ofacIdsKey), el pool en
    // vuelo se cancelaba y los que no habían alcanzado a procesarse quedaban
    // marcados 'loading' para siempre. Al estar ya en screenMap, la corrida
    // siguiente los daba por hechos y NUNCA se consultaban: la celda se quedaba
    // en "…" y parecía que el proveedor no respondía.
    const pendientes = colas.ofac.filter(c =>
      !ofacTomados.current.has(c.id) && !(c.id in screenMap) && !screeningVigente(c.screening));
    if (pendientes.length === 0) return;

    ofacRunning.current = true;
    pendientes.forEach(c => ofacTomados.current.add(c.id));

    // Estado inicial: loading para los screeneables (Chile/Colombia), 'na' para el resto.
    setScreenMap(prev => {
      const next = { ...prev };
      for (const c of pendientes) next[c.id] = { estado: esScreenable(c) ? 'loading' : 'na' };
      return next;
    });

    // Procesa por País (Chile→Regcheq, Colombia→Inspektor) con concurrencia limitada.
    const aProcesar = pendientes.filter(esScreenable);
    runPool(aProcesar, async c => {
      try {
        aplicarScreening(c, await screenCaso(c));
      } catch (e) {
        // Un fallo no puede dejar el caso colgado: se libera para reintentarlo.
        ofacTomados.current.delete(c.id);
        setScreenMap(prev => ({ ...prev, [c.id]: { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) } }));
      }
    }, 4).finally(() => {
      ofacRunning.current = false;
      setOfacRun(n => n + 1);   // re-render: el efecto vuelve a tomar lo que quedó
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, ofacIdsKey, ofacRun]);

  // ── El flujo automático de OFAC ya NO corre acá ─────────────────────────────
  // Antes vivía en este archivo, en un `useEffect` con un intervalo de 30 s. Se
  // movió al Lambda `lens-flujo-autonomo` por dos razones:
  //
  //   1. Solo corría con la pestaña abierta. Los casos llegaban igual —el receptor
  //      es un Lambda— y se acumulaban hasta que alguien entraba a la app.
  //   2. Y cuando SÍ había pestañas abiertas, había más de un ejecutor. Medido en
  //      producción: 61 casos cerrados dos veces entre el 16 y el 25 de agosto,
  //      separados por 0,1 a 9,6 segundos. Los dos mandaron su update a
  //      Salesforce. El guard era un ref por pestaña, así que no podía verlo.
  //
  // Un solo ejecutor elimina eso por diseño, sin candados que puedan fallar. Las
  // reglas son las mismas: el Lambda importa `evaluarCasoAuto` de
  // `services/flujoDecision.ts`, el mismo módulo que usa esta pantalla para
  // mostrar qué haría el flujo con cada caso.
  //
  // Lo que la app conserva: mostrar la decisión, el botón «Correr ahora» para no
  // esperar el próximo tick, y el cierre MANUAL de un caso tomado — que no puede
  // chocar con el Lambda, porque el Lambda saltea los casos asignados.

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
    const estado = (c.estadoCaso as EstadoCaso) ?? 'NUEVO';
    const asignado = c.asignacion?.analistaNombre ?? '';
    const asignadoId = c.asignacion?.analistaId ?? '';
    const tieneCoinc = (screenMap[c.id]?.delitosUnicos ?? 0) > 0;
    const prioridad = (c.prioridad as PrioridadCaso) ?? calcularPrioridadPreliminar(tipo, tieneCoinc);
    const versionCaso = c.versionCaso ?? 1;
    const status = statusDeCaso(c);
    return { tipo, estado, prioridad, asignado, asignadoId, versionCaso, status };
  };

  const prioColor = (p: PrioridadCaso): string =>
    p === 'CRITICA' ? 'text-red-600 dark:text-red-400'
      : p === 'ALTA' ? 'text-orange-600 dark:text-orange-400'
        : p === 'MEDIA' ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-500 dark:text-slate-400';

  const statusColor = (s: StatusCaso): string =>
    s === 'CERRADO' ? 'text-emerald-600 dark:text-emerald-400'
      : s === 'GESTIONANDO' ? 'text-sky-600 dark:text-sky-400'
        : 'text-slate-500 dark:text-slate-400';

  const conAccion = async (fn: () => Promise<void>) => {
    if (!actor) { setAccionMsg('Sesión no disponible.'); return; }
    setAccionEnCurso(true); setAccionMsg(null);
    try { await fn(); }
    catch (e) {
      // "Ya lo tiene otro analista" no es un error del sistema: es el resultado
      // de la reserva funcionando. Se muestra distinto para que no se lea como
      // una falla y se reintente.
      const err = e as Error;
      setAccionMsg(err.name === 'CasoYaTomado'
        ? `🔒 ${err.message}. Refrescá para ver quién lo tiene.`
        : err.message);
    }
    finally { setAccionEnCurso(false); }
  };
  const doTomar = (c: QueuedCaso) => conAccion(() => tomarCaso({ id: c.id, estadoCaso: vistaOp(c).estado, versionCaso: vistaOp(c).versionCaso }, actor!));
  const doLiberar = (c: QueuedCaso) => conAccion(() => liberarCaso({ id: c.id, estadoCaso: vistaOp(c).estado, versionCaso: vistaOp(c).versionCaso }, actor!));
  const doEstado = (c: QueuedCaso, nuevo: EstadoCaso) => conAccion(() => cambiarEstado({ id: c.id, estadoCaso: vistaOp(c).estado, versionCaso: vistaOp(c).versionCaso }, nuevo, actor!));
  const doPrioridad = (c: QueuedCaso, nueva: PrioridadCaso) => conAccion(() => cambiarPrioridad({ id: c.id, prioridadActual: vistaOp(c).prioridad, versionCaso: vistaOp(c).versionCaso }, nueva, actor!));
  const doStatus = (c: QueuedCaso, nuevo: StatusCaso) => conAccion(async () => {
    const anterior = vistaOp(c).status;
    await setStatusCaso(c.id, nuevo, actor!);
    logHistorial(c, 'STATUS', anterior, nuevo, actor ?? undefined);
  });

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

  // Valores distintos por columna (para los desplegables de filtro), tomados de la cola.
  const opcionesFiltro = useMemo(() => {
    const base = colas[activeQueue];
    const uniq = (arr: string[]) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    return {
      pais: uniq(base.map(c => c.pais)),
      estado: uniq(base.map(c => vistaOp(c).estado)),
      prioridad: uniq(base.map(c => vistaOp(c).prioridad)),
      conclusion: uniq(base.map(c => screenMap[c.id]?.decision || '')),
      tipoEnvio: uniq(base.map(c => (c.remesa ? remesaMap[c.remesa]?.tipo_envio : '') || '')),
      flujoBenef: uniq(base.map(c => benefMap[c.id]?.flujo || '')),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colas, activeQueue, screenMap, remesaMap, benefMap]);

  // Filtros por columna (tipo Excel): se combinan en AND con el buscador global.
  const cumpleFiltros = (c: QueuedCaso): boolean => {
    if (filtros.pais && (c.pais || '') !== filtros.pais) return false;
    if (filtros.estado && vistaOp(c).estado !== filtros.estado) return false;
    if (filtros.status && vistaOp(c).status !== filtros.status) return false;
    if (filtros.tipoEnvio && ((c.remesa ? remesaMap[c.remesa]?.tipo_envio : '') || '') !== filtros.tipoEnvio) return false;
    if (filtros.flujoBenef && (benefMap[c.id]?.flujo || '') !== filtros.flujoBenef) return false;
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
        case 'benefdni': return remesaMap[c.remesa]?.beneficiary_dni || '';
        case 'beneftipodni': return remesaMap[c.remesa]?.beneficiary_dni_type || '';
        case 'benefpais': return remesaMap[c.remesa]?.beneficiary_country_name || '';
        case 'customerid': return remesaMap[c.remesa]?.customer_id ?? idInterno(c);
        case 'correocliente': return correoCliente(c);
        case 'nombrecliente': return nombreCompleto(c);
        case 'benefflujo': return benefMap[c.id]?.flujo || '';
        case 'benefconclusion': return benefMap[c.id]?.decision || '';
        case 'benefhallazgos': {
          const b = benefMap[c.id];
          return b ? (b.flujo === 'INTL' ? b.listas.length : b.delitosUnicos) : -1;
        }
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
        case 'status': return vistaOp(c).status;
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
      // Status del caso: marca el canal SF. Si Admin también quedó OK → CERRADO.
      if (yaEnviada || sf?.ok) {
        await registrarCierreCanal(sel.id, 'sf', { ok: true, tipologia: tipoCierreSel || null }, actor ?? undefined).catch(() => {});
      }
      logCierre(sel, activeQueue, {
        canal: 'SF', ok: !!(yaEnviada || sf?.ok), tipologia: tipoCierreSel || null,
        httpStatus: sf?.status ?? null, detalleError: sf?.ok === false ? (sf.errors?.join('; ') ?? null) : null,
      }, actor ?? undefined);
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
        <div className="flex items-center gap-2">
          {/* Notificaciones del analista (asignaciones) */}
          <div className="relative">
            <button
              onClick={() => { setShowNotis(v => !v); if (notisSinLeer.length) marcarTodasLeidas(notisSinLeer.map(n => n.id)); }}
              title="Notificaciones"
              className="relative text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              🔔
              {notisSinLeer.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
                  {notisSinLeer.length}
                </span>
              )}
            </button>
            {showNotis && (
              <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto z-30 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl p-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-black text-slate-700 dark:text-slate-200">Notificaciones</span>
                  <button onClick={() => setShowNotis(false)} className="text-[11px] text-slate-400 hover:text-slate-600">cerrar</button>
                </div>
                {notis.length === 0 && <p className="text-xs text-slate-400 px-2 py-3">Sin notificaciones.</p>}
                {notis.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { marcarLeida(n.id); if (n.casos?.[0]) { setFiltroCol('numeroCaso', n.casos[0]); setShowNotis(false); } }}
                    className={`w-full text-left rounded-lg px-2 py-2 mb-1 border ${n.leida
                      ? 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/40'
                      : 'border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-950/30'}`}
                  >
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{n.titulo}</p>
                    {n.detalle && <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{n.detalle}</p>}
                    {n.casos?.length ? (
                      <p className="text-[10px] text-slate-400 mt-1 truncate">{n.casos.slice(0, 6).join(' · ')}{n.casos.length > 6 ? ` +${n.casos.length - 6}` : ''}</p>
                    ) : null}
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtFecha(n.creadaEn)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={onToggleDarkMode} className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
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
          <span className="ml-auto">{botonTraerSF}</span>
          {/* Mantenedor del flujo automático */}
          <button
            onClick={abrirFlujo}
            title="Prender/apagar el cierre automático de las colas"
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
              flujoCfg.ofac.enabled || flujoCfg.remesa.enabled
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-300'}`}
          >
            <span>{showFlujo ? '▾' : '▸'}</span> ⚙️ Flujo automático
            <span className={`px-1.5 py-0.5 rounded-full ${flujoCfg.ofac.enabled || flujoCfg.remesa.enabled ? 'bg-white/25' : 'bg-slate-100 dark:bg-slate-700'}`}>
              {flujoCfg.ofac.enabled || flujoCfg.remesa.enabled
                ? `ON: ${[flujoCfg.ofac.enabled && 'OFAC', flujoCfg.remesa.enabled && 'Remesas'].filter(Boolean).join(' + ')}`
                : 'OFF'}
            </span>
          </button>
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> en vivo
          </span>
        </div>
      )}

      {/* Recuperación desde Salesforce: qué se encontró y confirmación */}
      {(impEstado === 'listo' || impEstado === 'error' || impMsg) && (
        <div className={`mb-4 rounded-2xl border p-4 ${impEstado === 'error'
          ? 'border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30'
          : 'border-sky-200 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-950/30'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800 dark:text-slate-200">📡 Casos abiertos en Salesforce</p>
              {impEstado === 'listo' ? (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Se encontraron <b>{impResumen.total}</b> caso(s) abiertos en las colas de trabajo.
                    Elegí cuáles traer:
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    {QUEUES.map(q => (
                      <label key={q.key} className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={impColas[q.key]}
                          onChange={e => setImpColas(v => ({ ...v, [q.key]: e.target.checked }))}
                          className="accent-sky-600"
                        />
                        {q.label} <b>{impResumen.porCola[q.key]}</b>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                    <b>{impResumen.nuevos}</b> de los seleccionados no están en la Bandeja. Los que ya
                    están se actualizan conservando screening, asignación y cierres.
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{impMsg}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {impEstado === 'listo' && (
                <button
                  onClick={confirmarImportacion}
                  className="text-xs font-bold px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white"
                >
                  Traer {impResumen.elegidos.length} a la Bandeja
                </button>
              )}
              <button
                onClick={() => { setImpEstado('idle'); setImpRemotos([]); setImpMsg(''); }}
                className="text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ficha de configuración del flujo automático */}
      {showFlujo && !loading && !error && (() => {
        const sw = (on: boolean) => `relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`;
        const knob = (on: boolean) => `absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`;
        const selCls = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs outline-none focus:border-amber-400';
        const setOfac = (patch: Partial<FlujoConfig['ofac']>) => setFlujoDraft(d => ({ ...d, ofac: { ...d.ofac, ...patch } }));
        const sinCambios = JSON.stringify(flujoDraft.ofac) === JSON.stringify(flujoCfg.ofac)
          && flujoDraft.remesa.enabled === flujoCfg.remesa.enabled;
        return (
          <div className="mb-4 rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/20 p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-black text-amber-800 dark:text-amber-300">⚙️ Flujo automático de las colas</h3>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                  Con el flujo prendido los casos se cierran <b>solos</b> (sin revisión del analista) aplicando su tipología.
                  Las conclusiones de <b>revisión</b> nunca se automatizan.
                </p>
              </div>
              <button onClick={() => setShowFlujo(false)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700">Cerrar</button>
            </div>

            {!flujoConfigDisponible() && (
              <p className="text-xs text-red-600 dark:text-red-400 mb-3">Firestore no está configurado: la config no se puede guardar en esta instancia.</p>
            )}

            {/* Campos que se están resolviendo con el default. Importa porque el
                flujo desatendido corre sin nadie mirando: si el doc quedó
                incompleto, acá se ve, que es donde está quien puede arreglarlo.
                Guardar completa el doc y el aviso desaparece. */}
            {flujoCamposAusentes.length > 0 && (
              <p className="text-xs text-amber-800 dark:text-amber-300 mb-3 bg-amber-100/70 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700/60 rounded-lg px-3 py-2">
                ⚠️ Estos campos no están en la configuración guardada y se están usando por defecto:{' '}
                <b>{flujoCamposAusentes.join(', ')}</b>. Guardá la config para dejarlos explícitos.
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Cola OFAC */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3">
                <button onClick={() => setOfac({ enabled: !flujoDraft.ofac.enabled })} className="flex items-center gap-2 mb-3 w-full text-left">
                  <span className={sw(flujoDraft.ofac.enabled)}><span className={knob(flujoDraft.ofac.enabled)} /></span>
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Coincidencia OFAC</span>
                  <span className={`text-[11px] font-bold ${flujoDraft.ofac.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {flujoDraft.ofac.enabled ? 'AUTOMÁTICO' : 'MANUAL'}
                  </span>
                </button>
                <div className="space-y-2 text-xs">
                  {/* Activación por país: se prende de a uno (Chile primero). */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                    <p className="font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Países habilitados</p>
                    <div className="flex flex-wrap gap-3">
                      {PAISES_FLUJO.map(p => (
                        <label key={p.code} className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={flujoDraft.ofac.paises?.[p.code] === true}
                            onChange={e => setOfac({ paises: { ...flujoDraft.ofac.paises, [p.code]: e.target.checked } })}
                            className="w-3.5 h-3.5"
                          />
                          {p.label} <span className="text-slate-400">({p.code})</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
                      Un caso solo se automatiza si su país está prendido. Los países sin screening nunca entran.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={flujoDraft.ofac.cerrarSF} onChange={e => setOfac({ cerrarSF: e.target.checked })} className="w-3.5 h-3.5" />
                    Cerrar en Salesforce
                  </label>
                  <label className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={flujoDraft.ofac.cerrarAdmin} onChange={e => setOfac({ cerrarAdmin: e.target.checked })} className="w-3.5 h-3.5" />
                    Cerrar en Admin (bloqueo/desbloqueo del cliente)
                  </label>
                  <div className="pt-1 space-y-1.5">
                    <p className="font-semibold text-slate-500 dark:text-slate-400">Tipología según la conclusión del screening</p>
                    {([
                      ['Liberar', 'tipoLiberarNormal'],
                      ['Liberar UCR', 'tipoLiberarUcr'],
                      ['Fully Blocked', 'tipoBloquear'],
                    ] as const).map(([label, key]) => (
                      <label key={key} className="flex items-center justify-between gap-2">
                        <span className="text-slate-600 dark:text-slate-300">{label} →</span>
                        <select value={flujoDraft.ofac[key]} onChange={e => setOfac({ [key]: e.target.value } as Partial<FlujoConfig['ofac']>)} className={selCls}>
                          {TIPOS_CIERRE.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cola Remesas */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3">
                {(() => {
                  const setRem = (patch: Partial<FlujoConfig['remesa']>) =>
                    setFlujoDraft(d => ({ ...d, remesa: { ...d.remesa, ...patch } }));
                  return (
                    <>
                      <button onClick={() => setRem({ enabled: !flujoDraft.remesa.enabled })} className="flex items-center gap-2 mb-3 w-full text-left">
                        <span className={sw(flujoDraft.remesa.enabled)}><span className={knob(flujoDraft.remesa.enabled)} /></span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Remesas</span>
                        <span className={`text-[11px] font-bold ${flujoDraft.remesa.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          {flujoDraft.remesa.enabled ? 'AUTOMÁTICO' : 'MANUAL'}
                        </span>
                      </button>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-xs">
                          <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Tipología activa</span>
                          <select
                            value={flujoDraft.remesa.tipoLiberar}
                            onChange={e => setRem({ tipoLiberar: e.target.value })}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
                          >
                            {TIPOS_CIERRE_REMESA.map(t => (
                              <option key={t.id} value={t.id}>{t.label} — {t.statusDB}</option>
                            ))}
                          </select>
                        </label>
                        <div className="text-xs">
                          <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Canales que cierra</span>
                          <div className="flex items-center gap-4 h-[34px]">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={flujoDraft.remesa.cerrarSF} onChange={e => setRem({ cerrarSF: e.target.checked })} className="accent-sky-600" />
                              Salesforce
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="checkbox" checked={flujoDraft.remesa.cerrarAdmin} onChange={e => setRem({ cerrarAdmin: e.target.checked })} className="accent-rose-600" />
                              Admin (libera la transacción)
                            </label>
                          </div>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                        Con el switch prendido, un caso de remesa se cierra solo cuando el screening del
                        beneficiario no arroja coincidencias. <b>Cualquier coincidencia lo deja al analista</b>,
                        y los delitos sensibles lo <b>retienen siempre</b> (igual que en OFAC).
                        A diferencia de OFAC, la marca <b>PEP del beneficiario NO retiene</b> la remesa:
                        acá se libera una transacción, no se vincula a un cliente.
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Freno duro: no es configurable a propósito. */}
            <div className="mt-3 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50/70 dark:bg-red-950/20 p-3">
              <p className="text-xs font-bold text-red-800 dark:text-red-300">🛑 Qué retiene siempre el caso</p>
              <p className="text-[11px] text-red-700 dark:text-red-400 mt-1">
                Si el screening trae un delito de estas categorías <b>o el cliente es PEP</b>, el caso
                <b> no se cierra automáticamente</b> (ni en Salesforce ni en Admin) aunque la conclusión diga liberar.
                Queda para el analista. Regla fija, no se puede desactivar desde acá.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {CATEGORIAS_SENSIBLES.map(c => (
                  <span key={c.id} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300">
                    {c.label}
                  </span>
                ))}
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300">
                  Coincidencia PEP
                </span>
              </div>
            </div>

            {/* Sincronización diaria: el cluster se pausa 18:30–04:00 (hora Chile), así
                que los cierres de esa ventana NO llegan a Redshift. Este botón los
                recupera; por eso está siempre visible. */}
            <div className="mt-3 rounded-xl border border-sky-200 dark:border-sky-800/50 bg-sky-50/70 dark:bg-sky-950/20 p-3">
              <p className="text-xs font-bold text-sky-800 dark:text-sky-300">🔄 Sincronizar histórico a Redshift</p>
              <p className="text-[11px] text-sky-700 dark:text-sky-400 mt-1">
                El cluster se pausa entre <b>18:30 y 04:00</b>: lo que se cierre en esa ventana
                (incluido el flujo automático) <b>no llega solo</b>. Apretá esto cada mañana para
                recuperarlo. Incluye los casos ya cerrados y es idempotente: no duplica.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <button onClick={sincronizarHistorico} disabled={backfillRun || casos.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-bold">
                  {backfillRun ? 'Sincronizando…' : `Sincronizar ${casos.length} caso(s)`}
                </button>
                {backfillMsg && <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{backfillMsg}</span>}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={guardarFlujo}
                disabled={flujoSaving || sinCambios || !flujoConfigDisponible()}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-bold"
              >
                {flujoSaving ? 'Guardando…' : 'Guardar configuración'}
              </button>
              {!sinCambios && <span className="text-[11px] text-amber-700 dark:text-amber-400">Hay cambios sin guardar.</span>}
              {flujoMsg && <span className={`text-xs ${flujoMsg.includes('✓') ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{flujoMsg}</span>}
            </div>
          </div>
        );
      })()}

      {pendientes > 0 && !loading && !error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
          <span className="font-semibold">⏳ {pendientes} registro(s) de log esperando a Redshift</span>
          <span className="text-[11px] opacity-80">Se reenvían solos cuando el cluster vuelve (reintento cada 5 min).</span>
        </div>
      )}

      {autoMsg && !loading && !error && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 text-sm text-emerald-800 dark:text-emerald-300">
          <span className="font-semibold">🤖 {autoMsg}</span>
          <button onClick={() => setAutoMsg(null)} className="ml-auto text-xs underline opacity-80">ocultar</button>
        </div>
      )}

      {/* El flujo corre en el Lambda, no acá. Esta barra es lo único que lo hace
          visible, y tiene que distinguir tres cosas que antes se veían iguales:
          el flujo apagado, el flujo trabado, y el flujo trabajando.

          El LATIDO se escribe en cada invocación corra o no, así que dice si el
          proceso está vivo. La ÚLTIMA CORRIDA dice qué hizo la última vez que
          efectivamente procesó. Antes solo había lo segundo, y con los switches
          apagados el mensaje quedó clavado un día entero en la corrida de ayer. */}
      {!loading && !error && (
        <div className="mb-4 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/60 dark:bg-indigo-950/30 px-4 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold text-indigo-800 dark:text-indigo-300">Flujo automático</span>

            {/* Vivo o no. Sin latido reciente, el proceso no está corriendo. */}
            {latido ? (
              <span className={latido.corrio === false && /apagado/.test(latido.motivo ?? '')
                ? 'text-slate-500 dark:text-slate-400'
                : 'text-emerald-700 dark:text-emerald-400 font-semibold'}>
                {latido.corrio === false
                  ? `⏸️ ${latido.motivo ?? 'no corrió'} · revisado ${haceCuanto(latido.en)}`
                  : `▶️ activo · última revisión ${haceCuanto(latido.en)}`}
              </span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400">sin señal del proceso todavía</span>
            )}

            <button
              onClick={correrAhora}
              disabled={corriendoFlujo || !disparadorDisponible()}
              title={disparadorDisponible()
                ? 'Corre el flujo ahora, sin esperar el próximo tick del cron'
                : 'Falta configurar el proxy'}
              className="ml-auto px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold"
            >
              {corriendoFlujo ? 'Corriendo…' : 'Correr ahora'}
            </button>
          </div>

          {ultimaCorrida && (() => {
            const problema = corridaConProblema(ultimaCorrida);
            const seg = Math.round((ultimaCorrida.duracionMs ?? 0) / 1000);
            const det = [...(ultimaCorrida.detalle ?? []), ...(ultimaCorrida.remesa?.detalle ?? [])];
            const cerrados = det.filter(d => d.accion === 'cerrado');
            const retenidos = det.filter(d => d.accion === 'retenido');
            return (
              <div className="mt-1.5 pt-1.5 border-t border-indigo-200/70 dark:border-indigo-800/40">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300">
                  <span>
                    última corrida {haceCuanto(ultimaCorrida.en)}
                    {ultimaCorrida.origen ? ` (${ultimaCorrida.origen})` : ''}
                    {seg ? ` · ${seg}s` : ''}
                    {' · '}OFAC {ultimaCorrida.cerrados ?? 0}/{ultimaCorrida.casosEnCola ?? 0} cerrado(s)
                    {ultimaCorrida.remesa ? ` · remesas ${ultimaCorrida.remesa.cerradas ?? 0}/${ultimaCorrida.remesa.enCola ?? 0}` : ''}
                    {(ultimaCorrida.remesa?.omitidas ?? 0) > 0
                      ? ` (${ultimaCorrida.remesa?.omitidas} en espera: la base de transacciones pausa de 18:30 a 04:00)`
                      : ''}
                  </span>
                  {/* Cuánto leyó: es el número que hizo que se agotara la cuota de
                      Firestore por no estar mirándolo. */}
                  {ultimaCorrida.lecturas != null && (
                    <span className="text-slate-500 dark:text-slate-400">
                      {ultimaCorrida.lecturas} lectura(s){ultimaCorrida.modoLectura ? ` · ${ultimaCorrida.modoLectura}` : ''}
                    </span>
                  )}
                  {problema && (
                    <span className="font-semibold text-amber-800 dark:text-amber-300">⚠️ {problema}</span>
                  )}
                  {det.length > 0 && (
                    <button
                      onClick={() => setVerDetalleCorrida(v => !v)}
                      className="text-indigo-700 dark:text-indigo-400 underline"
                    >
                      {verDetalleCorrida ? 'ocultar' : `ver los ${det.length} caso(s)`}
                    </button>
                  )}
                </div>

                {/* QUÉ pasó con CADA caso. El dato ya se guardaba y no se mostraba
                    en ninguna parte: había que abrir Firestore para saber por qué
                    un caso no se liberó. */}
                {verDetalleCorrida && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-indigo-200 dark:border-indigo-800/50 bg-white/70 dark:bg-slate-900/50">
                    <table className="w-full text-[11px]">
                      <thead className="bg-indigo-100/60 dark:bg-indigo-950/50 text-slate-600 dark:text-slate-300 text-left sticky top-0">
                        <tr>
                          <th className="py-1.5 px-2 font-semibold">Caso</th>
                          <th className="py-1.5 px-2 font-semibold">Qué pasó</th>
                          <th className="py-1.5 px-2 font-semibold">Tipología</th>
                          <th className="py-1.5 px-2 font-semibold">Salesforce</th>
                          <th className="py-1.5 px-2 font-semibold">Admin</th>
                          <th className="py-1.5 px-2 font-semibold">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Los cerrados primero: es lo que se quiere ver. */}
                        {[...cerrados, ...retenidos, ...det.filter(d => d.accion !== 'cerrado' && d.accion !== 'retenido')]
                          .map((d, i) => (
                          <tr key={`${d.caseId ?? i}-${i}`} className="border-t border-indigo-100 dark:border-indigo-900/40">
                            <td className="py-1 px-2 font-semibold text-slate-800 dark:text-slate-100">{d.numeroCaso ?? d.caseId ?? '—'}</td>
                            <td className="py-1 px-2">
                              <span className={
                                d.accion === 'cerrado' ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                : d.accion === 'error' ? 'text-red-600 dark:text-red-400 font-semibold'
                                : 'text-slate-600 dark:text-slate-300'
                              }>
                                {d.accion === 'cerrado' ? 'liberado / cerrado'
                                  : d.accion === 'retenido' ? 'retenido'
                                  : d.accion === 'sin_screening' ? 'sin screening'
                                  : d.accion ?? '—'}
                              </span>
                            </td>
                            <td className="py-1 px-2 text-slate-500 dark:text-slate-400">{d.tipologia ?? '—'}</td>
                            <td className="py-1 px-2 text-slate-500 dark:text-slate-400">{d.sf ?? '—'}</td>
                            <td className="py-1 px-2 text-slate-500 dark:text-slate-400">{d.admin ?? '—'}</td>
                            <td className="py-1 px-2 text-slate-500 dark:text-slate-400">{d.motivo ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}
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
              <FiltroCombo label="Status" value={filtros.status} options={[...STATUS_CASO_VALORES]} onChange={v => setFiltroCol('status', v)} />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap" title="Los casos CERRADOS salen de la cola. Marcá esto para volver a verlos.">
                <input type="checkbox" checked={verCerrados} onChange={e => setVerCerrados(e.target.checked)} className="w-3.5 h-3.5" />
                Ver cerrados
              </label>
              {activeQueue === 'remesa' && <FiltroCombo label="Tipo de envío" value={filtros.tipoEnvio} options={opcionesFiltro.tipoEnvio} onChange={v => setFiltroCol('tipoEnvio', v)} />}
              {activeQueue === 'remesa' && <FiltroCombo label="Flujo" value={filtros.flujoBenef} options={opcionesFiltro.flujoBenef} onChange={v => setFiltroCol('flujoBenef', v)} />}
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
        <div className="text-center py-16">
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Todavía no llegó ningún caso. Cuando Salesforce haga <code>POST /casos</code>, aparecerán acá al instante.
          </p>
          {/* La cola vacía es justo cuando más se necesita la recuperación: sin esto
              el botón vivía solo en la barra de colas, que no se dibuja sin casos. */}
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 mb-3">
            ¿Se vació la Bandeja? Traé de vuelta los casos que siguen abiertos en Salesforce:
          </p>
          <div className="flex justify-center">{botonTraerSF}</div>
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
          {/* Asignación masiva: repartir casos entre analistas desde la cola */}
          {seleccion.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-3 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/50 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-violet-700 dark:text-violet-300">Asignar a</span>
              <select
                value={asignarA}
                onChange={e => { setAsignarA(e.target.value); setAsignarMsg(null); }}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              >
                <option value="">Elegir analista…</option>
                {usuarios.map(u => <option key={u.uid} value={u.uid}>{u.nombre}</option>)}
                {actor && <option value={actor.uid}>— Yo ({actor.nombre}) —</option>}
              </select>
              {asignarA && (
                <button
                  onClick={() => asignarCasos([...seleccion].map(id => filtrados.find(c => c.id === id)).filter((c): c is QueuedCaso => !!c), asignarA)}
                  disabled={asignando}
                  className="font-bold text-violet-700 dark:text-violet-400 hover:underline disabled:opacity-50"
                >
                  {asignando ? 'Asignando…' : `Asignar ${seleccion.size} caso(s)`}
                </button>
              )}
              {asignarMsg && <span className="text-violet-800 dark:text-violet-200 font-medium">{asignarMsg}</span>}
            </div>
          )}

          {/* Cierre masivo de la cola Remesa: Salesforce o liberación en Admin */}
          {seleccion.size > 0 && activeQueue === 'remesa' && (
            <div className="flex flex-wrap items-center gap-3 mb-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 py-2 text-sm">
              <span className="font-semibold text-amber-800 dark:text-amber-300">Cerrar remesas</span>
              <span className="text-xs text-amber-700 dark:text-amber-400">Admin + Salesforce en un paso</span>
              <select
                value={remesaMasivoTipo}
                onChange={e => { setRemesaMasivoTipo(e.target.value); setRemesaMasivoConfirm(false); setRemesaMasivoResult(null); }}
                className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              >
                <option value="">Tipología…</option>
                {TIPOS_CIERRE_REMESA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              {remesaMasivoTipo && !remesaMasivoConfirm && (
                <button onClick={() => setRemesaMasivoConfirm(true)} disabled={remesaMasivoSending} className="font-bold text-amber-800 dark:text-amber-300 hover:underline disabled:opacity-50">
                  Aplicar a {seleccion.size} caso(s)
                </button>
              )}
              {remesaMasivoConfirm && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-amber-900 dark:text-amber-200">
                    ¿Aplicar «{tipoRemesaPorId(remesaMasivoTipo)?.label}» a {seleccion.size} caso(s)?
                    Libera la transacción en Admin y cierra el caso en Salesforce. <b>Libera plata real.</b>
                  </span>
                  <button onClick={cerrarMasivoRemesa} disabled={remesaMasivoSending} className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold disabled:opacity-50">
                    {remesaMasivoSending ? 'Enviando…' : 'Sí, aplicar'}
                  </button>
                  <button onClick={() => setRemesaMasivoConfirm(false)} disabled={remesaMasivoSending} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600">Cancelar</button>
                </div>
              )}
              {remesaMasivoResult && <span className="text-xs text-amber-900 dark:text-amber-200 font-medium">{remesaMasivoResult}</span>}
            </div>
          )}

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
                    {(() => {
                      const t = TIPOS_CIERRE_ADMIN.find(x => x.id === adminMasivoTipo);
                      return <>¿Aplicar «{t?.label}» a {seleccion.size} cliente(s) en Admin? status {t?.status} · OFAC={ofacFlagPara(t?.status ?? '') ? 'Sí' : 'No'} · <b>bloquea/desbloquea clientes reales</b>.</>;
                    })()}
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
                  {activeQueue === 'otros' && Th('fecha', 'Fecha llegada')}
                  {activeQueue === 'remesa' && (
                    <>
                      {/* Orden pedido: caso → beneficiario → identificación → TX → cliente */}
                      {Th('numeroCaso', 'Nº caso')}
                      {Th('benef', 'Beneficiario')}
                      {Th('benefdni', 'DNI benef.')}
                      {Th('beneftipodni', 'Tipo DNI')}
                      {Th('benefpais', 'Nacionalidad benef.')}
                      {Th('remesa', 'Nº remesa')}
                      {Th('customerid', 'Customer ID')}
                      {Th('correocliente', 'Correo cliente')}
                      {Th('nombrecliente', 'Nombre cliente')}
                      {Th('paisorigen', 'País origen')}
                      {Th('tipoenvio', 'Tipo de envío')}
                      {/* Screening del beneficiario */}
                      {Th('benefflujo', 'Flujo')}
                      {Th('benefconclusion', 'Conclusión')}
                      {Th('benefhallazgos', 'Hallazgos', 'text-center')}
                      {Th('fecha', 'Fecha llegada')}
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
                      {Th('status', 'Status')}
                      {Th('estado', 'Estado')}
                      {Th('asignado', 'Asignado')}
                      {Th('pep', 'PEP', 'text-center')}
                      {Th('tipo', 'Tipo')}
                      {Th('fecha', 'Fecha llegada')}
                    </>
                  )}
                  {(activeQueue === 'ofac' ? columnas.filter(k => !OFAC_PROMOVIDAS.includes(k)) : activeQueue === 'remesa' ? columnas.filter(k => !REMESA_PROMOVIDAS.includes(k)) : columnas).map(k => Th(k, k))}
                </tr>
              </thead>
              <tbody>
                {ordenados.length === 0 && (
                  <tr>
                    <td colSpan={columnas.length + (activeQueue === 'remesa' ? 16 : activeQueue === 'ofac' ? 13 : 2)} className="py-8 text-center text-slate-400">
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
                      {activeQueue === 'otros' && <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtFecha(c.recibidoEn)}</td>}
                      {activeQueue === 'remesa' && (() => {
                        const b = benefMap[c.id];
                        const hallazgos = b ? (b.flujo === 'INTL' ? b.listas.length : b.delitosUnicos) : null;
                        return (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-800 dark:text-slate-100">{c.numeroCaso || '—'}</td>
                          <td className="px-3 py-2 max-w-[220px] truncate text-slate-700 dark:text-slate-200" title={r?.beneficiary_name}>{rCell(r?.beneficiary_name)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{rCell(r?.beneficiary_dni)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{rCell(r?.beneficiary_dni_type)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{rCell(r?.beneficiary_country_name)}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-sky-700 dark:text-sky-400">{c.remesa || '—'}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{r?.customer_id ? String(r.customer_id) : idInterno(c)}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-slate-600 dark:text-slate-300" title={correoCliente(c)}>{correoCliente(c)}</td>
                          <td className="px-3 py-2 max-w-[180px] truncate text-slate-700 dark:text-slate-200" title={nombreCompleto(c)}>{nombreCompleto(c)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{r?.origin_country || paisOrigen(c)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{rCell(r?.tipo_envio)}</td>
                          {/* Screening del beneficiario */}
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                            {b ? (b.flujo === 'CL' ? '🇨🇱 Chile' : b.flujo === 'CO' ? '🇨🇴 Colombia' : b.flujo === 'SIN_DATO' ? '⚠️ Sin dato' : '🌍 Intl') : (r ? '…' : '—')}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap font-semibold ${decisionColor(b?.decision)}`} title={b?.razon}>
                            {!b ? (r ? (benefMapLoading ? 'consultando…' : '…') : '—')
                              : b.estado === 'error' ? <span className="text-red-600 dark:text-red-400" title={b.mensaje || 'Error del proveedor'}>⚠️ Error del proveedor</span>
                              : b.estado === 'na' ? (b.decision || 'Sin revisión')
                              : (b.decision || '—')}
                            {/* Freno duro: delito sensible retiene la remesa aunque
                                el flujo automático esté prendido. */}
                            {(() => {
                              const cats = retenidoPorDelitoRemesa(b);
                              return cats.length ? (
                                <span className="ml-1.5 text-red-600 dark:text-red-400" title={`Retenido del flujo automático: ${cats.join(', ')}`}>🛑</span>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center font-bold text-slate-800 dark:text-slate-200">
                            {hallazgos === null ? '…' : hallazgos}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{fmtFecha(c.recibidoEn)}</td>
                        </>
                        );
                      })()}
                      {activeQueue === 'ofac' && op && (
                        <>
                          {/* Columnas clave, en el orden pedido */}
                          <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-800 dark:text-slate-100">{c.numeroCaso || '—'}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-slate-700 dark:text-slate-200" title={nombreCompleto(c)}>{nombreCompleto(c)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">{idInterno(c)}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">{paisOrigen(c)}</td>
                          {/* El motivo tiene que quedar a la vista: "No aplica" y
                              "Error" a secas no dejaban distinguir un país sin
                              lista de una caída del proveedor. */}
                          <td className={`px-3 py-2 whitespace-nowrap font-semibold ${decisionColor(s?.decision)}`}
                              title={s?.estado === 'error' ? (s?.mensaje || 'Error del proveedor') : s?.razon}>
                            {!s || s.estado === 'loading' ? 'consultando…'
                              : s.estado === 'na' ? `Sin lista · ${paisOrigen(c) || 'país no soportado'}`
                              : s.estado === 'error' ? <span className="text-red-600 dark:text-red-400">⚠️ Error del proveedor</span>
                              : s.estado === 'sin_causas' ? 'Sin causas'
                              : (s.decision || '—')}
                            {(() => {
                              const cats = motivosRetencion(s);
                              return cats.length ? (
                                <span className="ml-1.5 text-red-600 dark:text-red-400" title={`Retenido del flujo automático: ${cats.join(', ')}`}>🛑</span>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-center font-bold text-slate-800 dark:text-slate-200">
                            {!s || s.estado === 'loading' ? '…' : s.estado === 'na' ? '—' : s.estado === 'error' ? '⚠️' : (s.delitosUnicos ?? 0)}
                          </td>
                          <td className={`px-3 py-2 whitespace-nowrap font-bold ${prioColor(op.prioridad)}`}>{op.prioridad}</td>
                          {/* Resto de columnas útiles */}
                          <td className={`px-3 py-2 whitespace-nowrap font-bold ${statusColor(op.status)}`}>{op.status}</td>
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
                      {(activeQueue === 'ofac' ? columnas.filter(k => !OFAC_PROMOVIDAS.includes(k)) : activeQueue === 'remesa' ? columnas.filter(k => !REMESA_PROMOVIDAS.includes(k)) : columnas).map(k => {
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

                {/* Screening del BENEFICIARIO de la remesa (Chile / Colombia / Internacional) */}
                {activeQueue === 'remesa' && remesaData?.estado === 'ok' && remesaData.row && (() => {
                  const row = remesaData.row;
                  const flujo = flujoDeBeneficiario(row);
                  const etiquetaFlujo = flujo === 'CL' ? '🇨🇱 Chile · Regcheq'
                    : flujo === 'CO' ? '🇨🇴 Colombia · Inspektor'
                    : flujo === 'SIN_DATO' ? '⚠️ Sin nacionalidad · sin revisión'
                    : '🌍 Internacional · listas Regcheq';
                  const sc = benefScreen;
                  return (
                    <div className="mb-5 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/60 dark:bg-indigo-950/30 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-black text-indigo-800 dark:text-indigo-300">
                          ⚖️ Screening del beneficiario · {etiquetaFlujo}
                        </h3>
                        <div className="flex items-center gap-3">
                          {benefLoading
                            ? <span className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">consultando…</span>
                            : sc && <span className={`text-xs font-bold ${decisionColor(sc.decision)}`}>{sc.decision}</span>}
                          <button
                            onClick={() => reconsultarRemesa(sel)}
                            disabled={benefLoading || remesaLoading}
                            title="Volver a consultar Redshift y las listas (el resultado queda cacheado)"
                            className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 disabled:opacity-40"
                          >
                            ↻ Reconsultar
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                        {nombreBeneficiario(row) || '(sin nombre)'}
                        {row.beneficiary_dni ? ` · ${row.beneficiary_dni_type || 'DNI'} ${row.beneficiary_dni}` : ''}
                        {row.beneficiary_country_name ? ` · ${row.beneficiary_country_name}` : ''}
                      </p>

                      {benefLoading && <p className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Consultando listas…</p>}

                      {!benefLoading && sc?.estado === 'error' && (
                        <p className="text-xs text-red-600 dark:text-red-400">Error: {sc.mensaje}</p>
                      )}
                      {!benefLoading && sc?.estado === 'na' && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">No se puede screenear: {sc.mensaje}</p>
                      )}

                      {/* Chile / Colombia: causas penales contra el catálogo */}
                      {!benefLoading && sc && (sc.flujo === 'CL' || sc.flujo === 'CO') && sc.estado !== 'error' && (
                        <>
                          {sc.coincidencias.length === 0
                            ? <p className="text-xs text-emerald-600 dark:text-emerald-400">Sin causas penales.{sc.pep ? ' (marcado PEP)' : ''}</p>
                            : (
                              <>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                                  {sc.delitosUnicos} delito(s) único(s) · {sc.coincidencias.length} coincidencia(s)
                                  {sc.pep ? ' · PEP' : ''}
                                </p>
                                <CoincidenciasAgrupadas co={sc.coincidencias} />
                              </>
                            )}
                          {/* Chile: el catálogo concluye con causas penales + PEP, pero
                              puede haber match en OFAC/GAFI/etc. sin causas. */}
                          <OtrasListas listas={sc.listas} />
                        </>
                      )}

                      {/* Internacional: qué listas coinciden y de qué tipo (sin catálogo aún) */}
                      {/* Por qué este caso no se libera solo. Deja explícito el freno
                          por delito sensible, que es el que más importa auditar. */}
                      {!benefLoading && sc && sel && (() => {
                        const ev = evaluarRemesaAuto(sel, sc, flujoCfg.remesa);
                        if (ev.automatizable) {
                          return (
                            <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-2">
                              ✅ Habilitado para el flujo automático (tipología {ev.tipologia}).
                            </p>
                          );
                        }
                        const duro = ev.motivo === 'delito_sensible';
                        return (
                          <p className={`text-[11px] mt-2 ${duro ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                            {duro ? '🛑 ' : '⏸️ '}No se libera solo: {motivoRemesaLegible(ev.motivo)}
                            {ev.categorias?.length ? ` (${ev.categorias.join(', ')})` : ''}.
                          </p>
                        );
                      })()}

                      {!benefLoading && sc?.flujo === 'INTL' && sc.estado !== 'error' && sc.estado !== 'na' && (
                        sc.listas.length === 0
                          ? <p className="text-xs text-emerald-600 dark:text-emerald-400">Sin coincidencias en listas.</p>
                          : (
                            <>
                              <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-2">
                                Envío internacional: todavía no hay catálogo para concluir automáticamente.
                                Estas son las listas donde coincide — la decisión la toma el analista.
                              </p>
                              <table className="w-full text-xs">
                                <thead className="text-slate-500 dark:text-slate-400 text-left">
                                  <tr><th className="py-1">Lista</th><th className="py-1">Riesgo</th><th className="py-1">Detalle</th></tr>
                                </thead>
                                <tbody>
                                  {sc.listas.map(l => (
                                    <React.Fragment key={l.clave}>
                                      <tr className="border-t border-slate-200 dark:border-slate-700/50">
                                        <td className="py-1.5 font-bold text-slate-800 dark:text-slate-100">{l.lista}</td>
                                        <td className="py-1.5 text-slate-600 dark:text-slate-300">{l.riesgo || '—'}</td>
                                        <td className="py-1.5 text-slate-600 dark:text-slate-300">
                                          {l.detalle || '—'}{l.estadoMatch ? ` · ${l.estadoMatch}` : ''}
                                        </td>
                                      </tr>
                                      {/* Los matches concretos: nombre, tipos (incluye
                                          narcotics/terrorism/sanction), fuente y score.
                                          Sin esto la fila decía solo el nombre de la lista. */}
                                      {l.hits?.length ? (
                                        <tr className="border-t border-slate-100 dark:border-slate-800/50">
                                          <td colSpan={3} className="py-2">
                                            {l.totalHits && l.totalHits > l.hits.length && (
                                              <p className="text-[10px] text-slate-400 mb-1">
                                                Mostrando {l.hits.length} de {l.totalHits} coincidencia(s) — las de mayor score.
                                              </p>
                                            )}
                                            <div className="space-y-1.5">
                                              {l.hits.map((h, i) => (
                                                <div key={i} className="rounded-lg bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/60 px-2 py-1.5">
                                                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                                                    {h.nombre || '(sin nombre)'}
                                                    {typeof h.score === 'number' && (
                                                      <span className="ml-1.5 font-normal text-slate-400">score {h.score.toFixed(2)}</span>
                                                    )}
                                                    {h.matchTypes?.length ? (
                                                      <span className="ml-1.5 font-normal text-slate-400">· {h.matchTypes.join(', ')}</span>
                                                    ) : null}
                                                  </p>
                                                  {h.tipos?.length ? (
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                      {h.tipos.map(t => (
                                                        <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                                          /sanction|terror|narcotic|weapon|arms/i.test(t)
                                                            ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 font-bold'
                                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                                          {t}
                                                        </span>
                                                      ))}
                                                    </div>
                                                  ) : null}
                                                  {h.fuentes?.length ? (
                                                    <p className="text-[10px] text-slate-400 mt-1">Fuente: {h.fuentes.join(' · ')}</p>
                                                  ) : null}
                                                </div>
                                              ))}
                                            </div>
                                          </td>
                                        </tr>
                                      ) : null}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )
                      )}
                    </div>
                  );
                })()}

                {/* Estado y asignación del caso */}
                {(() => {
                  const op = vistaOp(sel);
                  const esMio = !!actor && (op.asignadoId === actor.uid || (!op.asignadoId && op.asignado === actor.nombre));
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
                            {(TRANSICIONES_CASO[op.estado] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          Status:
                          <select
                            value={op.status}
                            disabled={accionEnCurso}
                            onChange={e => e.target.value !== op.status && doStatus(sel, e.target.value as StatusCaso)}
                            className={`${selectCls} font-bold ${statusColor(op.status)}`}
                            title="Status del caso en la cola. CERRADO lo saca de la cola."
                          >
                            {STATUS_CASO_VALORES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </label>
                        <span className="text-slate-500 dark:text-slate-400">Asignado: <b className="text-slate-800 dark:text-slate-200">{op.asignado || '—'}</b></span>
                        {esMio ? (
                          <button onClick={() => doLiberar(sel)} disabled={accionEnCurso} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-semibold disabled:opacity-50">Liberar</button>
                        ) : (
                          <button onClick={() => doTomar(sel)} disabled={accionEnCurso} className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold disabled:opacity-50">Tomar caso</button>
                        )}
                        {/* Asignar este caso a otra persona (le llega notificación) */}
                        <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          Asignar a:
                          <select
                            value=""
                            disabled={asignando || usuarios.length === 0}
                            onChange={e => { if (e.target.value) asignarCasos([sel], e.target.value); }}
                            className={selectCls}
                            title="Asigna el caso a otro analista y le avisa"
                          >
                            <option value="">{asignando ? 'Asignando…' : 'Elegir…'}</option>
                            {usuarios.filter(u => u.uid !== op.asignadoId).map(u => <option key={u.uid} value={u.uid}>{u.nombre}</option>)}
                          </select>
                        </label>
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
                      const cats = motivosRetencion(screenMap[sel.id]);
                      return cats.length ? (
                        <div className="mb-3 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/30 px-3 py-2">
                          <p className="text-xs font-bold text-red-800 dark:text-red-300">🛑 Retenido del flujo automático</p>
                          <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">
                            Motivo: <b>{cats.join(', ')}</b>. Este caso no se cierra solo — requiere revisión del analista.
                          </p>
                        </div>
                      ) : null;
                    })()}
                    {(() => {
                      const sc = screenMap[sel.id];
                      if (!sc || sc.estado === 'loading') return <p className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Consultando lista…</p>;
                      if (sc.estado === 'na') return <p className="text-xs text-slate-500 dark:text-slate-400">País sin lista configurada (ni Chile ni Colombia).</p>;
                      if (sc.estado === 'error') return <p className="text-xs text-red-600 dark:text-red-400">Error en la consulta.</p>;
                      const co = sc.coincidencias ?? [];
                      return (
                        <>
                          {co.length === 0
                            ? <p className="text-xs text-emerald-600 dark:text-emerald-400">Sin coincidencias / causas penales.</p>
                            : (
                              <>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{sc.delitosUnicos} delito(s) único(s) · {co.length} coincidencia(s) · agrupadas por RUC</p>
                                <CoincidenciasAgrupadas co={co} />
                              </>
                            )}
                          <OtrasListas listas={sc.otrasListas} />
                        </>
                      );
                    })()}

                    {/* Qué va a hacer el flujo automático con este caso. Antes no
                        hacía falta mostrarlo porque la app misma lo ejecutaba y se
                        veía al instante; ahora ejecuta el Lambda, así que esto es
                        lo único que dice de antemano si el caso se va a cerrar solo
                        o si queda para el analista. Usa la MISMA función que el
                        Lambda, así que no puede decir una cosa y hacer otra. */}
                    {(() => {
                      const sc2 = screenMap[sel.id];
                      if (!sc2 || sc2.estado === 'loading') return null;
                      const ev = evaluarCasoAuto(sel, sc2, flujoCfg.ofac);
                      if (ev.automatizable) {
                        return (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800/50">
                            ✅ El flujo automático va a cerrar este caso con la tipología <b>{ev.tipologia}</b>.
                          </p>
                        );
                      }
                      const duro = ev.motivo === 'delito_sensible' || ev.motivo === 'pep';
                      const texto: Record<string, string> = {
                        flujo_apagado: 'el flujo automático está apagado',
                        pais_apagado: 'el país está apagado en el mantenedor',
                        ya_cerrado: 'el caso ya está cerrado',
                        asignado: 'lo tiene un analista asignado',
                        delito_sensible: 'retenido por delito sensible',
                        pep: 'retenido por ser PEP',
                        sin_conclusion: 'la conclusión del screening no se automatiza',
                      };
                      return (
                        <p className={`text-[11px] mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-800/50 ${duro ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                          {duro ? '🛑 ' : '⏸️ '}No se cierra solo: {texto[ev.motivo ?? ''] ?? ev.motivo}
                          {ev.categorias?.length ? ` (${ev.categorias.join(', ')})` : ''}.
                        </p>
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

                <Seccion>🧭 Investigación</Seccion>

                {/* Investigación del analista — desplegable (se usa menos que el cierre) */}
                <div className="mb-5">
                  <button
                    onClick={() => setShowInvestigacion(s => !s)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-600 hover:bg-slate-700 text-white text-sm font-bold"
                  >
                    <span>{showInvestigacion ? '▾' : '▸'}</span> 📝 Investigación
                    <span className="text-[11px] font-semibold opacity-80">
                      {invVersion > 0 ? `v${invVersion}${invActual?.actualizadaEn ? ' · ' + fmtFecha(invActual.actualizadaEn) : ''}` : 'sin iniciar'}
                    </span>
                  </button>
                </div>
                {showInvestigacion && (
                <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
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

                )}

                {/* ── Sección: Responder en Salesforce (inline, como el Cierre en Admin) ── */}
                <Seccion>📨 Responder en Salesforce</Seccion>
                <div className="rounded-xl border border-sky-200 dark:border-sky-800/50 bg-sky-50/40 dark:bg-sky-950/20 p-4">
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
                          {tiposSFdeCola(activeQueue).map(t => (
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
                            {sfResult.ok ? '✅ Caso actualizado en Salesforce' : `❌ No se pudo actualizar (HTTP ${sfResult.status}${sfResult.errorCode ? ` · ${sfResult.errorCode}` : ''})`}
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

                {/* ── Sección: Cierre en Admin de la REMESA (libera la transacción) ──
                    Es su propio bloque: acá no se bloquea al cliente, se cambia el
                    estado de la transacción. Solo aplica a la cola Remesa. */}
                {activeQueue === 'remesa' && (() => {
                  const inp = 'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-rose-400';
                  const tipo = tipoRemesaPorId(remesaAdminTipo);
                  return (
                    <>
                      <Seccion>💸 Cierre en Admin (liberar transacción)</Seccion>
                      <div className="rounded-xl border border-rose-200 dark:border-rose-800/50 bg-rose-50/40 dark:bg-rose-950/20 p-4">
                        <p className="text-[11px] text-rose-700 dark:text-rose-300 mb-3 font-semibold">
                          ⚠️ Cambia el estado de la transacción en Admin (producción): libera plata real.
                        </p>
                        {!remesaAdminDisponible() && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">Proxy no configurado (EMPRESADOCS_PROXY_URL).</p>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="text-xs">
                            <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">Tipología</span>
                            <select value={remesaAdminTipo} onChange={e => setRemesaAdminTipo(e.target.value)} className={inp}>
                              <option value="">Elegir…</option>
                              {TIPOS_CIERRE_REMESA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                          </label>
                          <label className="text-xs">
                            <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">N° de transacción</span>
                            <input value={remesaAdminIds} onChange={e => setRemesaAdminIds(e.target.value)} className={inp} placeholder="14363322, 14362110" />
                          </label>
                          <label className="text-xs">
                            <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">requestedBy</span>
                            <input value={remesaAdminBy} onChange={e => setRemesaAdminBy(e.target.value)} className={inp} />
                          </label>
                          <label className="text-xs">
                            <span className="block font-semibold text-slate-500 dark:text-slate-400 mb-1">changeTicket</span>
                            <input value={remesaAdminTicket} onChange={e => setRemesaAdminTicket(e.target.value)} className={inp} placeholder="TICKET-1234" />
                          </label>
                        </div>

                        {tipo && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                            Estado destino: <b>{tipo.statusDB}</b> ({tipo.statusLabel}). Si la transacción ya
                            está en ese estado, se omite.
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-3 flex-wrap">
                          {!remesaAdminConfirm ? (
                            <button
                              onClick={() => setRemesaAdminConfirm(true)}
                              disabled={!tipo || !remesaAdminIds.trim() || !remesaAdminDisponible()}
                              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-bold"
                            >
                              Aplicar en Admin
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50 rounded-xl px-3 py-2">
                              <span className="text-rose-700 dark:text-rose-300">
                                ¿Aplicar «{tipo?.label}» a {remesaAdminIds.split(',').filter(s => s.trim()).length} transacción(es)? <b>Libera plata real.</b>
                              </span>
                              <button onClick={enviarRemesaAdmin} disabled={remesaAdminSending} className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50">
                                {remesaAdminSending ? 'Enviando…' : 'Sí, aplicar'}
                              </button>
                              <button onClick={() => setRemesaAdminConfirm(false)} disabled={remesaAdminSending} className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600">Cancelar</button>
                            </div>
                          )}
                          {remesaAdminMsg && (
                            <span className={`text-xs ${remesaAdminMsg.startsWith('❌') ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{remesaAdminMsg}</span>
                          )}
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* ── Sección: Cierre en Admin (bloqueo/desbloqueo del cliente) ── */}
                {activeQueue !== 'remesa' && <Seccion>📛 Cierre en Admin (bloqueo/desbloqueo)</Seccion>}
                {activeQueue !== 'remesa' && (() => {
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
                        <label className={lbl}><span className={cap}>Risk level</span>
                          <select value={adminForm.riskLevel} onChange={e => setAdmin({ riskLevel: e.target.value })} className={inp}>
                            <option value="">— no tocar —</option>
                            {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </label>
                        <label className={lbl}><span className={cap}>PEP (isPep)</span>
                          <select
                            value={!adminForm.pepEnabled ? 'off' : (adminForm.pepValue ? 'si' : 'no')}
                            onChange={e => {
                              const v = e.target.value;
                              setAdmin(v === 'off' ? { pepEnabled: false } : { pepEnabled: true, pepValue: v === 'si' });
                            }}
                            className={inp}
                          >
                            <option value="off">— no tocar —</option>
                            <option value="no">isPep = No</option>
                            <option value="si">isPep = Sí</option>
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
                            Pasos: OFAC (flag={adminForm.ofacFlag ? 'Sí' : 'No'}, {adminForm.ofacProvider}) → Compliance{adminForm.pepEnabled ? ` → PEP (isPep=${adminForm.pepValue ? 'Sí' : 'No'})` : ''}{adminForm.riskLevel ? ` → Risk=${adminForm.riskLevel}` : ''}{habraLastStep ? ' → Last-step' : ''}. <b>Bloquea/desbloquea clientes reales.</b>
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
