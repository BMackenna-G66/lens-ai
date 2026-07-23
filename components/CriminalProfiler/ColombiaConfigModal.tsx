import React, { useState } from 'react';
import { X, Save, RotateCcw, Settings2 } from 'lucide-react';
import {
  getCriminalConfig, saveCriminalConfig, resetCriminalConfig, CRIMINAL_CONFIG_DEFAULT,
  type CriminalConfig, type ProviderSeverity,
} from '../../services/colombiaCriminalModel';

// Editor de la "matriz" del Perfil Criminal Colombia (Capas 1–6).
// Los cambios se guardan en localStorage y aplican a los PRÓXIMOS masivos/consultas
// (no recalcula Excel ya exportados). Replica el patrón del catálogo de Chile.
const SEVERITIES: ProviderSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];

export const ColombiaConfigModal: React.FC<{ dark: boolean; onClose: () => void }> = ({ dark, onClose }) => {
  // Clon editable (deep copy) de la config activa.
  const [cfg, setCfg] = useState<CriminalConfig>(() => JSON.parse(JSON.stringify(getCriminalConfig())));
  const [saved, setSaved] = useState(false);

  const card = dark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const label = dark ? 'text-slate-400' : 'text-slate-500';
  const numCls = `w-20 px-2 py-1 rounded-lg text-sm text-right bg-transparent border ${dark ? 'border-slate-700 text-slate-100' : 'border-slate-300 text-slate-800'}`;
  const selCls = `px-2 py-1 rounded-lg text-sm bg-transparent border ${dark ? 'border-slate-700 text-slate-100' : 'border-slate-300 text-slate-800'}`;

  const num = (val: number, on: (n: number) => void) => (
    <input type="number" value={val} onChange={e => { on(Number(e.target.value)); setSaved(false); }} className={numCls} />
  );
  // Editar un peso dentro de risk.<group>
  const setRisk = <K extends 'identity' | 'evidence' | 'severity'>(group: K, key: string, n: number) =>
    setCfg(c => ({ ...c, risk: { ...c.risk, [group]: { ...c.risk[group], [key]: n } } }));

  const Row: React.FC<{ k: string; children: React.ReactNode }> = ({ k, children }) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs font-medium">{k}</span>{children}
    </div>
  );
  const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
    <div className={`border rounded-xl p-4 ${card}`}>
      <h4 className="text-[11px] font-black uppercase tracking-widest mb-2">{title}</h4>
      {hint && <p className={`text-[10px] mb-2 ${label}`}>{hint}</p>}
      {children}
    </div>
  );

  const guardar = () => { saveCriminalConfig(cfg); setSaved(true); };
  const restaurar = () => { resetCriminalConfig(); setCfg(JSON.parse(JSON.stringify(CRIMINAL_CONFIG_DEFAULT))); setSaved(true); };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className={`rounded-[2rem] shadow-2xl w-full max-w-3xl h-[90vh] overflow-hidden flex flex-col border ${dark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
        <div className={`p-5 px-7 border-b flex justify-between items-center shrink-0 ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2">
            <Settings2 size={20} className="text-indigo-500" />
            <div>
              <h2 className="text-lg font-black">Configuración de la matriz — Perfil Criminal (Colombia)</h2>
              <p className={`text-[11px] ${label}`}>Aplica a los próximos masivos/consultas. No recalcula Excel ya exportados.</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}><X size={20} /></button>
        </div>

        <div className="flex-grow overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Section title="Severidad por prioridad" hint="Cómo se mapea la prioridad P1–P4 de Inspektor a severidad.">
            {[1, 2, 3, 4].map(p => (
              <Row key={p} k={`P${p}`}>
                <select className={selCls} value={cfg.severityByPriority[p]} onChange={e => { setCfg(c => ({ ...c, severityByPriority: { ...c.severityByPriority, [p]: e.target.value as ProviderSeverity } })); setSaved(false); }}>
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Row>
            ))}
          </Section>

          <Section title="Bandas de riesgo (score → nivel)" hint="0–low: LOW · (low,medium]: MEDIUM · (medium,high]: HIGH · >high: CRITICAL.">
            <Row k="low (máx LOW)">{num(cfg.risk.bands.low, n => setCfg(c => ({ ...c, risk: { ...c.risk, bands: { ...c.risk.bands, low: n } } })))}</Row>
            <Row k="medium (máx MEDIUM)">{num(cfg.risk.bands.medium, n => setCfg(c => ({ ...c, risk: { ...c.risk, bands: { ...c.risk.bands, medium: n } } })))}</Row>
            <Row k="high (máx HIGH)">{num(cfg.risk.bands.high, n => setCfg(c => ({ ...c, risk: { ...c.risk, bands: { ...c.risk.bands, high: n } } })))}</Row>
            <Row k="recurrencia (eventos distintos)">{num(cfg.risk.recurrenceDistinct, n => setCfg(c => ({ ...c, risk: { ...c.risk, recurrenceDistinct: n } })))}</Row>
          </Section>

          <Section title="Pesos — Identidad">
            {Object.keys(cfg.risk.identity).map(k => (
              <Row key={k} k={k}>{num(cfg.risk.identity[k], n => setRisk('identity', k, n))}</Row>
            ))}
          </Section>

          <Section title="Pesos — Evidencia (fuerza)">
            {Object.keys(cfg.risk.evidence).map(k => (
              <Row key={k} k={k}>{num(cfg.risk.evidence[k], n => setRisk('evidence', k, n))}</Row>
            ))}
          </Section>

          <Section title="Pesos — Severidad">
            {Object.keys(cfg.risk.severity).map(k => (
              <Row key={k} k={k}>{num(cfg.risk.severity[k], n => setRisk('severity', k, n))}</Row>
            ))}
          </Section>

          <Section title="Umbrales de identidad" hint="Corte de similitud de nombre y puntajes (avanzado).">
            <Row k="doc exacto (+)">{num(cfg.identity.docExact, n => setCfg(c => ({ ...c, identity: { ...c.identity, docExact: n } })))}</Row>
            <Row k="doc distinto (−)">{num(cfg.identity.docDifferent, n => setCfg(c => ({ ...c, identity: { ...c.identity, docDifferent: n } })))}</Row>
            <Row k="corte nombre alto">{num(cfg.identity.nameHighCut, n => setCfg(c => ({ ...c, identity: { ...c.identity, nameHighCut: n } })))}</Row>
            <Row k="PROBABLE: nombre mín.">{num(cfg.identity.probableNameMin, n => setCfg(c => ({ ...c, identity: { ...c.identity, probableNameMin: n } })))}</Row>
          </Section>
        </div>

        <div className={`p-4 px-7 border-t flex items-center justify-between shrink-0 ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
          <button onClick={restaurar} className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl ${dark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'}`}>
            <RotateCcw size={14} /> Restaurar default
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Guardado</span>}
            <button onClick={guardar} className="flex items-center gap-1.5 text-sm font-bold px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white">
              <Save size={16} /> Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
