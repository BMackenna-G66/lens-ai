// Tipos para la Vista 360° — consulta consolidada en vivo de una persona/empresa
// a través de Regcheq (AML/KYC Chile + causas penales) e Inspektor (Colombia).

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
  // Screening Colombia (Inspektor)
  inspektor?: Lens360Inspektor;
  // Veredicto consolidado
  verdict: Lens360Verdict;
  verdictReasons: string[];
  sources: { regcheq: boolean; inspektor: boolean };
}
