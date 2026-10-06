// ENVÍO DE UN MASIVO AL CRIMINAL PROFILE — el botón de los masivos de Chile,
// Perú y Colombia.
//
// Una sola ruta de datos: el botón arma EL MISMO workbook que «Exportar Excel»,
// lo escribe como archivo y se lo pasa al Criminal Profile, que lo carga con el
// MISMO parser que usa la subida manual. Lo que llega directo es idéntico a
// descargar y subir; no hay un segundo formato que se desincronice.
//
// Todo queda en la memoria del navegador: nada va a Firestore, a AWS ni a la IA.

import * as XLSX from 'xlsx';

export type PaisCriminal = 'CL' | 'CO' | 'PE';

export interface CargaCriminal { pais: PaisCriminal; archivo: File }

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** El workbook como el archivo que se habría descargado. */
export function archivoDesdeWorkbook(wb: XLSX.WorkBook, nombre: string): File {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], nombre, { type: TIPO_XLSX });
}

/**
 * Antes de navegar: el masivo se desmonta y sus resultados en pantalla se
 * pierden. Se avisa y se ofrece descargar. Devuelve si hay que seguir.
 */
export function confirmarEnvio(
  descargar: () => void,
  preguntar: (mensaje: string) => boolean = m => window.confirm(m),
): boolean {
  const descargarAntes = preguntar(
    'Vas a pasar al Criminal Profile y se cierran los resultados del masivo que ves en pantalla.\n\n'
    + '¿Descargar el Excel antes de enviar?\n\nAceptar: descargar y enviar · Cancelar: ver otras opciones',
  );
  if (descargarAntes) { descargar(); return true; }
  return preguntar('¿Enviar sin descargar? Los resultados en pantalla se pierden.\n\nAceptar: enviar · Cancelar: quedarse acá');
}
