// Saneado de textos libres que viajan a APIs externas (Admin de Global66 y
// Salesforce). Ambas APIs fallan cuando el texto trae caracteres especiales
// (guiones, emojis, comillas, etc.), así que se dejan SOLO letras, números,
// espacios, punto y coma.
//
// Se aplica en el borde (justo antes de enviar) para que cubra tanto los textos
// del mantenedor de tipologías como lo que escribe el analista a mano.

// Todo lo que NO sea letra (con tildes/ñ), dígito, espacio, punto o coma.
const NO_PERMITIDO = /[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ .,]/g;

export function sanitizarTexto(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .normalize('NFC')
    .replace(NO_PERMITIDO, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sanea solo las claves indicadas de un objeto (deja el resto intacto).
export function sanitizarCampos<T extends Record<string, unknown>>(obj: T, claves: string[]): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of claves) {
    if (typeof out[k] === 'string') out[k] = sanitizarTexto(out[k]);
  }
  return out as T;
}

// Campos de texto libre del case-update de Salesforce que hay que sanear.
export const CAMPOS_TEXTO_SF = ['Comments', 'razon_3_dias__c'];
