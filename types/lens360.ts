// Tipos para la Vista 360° — consulta consolidada en vivo de una persona/empresa
// a través de Regcheq (AML/KYC Chile + causas penales) e Inspektor (Colombia).

import { PersonProfile } from './criminalTypes';

export type Lens360Verdict = 'ALTO' | 'MEDIO' | 'BAJO' | 'SIN_DATOS';
export type Lens360PersonType = 'natural' | 'legal';

export interface Lens360ListHit {
  nombre: string;        // nombre visible de la lista (OFAC, ONU, PEP Chile, …)
  coincidence: boolean;
  risk: string;
}

export interface Lens360Crime {
  crimen: string;
  estado?: string;
  fecha?: string;
  tribunal?: string;
  ruc?: string;
}

export interface Lens360CriminalDecision {
  decision: string;
  razon: string;
  totalEquivalente: number;
  precedentes: number;      // cantidad de delitos precedentes
  noPrecedentes: number;    // cantidad de delitos no precedentes
  preScore: number;         // puntaje aportado por precedentes
  noPreScore: number;       // puntaje aportado por no precedentes
}

export interface Lens360InspektorHit {
  grupo: string;         // grupo objetivo / lista
  detalle: string;
}

export interface Lens360Inspektor {
  coincidencias: number;
  hits: Lens360InspektorHit[];
  error?: string;        // si la consulta falló (p.ej. CORS)
}

export interface Lens360RelatedPerson {
  dni: string;
  name: string;
  roles: string[];       // representante legal, beneficiario final, etc.
  percentage?: number;   // % de participación (si aplica)
  country?: string;
}

export interface Lens360Activity {
  code: string; name: string; category: string; date: string; afectoIva: string;
}

// Enriquecimiento Regcheq (screening AML + SII) para el Analizador de Documentos y Batch.
export interface RegcheqEnrichment {
  loading?: boolean;        // consulta en curso
  consultado: boolean;      // se intentó la consulta
  encontrado: boolean;      // Regcheq devolvió datos
  nombre?: string;
  regcheqRisk?: string;
  pepLevel?: string;
  amlHits: Lens360ListHit[];
  tributaria?: Lens360Tributaria;
  alerts?: import('../services/validationRules').ValidationAlert[];
  error?: string;
}

// Situación tributaria (SII) — solo aplica a personas jurídicas.
export interface Lens360Tributaria {
  rutContribuyente: string;
  nombreSii: string;
  presentaInicioActividades: string;   // Sí / No / —
  fechaInicioActividades: string;
  empresaMenorTamano: string;          // Sí / No / —
  monedaExtranjera: string;            // Sí / No / —
  ultimaActualizacion: string;
  situacionesIrregulares: string[];
  actividades: Lens360Activity[];
}

export interface Lens360Result {
  rut: string;
  nombre: string;
  personType?: string;
  country: string;
  regcheqRisk?: string;
  pepLevel?: string;
  // Screening AML Chile (Regcheq)
  amlHits: Lens360ListHit[];
  // Antecedentes penales (Causas Penales Chile) + motor de decisión criminal
  crimes: Lens360Crime[];
  criminalDecision?: Lens360CriminalDecision;
  criminalProfile?: PersonProfile;   // perfil completo para la ficha detallada (Criminal Profiler)
  // Screening Colombia (Inspektor)
  inspektor?: Lens360Inspektor;
  // Personas relacionadas (representantes legales, beneficiarios) para screening en cadena
  related: Lens360RelatedPerson[];
  // Situación tributaria (SII) — presente para personas jurídicas con datos
  tributaria?: Lens360Tributaria;
  // Veredicto consolidado
  verdict: Lens360Verdict;
  verdictReasons: string[];
  // Alertas del motor de reglas de validación (solo visual + PDF/Excel)
  alerts?: import('../services/validationRules').ValidationAlert[];
  sources: { regcheq: boolean; inspektor: boolean };
}
