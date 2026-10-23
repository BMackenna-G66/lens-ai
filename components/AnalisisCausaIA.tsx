// «Análisis de causa (IA)» y «Analizar caso», en la tarjeta Perfil criminal ·
// Regcheq de la ficha (contrato «Integración Scraper PJUD ↔ LENS», §4.2 y §4.3).
//
// Aislado a propósito:
//   · lee SOLO por el Worker (`/pjud/caso/{id}`), con el ID token del analista;
//     el navegador nunca toca `scraper_casos`;
//   · va dentro de un límite de errores: si algo de acá falla, la ficha y la
//     Bandeja siguen igual;
//   · no participa del cierre del caso.

import React, { useEffect, useState } from 'react';
import { getIdTokenActual } from '../services/firebaseService';
import { estadoAnalisisPjud, type DocPjud } from '../services/pjudScraper';

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');
const SCRAPER_URL = (process.env.PJUD_SCRAPER_URL || '').replace(/\/$/, '');
const CADA_MS = 20_000;

export type LecturaPjud =
  | { estado: 'apagado' }
  | { estado: 'cargando' }
  | { estado: 'sin_documento' }
  | { estado: 'ok'; doc: DocPjud }
  | { estado: 'error'; mensaje: string };

async function leerCasoPjud(caseId: string): Promise<LecturaPjud> {
  if (!PROXY) return { estado: 'error', mensaje: 'Falta la URL del Worker.' };
  const token = await getIdTokenActual();
  if (!token) return { estado: 'error', mensaje: 'Sin sesión de Lens.' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const r = await fetch(`${PROXY}/pjud/caso/${encodeURIComponent(caseId)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal,
    });
    if (r.status === 401) return { estado: 'error', mensaje: 'Tu sesión no tiene acceso al análisis de PJUD.' };
    if (!r.ok) return { estado: 'error', mensaje: `No se pudo leer el análisis de PJUD (HTTP ${r.status}).` };
    const cuerpo = await r.json() as { existe?: boolean } & DocPjud;
    return cuerpo.existe ? { estado: 'ok', doc: cuerpo } : { estado: 'sin_documento' };
  } catch {
    return { estado: 'error', mensaje: 'No se pudo leer el análisis de PJUD.' };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Una lectura al abrir el caso; si el scraper está trabajando (`en_proceso`),
 * vuelve a leer cada ~20 s hasta que termine. Sin `onSnapshot`: el navegador no
 * tiene acceso a esa base.
 */
export function usePjudCaso(caseId: string | null, activo: boolean): LecturaPjud {
  const [lectura, setLectura] = useState<LecturaPjud>({ estado: 'apagado' });
  useEffect(() => {
    if (!activo || !caseId) { setLectura({ estado: 'apagado' }); return; }
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLectura({ estado: 'cargando' });
    const leer = async () => {
      const r = await leerCasoPjud(caseId);
      if (!vivo) return;
      setLectura(r);
      if (r.estado === 'ok' && estadoAnalisisPjud(r.doc).enCurso) timer = setTimeout(leer, CADA_MS);
    };
    void leer();
    return () => { vivo = false; if (timer) clearTimeout(timer); };
  }, [caseId, activo]);
  return lectura;
}

/** Si algo del área falla al dibujarse, no se muestra nada: la ficha sigue. */
export class LimitePjud extends React.Component<{ children: React.ReactNode }, { roto: boolean }> {
  state = { roto: false };
  static getDerivedStateFromError() { return { roto: true }; }
  componentDidCatch(e: unknown) { console.warn('[PJUD] el área no se pudo mostrar', e); }
  render() { return this.state.roto ? null : this.props.children; }
}

const fecha = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
};

export const AreaAnalisisCausa: React.FC<{ lectura: LecturaPjud }> = ({ lectura }) => {
  if (lectura.estado === 'apagado' || lectura.estado === 'sin_documento') return null;
  const marco = 'mt-4 pt-3 border-t border-indigo-200 dark:border-indigo-800/50';
  const titulo = <p className="text-xs font-black text-indigo-800 dark:text-indigo-300 mb-1.5">🧾 Análisis de causa (IA)</p>;
  if (lectura.estado === 'cargando') {
    return <div className={marco}>{titulo}<p className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Leyendo el análisis de PJUD…</p></div>;
  }
  if (lectura.estado === 'error') {
    return <div className={marco}>{titulo}<p className="text-xs text-slate-500 dark:text-slate-400">{lectura.mensaje}</p></div>;
  }
  const e = estadoAnalisisPjud(lectura.doc);
  if (e.tipo === 'nada') return null;
  const color = e.tipo === 'fallida' ? 'text-red-700 dark:text-red-400'
    : e.tipo === 'incompleta' ? 'text-amber-700 dark:text-amber-400'
    : 'text-slate-600 dark:text-slate-300';
  return (
    <div className={marco}>
      {titulo}
      <p className={`text-[11px] font-semibold ${color} ${e.enCurso ? 'animate-pulse' : ''}`}>
        {e.titulo}{e.generado ? <span className="font-normal text-slate-500 dark:text-slate-400"> · generado {fecha(e.generado)}</span> : null}
      </p>
      {e.aviso && (
        <p className="mt-1.5 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-[11px] text-amber-800 dark:text-amber-300">
          ⚠️ {e.aviso}
        </p>
      )}
      {e.error && <p className="mt-1.5 text-[11px] text-red-700 dark:text-red-400">Error: {e.error}</p>}
      {e.avisosPjud.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-600 dark:text-slate-300">
          {e.avisosPjud.map((a, i) => <li key={i}>Aviso de PJUD: {a}</li>)}
        </ul>
      )}
      {e.texto && (
        <textarea
          readOnly
          value={e.texto}
          rows={Math.min(12, Math.max(4, e.texto.split('\n').length + 1))}
          aria-label="Análisis de causa generado por IA"
          className="mt-2 w-full resize-y rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs text-slate-800 dark:text-slate-200"
        />
      )}
      {(e.texto || e.tipo === 'incompleta' || e.tipo === 'actualizando') && (
        <p className="mt-1 text-[10px] italic text-slate-500 dark:text-slate-400">Generado por IA. Revisión del analista requerida.</p>
      )}
    </div>
  );
};

/** §4.3: solo si el caso está en el scraper y hay URL de la pantalla configurada. */
export const BotonAnalizarCaso: React.FC<{ caseId: string; lectura: LecturaPjud }> = ({ caseId, lectura }) => {
  if (lectura.estado !== 'ok' || !SCRAPER_URL) return null;
  return (
    <a
      href={`${SCRAPER_URL}/caso/${encodeURIComponent(caseId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 rounded-md border border-indigo-300 dark:border-indigo-700 px-2.5 py-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
    >
      Analizar caso ↗
    </a>
  );
};
