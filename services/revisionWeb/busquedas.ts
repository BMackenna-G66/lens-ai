// REVISIÓN WEB — las búsquedas de la Ronda B las arma el CÓDIGO (§5), no el
// modelo: hasta 5, por la tabla de prioridad, con su condición. El modelo solo
// las ejecuta y copia lo que encontró.

import type { Consulta, Extraccion, Jurisdiccion } from './tipos';

export const MAX_BUSQUEDAS = 5;

const REGULADOS = ['pagos', 'remesas', 'inversion', 'credito', 'factoring', 'cripto', 'seguros'];

export function ofreceRegulados(e: Pick<Extraccion, 'serviciosRegulados'>): boolean {
  return (e.serviciosRegulados || []).some(s => REGULADOS.some(r => String(s).toLowerCase().includes(r)));
}

const comillas = (s: string) => `"${String(s).replace(/"/g, '').trim()}"`;

export function nombreDe(e: Pick<Extraccion, 'razonSocial' | 'nombreComercial'>): string {
  return (e.razonSocial || e.nombreComercial || '').trim();
}

/**
 * @param jurisdiccion la esperada (la carga el analista) o, si no hay, la que
 *        se detectó en el sitio. Vacía = se buscan las dos.
 * @param conPlantilla la Ronda A detectó señales de plantilla (prioridad 3).
 */
export function armarConsultas(e: Extraccion, jurisdiccion: Jurisdiccion, conPlantilla: boolean): Consulta[] {
  const nombre = nombreDe(e);
  const c: Consulta[] = [];

  // 1 · Siempre: el identificador exacto; si no hay, la razón social exacta.
  if (e.identificador) c.push({ prioridad: 1, consulta: comillas(e.identificador), motivo: 'identificador tributario exacto' });
  else if (nombre) c.push({ prioridad: 1, consulta: comillas(nombre), motivo: 'razón social exacta (no publica identificador)' });

  // 2 · Alertas de regulador, si ofrece algo regulado.
  if (nombre && ofreceRegulados(e)) {
    if (jurisdiccion !== 'CO') c.push({ prioridad: 2, consulta: `site:cmfchile.cl ${comillas(nombre)}`, motivo: 'alertas de la CMF' });
    if (jurisdiccion !== 'CL') {
      c.push({ prioridad: 2, consulta: `site:superfinanciera.gov.co ${comillas(nombre)}`, motivo: 'alertas de la Superfinanciera' });
      c.push({ prioridad: 2, consulta: `Superfinanciera "no autorizada" ${comillas(nombre)}`, motivo: 'entidades no autorizadas (SFC)' });
    }
  }

  // 3 · Teléfono o dirección entre comillas, si hubo señales de plantilla.
  if (conPlantilla) {
    const dato = e.telefonos?.[0] || e.direcciones?.[0];
    if (dato) c.push({ prioridad: 3, consulta: comillas(dato), motivo: 'dato de contacto con señales de plantilla' });
  }

  // 4 · Dotación y año de fundación, si declara trayectoria o tamaño.
  if (nombre && e.declaraTrayectoria) c.push({ prioridad: 4, consulta: `${comillas(nombre)} fundada empleados`, motivo: 'trayectoria y tamaño declarados' });

  // 5 · Reputación y reclamos, si queda cupo.
  if (nombre) {
    const ente = jurisdiccion === 'CL' ? 'SERNAC' : jurisdiccion === 'CO' ? 'SIC' : 'SERNAC OR SIC';
    c.push({ prioridad: 5, consulta: `${comillas(nombre)} reclamos ${ente}`, motivo: 'reputación y reclamos' });
  }

  return c.slice(0, MAX_BUSQUEDAS);
}
