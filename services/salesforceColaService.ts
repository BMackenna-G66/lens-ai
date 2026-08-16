// Recuperación de la Bandeja desde Salesforce (PULL).
//
// El camino normal es push: Salesforce → Lambda `ofac-pep-trx-bot-receptor` →
// Firestore. Ese camino no tiene vuelta atrás: si la cola se vacía en Lens (por
// una limpieza masiva, por ejemplo), los casos que siguen ABIERTOS en Salesforce
// no vuelven solos, porque Salesforce ya los empujó una vez.
//
// Este servicio consulta Salesforce de LECTURA por las colas de trabajo y
// reconstruye los casos en Firestore con la misma forma que escribe el receptor,
// para que la Bandeja no note la diferencia. NO reemplaza al receptor ni lo toca:
// es un camino aparte, de recuperación manual.
//
// Escribe con merge: solo los campos de ingesta. El trabajo del analista
// (screening, asignación, cierres, status) que ya estuviera en el documento NO se
// pisa — igual que el updateMask del receptor.

import { doc, writeBatch, Firestore } from 'firebase/firestore';
import { getDb } from './firebaseService';
import { CASOS_COLLECTION, normalizeCaseNumber } from './casosService';

const WORKER_BASE = 'https://empresadocs-proxy.bmackenna.workers.dev';

// Colas de Salesforce (Owner de tipo Queue) que alimentan la Bandeja:
//   · "Revisión Casos LN / PEP´s" → casos "Coincidencia OFAC"
//   · "Compliance"                → casos del bot que detiene transacciones
export const COLAS_SF = ['Revisión Casos LN / PEP´s', 'Compliance'] as const;

export interface CasoSFRemoto {
  id: string;              // Id de Salesforce
  numeroCaso: string;
  asunto: string;
  nombreCuenta: string;
  pais: string;
  creadoEn: string;
  cola: string;
  datos: Record<string, unknown>;   // payload con las MISMAS claves que manda el bot
}

export interface ResumenCola {
  cola: string;
  total: number;
}

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

interface SFRecord {
  Id?: string; CaseNumber?: string; Subject?: string; Status?: string; CreatedDate?: string;
  Priority?: string; Country__c?: string; C_Review__c?: string; C_Status__c?: string;
  Type?: string; Nacionalidad__c?: string; ContactEmail?: string; SuppliedEmail?: string;
  userId__c?: string;
  Owner?: { Name?: string };
  Account?: {
    Name?: string; customer_id__c?: string; first_name__c?: string; last_name__c?: string;
    id_number__c?: string; id_type__c?: string; nationality__c?: string; country__c?: string;
    PersonEmail?: string; compliance_status__c?: string;
  };
}

// Traduce un Case de Salesforce al payload con las claves en español que usa la
// Bandeja (las mismas que manda el bot; ver aws/casos-receptor). Los datos de la
// persona viven en la Cuenta, no en el Case.
function aPayload(r: SFRecord): Record<string, unknown> {
  const a = r.Account ?? {};
  const nombre = txt(a.first_name__c);
  const apellido = txt(a.last_name__c);
  const completo = [nombre, apellido].filter(Boolean).join(' ');
  const payload: Record<string, unknown> = {
    'Número del caso': normalizeCaseNumber(txt(r.CaseNumber)),
    'Asunto': txt(r.Subject),
    'Nombre de la cuenta': txt(a.Name),
    'Estado': txt(r.Status),
    'Prioridad': txt(r.Priority),
    'País': txt(r.Country__c),
    'País Origen': txt(r.Country__c),
    'Id interno del usuario': txt(a.customer_id__c) || txt(r.userId__c),
    'Nombre': nombre,
    'Apellido': apellido,
    'Nombre completo': completo,
    'Número de DNI': txt(a.id_number__c),
    'Tipo de DNI': txt(a.id_type__c),
    'Nacionalidad': txt(a.nationality__c) || txt(r.Nacionalidad__c),
    'Email': txt(r.ContactEmail) || txt(a.PersonEmail) || txt(r.SuppliedEmail),
    '[C] Review': txt(r.C_Review__c),
    '[C] Status': txt(r.C_Status__c),
    'Tipo del caso': txt(r.Type),
    'Estado compliance': txt(a.compliance_status__c),
    'Cola Salesforce': txt(r.Owner?.Name),
    'Id Salesforce': txt(r.Id),
    'Fecha de creación': txt(r.CreatedDate),
    // Marca de procedencia: este caso se recuperó por consulta, no llegó empujado.
    'Origen ingesta': 'recuperado desde Salesforce',
  };
  // Las claves vacías se descartan: la ficha muestra el payload tal cual y no
  // tiene sentido llenarla de campos en blanco.
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => txt(v) !== ''));
}

async function pedir(params: Record<string, string>): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(`${WORKER_BASE}/salesforce/casos-cola?${qs}`);
  const texto = await resp.text();
  let data: unknown;
  try { data = JSON.parse(texto); } catch { throw new Error(texto.slice(0, 200) || `HTTP ${resp.status}`); }
  if (!resp.ok) {
    const arr = Array.isArray(data) ? data as Array<{ message?: string }> : [];
    const msg = arr[0]?.message || (data as { error?: string })?.error || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data as Record<string, unknown>;
}

// Cuántos casos ABIERTOS hay hoy en cada cola de Salesforce (sin traerlos).
export async function contarCasosCola(): Promise<ResumenCola[]> {
  const data = await pedir({ conteo: '1' });
  const records = (data.records ?? []) as Array<{ total?: number; colaNombre?: string }>;
  return records
    .filter(r => (COLAS_SF as readonly string[]).includes(txt(r.colaNombre)))
    .map(r => ({ cola: txt(r.colaNombre), total: Number(r.total ?? 0) }));
}

// Trae los casos ABIERTOS de las colas de trabajo. Solo lectura.
export async function traerCasosCola(limitePorCola = 1000): Promise<CasoSFRemoto[]> {
  const salida: CasoSFRemoto[] = [];
  for (const cola of COLAS_SF) {
    const data = await pedir({ cola, limite: String(limitePorCola) });
    for (const r of (data.records ?? []) as SFRecord[]) {
      const numeroCaso = normalizeCaseNumber(txt(r.CaseNumber));
      if (!numeroCaso) continue;
      salida.push({
        id: txt(r.Id),
        numeroCaso,
        asunto: txt(r.Subject),
        nombreCuenta: txt(r.Account?.Name),
        pais: txt(r.Country__c),
        creadoEn: txt(r.CreatedDate),
        cola,
        datos: aPayload(r),
      });
    }
  }
  return salida;
}

export interface ResultadoImportacion {
  nuevos: number;
  actualizados: number;
}

// Escribe los casos en Firestore. `yaEnBandeja` son los ids que la Bandeja ya
// tiene: a esos NO se les toca `recibidoEn` (perdería el orden y la antigüedad
// real de la cola) y se conserva todo el trabajo del analista.
export async function importarCasos(
  remotos: CasoSFRemoto[],
  yaEnBandeja: Set<string>,
): Promise<ResultadoImportacion> {
  const db = getDb() as Firestore | null;
  if (!db || remotos.length === 0) return { nuevos: 0, actualizados: 0 };
  let nuevos = 0, actualizados = 0;

  for (let i = 0; i < remotos.length; i += 450) {   // límite de 500 por batch
    const batch = writeBatch(db);
    for (const c of remotos.slice(i, i + 450)) {
      const docId = c.numeroCaso.replace(/\//g, '-');   // igual que el receptor
      const existe = yaEnBandeja.has(docId);
      existe ? actualizados++ : nuevos++;
      const campos: Record<string, unknown> = {
        numeroCaso: c.numeroCaso,
        asunto: c.asunto,
        nombreCuenta: c.nombreCuenta,
        pais: c.pais,
        origen: 'salesforce',
        datos: c.datos,
      };
      // Para los casos nuevos, la fecha de recepción es la de creación en
      // Salesforce (no "ahora"): así la cola queda ordenada como corresponde y
      // reimportar no reordena nada.
      if (!existe) campos.recibidoEn = c.creadoEn || new Date().toISOString();
      // merge: preserva screening, asignación, cierres y statusCaso.
      batch.set(doc(db, CASOS_COLLECTION, docId), campos, { merge: true });
    }
    await batch.commit();
  }
  return { nuevos, actualizados };
}
