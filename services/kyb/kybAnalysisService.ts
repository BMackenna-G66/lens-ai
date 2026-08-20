// Orquestador del análisis KYB de UNA empresa.
//
// Es el único archivo del módulo que hace I/O: junta las piezas puras (mappers,
// comparador, motor de certidumbre) con las fuentes reales (Admin + pipeline de
// documentos) y persiste el resultado. Los componentes de UI no llaman a nada de
// esto directamente: llaman acá.
//
// Secuencia:
//   1. Admin — ficha, personas, malla societaria y contexto (T&C, segmentación)
//   2. Documentos — descarga + OCR + extracción con el pipeline que ya existe
//   3. Comparación de los 12 componentes (puro)
//   4. Certidumbre explicable (puro)
//   5. Persistencia en la subcolección analisis/{runId}
//
// Reglas que NO se negocian acá:
//   · Sin API key de Gemini el análisis queda INCOMPLETO y la certidumbre en
//     `null`. NUNCA 0%: un 0 dice "está todo mal", un null dice "no sabemos".
//   · Si falta el lado de los documentos, los componentes salen SOLO_ADMIN, no
//     DISCREPA: no hay contradicción, hay falta de contraparte.

import { getEmpresaDocsCompany, getEmpresaDocsContexto, downloadEmpresaDoc } from '../empresaDocsClient';
import { processOneCompany } from '../batchProcessor';
import { runPool } from '../casosCriminalService';
import type { BatchCompanyInput, BatchDocumentInput } from '../../types/batch';
import type { ExtractedField } from '../../types';
import type { EmpresaDocsDocument, EmpresaDocsContexto } from '../../types/empresaDocs';
import { mapAdminALadoCanonico, mapEstadoAdmin } from './kybAdminMapper';
import { mapLensALadoCanonico, faltantesLens } from './kybLensMapper';
import { compararKyb } from './kybComparador';
import { calcularCertidumbre, coberturaComparada } from './kybCertaintyEngine';
import { evaluarAlertas } from './kybAlertasCatalogo';
import { screenearEmpresaKyb, aScreeningPersonas, type ResultadoScreeningKyb } from './kybScreeningService';
import { guardarAnalisis } from './kybQueueService';
import { logAnalisisKyb } from './kybLogService';
import type { AnalisisKyb, EstadoAnalisisKyb, AlertaKyb, EmpresaKyb } from '../../types/kyb';
import type { LadoCanonico } from '../../types/kybCanonico';

export interface ProgresoAnalisis {
  fase: string;
  detalle?: string;
}

export interface OpcionesAnalisis {
  // Sin key, el análisis corre igual pero solo con el lado Admin.
  hayApiKey: boolean;
  // Para el espejo analítico. Si no viene, el análisis corre igual y solo no se
  // registra en Redshift.
  empresa?: EmpresaKyb;
  actor?: { uid?: string; nombre?: string; esSistema?: boolean };
  onProgreso?: (p: ProgresoAnalisis) => void;
  // Máximo de documentos a procesar. Cada uno es descarga + OCR (CPU) + Gemini.
  maxDocumentos?: number;
}

// Hash barato y estable de los documentos. Si el cliente sube uno nuevo, cambia y
// el análisis guardado queda desactualizado sin necesidad de re-analizar para
// darse cuenta. FNV-1a, el mismo criterio de idempotencia que ya usa el cierre
// de casos en Salesforce.
export function hashDocumentos(docs: { fileName?: string; date?: string; link?: string }[]): string {
  const semilla = docs
    .map(d => `${d.link ?? d.fileName ?? ''}|${d.date ?? ''}`)
    .sort()
    .join('§');
  let h = 0x811c9dc5;
  for (let i = 0; i < semilla.length; i++) {
    h ^= semilla.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Tope por fase. Cualquier paso que no vuelva en su tiempo corta con un mensaje
// que dice QUÉ fase falló, en vez de dejar el análisis colgado sin avanzar.
async function conTope<T>(fase: string, ms: number, tarea: Promise<T>): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    t = setTimeout(() => rechazar(new Error(`${fase}: no respondió en ${Math.round(ms / 1000)}s`)), ms);
  });
  try {
    return await Promise.race([tarea, limite]);
  } finally {
    if (t) clearTimeout(t);
  }
}

const TOPES_MS = {
  admin: 45_000,
  contexto: 30_000,
  documentos: 240_000,   // descarga + OCR + Gemini de varios documentos
  screening: 180_000,    // una consulta a Regcheq por sujeto
} as const;

const runId = (hash: string): string => `${new Date().toISOString().replace(/[:.]/g, '-')}_${hash}`;

// ── Descarga de documentos ───────────────────────────────────────────────────
// El pipeline necesita el blob. Un documento que no se pudo bajar NO aborta el
// análisis: viaja con `error` y el pipeline lo cuenta como fallido.
async function aDocumentosDePipeline(
  docs: EmpresaDocsDocument[],
  onProgreso?: (p: ProgresoAnalisis) => void,
): Promise<BatchDocumentInput[]> {
  // En PARALELO con concurrencia acotada. Antes era un for secuencial: con 12
  // documentos, uno lento retrasaba a todos y uno colgado trababa el análisis.
  const salida: BatchDocumentInput[] = new Array(docs.length);
  let hechos = 0;
  await runPool(docs.map((d, idx) => ({ d, idx })), async ({ d, idx }) => {
    const i = idx + 1;
    onProgreso?.({ fase: 'Descargando documentos', detalle: `${hechos}/${docs.length} · ${d.fileName ?? ''}` });
    const entrada: BatchDocumentInput = {
      id: String(d.link || `doc-${i}`),
      fileName: String(d.fileName ?? `documento-${i}`),
      source: 'empresa_docs',
      fileKey: d.link,
      slot: d.slot,
      documentStatus: d.status,
      uploadedDate: d.date,
    };
    // La descarga va en cascada (proxy local → S3 presignado); si ninguna sirve,
    // el documento viaja con `error` y el pipeline lo cuenta como fallido en vez
    // de abortar el análisis completo.
    try {
      const bajado = await downloadEmpresaDoc(String(d.link ?? ''));
      entrada.blob = bajado.blob;
      entrada.presignedUrl = bajado.presignedUrl;
    } catch (e) {
      entrada.error = e instanceof Error ? e.message : String(e);
    }
    salida[idx] = entrada;
    hechos++;
  }, 4);
  return salida.filter(Boolean);
}

// ── Entrada principal ───────────────────────────────────────────────────────
export async function analizarEmpresa(
  companyId: string,
  opciones: OpcionesAnalisis,
): Promise<AnalisisKyb> {
  const { hayApiKey, onProgreso, maxDocumentos = 12 } = opciones;
  const faltantes: string[] = [];

  // ── 1. Admin ──
  onProgreso?.({ fase: 'Consultando Admin' });
  const detalle = await conTope('Consultando Admin', TOPES_MS.admin, getEmpresaDocsCompany(companyId));
  const admin: LadoCanonico = mapAdminALadoCanonico(detalle);
  const estadoAdmin = mapEstadoAdmin(companyId, detalle);

  // Contexto: T&C y segmentación. No entra en la matriz pero alimenta los frenos
  // duros del flujo automático. Si falla, el análisis sigue.
  let contexto: EmpresaDocsContexto | undefined;
  try {
    onProgreso?.({ fase: 'Consultando contexto de Admin' });
    contexto = await conTope('Contexto de Admin', TOPES_MS.contexto, getEmpresaDocsContexto(companyId));
  } catch { faltantes.push('Contexto de Admin (T&C, segmentación)'); }
  // Los T&C sin firmar son un freno duro del flujo automático: se registra acá
  // para que la decisión no dependa de volver a consultar Admin.
  if (contexto && (contexto.terminos ?? []).some(t => !t?.dateSignature)) {
    faltantes.push('Términos y condiciones sin firmar');
  }

  const documentos = detalle.documents ?? [];
  const hash = hashDocumentos(documentos);

  // ── 2. Documentos (lado Lens) ──
  let lens: LadoCanonico = {};
  let estado: EstadoAnalisisKyb = 'COMPLETO';
  let mensajeError: string | undefined;

  if (!hayApiKey) {
    estado = 'INCOMPLETO';
    faltantes.push('Sin API key de Gemini: no se pudieron leer los documentos');
  } else if (documentos.length === 0) {
    estado = 'INCOMPLETO';
    faltantes.push('La empresa no tiene documentos cargados en Admin');
  } else {
    try {
      const entradas = await aDocumentosDePipeline(documentos.slice(0, maxDocumentos), onProgreso);
      const entrada: BatchCompanyInput = {
        id: companyId,
        companyName: admin.razonSocial ?? companyId,
        companyId,
        identificationNumber: admin.identificacionNumero,
        country: estadoAdmin.segmentacion ?? admin.domicilio?.pais,
        source: 'empresa_docs',
        documents: entradas,
      };
      const resultado = await conTope('Lectura de documentos', TOPES_MS.documentos,
        processOneCompany(entrada, 'individual', {
          onDocOcr: () => {},
          onPhase: (label) => onProgreso?.({ fase: label }),
        }));
      lens = mapLensALadoCanonico(resultado.extractedData as ExtractedField[]);
      const faltaLens = faltantesLens(lens);
      if (faltaLens.length > 0) {
        estado = 'INCOMPLETO';
        faltantes.push(...faltaLens.map(f => `No se extrajo de los documentos: ${f}`));
      }
      if (documentos.length > maxDocumentos) {
        faltantes.push(`Se analizaron ${maxDocumentos} de ${documentos.length} documentos`);
      }
    } catch (e) {
      estado = 'ERROR';
      mensajeError = e instanceof Error ? e.message : String(e);
    }
  }

  // ── 2b. Screening criminal de la empresa y sus relacionados ──
  // Mismo motor y mismo catálogo de delitos de Chile que la cola de Salesforce.
  // Si falla, el análisis sigue: el screening queda undefined y las alertas que
  // dependen de él vuelven a salir como no evaluables, que es lo correcto —
  // nunca como "sin hallazgos".
  let screening: ResultadoScreeningKyb | undefined;
  try {
    screening = await conTope('Screening criminal', TOPES_MS.screening,
      screenearEmpresaKyb(admin, lens, (hechos, total, nombre) =>
        onProgreso?.({ fase: 'Screening criminal', detalle: `${hechos}/${total} · ${nombre}`.slice(0, 80) })));
  } catch (e) {
    faltantes.push(`Screening criminal no disponible: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 3 y 4. Comparación y certidumbre (puros) ──
  onProgreso?.({ fase: 'Comparando los 12 componentes' });
  const componentes = compararKyb(lens, admin);

  // Las 36 alertas del catálogo. Las que no se pueden evaluar por falta de fuente
  // salen igual con `evaluable: false`, para que el inventario sea completo y
  // nadie confunda "no se pudo evaluar" con "no hay hallazgos".
  onProgreso?.({ fase: 'Evaluando alertas' });
  const alertas: AlertaKyb[] = evaluarAlertas({
    lens, admin, estadoAdmin, contexto, componentes, documentos,
    // Con esto DOC_007 (delito sensible), DOC_008 (PEP) y DOC_009 (coincidencia
    // en listas) pasan de "no evaluables" a evaluadas.
    screeningPersonas: aScreeningPersonas(screening),
  });
  const cert = calcularCertidumbre(componentes, alertas);

  // Si el análisis no está completo, el porcentaje NO se publica: `null`. Mostrar
  // un número calculado sobre medio análisis invita a decidir sobre él.
  const certidumbre = estado === 'COMPLETO' ? cert.certidumbre : null;

  if (!cert.invarianteOk) {
    // El número no se puede reconstruir desde sus razones: no es defendible.
    estado = 'ERROR';
    mensajeError = 'La suma de las razones no coincide con la certidumbre calculada.';
  }

  const analisis: AnalisisKyb = {
    runId: runId(hash),
    companyId,
    corridaEn: new Date().toISOString(),
    estado,
    hashDocumentos: hash,
    certidumbre,
    razones: cert.razones,
    componentes,
    alertas,
    lens,
    admin,
    estadoAdmin,
    screening,
    faltantes: faltantes.length ? faltantes : undefined,
    mensajeError,
  };

  onProgreso?.({ fase: 'Guardando resultado' });
  await guardarAnalisis(analisis);

  // Espejo analítico. Best-effort y con buffer de reintento: si el cluster está
  // pausado no se pierde, y si falla no rompe el análisis.
  if (opciones.empresa) {
    try { logAnalisisKyb(opciones.empresa, analisis, opciones.actor); } catch { /* espejo */ }
  }
  return analisis;
}

// Cobertura efectivamente comparada (los dos lados con dato). Es distinto de la
// certidumbre: un caso puede tener buen porcentaje con solo tres componentes
// comparados, y eso no alcanza para decidir.
export { coberturaComparada };

// ¿El análisis guardado sigue vigente para los documentos actuales?
export function analisisVigente(
  guardado: { hashDocumentos?: string } | undefined,
  documentosActuales: { fileName?: string; date?: string; link?: string }[],
): boolean {
  if (!guardado?.hashDocumentos) return false;
  return guardado.hashDocumentos === hashDocumentos(documentosActuales);
}
