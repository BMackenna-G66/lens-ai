import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DEFAULT_CATALOG } from '../services/defaultCatalogData';
import { InspektorColombia } from './InspektorColombia';

type CountryMode = null | 'chile' | 'colombia' | 'global';

// ─── Config ────────────────────────────────────────────────────────────────────
const API_BASE = 'https://external-api.regcheq.com';
const API_KEY  = (import.meta as Record<string, unknown> & { env: Record<string, string> }).env.VITE_REGCHEQ_API_KEY ?? '';

// ─── Listas map ────────────────────────────────────────────────────────────────
const NOMBRE_LISTA: Record<string, string> = {
  // ── Chile-specific keys ─────────────────────────────────────────────────────
  pepChile:                   'PEP Chile',
  interpol:                   'INTERPOL',
  ofac:                       'OFAC',
  un:                         'ONU',
  eu:                         'Unión Europea',
  rtp:                        'RTP / PDI',
  secondCriminalCasesChile:   'Causas Penales Chile',
  pdi:                        'PDI Chile',
  gafi:                       'GAFI',
  screeningGlobal:            'Screening Global',
  interestList:               'Lista de Interés',
  // ── International / global keys (also present in Chile responses) ────────────
  internationalOrganizations: 'Organismos Internacionales',   // ← OFAC/ONU/EU hits global
  ofacAddressResult:          'OFAC Domicilio',
  bicResult:                  'BIC',
  gafiResult:                 'GAFI',                         // alias → smart-merge con 'gafi'
  rtpResult:                  'RTP / PDI',                    // alias → smart-merge con 'rtp'
  pdiResult:                  'PDI Chile',                    // alias → smart-merge con 'pdi'
  keywordsResult:             'Palabras Clave',
  riskComments:               'Comentarios de Riesgo',
  internList:                 'Lista Interna',
  regcheqList:                'Lista Regcheq',
};

// ─── Keys to skip / highlight ──────────────────────────────────────────────────
const SKIP_KEYS = new Set([
  'dni','personType','listResult','lastChecked','_id','__v',
  'searcher_id','assignee_id','client_ref','id','ref',
  'searcher','assignee','limit','offset','tags','labels',
  'filters','created_at','updated_at',
]);
const HIGHLIGHT_KEYS = new Set([
  'name','nombre','fullname','fullName','alias','aliases',
  'entity','entidad','sanctionname','sanctionName',
  'program','programa','source','fuente','list','lista',
  'description','descripcion','nationality','nacionalidad',
  'cargo','position','type','tipo',
]);
const COL_LABELS: Record<string, string> = {
  crimen:'Delito', estado:'Estado', fecha:'Fecha', riesgo:'Riesgo',
  rit:'RIT', ruc:'RUC', tribunal:'Tribunal',
  name:'Nombre', entity_type:'Tipo entidad', score:'Score',
  match_status:'Estado match', risk_level:'Nivel riesgo',
  search_term:'Término buscado', total_hits:'Total hits',
  total_matches:'Total coincidencias',
};

// ─── Types ─────────────────────────────────────────────────────────────────────
type Tab         = 'individual' | 'masivo' | 'lista';
type PersonType  = 'natural' | 'legal';

interface ListaEntry {
  coincidence: boolean;
  risk: string;
  data: unknown;
}
interface DecisionResult {
  decision: string;
  razon: string;
  precedentesCount: number;
  noPrecedentesCount: number;
  totalEquivalente: number;
}
interface PerfilResult {
  dni: string;
  nombre: string;
  riesgo_final: string;
  pep_level: string;
  listas: Record<string, ListaEntry>;
  ficha: Record<string, string>;
  decision?: DecisionResult;
}
interface ListaInteres {
  dni: string;
  name: string;
  personType: string;
  reason: string;
  status: string;
}
interface LogLine { type: 'ok'|'err'|'info'; text: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓ Sí' : '✗ No';
  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    if (typeof v[0] === 'object' && v[0] !== null)
      return (v as Record<string, unknown>[]).map(o => String(o.name ?? o.value ?? o.source ?? JSON.stringify(o))).join(' · ');
    return v.map(String).join(' · ');
  }
  if (typeof v === 'object') {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([k, val]) => val != null && !SKIP_KEYS.has(k))
      .map(([k, val]) => `${k}: ${val}`);
    return parts.length ? parts.join(' | ') : JSON.stringify(v);
  }
  return String(v);
}

function normalizeData(raw: unknown): { meta: {label:string;value:string}[]|null; items: Record<string,unknown>[]|null } {
  if (raw === null || raw === undefined) return { meta: null, items: null };
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { meta: null, items: [] };
    return { meta: null, items: raw.map(r => (typeof r === 'object' && r !== null ? r as Record<string,unknown> : { valor: r })) };
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Causas penales / generic additionalData arrays
    const adData = obj.additionalData;
    if (Array.isArray(adData) && adData.length > 0) {
      const first = adData[0] as Record<string,unknown>;
      if ('crimen' in first || 'tribunal' in first || 'ruc' in first) {
        // ── Causas Penales Chile ──
        const info = (obj.info ?? {}) as Record<string,unknown>;
        const meta: {label:string;value:string}[] = [];
        if (info.name)          meta.push({ label: 'Imputado',     value: String(info.name) });
        if (info.rut)           meta.push({ label: 'RUT',          value: String(info.rut) });
        if (info.total_matches) meta.push({ label: 'Total causas', value: String(info.total_matches) });
        return { meta: meta.length ? meta : null, items: adData as Record<string,unknown>[] };
      }
      // ── Generic additionalData (internationalOrganizations, OFAC, BIC, etc.) ──
      // Has fields like: name, program, activity, list, status, score
      const info = (obj.info ?? {}) as Record<string,unknown>;
      const meta: {label:string;value:string}[] = [];
      if (info.name)            meta.push({ label: 'Nombre buscado',     value: String(info.name) });
      if (info.total_matches !== undefined)
                                meta.push({ label: 'Total coincidencias', value: String(info.total_matches) });
      const typesArr = (info as Record<string,unknown>).typesMatches;
      if (Array.isArray(typesArr) && typesArr.length)
                                meta.push({ label: 'Listas con alerta',  value: (typesArr as string[]).join(', ') });
      const formatted = (info as Record<string,unknown>).formattedMatches;
      if (formatted && !typesArr)
                                meta.push({ label: 'Listas',             value: String(formatted) });
      return { meta: meta.length ? meta : null, items: adData as Record<string,unknown>[] };
    }
    // screeningGlobal: additionalData.hits[].doc
    const adObj = adData as Record<string,unknown> | undefined;
    if (adObj && Array.isArray(adObj.hits) && adObj.hits.length > 0) {
      const meta: {label:string;value:string}[] = [];
      if (adObj.search_term)   meta.push({ label: 'Término buscado',    value: String(adObj.search_term) });
      if (adObj.total_matches) meta.push({ label: 'Total coincidencias', value: String(adObj.total_matches) });
      if (adObj.match_status)  meta.push({ label: 'Estado',             value: String(adObj.match_status) });
      const items = (adObj.hits as Record<string,unknown>[]).map(h => {
        const doc = (h.doc ?? {}) as Record<string,unknown>;
        const row: Record<string,unknown> = {};
        if (doc.name)        row['Nombre']                = doc.name;
        if (doc.entity_type) row['Tipo entidad']           = doc.entity_type;
        if (Array.isArray(doc.types) && doc.types.length)  row['Tipos'] = (doc.types as string[]).join(' · ');
        if (Array.isArray(h.match_types) && (h.match_types as string[]).length) row['Match types'] = (h.match_types as string[]).join(' · ');
        if (h.score !== undefined) row['Score'] = typeof h.score === 'number' ? (h.score as number).toFixed(2) : h.score;
        if (Array.isArray(doc.sources) && doc.sources.length)
          row['Fuentes'] = (doc.sources as Record<string,unknown>[]).map(s => s.name ?? s).join(' · ');
        if (Array.isArray(doc.aka) && doc.aka.length)
          row['También conocido como'] = (doc.aka as Record<string,unknown>[]).map(a => a.name ?? a).slice(0,3).join(' · ');
        if (Array.isArray(doc.fields))
          (doc.fields as Record<string,unknown>[]).forEach(f => { if (f.name && f.value && !row[f.name as string]) row[f.name as string] = f.value; });
        return row;
      });
      return { meta: meta.length ? meta : null, items };
    }
    // generic
    for (const key of ['matches','results','hits','records','persons','entities','data','items','list']) {
      if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0)
        return { meta: null, items: (obj[key] as unknown[]).map(r => typeof r === 'object' && r !== null ? r as Record<string,unknown> : { valor: r }) };
    }
    const fila: Record<string,unknown> = {};
    Object.entries(obj).forEach(([k,v]) => { if (!SKIP_KEYS.has(k) && v != null) fila[k] = v; });
    return { meta: null, items: [Object.keys(fila).length > 0 ? fila : obj] };
  }
  return { meta: null, items: [{ valor: String(raw) }] };
}

// ─── Decision engine (local catalog) ─────────────────────────────────────────
function computeDecisionFromCrimes(additionalData: Record<string,unknown>[]): DecisionResult | undefined {
  if (!additionalData || additionalData.length === 0) return undefined;
  const catalog = DEFAULT_CATALOG;
  if (!catalog.items.length || !catalog.decisionTable.length) return undefined;

  const catalogMap = new Map(catalog.items.map(i => [i.nombre.toLowerCase(), i]));
  let scoreTotal = 0;
  for (const crime of additionalData) {
    const nombre = String(crime['crimen'] ?? crime['Crimen'] ?? crime['delito'] ?? '').toLowerCase().trim();
    if (!nombre) continue;
    const match = catalogMap.get(nombre);
    if (match) scoreTotal += match.valor;
  }

  const sorted = [...catalog.decisionTable].sort((a, b) => b.totalEquivalente - a.totalEquivalente);
  const rule = sorted.find(r => scoreTotal >= r.totalEquivalente);
  if (!rule) return undefined;

  return {
    decision: rule.decision,
    razon: rule.razon,
    precedentesCount: rule.precedentesCount,
    noPrecedentesCount: rule.noPrecedentesCount,
    totalEquivalente: scoreTotal,
  };
}

// ─── API call ─────────────────────────────────────────────────────────────────
async function fetchPerfil(dniVal: string): Promise<PerfilResult> {
  const resp = await fetch(`${API_BASE}/record/${dniVal}/${API_KEY}`);
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
  const perfil = await resp.json();

  const listasRaw = ((perfil.listas ?? {}) as Record<string, Record<string,unknown>>);
  const listas: Record<string, ListaEntry> = {};
  // Smart-merge: iterate all known keys. When two keys share the same display label
  // (e.g. 'rtp' and 'rtpResult' → 'RTP / PDI'), keep whichever has coincidence=true.
  // This way Chile responses use the old keys and global responses use the *Result keys
  // without one overwriting the other's positive match.
  for (const [clave, nombre] of Object.entries(NOMBRE_LISTA)) {
    const entry = listasRaw[clave] ?? null;
    let rawData = entry?.data ?? null;
    if (typeof rawData === 'string' && !(rawData as string).trim()) rawData = null;
    const incoming: ListaEntry = { coincidence: Boolean(entry?.coincidence), risk: String(entry?.risk ?? ''), data: rawData };
    const existing = listas[nombre];
    // Only overwrite if incoming wins (has coincidence) or slot is empty or existing has no coincidence
    if (!existing || incoming.coincidence || !existing.coincidence) {
      listas[nombre] = incoming;
    }
  }

  const FICHA_MAP: [string, string][] = [
    ['name','Nombre'],['fatherName','Apellido paterno'],['motherName','Apellido materno'],
    ['nationality','Nacionalidad'],['country','País'],['email','Email'],
    ['phone','Teléfono'],['position','Cargo'],['employer','Empleador'],
    ['birthDate','Fecha nacimiento'],['socialReason','Razón Social'],['businessType','Tipo empresa'],
    ['comments','Comentarios'],
  ];
  const ficha: Record<string,string> = {};
  for (const [k, label] of FICHA_MAP) { const v = perfil[k]; if (v) ficha[label] = String(v); }

  // Compute local decision from Causas Penales Chile crimes
  const causasEntry = listas['Causas Penales Chile'];
  let decision: DecisionResult | undefined;
  if (causasEntry?.coincidence && causasEntry.data) {
    const raw = causasEntry.data as Record<string,unknown>;
    const additionalData = Array.isArray(raw['additionalData'])
      ? (raw['additionalData'] as Record<string,unknown>[])
      : [];
    decision = computeDecisionFromCrimes(additionalData);
  }

  return {
    dni: dniVal,
    nombre: perfil.name ?? perfil.socialReason ?? '',
    riesgo_final: perfil.effectiveRisk ?? perfil.calculatedRisk ?? '',
    pep_level: perfil.pepLevel ?? '',
    listas,
    ficha,
    decision,
  };
}

// ─── PDF generator ────────────────────────────────────────────────────────────
const PDF_NAVY   = [30, 58, 95]    as [number, number, number];
const PDF_INDIGO = [79, 70, 229]   as [number, number, number];
const PDF_RED    = [185, 28, 28]   as [number, number, number];
const PDF_GREEN  = [21, 128, 61]   as [number, number, number];
const PDF_AMBER  = [146, 64, 14]   as [number, number, number];
const PDF_WHITE  = [255, 255, 255] as [number, number, number];
const PDF_LGRAY  = [248, 249, 250] as [number, number, number];
const PDF_MGRAY  = [100, 116, 139] as [number, number, number];
const PDF_DTEXT  = [30, 41, 59]    as [number, number, number];

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

async function generatePDF(result: PerfilResult) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW  = doc.internal.pageSize.getWidth();
  const pageH  = doc.internal.pageSize.getHeight();
  const margin = 14;
  const now    = new Date();
  const dateStr = now.toLocaleString('es-CL');
  const getLastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 80;

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
  doc.text('REPORTE DE SCREENING AML/KYC', margin, 16);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(196, 210, 230);
  doc.text('Regcheq · Análisis de Perfil · LENS AI', margin, 24);

  // ── Info box ──
  const hitCount = Object.values(result.listas).filter(e => e.coincidence).length;
  const totalLists = Object.keys(result.listas).length;
  const riskUpper = (result.riesgo_final || '').toUpperCase();
  const riskColor: [number,number,number] = riskUpper.includes('HIGH') ? PDF_RED : riskUpper.includes('MEDIUM') ? PDF_AMBER : PDF_GREEN;

  doc.setFillColor(...PDF_LGRAY);
  doc.setDrawColor(220, 228, 240);
  doc.roundedRect(margin, 46, pageW - margin * 2, 26, 2, 2, 'FD');

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_MGRAY);
  doc.text('IDENTIFICACIÓN', margin + 4, 53);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_DTEXT); doc.setFontSize(9);
  doc.text(`${result.nombre || '—'}`, margin + 4, 59);
  doc.setFontSize(8); doc.setTextColor(...PDF_MGRAY);
  doc.text(`DNI / RUT: ${result.dni}`, margin + 4, 66);

  doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_MGRAY);
  doc.text('RIESGO', pageW / 2, 53);
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...riskColor);
  doc.text(riskUpper || 'N/D', pageW / 2, 62);

  if (result.pep_level) {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...PDF_MGRAY);
    doc.text('PEP', pageW - 50, 53);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_DTEXT);
    doc.text(`Nivel ${result.pep_level}`, pageW - 50, 59);
  }

  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...PDF_MGRAY);
  doc.text(`Generado: ${dateStr}`, pageW - margin, 70, { align: 'right' });

  // ── Alert banner ──
  let curY = 78;
  if (hitCount > 0) {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(...PDF_RED);
    doc.roundedRect(margin, curY, pageW - margin * 2, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_RED);
    doc.text(`⚠  ${hitCount} alerta${hitCount > 1 ? 's' : ''} detectada${hitCount > 1 ? 's' : ''} de ${totalLists} listas consultadas`, margin + 4, curY + 6.5);
  } else {
    doc.setFillColor(220, 252, 231);
    doc.setDrawColor(...PDF_GREEN);
    doc.roundedRect(margin, curY, pageW - margin * 2, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...PDF_GREEN);
    doc.text(`✓  Sin alertas — perfil limpio en todas las listas consultadas`, margin + 4, curY + 6.5);
  }
  curY += 14;

  // ── Datos del perfil ──
  if (Object.keys(result.ficha).length > 0) {
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
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
      margin: { left: margin, right: margin },
    });
    curY = getLastY() + 6;
  }

  // ── Resultados de listas ──
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_NAVY);
  doc.text(`RESULTADOS DE LISTAS — ${hitCount} alerta${hitCount !== 1 ? 's' : ''} de ${totalLists} consultadas`, margin, curY + 4);
  doc.setFillColor(...PDF_INDIGO);
  doc.rect(margin, curY + 5.5, pageW - margin * 2, 0.5, 'F');

  const sortedListas = Object.entries(result.listas).sort((a, b) => (b[1].coincidence ? 1 : 0) - (a[1].coincidence ? 1 : 0));
  autoTable(doc, {
    startY: curY + 8,
    head: [['Lista', 'Resultado', 'Riesgo']],
    body: sortedListas.map(([n, e]) => [
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

  // ── Decision box ──
  if (result.decision) {
    const d = result.decision;
    const isFB  = d.decision === 'FORZAR_BLOQUEO';
    const isUCR = d.decision === 'UNDER_COMPLIANCE_REVIEW';
    const decColor: [number,number,number] = isFB ? PDF_RED : isUCR ? PDF_AMBER : PDF_GREEN;
    const decFill: [number,number,number]  = isFB ? [254,226,226] : isUCR ? [254,243,199] : [220,252,231];

    // Check if we need a new page
    if (curY > pageH - 50) { doc.addPage(); curY = 20; }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...PDF_NAVY);
    doc.text('DECISIÓN (MOTOR LOCAL)', margin, curY + 4);
    doc.setFillColor(...PDF_INDIGO);
    doc.rect(margin, curY + 5.5, pageW - margin * 2, 0.5, 'F');
    curY += 9;

    doc.setFillColor(...decFill);
    doc.setDrawColor(...decColor);
    doc.roundedRect(margin, curY, pageW - margin * 2, 22, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...decColor);
    doc.text(d.decision, margin + 4, curY + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...PDF_DTEXT);
    if (d.razon) doc.text(d.razon, margin + 4, curY + 13);
    doc.setTextColor(...PDF_MGRAY); doc.setFontSize(7);
    doc.text(`Precedentes: ${d.precedentesCount}   No-precedentes: ${d.noPrecedentesCount}   Equivalente total: ${d.totalEquivalente}`, margin + 4, curY + 20);
    curY += 28;
  }

  // ── Footer on all pages ──
  const totalPgs = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages?.() ?? 1;
  for (let p = 1; p <= totalPgs; p++) {
    doc.setPage(p);
    doc.setFillColor(...PDF_NAVY);
    doc.rect(0, pageH - 12, pageW, 12, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...PDF_WHITE);
    doc.text('LENS AI · Regcheq Screening · Team Compliance Global66', margin, pageH - 4.5);
    doc.text(`Página ${p} de ${totalPgs} · ${dateStr}`, pageW - margin, pageH - 4.5, { align: 'right' });
  }

  doc.save(`regcheq_${result.dni}_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.pdf`);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: string }) {
  const r = (risk || '').toLowerCase();
  const map: Record<string,string> = {
    high:   'bg-red-500/20 text-red-400 border-red-500/40',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    low:    'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  };
  const label: Record<string,string> = { high: '⚠ ALTO', medium: '⚡ MEDIO', low: '✓ BAJO' };
  const cls = map[r] ?? 'bg-slate-700/60 text-slate-400 border-slate-600';
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${cls}`}>
      {label[r] ?? (risk || 'N/D')}
    </span>
  );
}

function DetailTable({ data, dark }: { data: unknown; dark: boolean }) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');

  const { meta, items } = normalizeData(data);
  const border = dark ? 'border-slate-700' : 'border-slate-300';

  if (items === null)
    return <p className={`text-xs italic ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Sin detalle adicional disponible</p>;
  if (items.length === 0)
    return <p className={`text-xs italic ${dark ? 'text-slate-500' : 'text-slate-400'}`}>Sin registros</p>;

  const allCols = Array.from(new Set(items.flatMap(r => Object.keys(r))));
  const cols = allCols.filter(k => items.some(r => {
    const v = r[k]; return v != null && String(v).trim() !== '' && String(v) !== '—';
  }));

  // Dedup by RUC
  let displayItems = items;
  const dupMap: Record<string, Record<string,unknown>[]> = {};
  if (cols.includes('ruc') && cols.includes('fecha')) {
    const groups: Record<string, Record<string,unknown>[]> = {};
    items.forEach(it => { const r = String(it.ruc ?? '__no_ruc__'); (groups[r] ??= []).push(it); });
    displayItems = [];
    Object.values(groups).forEach(grp => {
      if (grp.length === 1) { displayItems.push(grp[0]); return; }
      grp.sort((a, b) => {
        const parse = (s: unknown) => { const [d,m,y] = String(s ?? '').split('/'); return new Date(`${y}-${m}-${d}`); };
        return parse(b.fecha).getTime() - parse(a.fecha).getTime();
      });
      displayItems.push(grp[0]);
      dupMap[String(grp[0].ruc)] = grp.slice(1);
    });
  }

  // Sort
  const sorted = sortCol === null ? displayItems : [...displayItems].sort((a, b) => {
    const key = cols[sortCol];
    const ta = String(a[key] ?? ''), tb = String(b[key] ?? '');
    const [dd,mm,yy] = ta.split('/'); const da = yy ? new Date(`${yy}-${mm}-${dd}`) : null;
    const [dd2,mm2,yy2] = tb.split('/'); const db = yy2 ? new Date(`${yy2}-${mm2}-${dd2}`) : null;
    if (da && db) return sortDir === 'asc' ? da.getTime()-db.getTime() : db.getTime()-da.getTime();
    const na = parseFloat(ta), nb = parseFloat(tb);
    if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na-nb : nb-na;
    return sortDir === 'asc' ? ta.localeCompare(tb) : tb.localeCompare(ta);
  });

  const thBg  = dark ? 'bg-red-950/40 text-red-400/80' : 'bg-violet-100 text-violet-700';
  const rowHover = dark ? 'hover:bg-slate-800/40' : 'hover:bg-violet-50/60';
  const tdText = dark ? 'text-slate-300' : 'text-slate-700';
  const borderColor = dark ? 'border-red-900/30' : 'border-violet-200/60';

  return (
    <div className="mt-2 space-y-2">
      {meta && meta.length > 0 && (
        <div className={`flex flex-wrap gap-4 px-3 py-2 rounded-lg text-xs ${dark ? 'bg-red-950/30 border border-red-900/30 text-slate-300' : 'bg-violet-50 border border-violet-200 text-slate-700'}`}>
          {meta.map(m => (
            <span key={m.label}><strong className="text-red-400 mr-1">{m.label}:</strong>{m.value}</span>
          ))}
        </div>
      )}
      <div className={`overflow-x-auto rounded-lg border ${borderColor}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className={thBg}>
              {cols.map((c, i) => (
                <th
                  key={c}
                  onClick={() => { setSortCol(i); setSortDir(sortCol === i && sortDir === 'asc' ? 'desc' : 'asc'); }}
                  className="px-3 py-2 text-left font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none pr-6 relative"
                >
                  {COL_LABELS[c] ?? c}
                  <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] opacity-60">
                    {sortCol === i ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, ri) => (
              <tr key={ri} className={`border-t ${border} ${rowHover}`}>
                {cols.map(c => {
                  const v = row[c];
                  const empty = v == null || String(v).trim() === '';
                  const isHi = HIGHLIGHT_KEYS.has(c) || HIGHLIGHT_KEYS.has(c.toLowerCase());
                  const isRisk = c === 'riesgo';
                  const rVal = String(v ?? '').toLowerCase();
                  const riskCls = isRisk ? (rVal==='high'?'text-red-400 font-black':rVal==='medium'?'text-amber-400 font-black':'text-emerald-400 font-black') : '';
                  const dups = c === 'ruc' ? dupMap[String(v ?? '')] : undefined;
                  return (
                    <td key={c} className={`px-3 py-2 align-top ${tdText} ${isHi && !empty ? 'font-bold' : ''} ${riskCls}`}>
                      {empty ? '—' : isRisk ? ({ high:'⚠ ALTO', medium:'⚡ MEDIO', low:'✓ BAJO' }[rVal] ?? formatVal(v))
                        : formatVal(v)}
                      {dups && dups.length > 0 && (
                        <span className="relative group ml-1.5">
                          <span className="text-[9px] font-bold bg-red-500/20 text-red-400 border border-red-500/40 rounded-full px-1.5 py-0.5 cursor-help">
                            +{dups.length} dup
                          </span>
                          <div className="hidden group-hover:block absolute left-0 top-full z-50 mt-1 min-w-64 bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl text-slate-300 text-[11px] whitespace-normal">
                            <p className="font-bold text-red-400 mb-2">Causas duplicadas (mismo RUC)</p>
                            {dups.map((d, di) => (
                              <div key={di} className="mb-1 pb-1 border-b border-slate-700 last:border-0">
                                {d.crimen ? <span className="mr-2">{String(d.crimen)}</span> : null}
                                {d.fecha  ? <span className="text-slate-500 mr-2">{String(d.fecha)}</span> : null}
                              </div>
                            ))}
                          </div>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListaRow({ name, entry, dark }: { name: string; entry: ListaEntry; dark: boolean }) {
  const [open, setOpen] = useState(false);
  const hitBorder = dark ? 'border-red-800/50 bg-red-950/20' : 'border-red-300 bg-red-50/70';
  const cleanBorder = dark ? 'border-slate-700/40 bg-slate-800/30' : 'border-violet-200/60 bg-violet-50/30';
  return (
    <div className={`rounded-xl border transition-colors ${entry.coincidence ? hitBorder : cleanBorder}`}>
      <button
        onClick={() => entry.coincidence && setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${entry.coincidence ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-lg ${
          entry.coincidence
            ? entry.risk.toLowerCase() === 'medium' ? 'bg-amber-400 shadow-amber-400/50' : 'bg-red-400 shadow-red-400/50'
            : 'bg-emerald-400 shadow-emerald-400/50'
        }`} />
        <span className={`flex-1 text-sm font-medium ${dark ? 'text-slate-200' : 'text-slate-700'}`}>{name}</span>
        {entry.coincidence
          ? <span className={`text-xs font-black uppercase ${entry.risk.toLowerCase()==='medium'?'text-amber-400':'text-red-400'}`}>{entry.risk.toUpperCase()}</span>
          : <span className={`text-xs ${dark ? 'text-slate-500' : 'text-slate-500'}`}>Sin coincidencia</span>}
        {entry.coincidence && (
          <svg className={`w-3 h-3 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {open && entry.coincidence && (
        <div className="px-4 pb-4">
          <DetailTable data={entry.data} dark={dark} />
        </div>
      )}
    </div>
  );
}

function DecisionBox({ decision, dark }: { decision: DecisionResult; dark: boolean }) {
  const d = decision.decision;
  const isFB  = d === 'FORZAR_BLOQUEO';
  const isUCR = d === 'UNDER_COMPLIANCE_REVIEW';

  const boxCls = isFB
    ? dark ? 'bg-red-950/40 border-red-700/60' : 'bg-red-50 border-red-300'
    : isUCR
      ? dark ? 'bg-amber-950/40 border-amber-700/60' : 'bg-amber-50 border-amber-300'
      : dark ? 'bg-emerald-950/30 border-emerald-700/50' : 'bg-emerald-50 border-emerald-300';

  const labelCls = isFB
    ? dark ? 'text-red-400' : 'text-red-700'
    : isUCR
      ? dark ? 'text-amber-400' : 'text-amber-700'
      : dark ? 'text-emerald-400' : 'text-emerald-700';

  const icon = isFB ? '🚫' : isUCR ? '⚠️' : '✅';

  return (
    <div className={`rounded-xl border px-5 py-4 space-y-2 ${boxCls}`}>
      <div className={`text-base font-black flex items-center gap-2 ${labelCls}`}>
        <span>{icon}</span>
        <span>{d}</span>
      </div>
      {decision.razon && (
        <div className={`text-sm ${dark ? 'text-slate-400' : 'text-slate-600'}`}>{decision.razon}</div>
      )}
      <div className={`flex flex-wrap gap-5 text-xs ${dark ? 'text-slate-500' : 'text-slate-500'}`}>
        <span>Precedentes: <strong className={dark ? 'text-slate-300' : 'text-slate-700'}>{decision.precedentesCount}</strong></span>
        <span>No-precedentes: <strong className={dark ? 'text-slate-300' : 'text-slate-700'}>{decision.noPrecedentesCount}</strong></span>
        <span>Equivalente total: <strong className={dark ? 'text-slate-300' : 'text-slate-700'}>{decision.totalEquivalente}</strong></span>
      </div>
    </div>
  );
}

function ResultCard({ result, dark }: { result: PerfilResult; dark: boolean }) {
  const hitCount = Object.values(result.listas).filter(e => e.coincidence).length;
  const bg    = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-violet-200/70 shadow-sm';
  const text  = dark ? 'text-white' : 'text-slate-900';
  const muted = dark ? 'text-slate-500' : 'text-violet-600';
  const fieldBg = dark ? 'bg-slate-900/40 border-slate-700/40' : 'bg-violet-50/60 border-violet-200/60';
  const fieldLabel = dark ? 'text-slate-500' : 'text-violet-500';
  const fieldVal   = dark ? 'text-slate-200' : 'text-slate-800';
  const divider = dark ? 'bg-slate-700/50' : 'bg-violet-200/60';

  return (
    <div className="space-y-4">
      <div className={`border rounded-2xl p-6 ${bg}`}>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className={`text-xl font-black ${text}`}>{result.nombre || result.dni}</h3>
          <RiskBadge risk={result.riesgo_final} />
          {result.pep_level && (
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/40">
              PEP Nivel {result.pep_level}
            </span>
          )}
          <code className={`ml-auto text-xs font-mono px-3 py-1.5 rounded-lg border ${dark ? 'text-slate-400 bg-slate-900/60 border-slate-700' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>
            {result.dni}
          </code>
          <button
            onClick={() => generatePDF(result)}
            className="flex items-center gap-1.5 text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-600/40 px-3 py-1.5 rounded-lg transition-all"
          >
            📄 PDF
          </button>
        </div>

        {hitCount > 0 ? (
          <div className={`border rounded-xl px-4 py-3 text-sm font-medium ${dark ? 'bg-red-950/40 border-red-800/50 text-red-300' : 'bg-red-50 border-red-300 text-red-700'}`}>
            ⚠ <strong>{hitCount} alerta{hitCount > 1 ? 's' : ''} detectada{hitCount > 1 ? 's' : ''}</strong> — haz clic en cada lista para ver el detalle
          </div>
        ) : (
          <div className={`border rounded-xl px-4 py-3 text-sm font-medium ${dark ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700'}`}>
            ✓ <strong>Sin alertas</strong> — perfil limpio en todas las listas consultadas
          </div>
        )}

        {Object.keys(result.ficha).length > 0 && (
          <>
            <div className="flex items-center gap-3 mt-5 mb-3">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Datos del perfil</span>
              <div className={`flex-1 h-px ${divider}`} />
            </div>
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

      <div>
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>
            Resultados de listas — {hitCount} alerta{hitCount !== 1 ? 's' : ''} de {Object.keys(result.listas).length} consultadas
          </span>
          <div className={`flex-1 h-px ${divider}`} />
        </div>
        <div className="space-y-2">
          {Object.entries(result.listas)
            .sort((a, b) => (b[1].coincidence ? 1 : 0) - (a[1].coincidence ? 1 : 0))
            .map(([name, entry]) => (
              <ListaRow key={name} name={name} entry={entry} dark={dark} />
            ))}
        </div>
      </div>

      {result.decision && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Decisión (Motor local)</span>
            <div className={`flex-1 h-px ${divider}`} />
          </div>
          <DecisionBox decision={result.decision} dark={dark} />
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface RegcheqToolProps {
  onBack: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const RegcheqTool: React.FC<RegcheqToolProps> = ({ onBack, darkMode }) => {
  // Use global darkMode if provided, otherwise fallback to localStorage
  const [localDark] = useState<boolean>(() => localStorage.getItem('regcheq-theme') !== 'light');
  const dark = darkMode !== undefined ? darkMode : localDark;
  const [countryMode, setCountryMode] = useState<CountryMode>(null);
  const [tab, setTab] = useState<Tab>('individual');

  useEffect(() => {
    // Keep local preference in sync for standalone use
    localStorage.setItem('regcheq-theme', dark ? 'dark' : 'light');
  }, [dark]);

  // ── Individual state ────────────────────────────────────────────────────────
  const [tipo, setTipo]               = useState<PersonType>('natural');
  const [natDni, setNatDni]           = useState('');
  const [natNombre, setNatNombre]     = useState('');
  const [natAp, setNatAp]             = useState('');
  const [natAp2, setNatAp2]           = useState('');
  const [natNac, setNatNac]           = useState('');
  const [natCargo, setNatCargo]       = useState('');
  const [natEmail, setNatEmail]       = useState('');
  const [natTel, setNatTel]           = useState('');
  const [legRut, setLegRut]           = useState('');
  const [legRazon, setLegRazon]       = useState('');
  const [legTipo, setLegTipo]         = useState('');
  const [legRepDni, setLegRepDni]     = useState('');
  const [legRepNom, setLegRepNom]     = useState('');
  const [legEmail, setLegEmail]       = useState('');
  const [legPais, setLegPais]         = useState('');
  const [crearFicha, setCrearFicha]   = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [result, setResult]           = useState<PerfilResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // ── Masivo state ────────────────────────────────────────────────────────────
  const [masivoFile, setMasivoFile]         = useState<File | null>(null);
  const [crearMasivo, setCrearMasivo]       = useState(false);
  const [delay, setDelay]                   = useState(0.5);
  const [limite, setLimite]                 = useState(0);
  const [isDrag, setIsDrag]                 = useState(false);
  const [masivoRunning, setMasivoRunning]   = useState(false);
  const [masivoProgress, setMasivoProgress] = useState(0);
  const [masivoTotal, setMasivoTotal]       = useState(0);
  const [logs, setLogs]                     = useState<LogLine[]>([]);
  const [masivoResults, setMasivoResults]   = useState<PerfilResult[]>([]);
  const [masivoStats, setMasivoStats]       = useState({ total:0, high:0, alerts:0, ok:0, err:0 });
  const [carouselIdx, setCarouselIdx]       = useState(0);
  const [carouselFilter, setCarouselFilter] = useState('');
  const [masivoError, setMasivoError]       = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  const filteredResults = masivoResults.filter(r =>
    !carouselFilter || r.dni.includes(carouselFilter) || r.nombre.toLowerCase().includes(carouselFilter.toLowerCase())
  );

  const addLog = useCallback((type: LogLine['type'], text: string) => {
    setLogs(l => [...l.slice(-200), { type, text }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }, []);

  // ── Lista state ─────────────────────────────────────────────────────────────
  const [listaItems, setListaItems]   = useState<ListaInteres[]>([]);
  const [listaLoading, setListaLoading] = useState(false);
  const [listaError, setListaError]   = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDni, setAddDni]           = useState('');
  const [addNom, setAddNom]           = useState('');
  const [addTipo, setAddTipo]         = useState<PersonType>('natural');
  const [addRazon, setAddRazon]       = useState('');
  const [addLoading, setAddLoading]   = useState(false);

  // ── Theme-based classes ─────────────────────────────────────────────────────
  const bg        = dark ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950' : 'bg-gradient-to-br from-white via-violet-50/40 to-white';
  const cardBg    = dark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-white border-violet-200/70 shadow-sm';
  const navBg     = dark ? 'bg-slate-900/90 border-slate-700/50' : 'bg-white/95 border-violet-200/70 shadow-sm';
  const textMain  = dark ? 'text-slate-100' : 'text-slate-900';
  const textMuted = dark ? 'text-slate-400' : 'text-slate-600';
  const inputCls  = dark
    ? 'bg-slate-900/60 border-slate-600/50 text-white placeholder-slate-600 focus:border-indigo-500'
    : 'bg-white border-violet-200 text-slate-800 placeholder-slate-400 focus:border-violet-500 focus:ring-1 focus:ring-violet-200';
  const labelCls  = dark ? 'text-slate-400' : 'text-violet-600';

  function inputField(label: string, value: string, onChange: (v:string)=>void, props?: React.InputHTMLAttributes<HTMLInputElement>) {
    return (
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
  }

  // ── Individual analysis ─────────────────────────────────────────────────────
  async function analizarPerfil() {
    const dniVal = tipo === 'natural' ? natDni.trim() : legRut.trim();
    if (!dniVal) { setError('El campo DNI / RUT es obligatorio.'); return; }
    if (!API_KEY) { setError('Falta la variable de entorno VITE_REGCHEQ_API_KEY.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      if (crearFicha) {
        const body: Record<string,string> = { dni: dniVal, personType: tipo };
        if (tipo === 'natural') {
          if (natNombre) body.name        = natNombre.toUpperCase();
          if (natAp)     body.fatherName  = natAp.toUpperCase();
          if (natAp2)    body.motherName  = natAp2.toUpperCase();
          if (natNac)    body.nationality = natNac;
          if (natCargo)  body.position    = natCargo;
          if (natEmail)  body.email       = natEmail;
          if (natTel)    body.phone       = natTel;
        } else {
          if (legRazon)  body.socialReason  = legRazon;
          if (legTipo)   body.businessType  = legTipo;
          if (legEmail)  body.email         = legEmail;
          if (legPais)   body.country       = legPais;
          if (legRepDni) {
            // personsRelations requires special handling — skip in browser for now
          }
        }
        await fetch(`${API_BASE}/record/${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const r = await fetchPerfil(dniVal);
      setResult(r);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('Failed to fetch') || msg.includes('NetworkError')
        ? 'Error de red (posible bloqueo CORS de la API). Verifica tu conexión o usa la versión local Python.'
        : msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Masivo processing ───────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) setMasivoFile(f);
  }

  async function procesarMasivo() {
    if (!masivoFile) return;
    if (!API_KEY) { setMasivoError('Falta VITE_REGCHEQ_API_KEY.'); return; }
    setMasivoRunning(true); setMasivoError(''); setLogs([]); setMasivoResults([]); abortRef.current = false;

    // Parse Excel
    let rows: Record<string, string>[];
    try {
      const buf  = await masivoFile.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string,string>>(ws, { defval: '' });
      // Normalize keys
      rows = data.map(r => {
        const norm: Record<string,string> = {};
        for (const [k,v] of Object.entries(r)) norm[k.toLowerCase().trim()] = String(v).trim();
        return norm;
      });
    } catch (e) {
      setMasivoError(`Error leyendo Excel: ${e instanceof Error ? e.message : String(e)}`);
      setMasivoRunning(false); return;
    }

    // Find DNI column
    const dniColCandidates = countryMode === 'global'
      ? ['dni','id','pasaporte','passport','documento','document']
      : ['rut','dni','rut/dni'];
    const dniCol = dniColCandidates.find(k => rows[0]?.[k] !== undefined);
    if (!dniCol) {
      setMasivoError(countryMode === 'global'
        ? 'El archivo no tiene columna "dni". Verifica el formato.'
        : 'El archivo no tiene columna "rut" o "dni". Verifica el formato.');
      setMasivoRunning(false); return;
    }
    // Detect optional nationality column (global mode)
    const paisCol = ['pais','país','nacionalidad','nationality','country'].find(k => rows[0]?.[k] !== undefined);

    const toProcess = limite > 0 ? rows.slice(0, limite) : rows;
    setMasivoTotal(toProcess.length);
    addLog('info', `📂 ${masivoFile.name} — ${toProcess.length} registros a procesar`);

    const results: PerfilResult[] = [];
    let high = 0, alerts = 0, ok = 0, err = 0;

    for (let i = 0; i < toProcess.length; i++) {
      if (abortRef.current) { addLog('info', '⛔ Proceso cancelado por el usuario'); break; }
      const row   = toProcess[i];
      const dniV    = row[dniCol];
      const name    = row['nombre'] ?? row['name'] ?? row['razón social'] ?? row['razon social'] ?? '';
      const apellido = row['apellido'] ?? row['apellido_paterno'] ?? row['apellido paterno'] ?? '';
      const pais    = paisCol ? (row[paisCol] ?? '') : '';
      const label   = name ? `${dniV} (${name}${apellido ? ' '+apellido : ''})` : dniV;

      if (!dniV) { addLog('err', `Fila ${i+1}: sin DNI, omitida`); err++; setMasivoProgress(i+1); continue; }

      try {
        if (crearMasivo) {
          const body: Record<string,string> = { dni: dniV, personType: 'natural' };
          if (name)    body.name        = name.toUpperCase();
          if (apellido) body.fatherName = apellido.toUpperCase();
          if (pais)    body.nationality = pais;
          await fetch(`${API_BASE}/record/${API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        }
        const r = await fetchPerfil(dniV);
        results.push(r);
        const hitCount = Object.values(r.listas).filter(e => e.coincidence).length;
        const riskLow  = (r.riesgo_final || '').toLowerCase();
        if (riskLow === 'high' || riskLow === 'high risk') high++;
        if (hitCount > 0) alerts++;
        else ok++;
        const icon = hitCount > 0 ? '⚠' : '✓';
        addLog(hitCount > 0 ? 'err' : 'ok', `${icon} [${i+1}/${toProcess.length}] ${label} — ${hitCount} alerta${hitCount !== 1 ? 's' : ''} · ${r.riesgo_final || 'N/D'}`);
      } catch (e: unknown) {
        err++;
        addLog('err', `✗ [${i+1}/${toProcess.length}] ${label} — Error: ${e instanceof Error ? e.message : String(e)}`);
      }

      setMasivoProgress(i + 1);
      setMasivoResults([...results]);
      setMasivoStats({ total: i+1, high, alerts, ok, err });

      if (delay > 0 && i < toProcess.length - 1) await new Promise(res => setTimeout(res, delay * 1000));
    }

    addLog('info', `✅ Proceso completado — ${results.length} procesados, ${err} errores`);
    setMasivoRunning(false);
    setCarouselIdx(0);
  }

  function exportarExcel() {
    if (masivoResults.length === 0) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts  = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const fileName = `resultado_regcheq_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.xlsx`;

    // Helper — coincidence bool as "True"/"False"
    const coinc = (r: PerfilResult, label: string) => r.listas[label]?.coincidence ? 'True' : 'False';

    // Helper — extract crimes array from causas penales lista entry
    const getCrimes = (r: PerfilResult): Record<string,unknown>[] => {
      const raw = r.listas['Causas Penales Chile']?.data as Record<string,unknown> | null | undefined;
      if (!raw) return [];
      if (Array.isArray(raw)) return raw as Record<string,unknown>[];
      if (Array.isArray(raw['additionalData'])) return raw['additionalData'] as Record<string,unknown>[];
      return [];
    };

    // Helper — imputado name from causas API data
    const getImputado = (r: PerfilResult): string => {
      const raw = r.listas['Causas Penales Chile']?.data as Record<string,unknown> | null | undefined;
      const info = raw?.['info'] as Record<string,unknown> | undefined;
      return info?.['name'] ? String(info['name']) : '';
    };

    // ── Hoja 1: Resultados Regcheq ────────────────────────────────────────────
    const resultadosRows = masivoResults.map(r => ({
      'DNI':                                      r.dni,
      'Tipo de persona':                          'natural',
      'Nombre':                                   r.nombre,
      'Apellido paterno':                         r.ficha['Apellido paterno'] || '',
      'Razón Social':                             r.ficha['Razón Social'] || '',
      'Riesgo calculado listas':                  r.riesgo_final,
      'Riesgo sobreescrito':                      '',
      'Riesgo final Ficha':                       r.riesgo_final,
      'listas_total_coincidencias':               Object.values(r.listas).filter(e => e.coincidence).length,
      'Coincidencia_PEP Chile':                   coinc(r, 'PEP Chile'),
      'Coincidencia_Funcionarios Públicos Chile':  'False',
      'Coincidencia_Causas penales Chile':         coinc(r, 'Causas Penales Chile'),
      'Coincidencia_PDI':                         coinc(r, 'PDI Chile'),
      'Coincidencia_Países Sancionados (GAFI)':   coinc(r, 'GAFI'),
      'Coincidencia_Organismos internacionales':  'False',
      'Coincidencia_OFAC Domicilio':              coinc(r, 'OFAC'),
      'Coincidencia_Screening Global':            coinc(r, 'Screening Global'),
      'Coincidencia_RTP':                         coinc(r, 'RTP / PDI'),
      'Coincidencia_Palabras Clave':              'False',
      'Coincidencia_Comentarios de Riesgo':       'False',
      'Coincidencia_Lista de interés':            coinc(r, 'Lista de Interés'),
      'Coincidencia_Lista Regcheq':               'False',
      'Coincidencia_BIC':                         'False',
      'PEP_nivel':                                r.pep_level || '',
      'causas_penales_imputado':                  getImputado(r),
      'regcheq_error':                            '',
    }));

    // ── Hoja 2: Coincidencias ─────────────────────────────────────────────────
    const coincidenciasRows = masivoResults.map(r => ({
      'DNI':                                      r.dni,
      'Nombre':                                   r.nombre,
      'Apellido paterno':                         r.ficha['Apellido paterno'] || '',
      'Razón Social':                             r.ficha['Razón Social'] || '',
      'Riesgo final Ficha':                       r.riesgo_final,
      'Nombre imputado (API)':                    getImputado(r),
      'Coincidencia_Causas penales Chile':         coinc(r, 'Causas Penales Chile'),
      'Coincidencia_PEP Chile':                   coinc(r, 'PEP Chile'),
      'Coincidencia_Funcionarios Públicos Chile':  'False',
      'Coincidencia_PDI':                         coinc(r, 'PDI Chile'),
      'Coincidencia_Países Sancionados (GAFI)':   coinc(r, 'GAFI'),
      'Coincidencia_Organismos internacionales':  'False',
      'Coincidencia_OFAC Domicilio':              coinc(r, 'OFAC'),
      'Coincidencia_Screening Global':            coinc(r, 'Screening Global'),
      'Coincidencia_RTP':                         coinc(r, 'RTP / PDI'),
      'Coincidencia_BIC':                         'False',
      'Coincidencia_Palabras Clave':              'False',
      'Coincidencia_Comentarios de Riesgo':       'False',
      'Coincidencia_Lista de interés':            coinc(r, 'Lista de Interés'),
      'Coincidencia_Lista Regcheq':               'False',
    }));

    // ── Hoja 3: Causas Penales Chile — una fila por delito ────────────────────
    const causasRows: Record<string,string>[] = [];
    for (const r of masivoResults) {
      const crimes = getCrimes(r);
      const imputado = getImputado(r) || r.nombre;
      for (const c of crimes) {
        causasRows.push({
          'DNI':            r.dni,
          'Imputado (API)': imputado,
          'Nombre Ficha':   r.nombre,
          'Riesgo Ficha':   r.riesgo_final,
          'Delito':         String(c['crimen']   ?? c['Crimen']   ?? c['delito']   ?? ''),
          'Estado':         String(c['estado']   ?? c['Estado']   ?? ''),
          'Fecha':          String(c['fecha']    ?? c['Fecha']    ?? ''),
          'Riesgo Delito':  String(c['riesgo']   ?? c['Riesgo']   ?? c['risk']    ?? ''),
          'RIT':            String(c['rit']      ?? c['RIT']      ?? ''),
          'RUC':            String(c['ruc']      ?? c['RUC']      ?? ''),
          'Tribunal':       String(c['tribunal'] ?? c['Tribunal'] ?? ''),
        });
      }
    }

    // ── Hoja 4: Resumen ───────────────────────────────────────────────────────
    const highCount = masivoResults.filter(r => (r.riesgo_final || '').toLowerCase().includes('high')).length;
    const pepCount  = masivoResults.filter(r => r.listas['PEP Chile']?.coincidence).length;
    const resumenRows = [
      { 'Generado': 'Total personas', [ts]: masivoResults.length },
      { 'Generado': 'Errores API',    [ts]: 0 },
      { 'Generado': 'High Risk',      [ts]: highCount },
      { 'Generado': 'PEP detectado',  [ts]: pepCount },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resultadosRows),    'Resultados Regcheq');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coincidenciasRows), 'Coincidencias');
    if (causasRows.length > 0)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(causasRows), 'Causas Penales Chile');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows),       'Resumen');
    XLSX.writeFile(wb, fileName);
  }

  function exportarPDFAll() {
    masivoResults.forEach(r => generatePDF(r));
  }

  // ── Lista de interés ────────────────────────────────────────────────────────
  async function cargarLista() {
    if (!API_KEY) { setListaError('Falta VITE_REGCHEQ_API_KEY.'); return; }
    setListaLoading(true); setListaError('');
    try {
      const resp = await fetch(`${API_BASE}/interest-list/${API_KEY}`);
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      setListaItems(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setListaError(msg.includes('Failed to fetch') ? 'Error de red / CORS.' : msg);
    } finally { setListaLoading(false); }
  }

  async function agregarLista() {
    if (!addDni.trim() || !addNom.trim() || !addRazon.trim()) { setListaError('Completa RUT, nombre y razón.'); return; }
    setAddLoading(true); setListaError('');
    try {
      const resp = await fetch(`${API_BASE}/interest-list/${API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni: addDni.trim(), name: addNom.trim(), personType: addTipo, reason: addRazon.trim(), status: 'active' }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      setAddDni(''); setAddNom(''); setAddRazon(''); setShowAddForm(false);
      await cargarLista();
    } catch (e: unknown) { setListaError(e instanceof Error ? e.message : String(e)); }
    finally { setAddLoading(false); }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  // ── Colombia mode ──────────────────────────────────────────────────────────
  if (countryMode === 'colombia') {
    return <InspektorColombia onBack={() => setCountryMode(null)} dark={dark} />;
  }

  // ── Country selector landing ────────────────────────────────────────────────
  if (!countryMode) {
    return (
      <div className={`min-h-screen ${bg} ${textMain} transition-colors`}>
        {/* Nav */}
        <nav className={`sticky top-0 z-50 backdrop-blur border-b px-6 py-3 flex items-center gap-3 ${
          dark ? 'bg-slate-900/90 border-slate-700/50' : 'bg-white/95 border-violet-200/70 shadow-sm'
        }`}>
          <button onClick={onBack} className={`flex items-center gap-2 text-xs font-semibold transition-colors ${dark ? 'text-slate-400 hover:text-indigo-400' : 'text-slate-600 hover:text-indigo-600'}`}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Inicio
          </button>
          <div className={`h-4 w-px ${dark ? 'bg-slate-700' : 'bg-violet-200'}`} />
          <span className="text-sm font-black">Regcheq</span>
          <span className={`text-xs font-medium ${dark ? 'text-slate-400' : 'text-slate-600'}`}>Análisis AML / KYC</span>
        </nav>

        {/* Country selector */}
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <div className="text-5xl mb-4">🌎</div>
          <h2 className={`text-2xl font-black mb-2 ${dark ? 'text-white' : 'text-slate-900'}`}>
            ¿Qué tipo de cliente deseas consultar?
          </h2>
          <p className={`text-sm mb-10 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            Selecciona la nacionalidad para acceder a las fuentes correspondientes.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Chile */}
            <button
              onClick={() => setCountryMode('chile')}
              className={`group rounded-3xl p-8 text-left transition-all duration-300 border hover:shadow-2xl active:scale-[0.98] ${
                dark
                  ? 'bg-slate-800/60 border-slate-700/50 hover:border-indigo-500/50 hover:bg-indigo-950/40 hover:shadow-indigo-950/50'
                  : 'bg-white border-violet-200 hover:border-indigo-400 hover:shadow-indigo-100/60'
              }`}
            >
              <div className="text-5xl mb-4">🇨🇱</div>
              <h3 className={`text-xl font-black mb-2 ${dark ? 'text-white' : 'text-slate-900'}`}>Chilenos</h3>
              <p className={`text-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                Regcheq — PEP Chile, OFAC, ONU, Unión Europea, PDI, causas penales, screening global y lista de interés interna.
              </p>
            </button>

            {/* Colombia */}
            <button
              onClick={() => setCountryMode('colombia')}
              className={`group rounded-3xl p-8 text-left transition-all duration-300 border hover:shadow-2xl active:scale-[0.98] ${
                dark
                  ? 'bg-slate-800/60 border-slate-700/50 hover:border-yellow-500/40 hover:bg-yellow-950/20 hover:shadow-yellow-950/30'
                  : 'bg-white border-violet-200 hover:border-yellow-400 hover:shadow-yellow-100/50'
              }`}
            >
              <div className="text-5xl mb-4">🇨🇴</div>
              <h3 className={`text-xl font-black mb-2 ${dark ? 'text-white' : 'text-slate-900'}`}>Colombianos</h3>
              <p className={`text-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                Inspektor · DataLAFT — Listas AML, Procuraduría, Rama Judicial, JEPMS y listas propias.
              </p>
            </button>

            {/* Global / Internacional */}
            <button
              onClick={() => setCountryMode('global')}
              className={`group rounded-3xl p-8 text-left transition-all duration-300 border hover:shadow-2xl active:scale-[0.98] ${
                dark
                  ? 'bg-slate-800/60 border-slate-700/50 hover:border-emerald-500/40 hover:bg-emerald-950/20 hover:shadow-emerald-950/30'
                  : 'bg-white border-violet-200 hover:border-emerald-400 hover:shadow-emerald-100/50'
              }`}
            >
              <div className="text-5xl mb-4">🌍</div>
              <h3 className={`text-xl font-black mb-2 ${dark ? 'text-white' : 'text-slate-900'}`}>Internacional</h3>
              <p className={`text-sm leading-relaxed ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                Regcheq — OFAC, ONU, Unión Europea, INTERPOL, GAFI y Screening Global para cualquier nacionalidad.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Chile mode (existing UI) ────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${bg} ${textMain} transition-colors`}>
      {/* Nav */}
      <nav className={`sticky top-0 z-50 backdrop-blur border-b px-6 py-3 flex items-center gap-3 flex-wrap ${navBg}`}>
        <button onClick={() => setCountryMode(null)} className={`flex items-center gap-2 text-xs font-semibold transition-colors ${textMuted} hover:text-indigo-400`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Países
        </button>
        <div className={`h-4 w-px ${dark ? 'bg-slate-700' : 'bg-violet-200'}`} />
        <span className="text-sm font-black">
          {countryMode === 'global' ? '🌍 Internacional' : '🇨🇱 Chilenos'}
        </span>
        <span className={`text-xs font-medium ${textMuted}`}>Regcheq · AML / KYC</span>

        <div className={`flex gap-1 rounded-xl p-1 ml-2 ${dark ? 'bg-slate-800/60' : 'bg-violet-100/70'}`}>
          {(countryMode === 'global' ? (['individual','masivo'] as Tab[]) : (['individual','masivo','lista'] as Tab[])).map(t => {
            const labels: Record<Tab,string> = { individual:'🔍 Individual', masivo:'📊 Masivo', lista:'📋 Lista de Interés' };
            return (
              <button
                key={t}
                onClick={() => { setTab(t); if (t === 'lista') cargarLista(); }}
                className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${tab === t ? 'bg-indigo-600 text-white' : dark ? `${textMuted} hover:text-indigo-400` : 'text-violet-700 hover:text-violet-900'}`}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        <div className="ml-auto" />
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* ─── TAB: INDIVIDUAL ─────────────────────────────────────────────── */}
        {tab === 'individual' && (
          <div className="space-y-6">
            <div>
              <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>Análisis de Perfil</h2>
              <p className={`text-sm mt-1 ${textMuted}`}>
                {countryMode === 'global'
                  ? 'Consulta OFAC, ONU, Unión Europea, INTERPOL, GAFI y Screening Global para cualquier nacionalidad.'
                  : 'Consulta listas de vigilancia, PEP, OFAC, causas penales y más.'}
              </p>
            </div>

            <div className={`border rounded-2xl p-6 space-y-5 ${cardBg}`}>
              {/* Type toggle */}
              <div className={`flex gap-0 rounded-xl overflow-hidden w-fit border ${dark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-violet-50 border-violet-200'}`}>
                {(['natural','legal'] as PersonType[]).map(t => (
                  <button key={t} onClick={() => { setTipo(t); setResult(null); setError(''); }}
                    className={`px-5 py-2.5 text-sm font-bold transition-all ${tipo === t ? 'bg-indigo-600 text-white' : dark ? `${textMuted} hover:text-indigo-400` : 'text-violet-700 hover:text-violet-900'}`}>
                    {t === 'natural' ? '👤 Persona Natural' : '🏢 Empresa / Jurídica'}
                  </button>
                ))}
              </div>

              {/* Natural form */}
              {tipo === 'natural' && (
                <div className="space-y-4">
                  {countryMode === 'global' ? (
                    <>
                      {/* Global layout: nationality prominently up front */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {inputField('DNI / Pasaporte / ID *', natDni, setNatDni, { placeholder:'AB123456', onKeyDown: e => e.key==='Enter' && analizarPerfil() })}
                        {inputField('Nacionalidad / País ✦', natNac, setNatNac, { placeholder:'Argentina' })}
                        {inputField('Nombre', natNombre, setNatNombre, { placeholder:'JUAN' })}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {inputField('Apellido paterno', natAp, setNatAp, { placeholder:'PÉREZ' })}
                        {inputField('Apellido materno', natAp2, setNatAp2, { placeholder:'GÓMEZ' })}
                        {inputField('Cargo / Posición', natCargo, setNatCargo, { placeholder:'Director' })}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {inputField('Email', natEmail, setNatEmail, { type:'email', placeholder:'correo@ejemplo.com' })}
                        {inputField('Teléfono', natTel, setNatTel, { placeholder:'+54911234567' })}
                      </div>
                      <p className={`text-xs ${dark ? 'text-emerald-400/80' : 'text-emerald-700'}`}>
                        ✦ Incluir <strong>nombre completo</strong> y <strong>nacionalidad</strong> mejora significativamente la cobertura en listas internacionales (OFAC, ONU, Screening Global).
                      </p>
                    </>
                  ) : (
                    <>
                      {/* Chile layout: original */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {inputField('DNI / RUT *', natDni, setNatDni, { placeholder:'12345678-9', onKeyDown: e => e.key==='Enter' && analizarPerfil() })}
                        {inputField('Nombre', natNombre, setNatNombre, { placeholder:'PEDRO' })}
                        {inputField('Apellido paterno', natAp, setNatAp, { placeholder:'PÉREZ' })}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {inputField('Apellido materno', natAp2, setNatAp2, { placeholder:'GÓMEZ' })}
                        {inputField('Nacionalidad', natNac, setNatNac, { placeholder:'Chile' })}
                        {inputField('Cargo / Posición', natCargo, setNatCargo, { placeholder:'Gerente' })}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {inputField('Email', natEmail, setNatEmail, { type:'email', placeholder:'correo@ejemplo.cl' })}
                        {inputField('Teléfono', natTel, setNatTel, { placeholder:'+56912345678' })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Legal form */}
              {tipo === 'legal' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {inputField(countryMode === 'global' ? 'ID / NIT / Registro *' : 'RUT Empresa *', legRut, setLegRut, { placeholder: countryMode === 'global' ? 'ID-123456' : '76543210-K', onKeyDown: e => e.key==='Enter' && analizarPerfil() })}
                    {inputField('Razón Social', legRazon, setLegRazon, { placeholder:'Empresa SA' })}
                    {inputField('Tipo de empresa', legTipo, setLegTipo, { placeholder:'Sociedad Anónima' })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {inputField('RUT Representante', legRepDni, setLegRepDni, { placeholder:'12345678-9' })}
                    {inputField('Nombre Representante', legRepNom, setLegRepNom, { placeholder:'PEDRO PÉREZ' })}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {inputField('Email empresa', legEmail, setLegEmail, { type:'email', placeholder:'contacto@empresa.cl' })}
                    {inputField('País', legPais, setLegPais, { placeholder:'Chile' })}
                  </div>
                </div>
              )}

              {/* Crear ficha toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                <div onClick={() => setCrearFicha(v => !v)}
                  className={`w-10 h-6 rounded-full border transition-all relative ${crearFicha ? 'bg-indigo-600 border-indigo-500' : dark ? 'bg-slate-700 border-slate-600' : 'bg-slate-200 border-slate-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${crearFicha ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <span className={`text-sm ${dark ? 'text-slate-300' : 'text-slate-700'}`}>Crear / actualizar ficha antes de consultar</span>
              </label>

              <button onClick={analizarPerfil} disabled={loading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all">
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Consultando...</>
                  : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Analizar Perfil</>}
              </button>
            </div>

            {error && <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300"><strong>Error:</strong> {error}</div>}
            {result && <div ref={resultRef}><ResultCard result={result} dark={dark} /></div>}
          </div>
        )}

        {/* ─── TAB: MASIVO ─────────────────────────────────────────────────── */}
        {tab === 'masivo' && (
          <div className="space-y-6">
            <div>
              <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>Consulta Masiva</h2>
              {countryMode === 'global' ? (
                <p className={`text-sm mt-1 ${textMuted}`}>
                  Sube un Excel con columna <code className="font-mono text-indigo-400">dni</code> (obligatorio).
                  Columnas opcionales: <code className="font-mono text-indigo-400">nombre</code>, <code className="font-mono text-indigo-400">apellido</code>, <code className="font-mono text-indigo-400">pais</code> / <code className="font-mono text-indigo-400">nacionalidad</code>.
                </p>
              ) : (
                <p className={`text-sm mt-1 ${textMuted}`}>Sube un Excel con columna <code className="font-mono text-indigo-400">rut</code> o <code className="font-mono text-indigo-400">dni</code> para procesar múltiples perfiles.</p>
              )}
            </div>

            <div className={`border rounded-2xl p-6 space-y-5 ${cardBg}`}>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setIsDrag(true); }}
                onDragLeave={() => setIsDrag(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('masivo-file-input')?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  isDrag ? 'border-indigo-500 bg-indigo-500/10' :
                  masivoFile ? (dark ? 'border-emerald-600/50 bg-emerald-950/20' : 'border-emerald-400 bg-emerald-50') :
                  dark ? 'border-slate-600 hover:border-indigo-500 hover:bg-indigo-500/5' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                }`}
              >
                <div className="text-4xl mb-3">{masivoFile ? '📊' : '📂'}</div>
                <p className={`text-base font-semibold mb-1 ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
                  {masivoFile ? masivoFile.name : 'Arrastra tu Excel aquí o haz clic para seleccionar'}
                </p>
                <p className={`text-xs ${textMuted}`}>
                  {countryMode === 'global'
                    ? <>Formato: <code className="font-mono text-indigo-400">.xlsx</code> · Columna obligatoria: <code className="font-mono text-indigo-400">dni</code> · Opcionales: <code className="font-mono text-indigo-400">nombre</code>, <code className="font-mono text-indigo-400">apellido</code>, <code className="font-mono text-indigo-400">pais</code></>
                    : <>Formato: <code className="font-mono text-indigo-400">.xlsx</code> · Columna obligatoria: <code className="font-mono text-indigo-400">rut</code> o <code className="font-mono text-indigo-400">dni</code></>
                  }
                </p>
                <input id="masivo-file-input" type="file" accept=".xlsx" className="hidden"
                  onChange={e => e.target.files?.[0] && setMasivoFile(e.target.files[0])} />
              </div>

              {/* Options */}
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div onClick={() => setCrearMasivo(v => !v)}
                    className={`w-10 h-6 rounded-full border transition-all relative ${crearMasivo ? 'bg-indigo-600 border-indigo-500' : dark ? 'bg-slate-700 border-slate-600' : 'bg-slate-200 border-slate-300'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${crearMasivo ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                  <span className={`text-sm ${dark ? 'text-slate-300' : 'text-slate-700'}`}>Crear fichas antes de consultar</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className={`text-xs font-bold uppercase tracking-widest whitespace-nowrap ${labelCls}`}>Delay (seg)</label>
                  <input type="number" value={delay} step={0.1} min={0}
                    onChange={e => setDelay(parseFloat(e.target.value) || 0)}
                    className={`w-20 border rounded-lg px-3 py-1.5 text-sm focus:outline-none transition-colors ${inputCls}`} />
                </div>
                <div className="flex items-center gap-2">
                  <label className={`text-xs font-bold uppercase tracking-widest whitespace-nowrap ${labelCls}`}>Límite filas</label>
                  <input type="number" value={limite} min={0} placeholder="0=todas"
                    onChange={e => setLimite(parseInt(e.target.value) || 0)}
                    className={`w-24 border rounded-lg px-3 py-1.5 text-sm focus:outline-none transition-colors ${inputCls}`} />
                </div>
              </div>

              <div className="flex gap-3 flex-wrap">
                <button onClick={procesarMasivo} disabled={!masivoFile || masivoRunning}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all">
                  {masivoRunning
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Procesando...</>
                    : '⚡ Procesar'}
                </button>
                {masivoRunning && (
                  <button onClick={() => { abortRef.current = true; }}
                    className="flex items-center gap-2 bg-red-700 hover:bg-red-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
                    ⛔ Cancelar
                  </button>
                )}
                {masivoResults.length > 0 && !masivoRunning && (
                  <>
                    <button onClick={exportarExcel}
                      className={`flex items-center gap-2 border font-bold px-5 py-2.5 rounded-xl text-sm transition-all ${dark ? 'border-emerald-600/50 text-emerald-400 hover:bg-emerald-950/40' : 'border-emerald-500 text-emerald-700 hover:bg-emerald-50'}`}>
                      📥 Exportar Excel
                    </button>
                    <button onClick={exportarPDFAll}
                      className={`flex items-center gap-2 border font-bold px-5 py-2.5 rounded-xl text-sm transition-all ${dark ? 'border-indigo-600/50 text-indigo-400 hover:bg-indigo-950/40' : 'border-violet-500 text-violet-700 hover:bg-violet-50'}`}>
                      📋 PDF todas las fichas
                    </button>
                  </>
                )}
              </div>
            </div>

            {masivoError && <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300"><strong>Error:</strong> {masivoError}</div>}

            {/* Progress */}
            {(masivoRunning || logs.length > 0) && (
              <div className={`border rounded-2xl p-6 space-y-4 ${cardBg}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold uppercase tracking-widest ${textMuted}`}>Progreso</span>
                  <span className={`text-sm font-bold ${dark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {masivoProgress} / {masivoTotal}
                  </span>
                </div>
                <div className={`w-full rounded-full h-2 ${dark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                  <div className="h-2 rounded-full bg-indigo-500 transition-all"
                    style={{ width: masivoTotal > 0 ? `${(masivoProgress/masivoTotal)*100}%` : '0%' }} />
                </div>
                <div ref={logRef} className={`font-mono text-xs rounded-xl p-4 max-h-64 overflow-y-auto space-y-0.5 ${dark ? 'bg-slate-900/60 border border-slate-700/50' : 'bg-slate-50 border border-slate-200'}`}>
                  {logs.map((l, i) => (
                    <div key={i} className={l.type === 'ok' ? 'text-emerald-400' : l.type === 'err' ? 'text-red-400' : 'text-indigo-400'}>
                      {l.text}
                    </div>
                  ))}
                </div>

                {/* Stats */}
                {masivoStats.total > 0 && (
                  <div className="grid grid-cols-5 gap-3">
                    {[
                      { num: masivoStats.total,  lbl: 'Total',       cls: dark ? 'text-slate-200' : 'text-violet-800' },
                      { num: masivoStats.high,   lbl: 'Alto riesgo', cls: 'text-red-400' },
                      { num: masivoStats.alerts, lbl: 'Con alertas', cls: 'text-amber-400' },
                      { num: masivoStats.ok,     lbl: 'Sin alertas', cls: 'text-emerald-400' },
                      { num: masivoStats.err,    lbl: 'Errores',     cls: textMuted },
                    ].map(s => (
                      <div key={s.lbl} className={`border rounded-xl p-3 text-center ${dark ? 'bg-slate-900/40 border-slate-700/40' : 'bg-violet-50/60 border-violet-200/60'}`}>
                        <div className={`text-2xl font-black ${s.cls}`}>{s.num}</div>
                        <div className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${textMuted}`}>{s.lbl}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Carousel */}
            {masivoResults.length > 0 && (
              <div className={`border rounded-2xl p-6 space-y-4 ${cardBg}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => setCarouselIdx(i => Math.max(0, i-1))} disabled={carouselIdx === 0}
                    className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all disabled:opacity-40 ${dark ? 'border-slate-600 text-slate-300 hover:border-indigo-500' : 'border-violet-300 text-violet-700 hover:border-violet-500'}`}>
                    ◀ Anterior
                  </button>
                  <span className={`text-sm font-bold ${dark ? 'text-slate-200' : 'text-slate-700'}`}>
                    {carouselIdx + 1} / {filteredResults.length}
                  </span>
                  <button onClick={() => setCarouselIdx(i => Math.min(filteredResults.length-1, i+1))} disabled={carouselIdx >= filteredResults.length-1}
                    className={`text-xs font-bold px-4 py-2 rounded-xl border transition-all disabled:opacity-40 ${dark ? 'border-slate-600 text-slate-300 hover:border-indigo-500' : 'border-violet-300 text-violet-700 hover:border-violet-500'}`}>
                    Siguiente ▶
                  </button>
                  <input
                    value={carouselFilter}
                    onChange={e => { setCarouselFilter(e.target.value); setCarouselIdx(0); }}
                    placeholder="🔍 Filtrar por DNI o nombre…"
                    className={`flex-1 min-w-40 border rounded-xl px-4 py-2 text-sm focus:outline-none transition-colors ${inputCls}`}
                  />
                  <button onClick={() => filteredResults[carouselIdx] && generatePDF(filteredResults[carouselIdx])}
                    className="text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-600/40 px-3 py-2 rounded-xl transition-all">
                    📄 PDF ficha
                  </button>
                </div>

                {filteredResults[carouselIdx] ? (
                  <ResultCard result={filteredResults[carouselIdx]} dark={dark} />
                ) : (
                  <p className={`text-sm text-center py-6 ${textMuted}`}>Sin resultados para el filtro aplicado</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: LISTA DE INTERÉS ─────────────────────────────────────── */}
        {tab === 'lista' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>Lista de Interés</h2>
                <p className={`text-sm mt-1 ${textMuted}`}>Registros activos en la lista interna de Regcheq.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={cargarLista} disabled={listaLoading}
                  className={`flex items-center gap-2 border font-bold px-4 py-2 rounded-xl text-sm transition-all ${dark ? 'border-slate-600 text-slate-300 hover:border-indigo-500' : 'border-violet-300 text-violet-700 hover:border-violet-500 hover:bg-violet-50'}`}>
                  <svg className={`w-4 h-4 ${listaLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  Actualizar
                </button>
                <button onClick={() => setShowAddForm(v => !v)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-all">
                  {showAddForm ? '✕ Cancelar' : '+ Agregar'}
                </button>
              </div>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className={`border rounded-2xl p-5 space-y-4 ${cardBg}`}>
                <h3 className={`text-sm font-bold ${dark ? 'text-slate-300' : 'text-slate-600'}`}>Nuevo registro</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {inputField('DNI / RUT *', addDni, setAddDni, { placeholder:'12345678-9' })}
                  {inputField('Nombre *', addNom, setAddNom, { placeholder:'Juan Pérez' })}
                  <div className="space-y-1.5">
                    <label className={`text-[10px] font-bold uppercase tracking-widest ${labelCls}`}>Tipo</label>
                    <select value={addTipo} onChange={e => setAddTipo(e.target.value as PersonType)}
                      className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors ${inputCls}`}>
                      <option value="natural">Persona Natural</option>
                      <option value="legal">Persona Jurídica</option>
                    </select>
                  </div>
                </div>
                {inputField('Razón / Motivo *', addRazon, setAddRazon, { placeholder:'PEP detectado / Coincidencia GAFI / ...' })}
                <button onClick={agregarLista} disabled={addLoading}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all">
                  {addLoading ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Guardando...</> : 'Guardar'}
                </button>
              </div>
            )}

            {listaError && <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300"><strong>Error:</strong> {listaError}</div>}

            {listaLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-indigo-600/30 border-t-indigo-400 rounded-full animate-spin" />
              </div>
            ) : listaItems.length > 0 ? (
              <div className={`border rounded-2xl overflow-hidden ${cardBg}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`border-b ${dark ? 'border-slate-700/50 bg-slate-900/40' : 'border-violet-200/60 bg-violet-50/60'}`}>
                      {['RUT/DNI','Nombre','Tipo','Razón','Estado'].map(h => (
                        <th key={h} className={`px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listaItems.map((item, i) => (
                      <tr key={i} className={`border-t transition-colors ${dark ? 'border-slate-800/60 hover:bg-slate-800/40' : 'border-violet-100 hover:bg-violet-50/50'}`}>
                        <td className={`px-4 py-3 font-mono text-xs ${textMuted}`}>{item.dni}</td>
                        <td className={`px-4 py-3 font-medium ${dark ? 'text-slate-200' : 'text-slate-700'}`}>{item.name}</td>
                        <td className={`px-4 py-3 ${textMuted}`}>{item.personType}</td>
                        <td className={`px-4 py-3 max-w-xs truncate ${textMuted}`}>{item.reason}</td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full border ${
                            item.status === 'active'
                              ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800/40'
                              : dark ? 'bg-slate-700 text-slate-400 border-slate-600' : 'bg-slate-100 text-slate-500 border-slate-300'
                          }`}>{item.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={`text-center py-16 ${textMuted}`}>
                <p className="text-4xl mb-3">📋</p>
                <p className="font-medium">Haz clic en "Actualizar" para cargar los registros</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
