// REVISIÓN WEB — Paso 0, riesgo inherente (§4). Depende del SERVICIO a contratar,
// no del sitio: fija el estándar de prueba antes de mirar nada.

import type { FactoresPaso0, RiesgoInherente, UsoPrevisto } from './tipos';

export const FACTORES: { clave: keyof FactoresPaso0; peso: number; texto: string }[] = [
  { clave: 'fondos', peso: 3, texto: 'Toca o custodia fondos de clientes' },
  { clave: 'mercadoVigilado', peso: 2, texto: 'Opera en un mercado donde Global66 es entidad vigilada (CL / CO)' },
  { clave: 'datosPersonales', peso: 2, texto: 'Trata datos personales o documentación KYC' },
  { clave: 'accesoSistemas', peso: 2, texto: 'Tendrá acceso a sistemas, producción o credenciales' },
  { clave: 'caraCliente', peso: 1, texto: 'Es cara al cliente final' },
  { clave: 'sustituible', peso: -1, texto: 'Es sustituible con bajo costo de salida' },
];

const NINGUNO: FactoresPaso0 = {
  fondos: false, mercadoVigilado: false, datosPersonales: false, accesoSistemas: false, caraCliente: false, sustituible: false,
};

/** §3: «si se entrega el uso previsto, se omite el cálculo del Paso 0». Estos son
 *  los factores que cada uso trae marcados; el analista los puede corregir en el
 *  panel. Es una PROPUESTA que tiene que confirmar Compliance:
 *
 *    cliente B2B        mercado vigilado                          = 2 → MEDIO
 *    proveedor de pagos fondos + vigilado + datos + sistemas      = 9 → CRITICO
 *    integración        vigilado + datos + sistemas               = 6 → ALTO
 *    link reportado     ninguno (no se contrata nada)             = 0 → BAJO
 *
 *  En el link reportado lo que importa son los gatillos de fraude, que no
 *  dependen del riesgo inherente. */
export const FACTORES_POR_USO: Record<UsoPrevisto, FactoresPaso0> = {
  cliente_b2b: { ...NINGUNO, mercadoVigilado: true },
  proveedor_pagos: { ...NINGUNO, fondos: true, mercadoVigilado: true, datosPersonales: true, accesoSistemas: true },
  integracion: { ...NINGUNO, mercadoVigilado: true, datosPersonales: true, accesoSistemas: true },
  link_reportado: { ...NINGUNO },
};

export const ETIQUETA_USO: Record<UsoPrevisto, string> = {
  cliente_b2b: 'Cliente B2B',
  proveedor_pagos: 'Proveedor de pagos',
  integracion: 'Integración',
  link_reportado: 'Link reportado',
};

export function sumaPaso0(f: FactoresPaso0): number {
  return FACTORES.reduce((s, x) => s + (f[x.clave] ? x.peso : 0), 0);
}

export function riesgoDeSuma(suma: number): RiesgoInherente {
  if (suma <= 1) return 'BAJO';
  if (suma <= 4) return 'MEDIO';
  if (suma <= 7) return 'ALTO';
  return 'CRITICO';
}

/** §9: puntaje mínimo por riesgo inherente. */
export const UMBRAL: Record<RiesgoInherente, number> = { BAJO: 50, MEDIO: 65, ALTO: 80, CRITICO: 90 };
