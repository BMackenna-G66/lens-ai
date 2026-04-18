import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  investigateClient,
  COUNTRY_OPTIONS,
  RISK_CONFIG,
  PROVIDER_CONFIG,
  LIST_TYPE_LABELS,
  routeProvider,
  type KYCInput,
  type KYCResult,
  type KYCMatch,
  type NosisVariable,
  type ProviderType,
  type RegcheqLista,
} from '../../services/kycService';

// ── Props ─────────────────────────────────────────────────────────────────────
interface KYCAppProps {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

// ── PDF colors (same palette as RegcheqTool) ──────────────────────────────────
const PDF_NAVY   = [30, 58, 95]    as [number, number, number];
const PDF_INDIGO = [79, 70, 229]   as [number, number, number];
const PDF_RED    = [185, 28, 28]   as [number, number, number];
const PDF_GREEN  = [21, 128, 61]   as [number, number, number];
const PDF_AMBER  = [146, 64, 14]   as [number, number, number];
const PDF_WHITE  = [255, 255, 255] as [number, number, number];
const PDF_LGRAY  = [248, 249, 250] as [number, number, number];
const PDF_MGRAY  = [100, 116, 139] as [number, number, number];
const PDF_DTEXT  = [30, 41, 59]    as [number, number, number];

// ── Logo loader ───────────────────────────────────────────────────────────────
async function loadLogoForPDF(): Promise<string | null> {
  for (const path of ['/logo_global.jpg', '/lens-ai/logo_global.jpg']) {
    try {
      const res = await fetch(path);
      if (!res.ok) continue;
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch { continue; }
  }
  return null;
}

// ── PDF generation ────────────────────────────────────────────────────────────
async function generateKYCPDF(result: KYCResult) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 14;
  const now    = new Date();
  const dateStr = now.toLocaleString('es-CL');
  const getLastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 80;

  const providerCfg = PROVIDER_CONFIG[result.providerUsed];
  const totalHits = result.regcheqListas
    ? Object.values(result.regcheqListas).filter(l => l.coincidence).length
    : result.matches.length;

  // ── Header ──
  doc.setFillColor(...PDF_NAVY);
  doc.rect(0, 0, pageW, 38, 'F');
  doc.setFillColor(...PDF_INDIGO);
  doc.rect(0, 38, pageW, 2, 'F');

  const logo = await loadLogoForPDF();
  if (logo) { try { doc.addImage(logo, 'JPEG', pageW - 58, 8, 44, 13); } catch { /* skip */ } }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...PDF_WHITE);
  doc.text('REPORTE DE INVESTIGACIÓN AML/KYC', margin, 16);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(196, 210, 230);
  doc.text(`${providerCfg.label} · Análisis de Perfil · LENS AI`, margin, 24);

  // ── Info box ──
  const rCfg = RISK_CONFIG[result.effectiveRisk];
  const riskColor: [number,number,number] = result.effectiveRisk === 'high' ? PDF_RED : result.effectiveRisk === 'medium' ? PDF_AMBER : PDF_GREEN;

  doc.setFillColor(...PDF_LGRAY);
  doc.setDrawColor(220, 228, 240);
  doc.roundedRect(margin, 46, pageW - margin * 2, 26, 2, 2, 'FD');

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_MGRAY);
  doc.text('IDENTIFICACIÓN', margin + 4, 53);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_DTEXT); doc.setFontSize(9);
  doc.text(`${result.fullName || '—'}`, margin + 4, 59);
  doc.setFontSize(8); doc.setTextColor(...PDF_MGRAY);
  doc.text(`Doc: ${result.documentNumber}  ·  País: ${result.country}`, margin + 4, 66);

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_MGRAY);
  doc.text('RIESGO', pageW / 2, 53);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...riskColor);
  doc.text(rCfg.label, pageW / 2, 62);

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_MGRAY);
  doc.text('PROVEEDOR', pageW - 55, 53);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_DTEXT);
  doc.text(providerCfg.label, pageW - 55, 59);

  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_MGRAY);
  doc.text(`Generado: ${dateStr}`, pageW - margin, 70, { align: 'right' });

  // ── Alert banner ──
  let curY = 78;
  if (totalHits > 0) {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(...PDF_RED);
    doc.roundedRect(margin, curY, pageW - margin * 2, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_RED);
    doc.text(`⚠  ${totalHits} alerta${totalHits > 1 ? 's' : ''} detectada${totalHits > 1 ? 's' : ''} — perfil requiere revisión`, margin + 4, curY + 6.5);
  } else {
    doc.setFillColor(220, 252, 231);
    doc.setDrawColor(...PDF_GREEN);
    doc.roundedRect(margin, curY, pageW - margin * 2, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_GREEN);
    doc.text(`✓  Sin alertas — perfil limpio en todas las listas consultadas`, margin + 4, curY + 6.5);
  }
  curY += 14;

  // ── PEP banner ──
  if (result.isPEP) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(...PDF_AMBER);
    doc.roundedRect(margin, curY, pageW - margin * 2, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_AMBER);
    doc.text(`⚠  PERSONA POLÍTICAMENTE EXPUESTA (PEP)${result.pepLevel ? ` — Nivel ${result.pepLevel}` : ''}`, margin + 4, curY + 6.5);
    curY += 14;
  }

  // ── Ficha / datos del perfil ──
  if (result.ficha && Object.keys(result.ficha).length > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_NAVY);
    doc.text('DATOS DEL PERFIL', margin, curY + 4);
    doc.setFillColor(...PDF_INDIGO);
    doc.rect(margin, curY + 5.5, pageW - margin * 2, 0.5, 'F');
    autoTable(doc, {
      startY: curY + 8,
      head: [['Campo', 'Valor']],
      body: Object.entries(result.ficha),
      theme: 'grid',
      headStyles: { fillColor: PDF_NAVY, textColor: PDF_WHITE, fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: PDF_DTEXT },
      alternateRowStyles: { fillColor: PDF_LGRAY },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 } },
      margin: { left: margin, right: margin },
    });
    curY = getLastY() + 6;
  }

  // ── REGCHEQ: Lista results ──
  if (result.regcheqListas) {
    const listaEntries = Object.entries(result.regcheqListas);
    const totalListas = listaEntries.length;
    const hitsListas  = listaEntries.filter(([,e]) => e.coincidence).length;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_NAVY);
    doc.text(`RESULTADOS DE LISTAS — ${hitsListas} alerta${hitsListas !== 1 ? 's' : ''} de ${totalListas} consultadas`, margin, curY + 4);
    doc.setFillColor(...PDF_INDIGO);
    doc.rect(margin, curY + 5.5, pageW - margin * 2, 0.5, 'F');

    const sorted = [...listaEntries].sort((a, b) => (b[1].coincidence ? 1 : 0) - (a[1].coincidence ? 1 : 0));
    autoTable(doc, {
      startY: curY + 8,
      head: [['Lista', 'Resultado', 'Riesgo']],
      body: sorted.map(([n, e]) => [
        n,
        e.coincidence ? 'ALERTA' : 'Sin coincidencia',
        e.coincidence ? (e.risk?.toUpperCase() || 'HIGH') : '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: PDF_NAVY, textColor: PDF_WHITE, fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: PDF_DTEXT },
      alternateRowStyles: { fillColor: PDF_LGRAY },
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 45 }, 2: { cellWidth: 35 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const val = String(data.cell.raw ?? '');
          if (val === 'ALERTA') { data.cell.styles.textColor = PDF_RED; data.cell.styles.fontStyle = 'bold'; }
          else { data.cell.styles.textColor = PDF_GREEN; }
        }
        if (data.section === 'body' && data.column.index === 2) {
          const val = String(data.cell.raw ?? '');
          if (val !== '—') { data.cell.styles.textColor = PDF_RED; data.cell.styles.fontStyle = 'bold'; }
        }
      },
      margin: { left: margin, right: margin },
    });
    curY = getLastY() + 6;
  }

  // ── INSPEKTOR / matches table ──
  if ((result.providerUsed === 'INSPEKTOR' || !result.regcheqListas) && result.matches.length > 0) {
    if (curY > pageH - 50) { doc.addPage(); curY = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_NAVY);
    doc.text(`COINCIDENCIAS ENCONTRADAS (${result.matches.length})`, margin, curY + 4);
    doc.setFillColor(...PDF_INDIGO);
    doc.rect(margin, curY + 5.5, pageW - margin * 2, 0.5, 'F');
    autoTable(doc, {
      startY: curY + 8,
      head: [['Lista / Fuente', 'Nombre', 'Riesgo', 'Detalle']],
      body: result.matches.map(m => [
        LIST_TYPE_LABELS[m.listType] ?? m.listType,
        m.matchedName || '—',
        RISK_CONFIG[m.risk]?.label ?? m.risk.toUpperCase(),
        [m.offense, m.zone, m.lastUpdated ? `Upd: ${m.lastUpdated}` : ''].filter(Boolean).join(' · ') || '—',
      ]),
      theme: 'grid',
      headStyles: { fillColor: PDF_NAVY, textColor: PDF_WHITE, fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7.5, textColor: PDF_DTEXT },
      alternateRowStyles: { fillColor: PDF_LGRAY },
      columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 50 }, 2: { cellWidth: 22 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const val = String(data.cell.raw ?? '').toLowerCase();
          if (val === 'alto') { data.cell.styles.textColor = PDF_RED; data.cell.styles.fontStyle = 'bold'; }
          else if (val === 'medio') { data.cell.styles.textColor = PDF_AMBER; }
          else { data.cell.styles.textColor = PDF_GREEN; }
        }
      },
      margin: { left: margin, right: margin },
    });
    curY = getLastY() + 6;
  }

  // ── NOSIS: variables table (first 40) ──
  if (result.nosisVariables && result.nosisVariables.length > 0) {
    if (curY > pageH - 50) { doc.addPage(); curY = 20; }
    const vars = result.nosisVariables.slice(0, 40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_NAVY);
    doc.text(`VARIABLES NOSIS (${result.nosisVariables.length} total — mostrando ${vars.length})`, margin, curY + 4);
    doc.setFillColor(...PDF_INDIGO);
    doc.rect(margin, curY + 5.5, pageW - margin * 2, 0.5, 'F');
    autoTable(doc, {
      startY: curY + 8,
      head: [['Variable', 'Valor', 'Descripción']],
      body: vars.map(v => [v.name, v.value, v.description ?? '—']),
      theme: 'grid',
      headStyles: { fillColor: PDF_NAVY, textColor: PDF_WHITE, fontSize: 7, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: PDF_DTEXT, fontStyle: 'normal' },
      alternateRowStyles: { fillColor: PDF_LGRAY },
      columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' }, 1: { cellWidth: 30 } },
      margin: { left: margin, right: margin },
    });
    curY = getLastY() + 6;
  }

  // ── Footer on all pages ──
  const totalPgs = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages?.() ?? 1;
  for (let p = 1; p <= totalPgs; p++) {
    doc.setPage(p);
    doc.setFillColor(...PDF_NAVY);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...PDF_WHITE);
    doc.text(`LENS AI · KYC Investigador · ${providerCfg.label} · Team Compliance Global66`, margin, pageH - 4.5);
    doc.text(`Página ${p} de ${totalPgs} · ${dateStr}`, pageW - margin, pageH - 4.5, { align: 'right' });
  }

  const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  doc.save(`kyc_${result.providerUsed.toLowerCase()}_${result.documentNumber}_${ts}.pdf`);
}

// ── Initial form state ────────────────────────────────────────────────────────
const emptyForm = (): KYCInput => ({
  country: 'CL',
  documentType: 'RUT',
  documentNumber: '',
  firstName: '',
  fatherName: '',
  motherName: '',
  birthDate: '',
  gender: undefined,
  tienePrioridad4: false,
  procuraduria: true,
  ramaJudicial: true,
  ramaJEPMS: true,
  nosisVR: 2,
});

// ── Small badges ──────────────────────────────────────────────────────────────
const RiskBadge: React.FC<{ risk: KYCResult['effectiveRisk'] }> = ({ risk }) => {
  const cfg = RISK_CONFIG[risk];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      RIESGO {cfg.label}
    </span>
  );
};

const ProviderBadge: React.FC<{ provider: ProviderType }> = ({ provider }) => {
  const cfg = PROVIDER_CONFIG[provider];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
};

// ── Regcheq lista row (expandable, mirrors RegcheqTool's ListaRow) ────────────
const RegcheqListaRow: React.FC<{ name: string; entry: RegcheqLista; dark: boolean }> = ({ name, entry, dark }) => {
  const [open, setOpen] = useState(false);
  const hitBorder = dark ? 'border-red-800/50 bg-red-950/20' : 'border-red-300 bg-red-50/70';
  const cleanBorder = dark ? 'border-slate-700/40 bg-slate-800/30' : 'border-slate-200 bg-slate-50/30';
  const riskLabel = entry.risk.toLowerCase();
  const dotColor = entry.coincidence
    ? (riskLabel === 'medium' ? 'bg-amber-400 shadow-amber-400/50' : 'bg-red-400 shadow-red-400/50')
    : 'bg-emerald-400 shadow-emerald-400/50';

  return (
    <div className={`rounded-xl border transition-colors ${entry.coincidence ? hitBorder : cleanBorder}`}>
      <button
        onClick={() => entry.coincidence && setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${entry.coincidence ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-lg ${dotColor}`} />
        <span className={`flex-1 text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-700'}`}>{name}</span>
        {entry.coincidence
          ? <span className={`text-xs font-black uppercase ${riskLabel === 'medium' ? 'text-amber-400' : 'text-red-400'}`}>{entry.risk.toUpperCase()}</span>
          : <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-500'}`}>Sin coincidencia</span>}
        {entry.coincidence && (
          <svg className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && entry.coincidence && entry.data != null && (
        <div className="px-4 pb-4">
          <pre className={`text-[10px] rounded-xl p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all font-mono ${dark ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
            {JSON.stringify(entry.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

// ── Match card (for Inspektor hits) ──────────────────────────────────────────
const MatchCard: React.FC<{ match: KYCMatch; dark: boolean }> = ({ match, dark }) => {
  const rCfg = RISK_CONFIG[match.risk];
  const label = LIST_TYPE_LABELS[match.listType] ?? match.listType;
  return (
    <div className={`rounded-xl border p-4 ${rCfg.bg} ${rCfg.border}`}>
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 mt-1 ${rCfg.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${rCfg.text}`}>{label}</span>
            {match.priority != null && (
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Prioridad {match.priority}</span>
            )}
          </div>
          {match.matchedName && <p className={`text-sm font-semibold mt-1 ${dark ? 'text-slate-100' : 'text-slate-800'}`}>{match.matchedName}</p>}
          {match.matchedDocument && <p className="text-xs text-slate-500">{match.matchedDocument}</p>}
          {match.source && <p className="text-[11px] text-slate-400 mt-0.5">Fuente: {match.source}</p>}
          {match.offense && <p className={`text-xs mt-1 ${dark ? 'text-slate-300' : 'text-slate-600'}`}><span className="font-semibold">Delito/Sanción:</span> {match.offense}</p>}
          {match.zone && <p className="text-xs text-slate-400 mt-0.5">Zona: {match.zone}</p>}
          {match.lastUpdated && <p className="text-[10px] text-slate-400 mt-1">Actualizado: {match.lastUpdated}</p>}
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border flex-shrink-0 ${rCfg.bg} ${rCfg.text} ${rCfg.border}`}>{rCfg.label}</span>
      </div>
    </div>
  );
};

// ── Nosis variables table ─────────────────────────────────────────────────────
const NosisTable: React.FC<{ variables: NosisVariable[]; dark: boolean }> = ({ variables, dark }) => {
  const [filter, setFilter] = useState('');
  const filtered = variables.filter(v =>
    !filter || v.name.toLowerCase().includes(filter.toLowerCase()) || v.description?.toLowerCase().includes(filter.toLowerCase())
  );
  const border = dark ? 'border-slate-700' : 'border-slate-200';
  const headBg = dark ? 'bg-slate-800' : 'bg-slate-50';
  const rowAlt = dark ? 'bg-slate-800/30' : 'bg-slate-50/50';
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Variables Nosis ({variables.length})</span>
        <input
          type="text"
          placeholder="Filtrar..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className={`border rounded-xl px-3 py-1.5 text-xs w-44 focus:outline-none focus:ring-2 focus:ring-violet-500 ${dark ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'}`}
        />
      </div>
      <div className={`overflow-auto max-h-80 rounded-xl border ${border}`}>
        <table className="w-full text-xs">
          <thead className={`sticky top-0 ${headBg} border-b ${border}`}>
            <tr>
              {['Variable','Valor','Descripción'].map(h => (
                <th key={h} className={`text-left px-3 py-2.5 font-bold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => (
              <tr key={i} className={`border-b ${border} ${i % 2 === 1 ? rowAlt : ''}`}>
                <td className={`px-3 py-2 font-mono font-bold ${dark ? 'text-violet-400' : 'text-violet-700'} whitespace-nowrap`}>{v.name}</td>
                <td className={`px-3 py-2 font-semibold ${dark ? 'text-slate-200' : 'text-slate-800'}`}>{v.value}</td>
                <td className={`px-3 py-2 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{v.description ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={3} className={`px-3 py-6 text-center ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Sin resultados para "{filter}"</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Result card ───────────────────────────────────────────────────────────────
const ResultCard: React.FC<{ result: KYCResult; dark: boolean }> = ({ result, dark }) => {
  const [showRaw, setShowRaw] = useState(false);
  const allHits = result.regcheqListas
    ? Object.values(result.regcheqListas).filter(l => l.coincidence).length
    : result.matches.length;

  const bg        = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200 shadow-sm';
  const muted     = dark ? 'text-slate-500' : 'text-slate-400';
  const divider   = dark ? 'bg-slate-700/50' : 'bg-slate-200/60';
  const fieldBg   = dark ? 'bg-slate-900/40 border-slate-700/40' : 'bg-slate-50 border-slate-200';
  const fieldLabel= dark ? 'text-slate-500' : 'text-slate-400';
  const fieldVal  = dark ? 'text-slate-200' : 'text-slate-800';

  const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
    <div className="flex items-center gap-3 mt-5 mb-3">
      <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>{title}</span>
      <div className={`flex-1 h-px ${divider}`} />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ── Summary header ── */}
      <div className={`border rounded-2xl p-6 ${bg}`}>
        <div className="flex flex-wrap items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <RiskBadge risk={result.effectiveRisk} />
              <ProviderBadge provider={result.providerUsed} />
              {result.isPEP && (
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  ⚠ PEP{result.pepLevel ? ` Nivel ${result.pepLevel}` : ''}
                </span>
              )}
            </div>
            <h3 className={`text-xl font-black ${dark ? 'text-white' : 'text-slate-900'}`}>{result.fullName || '—'}</h3>
            <p className={`text-xs mt-0.5 ${muted}`}>
              {result.documentNumber} · {result.country}
              {result.queryId && <span className="ml-2 opacity-60">#{result.queryId}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => generateKYCPDF(result)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-all border ${
                dark ? 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border-indigo-600/40'
                     : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-indigo-200'
              }`}
            >
              📄 PDF
            </button>
          </div>
        </div>

        {allHits > 0 ? (
          <div className={`border rounded-xl px-4 py-3 text-sm font-medium ${dark ? 'bg-red-950/40 border-red-800/50 text-red-300' : 'bg-red-50 border-red-300 text-red-700'}`}>
            ⚠ <strong>{allHits} alerta{allHits > 1 ? 's' : ''} detectada{allHits > 1 ? 's' : ''}</strong>
            {result.providerUsed === 'REGCHEQ' && ' — haz clic en cada lista para ver el detalle'}
          </div>
        ) : (
          <div className={`border rounded-xl px-4 py-3 text-sm font-medium ${dark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700'}`}>
            ✓ <strong>Sin alertas</strong> — perfil limpio en todas las listas consultadas
          </div>
        )}

        {/* Ficha fields */}
        {result.ficha && Object.keys(result.ficha).length > 0 && (
          <>
            <SectionHeader title="Datos del perfil" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(result.ficha).map(([label, val]) => (
                <div key={label} className={`border rounded-xl px-3 py-2.5 ${fieldBg}`}>
                  <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${fieldLabel}`}>{label}</div>
                  <div className={`text-sm font-semibold ${fieldVal}`}>{val}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── REGCHEQ: full list rows ── */}
      {result.regcheqListas && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>
              Resultados de listas — {Object.values(result.regcheqListas).filter(l => l.coincidence).length} alerta{Object.values(result.regcheqListas).filter(l => l.coincidence).length !== 1 ? 's' : ''} de {Object.keys(result.regcheqListas).length} consultadas
            </span>
            <div className={`flex-1 h-px ${divider}`} />
          </div>
          <div className="space-y-2">
            {Object.entries(result.regcheqListas)
              .sort((a, b) => (b[1].coincidence ? 1 : 0) - (a[1].coincidence ? 1 : 0))
              .map(([name, entry]) => (
                <RegcheqListaRow key={name} name={name} entry={entry} dark={dark} />
              ))}
          </div>
        </div>
      )}

      {/* ── INSPEKTOR: matches list ── */}
      {result.providerUsed === 'INSPEKTOR' && result.matches.length > 0 && (
        <div>
          <SectionHeader title={`Coincidencias encontradas (${result.matches.length})`} />
          <div className="space-y-3">
            {result.matches.map((m, i) => <MatchCard key={i} match={m} dark={dark} />)}
          </div>
        </div>
      )}

      {/* INSPEKTOR: Procuraduria / Rama Judicial extra sections */}
      {result.providerUsed === 'INSPEKTOR' && result.matches.length === 0 && (
        <div className={`border rounded-2xl px-5 py-4 ${dark ? 'bg-emerald-950/20 border-emerald-800/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          ✓ <strong>Sin coincidencias</strong> — no se encontraron alertas en las listas consultadas
        </div>
      )}

      {/* ── NOSIS: variables table ── */}
      {result.nosisVariables && result.nosisVariables.length > 0 && (
        <div className={`border rounded-2xl p-5 ${dark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
          <NosisTable variables={result.nosisVariables} dark={dark} />
        </div>
      )}

      {/* ── Raw payload accordion ── */}
      <div className={`border rounded-2xl overflow-hidden ${dark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
        <button
          onClick={() => setShowRaw(r => !r)}
          className={`w-full flex items-center justify-between px-5 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${dark ? 'text-slate-500 hover:bg-slate-800/50' : 'text-slate-400 hover:bg-slate-50'}`}
        >
          <span>Payload crudo del proveedor</span>
          <svg className={`w-4 h-4 transition-transform ${showRaw ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showRaw && (
          <div className={`border-t p-4 ${dark ? 'border-slate-800' : 'border-slate-200'}`}>
            <pre className={`text-[10px] overflow-auto max-h-96 whitespace-pre-wrap break-all font-mono rounded-xl p-4 ${dark ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-50 text-slate-600'}`}>
              {JSON.stringify(result.rawPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const KYCApp: React.FC<KYCAppProps> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const [form, setForm] = useState<KYCInput>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KYCResult | null>(null);

  const dark = darkMode;
  const country = COUNTRY_OPTIONS.find(c => c.code === form.country) ?? COUNTRY_OPTIONS[0];
  const provider = routeProvider(form.country);
  const pCfg = PROVIDER_CONFIG[provider];

  const set = (field: keyof KYCInput, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleCountryChange = (code: string) => {
    const c = COUNTRY_OPTIONS.find(o => o.code === code);
    setForm(prev => ({ ...prev, country: code, documentType: c?.docTypes[0] ?? 'Pasaporte' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.documentNumber.trim()) {
      setError('Ingresa el número de documento.');
      return;
    }
    if (provider === 'INSPEKTOR' && (!form.firstName?.trim() || !form.fatherName?.trim())) {
      setError('Para consultas en Colombia (Inspektor) se requiere nombre y apellido paterno.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await investigateClient(form);
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isCors = msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkerror') || msg.toLowerCase().includes('load failed');
      setError(isCors
        ? `Error de red — posible bloqueo CORS de la API ${pCfg.label}. Verifica tu conexión o contacta al soporte técnico.`
        : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => { setForm(emptyForm()); setResult(null); setError(null); };

  // ── Theme classes ──
  const bg       = dark ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950' : 'bg-slate-50';
  const navBg    = dark ? 'bg-slate-900/90 border-slate-700/50' : 'bg-white border-slate-200 shadow-sm';
  const cardBg   = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-slate-200 shadow-sm';
  const inputCls = dark
    ? 'bg-slate-900/60 border-slate-600/50 text-white placeholder-slate-600 focus:border-indigo-500'
    : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100';
  const labelCls = dark ? 'text-slate-400' : 'text-slate-500';
  const muted    = dark ? 'text-slate-400' : 'text-slate-500';

  const inputField = (label: string, value: string, onChange: (v: string) => void, props?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="space-y-1.5">
      <label className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${inputCls}`}
        {...props}
      />
    </div>
  );

  const selectField = (label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <div className="space-y-1.5">
      <label className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${inputCls}`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className={`min-h-screen transition-colors ${bg}`}>
      {/* ── Header ── */}
      <header className={`border-b px-6 py-4 flex items-center justify-between sticky top-0 z-40 ${navBg}`}>
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className={`flex items-center gap-2 text-xs font-semibold border rounded-xl px-3 py-2 transition-colors ${
              dark ? 'text-slate-400 hover:text-white bg-slate-800/60 border-slate-700'
                   : 'text-slate-500 hover:text-slate-800 bg-slate-100 border-slate-200'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Inicio
          </button>
          <div>
            <h1 className={`text-base font-black leading-none ${dark ? 'text-white' : 'text-slate-900'}`}>KYC Investigador</h1>
            <p className={`text-[11px] mt-0.5 ${muted}`}>Consulta AML/KYC multiproveedor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProviderBadge provider={provider} />
          <span className={`text-xs hidden sm:inline ${muted}`}>{country.flag} {country.name}</span>
          <button
            onClick={onToggleDarkMode}
            className={`w-9 h-9 rounded-full border flex items-center justify-center text-base hover:scale-110 active:scale-95 transition-all ${
              dark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
            }`}
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* ── Form ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Country + provider */}
          <div className={`border rounded-2xl p-5 ${cardBg}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${muted}`}>País y proveedor</p>
            {selectField('País *', form.country, handleCountryChange,
              COUNTRY_OPTIONS.map(c => ({ value: c.code, label: `${c.flag} ${c.name}` }))
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className={`text-xs ${muted}`}>Proveedor asignado</span>
              <ProviderBadge provider={provider} />
            </div>
          </div>

          {/* Document */}
          <div className={`border rounded-2xl p-5 ${cardBg}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${muted}`}>Identificación *</p>
            <div className="grid grid-cols-2 gap-3">
              {selectField('Tipo doc.', form.documentType, v => set('documentType', v),
                country.docTypes.map(dt => ({ value: dt, label: dt }))
              )}
              {inputField('Número *', form.documentNumber, v => set('documentNumber', v), {
                placeholder: form.documentType === 'RUT' ? '12.345.678-9' : '12345678',
                required: true,
              })}
            </div>
          </div>

          {/* Names — required for CO (Inspektor), hidden for other providers */}
          {provider === 'INSPEKTOR' && (
            <div className={`border rounded-2xl p-5 ${cardBg}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${muted}`}>Nombres *</p>
              <div className="space-y-3">
                {inputField('Primer nombre *', form.firstName ?? '', v => set('firstName', v), { placeholder: 'JUAN CARLOS', required: true })}
                {inputField('Apellido paterno *', form.fatherName ?? '', v => set('fatherName', v), { placeholder: 'GONZÁLEZ', required: true })}
                {inputField('Apellido materno', form.motherName ?? '', v => set('motherName', v), { placeholder: 'PÉREZ' })}
              </div>
            </div>
          )}

          {/* Inspektor options */}
          {provider === 'INSPEKTOR' && (
            <div className={`border rounded-2xl p-5 ${dark ? 'bg-indigo-950/40 border-indigo-800/50' : 'bg-indigo-50 border-indigo-200'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${dark ? 'text-indigo-400' : 'text-indigo-500'}`}>Opciones Inspektor</p>
              <div className="space-y-2.5">
                {([
                  { field: 'procuraduria',    label: 'Incluir Procuraduría' },
                  { field: 'ramaJudicial',    label: 'Incluir Rama Judicial' },
                  { field: 'ramaJEPMS',       label: 'Incluir JEP / MS' },
                  { field: 'tienePrioridad4', label: 'Incluir Prioridad 4 (bajo riesgo)' },
                ] as { field: keyof KYCInput; label: string }[]).map(({ field, label }) => (
                  <label key={field} className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={!!form[field]} onChange={e => set(field, e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
                    <span className={`text-xs font-medium ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Nosis options */}
          {provider === 'NOSIS' && (
            <div className={`border rounded-2xl p-5 ${dark ? 'bg-violet-950/40 border-violet-800/50' : 'bg-violet-50 border-violet-200'}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-4 ${dark ? 'text-violet-400' : 'text-violet-500'}`}>Opciones Nosis</p>
              <div className="space-y-1.5">
                <label className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>VR — Versión de reporte (defecto: 2)</label>
                <input
                  type="number" min={1} max={99} value={form.nosisVR ?? 2}
                  onChange={e => set('nosisVR', parseInt(e.target.value))}
                  className={`w-24 border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 ${inputCls}`}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3">
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Consultando {pCfg.label}...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>Investigar Cliente</>
              )}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className={`px-4 py-3 font-semibold rounded-xl transition-colors text-sm border ${dark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'}`}
            >
              Limpiar
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className={`border rounded-xl p-4 text-sm ${dark ? 'bg-red-950/40 border-red-800/50 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <p className="font-bold mb-1">Error al consultar</p>
              <p className="text-xs">{error}</p>
            </div>
          )}
        </div>

        {/* ── Results column ── */}
        <div className="lg:col-span-3">
          {!result && !loading && !error && (
            <div className={`h-full flex flex-col items-center justify-center text-center py-24 ${muted}`}>
              <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 border ${dark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                <span className="text-4xl">🔍</span>
              </div>
              <p className={`font-semibold text-base ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Resultados aparecerán aquí</p>
              <p className="text-sm mt-1 max-w-xs">Completa el formulario y haz clic en "Investigar Cliente".</p>
            </div>
          )}
          {loading && (
            <div className="h-full flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 rounded-full animate-spin mb-6" />
              <p className={`font-semibold ${dark ? 'text-slate-300' : 'text-slate-600'}`}>Consultando {pCfg.label}...</p>
              <p className={`text-sm mt-1 ${muted}`}>Esto puede tardar unos segundos</p>
            </div>
          )}
          {result && <ResultCard result={result} dark={dark} />}
        </div>
      </div>
    </div>
  );
};
