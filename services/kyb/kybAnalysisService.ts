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
import type { BatchCompanyInput, BatchDocumentInput } from '../../types/batch';
import type { ExtractedField } from '../../types';
import type { EmpresaDocsDocument, EmpresaDocsContexto } from '../../types/empresaDocs';
import { mapAdminALadoCanonico, mapEstadoAdmin } from './kybAdminMapper';
import { mapLensALadoCanonico, faltantesLens } from './kybLensMapper';
import { compararKyb } from './kybComparador';
import { calcularCertidumbre, coberturaComparada } from './kybCertaintyEngine';
import { evaluarAlertas } from './kybAlertasCatalogo';
import { guardarAnalisis } from './kybQueueService';
import type { AnalisisKyb, EstadoAnalisisKyb, AlertaKyb } from '../../types/kyb';
import type { LadoCanonico } from '../../types/kybCanonico';

export interface ProgresoAnalisis {
  fase: string;
  detalle?: string;
}

export interface OpcionesAnalisis {
  // Sin key, el análisis corre igual pero solo con el lado Admin.
  hayApiKey: boolean;
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

const runId = (hash: string): string => `${new Date().toISOString().replace(/[:.]/g, '-')}_${hash}`;

// ── Descarga de documentos ───────────────────────────────────────────────────
// El pipeline necesita el blob. Un documento que no se pudo bajar NO aborta el
// análisis: viaja con `error` y el pipeline lo cuenta como fallido.
async function aDocumentosDePipeline(
  docs: EmpresaDocsDocument[],
  onProgreso?: (p: ProgresoAnalisis) => void,
): Promise<BatchDocumentInput[]> {
  const salida: BatchDocumentInput[] = [];
  let i = 0;
  for (const d of docs) {
    i++;
    onProgreso?.({ fase: 'Descargando documentos', detalle: `${i}/${docs.length} · ${d.fileName ?? ''}` });
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
    salida.push(entrada);
  }
  return salida;
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
  const detalle = await getEmpresaDocsCompany(companyId);
  const admin: LadoCanonico = mapAdminALadoCanonico(detalle);
  const estadoAdmin = mapEstadoAdmin(companyId, detalle);

  // Contexto: T&C y segmentación. No entra en la matriz pero alimenta los frenos
  // duros del flujo automático. Si falla, el análisis sigue.
  let contexto: EmpresaDocsContexto | undefined;
  try {
    onProgreso?.({ fase: 'Consultando contexto de Admin' });
    contexto = await getEmpresaDocsContexto(companyId);
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
      const resultado = await processOneCompany(entrada, 'individual', {
        onDocOcr: () => {},
        onPhase: (label) => onProgreso?.({ fase: label }),
      });
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

  // ── 3 y 4. Comparación y certidumbre (puros) ──
  onProgreso?.({ fase: 'Comparando los 12 componentes' });
  const componentes = compararKyb(lens, admin);

  // Las 36 alertas del catálogo. Las que no se pueden evaluar por falta de fuente
  // salen igual con `evaluable: false`, para que el inventario sea completo y
  // nadie confunda "no se pudo evaluar" con "no hay hallazgos".
  onProgreso?.({ fase: 'Evaluando alertas' });
  const alertas: AlertaKyb[] = evaluarAlertas({
    lens, admin, estadoAdmin, contexto, componentes, documentos,
    // El screening criminal de la empresa y sus personas todavía no se corre acá:
    // las alertas que dependen de él quedan no evaluables, no en silencio.
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
    faltantes: faltantes.length ? faltantes : undefined,
    mensajeError,
  };

  onProgreso?.({ fase: 'Guardando resultado' });
  await guardarAnalisis(analisis);
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
