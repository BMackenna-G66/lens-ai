// analyticsService.ts
// Lightweight localStorage-based analytics tracker for Lens AI.
// Persists event history so the Dashboard can show usage stats
// even across page reloads, without requiring a backend.

export type ModuleKey = 'analyzer' | 'tools' | 'crypto' | 'compliance';

export interface AnalyticsEvent {
  type: 'module_visit' | 'document_processed' | 'crypto_analyzed' | 'financial_analyzed' | 'compliance_analyzed';
  module: ModuleKey;
  timestamp: number;        // ms since epoch
  country?: string;         // for document_processed events
  hasRisk?: boolean;        // for document_processed events
  userId?: string;          // Firebase UID when logged in
}

const EVENTS_KEY = 'lens_ai_analytics_v1';
const MAX_EVENTS = 1000;

// ─── Write ────────────────────────────────────────────────────────────────────

export function trackEvent(event: Omit<AnalyticsEvent, 'timestamp'>): void {
  try {
    const events = readEvents();
    events.push({ ...event, timestamp: Date.now() });
    // Keep only the most recent MAX_EVENTS entries to bound storage use
    const trimmed = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events;
    localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage quota exceeded or private mode – silently skip
  }
}

export function trackModuleVisit(module: ModuleKey, userId?: string): void {
  trackEvent({ type: 'module_visit', module, userId });
}

export function trackDocumentProcessed(module: ModuleKey, country?: string, hasRisk?: boolean, userId?: string): void {
  trackEvent({ type: 'document_processed', module, country, hasRisk, userId });
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export function readEvents(): AnalyticsEvent[] {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]') as AnalyticsEvent[];
  } catch {
    return [];
  }
}

export interface DashboardStats {
  totalDocuments: number;
  documentsThisWeek: number;
  riskAlertsDetected: number;
  cryptoAnalyzed: number;
  complianceAnalyzed: number;
  financialAnalyzed: number;
  moduleUsage: { name: string; value: number; module: ModuleKey }[];
  topCountries: { country: string; count: number }[];
  dailyActivity: { date: string; documentos: number }[];
}

const MODULE_LABELS: Record<ModuleKey, string> = {
  analyzer: 'Analizador',
  tools: 'Límites Trans.',
  crypto: 'Lens Crypto',
  compliance: 'Evaluador AML',
};

export function computeDashboardStats(): DashboardStats {
  const events = readEvents();
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const twoWeeks = 14 * 24 * 60 * 60 * 1000;

  const docEvents = events.filter(e => e.type === 'document_processed');
  const recentDocEvents = docEvents.filter(e => now - e.timestamp < oneWeek);

  // Module usage (visits + processing combined)
  const moduleCounts: Record<ModuleKey, number> = { analyzer: 0, tools: 0, crypto: 0, compliance: 0 };
  for (const e of events) {
    if (e.type === 'module_visit') moduleCounts[e.module] = (moduleCounts[e.module] || 0) + 1;
  }
  const moduleUsage = (Object.keys(moduleCounts) as ModuleKey[]).map(m => ({
    name: MODULE_LABELS[m],
    value: moduleCounts[m],
    module: m,
  }));

  // Top countries
  const countryCounts: Record<string, number> = {};
  for (const e of docEvents) {
    if (e.country) countryCounts[e.country] = (countryCounts[e.country] || 0) + 1;
  }
  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([country, count]) => ({ country, count }));

  // Daily activity last 14 days
  const dailyActivity: { date: string; documentos: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const dayStart = new Date(now - i * 24 * 60 * 60 * 1000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const count = docEvents.filter(
      e => e.timestamp >= dayStart.getTime() && e.timestamp <= dayEnd.getTime()
    ).length;
    const label = dayStart.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
    dailyActivity.push({ date: label, documentos: count });
  }

  return {
    totalDocuments: docEvents.length,
    documentsThisWeek: recentDocEvents.length,
    riskAlertsDetected: docEvents.filter(e => e.hasRisk).length,
    cryptoAnalyzed: events.filter(e => e.type === 'crypto_analyzed').length,
    complianceAnalyzed: events.filter(e => e.type === 'compliance_analyzed').length,
    financialAnalyzed: events.filter(e => e.type === 'financial_analyzed').length,
    moduleUsage,
    topCountries,
    dailyActivity,
  };
}
