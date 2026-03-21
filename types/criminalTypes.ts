export interface Crime {
  id: string; tipo: string; estado: string; fecha: string;
  riesgo: string; rit: string; ruc: string; tribunal: string;
  catalogValue?: number; catalogType?: string;
}
export type AnalysisAction = 'Liberar' | 'Revisar' | 'Liberar + UCR' | 'Fully Blocked' | '';
export interface PreEvaluation { decision: string; razon: string; scoreTotal: number; }
export interface PersonProfile {
  rut: string; nombre: string; apellido: string; nombreCuenta: string;
  customerId: string; conInfo: boolean; crimes: Crime[];
  totalCrimes: number; totalHighRiskCrimes: number; highestRisk: string;
  status: 'Pendiente' | 'Revisado'; selectedAction: AnalysisAction;
  preEvaluation?: PreEvaluation; isPep?: boolean;
  notes?: string;
}
export interface CatalogItem { nombre: string; riesgoG66: string; valor: number; tipo: string; }
export interface DecisionRule {
  precedentesCount: number; noPrecedentesCount: number;
  preEquivalente: number; noPreEquivalente: number;
  totalEquivalente: number; decision: string; razon: string;
}
export interface CatalogData {
  items: CatalogItem[]; parameters: Record<string, any>; decisionTable: DecisionRule[];
}
export interface CriminalAppState {
  profiles: PersonProfile[]; catalog: CatalogData | null;
  loading: boolean; error: string | null; selectedRut: string | null;
  view: 'dashboard' | 'catalog' | 'comparison' | 'triage';
}
export enum RiskLevel { LOW = 'low', MEDIUM = 'medium', HIGH = 'high', CRITICAL = 'critical' }
