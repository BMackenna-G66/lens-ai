// Log de la gestión de colas → Redshift (schema `colas_trabajo`).
//
// El navegador NO le pega a la Lambda directo: va por el Worker (`/colas/log`),
// que es el que guarda el secreto. Así la clave nunca queda en el bundle público.
//
// Es un espejo ANALÍTICO: Firestore sigue siendo la fuente operacional y la
// auditoría de la app (caseAuditService) sigue igual. Por eso todas las llamadas
// son fire-and-forget: si el logger falla, la Bandeja no se entera.

import type { CasoSF } from './casosService';

const PROXY = (process.env.EMPRESADOCS_PROXY_URL || '').replace(/\/$/, '');

export const colasLogDisponible = (): boolean => !!PROXY;

type Fila = { tabla: string; datos: Record<string, unknown> };

export interface ActorLog { uid: string; nombre: string; email?: string; esSistema?: boolean }

// Actor del flujo automático: queda distinguible de una persona en la auditoría.
export const ACTOR_SISTEMA: ActorLog = { uid: 'system', nombre: 'Flujo automático', esSistema: true };

// Envío fire-and-forget: nunca lanza ni bloquea al que llama.
async function enviar(eventos: Fila[]): Promise<void> {
  if (!PROXY || eventos.length === 0) return;
  try {
    await fetch(`${PROXY}/colas/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventos }),
      keepalive: true,   // sobrevive si el analista navega justo después
    });
  } catch {
    /* el log es best-effort: no rompe la gestión */
  }
}

const ahora = (): string => new Date().toISOString().replace('T', ' ').slice(0, 23);
const num = (v: unknown): number | null => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null;
};

// Dimensión del caso (se manda junto con cada hecho para que los joins funcionen).
function filaCaso(c: CasoSF, cola: string): Fila {
  return {
    tabla: 'caso',
    datos: {
      numero_caso: c.numeroCaso,
      caso_id: c.id,
      cola,
      asunto: c.asunto,
      nombre_cuenta: c.nombreCuenta,
      pais: c.pais,
      pais_codigo: /colombia|^co$/i.test(c.pais) ? 'CO' : /chile|^cl$/i.test(c.pais) ? 'CL' : null,
      id_interno_usuario: num(c.datos?.['Id interno del usuario']),
      origen: c.origen,
      recibido_en: (c.recibidoEn || '').replace('T', ' ').replace('Z', '').slice(0, 23) || null,
      actualizado_en: ahora(),
    },
  };
}

function filaAnalista(actor?: ActorLog): Fila[] {
  if (!actor?.uid) return [];
  return [{
    tabla: 'analista',
    datos: {
      actor_id: actor.uid,
      nombre: actor.nombre,
      email: actor.email ?? null,
      es_sistema: actor.esSistema ?? actor.uid === 'system',
      ultimo_evento_en: ahora(),
    },
  }];
}

// ── Hechos ───────────────────────────────────────────────────────────────────

export interface CierreLog {
  canal: 'SF' | 'ADMIN';
  ok: boolean;
  automatico?: boolean;
  tipologia?: string | null;
  statusEnviado?: string | null;
  ofacFlag?: boolean | null;
  pepEnviado?: boolean | null;
  riskLevel?: string | null;
  lastStep?: boolean | null;
  httpStatus?: number | null;
  detalleError?: string | null;
}

export function logCierre(caso: CasoSF, cola: string, cierre: CierreLog, actor?: ActorLog): void {
  const en = ahora();
  void enviar([
    filaCaso(caso, cola),
    ...filaAnalista(actor),
    {
      tabla: 'cierre',
      datos: {
        cierre_id: `${caso.numeroCaso}|${cierre.canal}|${en}`,
        numero_caso: caso.numeroCaso,
        canal: cierre.canal,
        resultado_ok: cierre.ok,
        automatico: cierre.automatico ?? false,
        tipologia: cierre.tipologia ?? null,
        status_enviado: cierre.statusEnviado ?? null,
        ofac_flag: cierre.ofacFlag ?? null,
        pep_enviado: cierre.pepEnviado ?? null,
        risk_level: cierre.riskLevel ?? null,
        last_step: cierre.lastStep ?? null,
        http_status: cierre.httpStatus ?? null,
        detalle_error: cierre.detalleError ?? null,
        actor_id: actor?.uid ?? ACTOR_SISTEMA.uid,
        actor_nombre: actor?.nombre ?? ACTOR_SISTEMA.nombre,
        actor_tipo: (actor?.esSistema ?? !actor) ? 'SYSTEM' : 'USER',
        ocurrido_en: en,
      },
    },
  ]);
}

export interface ScreeningLog {
  fuente?: string; estado?: string; decision?: string;
  delitosUnicos?: number; pep?: boolean;
  categoriasSensibles?: string[];
  coincidencias?: unknown[];
}

export function logScreening(caso: CasoSF, cola: string, s: ScreeningLog): void {
  const en = ahora();
  const cats = s.categoriasSensibles ?? [];
  void enviar([
    filaCaso(caso, cola),
    {
      tabla: 'screening',
      datos: {
        screening_id: `${caso.numeroCaso}|${en}`,
        numero_caso: caso.numeroCaso,
        fuente: s.fuente ?? null,
        estado: s.estado ?? null,
        decision: s.decision ?? null,
        delitos_unicos: s.delitosUnicos ?? null,
        es_pep: s.pep ?? null,
        retenido_sensible: cats.length > 0,
        categorias_sensibles: cats.length ? cats.join(', ') : null,
        coincidencias: s.coincidencias?.length ? s.coincidencias : null,
        screened_en: en,
      },
    },
  ]);
}

export function logHistorial(
  caso: CasoSF, campo: 'STATUS' | 'ESTADO' | 'PRIORIDAD' | 'ASIGNACION',
  anterior: string | null, nuevo: string | null, actor?: ActorLog,
): void {
  const en = ahora();
  void enviar([
    ...filaAnalista(actor),
    {
      tabla: 'caso_historial',
      datos: {
        historial_id: `${caso.numeroCaso}|${campo}|${en}`,
        numero_caso: caso.numeroCaso,
        campo,
        valor_anterior: anterior,
        valor_nuevo: nuevo,
        actor_id: actor?.uid ?? 'system',
        actor_tipo: actor?.uid ? 'USER' : 'SYSTEM',
        ocurrido_en: en,
      },
    },
  ]);
}

// Cambio en el mantenedor: deja registro de quién prendió/apagó la automatización.
export function logConfigFlujo(
  cola: 'ofac' | 'remesa',
  cfg: { habilitado: boolean; paises?: string[]; cerrarSF?: boolean; cerrarAdmin?: boolean; tipologias?: unknown },
  actor?: ActorLog,
): void {
  const en = ahora();
  void enviar([
    ...filaAnalista(actor),
    {
      tabla: 'config_flujo_historial',
      datos: {
        config_id: `${cola}|${en}`,
        cola,
        habilitado: cfg.habilitado,
        paises_habilitados: cfg.paises?.length ? cfg.paises.join(',') : null,
        cerrar_sf: cfg.cerrarSF ?? null,
        cerrar_admin: cfg.cerrarAdmin ?? null,
        tipologias: cfg.tipologias ?? null,
        actor_id: actor?.uid ?? 'system',
        actor_nombre: actor?.nombre ?? null,
        ocurrido_en: en,
      },
    },
  ]);
}

// ── Diccionario de usuarios de Lens ──────────────────────────────────────────
// Sincroniza la tabla `analista` con los usuarios del proyecto (Firestore
// `users`), para que los logs se puedan leer por nombre/correo sin depender de
// que la persona haya actuado antes. Se llama al abrir la Bandeja.
export interface UsuarioLens {
  uid: string; email?: string; displayName?: string; role?: string; disabled?: boolean;
}

export function sincronizarAnalistas(usuarios: UsuarioLens[]): void {
  const filas: Fila[] = usuarios
    .filter(u => u?.uid)
    .map(u => ({
      tabla: 'analista',
      datos: {
        actor_id: u.uid,
        nombre: u.displayName || u.email || u.uid,
        email: u.email ?? null,
        rol: u.role ?? null,
        deshabilitado: u.disabled ?? false,
        es_sistema: false,
      },
    }));
  // El flujo automático también es un "actor": queda en la tabla desde el arranque.
  filas.push({
    tabla: 'analista',
    datos: { actor_id: ACTOR_SISTEMA.uid, nombre: ACTOR_SISTEMA.nombre, rol: 'Sistema', es_sistema: true },
  });
  // De a 50 por request (el logger acepta hasta 100).
  for (let i = 0; i < filas.length; i += 50) void enviar(filas.slice(i, i + 50));
}

// ── Espejo del evento de auditoría (todo lo que registra caseAuditService) ────
export interface EventoLog {
  eventId: string; numeroCaso: string; tipo: string;
  actorId?: string; actorTipo?: string; timestamp?: string;
  correlationId?: string; versionCaso?: number;
  cambios?: unknown; metadata?: unknown;
}

export function logEvento(ev: EventoLog): void {
  void enviar([{
    tabla: 'evento_auditoria',
    datos: {
      event_id: ev.eventId,
      numero_caso: ev.numeroCaso,
      tipo: ev.tipo,
      actor_id: ev.actorId ?? null,
      actor_tipo: ev.actorTipo ?? null,
      ocurrido_en: (ev.timestamp || ahora()).replace('T', ' ').replace('Z', '').slice(0, 23),
      correlation_id: ev.correlationId ?? null,
      version_caso: ev.versionCaso ?? null,
      cambios: ev.cambios ?? null,
      metadata: ev.metadata ?? null,
    },
  }]);
}
