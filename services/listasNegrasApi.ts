// Las llamadas del módulo «Listas negras» al Worker (`/admin/listas-negras/*`),
// siempre con el ID token de Firebase del analista. El navegador nunca habla
// con Admin G66 ni con el registro: el Worker verifica el token y el permiso,
// registra cada cambio con el actor del token y llama a Admin.

import { getIdTokenActual } from './firebaseService';
import { RUTA_LISTA, type Lista, type Modo } from './listasNegras';

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export interface RespuestaWorker {
  http: number;
  actor?: string;
  status?: number;
  datos?: unknown;
  error?: string;
  motivo?: string;
  cambioId?: string;
  /** Escrituras: `ok`, `sin_resultado` (Admin respondió y el resultado no quedó
   *  registrado) o `no_disponible` (no se registró, así que no se hizo). */
  registro?: 'ok' | 'sin_resultado' | 'no_disponible';
}

async function llamar(ruta: string, init: RequestInit = {}, ms = 45_000): Promise<RespuestaWorker> {
  if (!PROXY) return { http: 0, error: 'Falta la URL del Worker.' };
  const token = await getIdTokenActual();
  if (!token) return { http: 0, error: 'Sin sesión de Lens.' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${PROXY}/admin/listas-negras/${ruta}`, {
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    let cuerpo: Record<string, unknown> = {};
    try { cuerpo = await r.json(); } catch { /* sin cuerpo */ }
    return { http: r.status, ...cuerpo } as RespuestaWorker;
  } catch {
    return { http: 0, error: 'No se pudo contactar al Worker (red o tiempo de espera).' };
  } finally {
    clearTimeout(t);
  }
}

/** Un mensaje para el analista a partir de una respuesta que no fue 2xx. */
export function mensajeDeError(r: RespuestaWorker): string {
  if (r.http === 401) return 'Tu sesión no fue aceptada. Volvé a iniciar sesión en Lens.';
  if (r.http === 403 && r.error === 'sin permiso') return 'Tu usuario no tiene habilitado el módulo Listas negras.';
  if (r.registro === 'no_disponible') return r.error || 'No se pudo registrar el cambio, así que no se hizo.';
  const detalle = typeof r.datos === 'object' && r.datos ? JSON.stringify(r.datos).slice(0, 300) : '';
  return [r.error || r.motivo || `HTTP ${r.http}`, detalle].filter(Boolean).join(' · ');
}

export const leerLista = (lista: Lista) => llamar(RUTA_LISTA[lista]);
export const leerPaises = () => llamar('paises');

export interface MetaEscritura {
  ejecucionId: string;
  estadoAnterior?: boolean | null;
  reasonAnterior?: string | null;
  valor?: string | null;
}

export const escribir = (lista: Lista, metodo: 'POST' | 'PUT', registro: Record<string, unknown>, meta: MetaEscritura) =>
  llamar(RUTA_LISTA[lista], { method: metodo, body: JSON.stringify({ registro, meta }) });

export interface FilaSinOperacion {
  valor?: string;
  countryCode?: string;
  accountType?: string | null;
  adminId?: string | null;
  resultado: string;
  estadoAnterior?: boolean | null;
  estadoNuevo?: boolean | null;
  reason?: string | null;
  error?: string | null;
}

/** Lo que no llegó a Admin (omitido, sin cambios, error de validación), en lotes de 500. */
export async function registrarSinOperacion(lista: Lista, ejecucionId: string, modo: Modo,
                                            filas: FilaSinOperacion[]): Promise<boolean> {
  for (let i = 0; i < filas.length; i += 500) {
    const limpio = filas.slice(i, i + 500).map(f =>
      Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== '')));
    const r = await llamar(`${RUTA_LISTA[lista]}/sin-operacion`, {
      method: 'POST', body: JSON.stringify({ ejecucionId, modo: modo === 'cargar' ? 'carga' : 'edicion', filas: limpio }),
    });
    if (r.http !== 200) return false;
  }
  return true;
}

/** El `admin_id` de altas que Admin no devolvió, sacado del GET posterior. */
export async function completarIds(lista: Lista, ids: { cambioId: string; adminId: string }[]): Promise<boolean> {
  for (let i = 0; i < ids.length; i += 500) {
    const r = await llamar(`${RUTA_LISTA[lista]}/ids`, { method: 'POST', body: JSON.stringify({ ids: ids.slice(i, i + 500) }) });
    if (r.http !== 200) return false;
  }
  return true;
}

/** Un «Bloqueado» histórico de la cola OFAC: la misma lógica del paso 6 del cierre. Solo Líder. */
export const cargarBloqueado = (entrada: Record<string, string>) =>
  llamar('dni/bloqueado', { method: 'POST', body: JSON.stringify(entrada) });
