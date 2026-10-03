// REVISIÓN WEB — Ronda A, lectura del sitio a través del Worker `lens-lector-web`.
//
// El navegador no puede leer sitios ajenos (CORS), y el Worker de EmpresaDocs no
// se usa para esto: tiene secretos y acceso a S3. `lens-lector-web` no tiene
// nada, y es lo ÚNICO con lo que habla este archivo.

import { enlaceParaSlot, enlaces } from './html';
import type { LecturaWorker, Pagina, Slot } from './tipos';

export const URL_LECTOR = 'https://lens-lector-web.bmackenna.workers.dev';

/** Las rutas de §5, en orden de preferencia por lugar. */
export const RUTAS: Record<Exclude<Slot, 'inicio'>, string[]> = {
  terminos: ['/legal/terms', '/terminos'],
  privacidad: ['/legal/privacy', '/privacidad'],
  nosotros: ['/about', '/contacto'],
};

/** `acme.cl` → `https://acme.cl/`. Lo que no se puede leer como URL, falla acá
 *  y no en el Worker. */
export function normalizarUrl(cruda: string): string {
  const t = String(cruda || '').trim();
  if (!t) throw new Error('Falta la URL.');
  const conEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  const u = new URL(conEsquema);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Solo se revisan sitios http o https.');
  return u.toString();
}

export async function leer(urls: string[], timeoutMs = 25_000): Promise<LecturaWorker[]> {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL_LECTOR}/leer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      signal: corte.signal,
    });
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(cuerpo?.error || `el lector respondió ${res.status}`);
    return cuerpo.lecturas as LecturaWorker[];
  } catch (e) {
    const err = e as Error;
    throw new Error(err?.name === 'AbortError' ? 'el lector de sitios no respondió a tiempo' : `no se pudo usar el lector de sitios: ${err?.message || err}`);
  } finally {
    clearTimeout(reloj);
  }
}

const sirve = (l: LecturaWorker | undefined | null): boolean =>
  !!l && l.ok && (l.status ?? 500) < 400 && !!l.html;

/**
 * Las 4 lecturas de §5, en paralelo.
 *
 * Primero el inicio y las rutas del procedimiento, todas juntas aunque alguna
 * dé 404. El lugar que quede vacío se busca en los enlaces del INICIO —los sitios
 * en castellano rara vez usan `/legal/terms`; usan `/terminos-y-condiciones`—, y
 * esa segunda tanda también va en paralelo. Siguen siendo 4 páginas leídas: lo
 * que crece es el número de rutas probadas para encontrarlas.
 */
export async function leerSitio(url: string): Promise<{ inicio: LecturaWorker | null; paginas: Pagina[] }> {
  const origen = new URL(url).origin;
  const slots = Object.keys(RUTAS) as Exclude<Slot, 'inicio'>[];
  const candidatas = slots.flatMap(s => RUTAS[s].map(r => origen + r));
  const primera = await leer([url, ...candidatas]);
  const inicio = primera[0] ?? null;

  const paginas: Pagina[] = [{ slot: 'inicio', url: inicio?.urlFinal ?? url, lectura: inicio, intentadas: [url] }];
  let i = 1;
  for (const s of slots) {
    const propias = primera.slice(i, i + RUTAS[s].length);
    i += RUTAS[s].length;
    const buena = propias.find(sirve);
    paginas.push({ slot: s, url: buena?.urlFinal ?? null, lectura: buena ?? null, intentadas: propias.map(p => p.pedida) });
  }

  // Segunda tanda: lo que falta, por los enlaces del inicio.
  if (sirve(inicio)) {
    const host = new URL(inicio!.urlFinal || url).hostname;
    const lista = enlaces(inicio!.html!, inicio!.urlFinal || url);
    const faltan = paginas.filter(p => p.slot !== 'inicio' && !p.lectura);
    const yaLeidas = paginas.flatMap(p => [...p.intentadas, p.url || '']).filter(Boolean);
    const pedidos = faltan
      .map(p => ({ p, href: enlaceParaSlot(lista, p.slot as Exclude<Slot, 'inicio'>, host, yaLeidas) }))
      .filter((x): x is { p: Pagina; href: string } => !!x.href);
    if (pedidos.length) {
      const segunda = await leer(pedidos.map(x => x.href)).catch(() => [] as LecturaWorker[]);
      pedidos.forEach((x, k) => {
        x.p.intentadas.push(x.href);
        if (sirve(segunda[k])) { x.p.lectura = segunda[k]; x.p.url = segunda[k].urlFinal; }
      });
    }
  }
  return { inicio, paginas };
}
