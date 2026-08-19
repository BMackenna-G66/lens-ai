// Cola de trabajo KYB (empresas / B2B). Módulo paralelo e independiente de la
// Bandeja de Casos: colección propia, servicios propios, y no importa nada de
// CasosInbox.
//
// Toda la I/O pasa por los servicios de services/kyb/*; este componente solo
// orquesta estado de UI.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeColaKyb, encolarEmpresas, leerUltimoAnalisis, kybDisponible, setStatusKyb } from '../../services/kyb/kybQueueService';
import { analizarEmpresa, analisisVigente } from '../../services/kyb/kybAnalysisService';
import { getEmpresaDocsCompany } from '../../services/empresaDocsClient';
import { mapEstadoAdmin } from '../../services/kyb/kybAdminMapper';
import type { EmpresaKyb, AnalisisKyb, TipoDecisionKyb } from '../../types/kyb';
import { DECISIONES_CON_CHECKER } from '../../types/kyb';
import { useAuth } from '../../context/AuthContext';
import { KybFicha } from './KybFicha';

interface Props {
  onBack: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const hayGeminiKey = (): boolean => !!(process.env.GEMINI_API_KEY || process.env.API_KEY);

export const KybQueue: React.FC<Props> = ({ onBack, darkMode, onToggleDarkMode }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<EmpresaKyb[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [selId, setSelId] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisKyb | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [progreso, setProgreso] = useState('');

  const [companyIdNuevo, setCompanyIdNuevo] = useState('');
  const [encolando, setEncolando] = useState(false);
  const [msg, setMsg] = useState('');
  const [filtro, setFiltro] = useState('');

  // ── Suscripción a la cola ──
  useEffect(() => {
    if (!kybDisponible()) { setError('Firestore no está configurado en esta instancia.'); setCargando(false); return; }
    const un = subscribeColaKyb(
      d => { setItems(d); setCargando(false); setError(null); },
      m => {
        // El mensaje de Firestore viaja tal cual: si falta el índice compuesto,
        // ahí viene el link para crearlo y esconderlo cuesta media hora.
        setError(m);
        setCargando(false);
      },
    );
    return un;
  }, []);

  const sel = useMemo(() => items.find(i => i.companyId === selId) ?? null, [items, selId]);

  // Al abrir una ficha se lee el último análisis guardado. NO se re-analiza solo:
  // cada corrida cuesta descargas, OCR y llamadas a Gemini.
  const cargadoPara = useRef<string | null>(null);
  useEffect(() => {
    if (!selId || cargadoPara.current === selId) return;
    cargadoPara.current = selId;
    setAnalisis(null);
    leerUltimoAnalisis(selId).then(a => setAnalisis(a)).catch(() => {});
  }, [selId]);

  // ── Encolar por Company ID ──
  const encolar = async () => {
    const id = companyIdNuevo.trim();
    if (!id) return;
    setEncolando(true); setMsg('');
    try {
      // Se consulta Admin antes de encolar para guardar la razón social y el
      // estado en el doc padre: así la cola se puede filtrar y ordenar sin abrir
      // cada ficha ni volver a pegarle a Admin.
      const detalle = await getEmpresaDocsCompany(id);
      const est = mapEstadoAdmin(id, detalle);
      const razonSocial = String((detalle.adminRaw as Record<string, unknown> | undefined)?.name ?? '') || `Empresa ${id}`;
      const r = await encolarEmpresas([{
        companyId: id,
        razonSocial,
        identificacion: String((detalle.adminRaw as Record<string, unknown> | undefined)?.identificationNumber ?? '') || undefined,
        complianceStatus: est.complianceStatus,
        kycStage1: est.kycStage1,
        riskLevel: est.riskLevel,
        institucional: est.institucional,
        origen: 'manual',
      }]);
      setMsg(`✅ ${razonSocial} · ${r.nuevas ? 'encolada' : 'ya estaba, actualizada'}`);
      setCompanyIdNuevo('');
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEncolando(false);
    }
  };

  // ── Análisis ──
  const correrAnalisis = async (companyId: string) => {
    setAnalizando(true); setProgreso('Iniciando…');
    try {
      const a = await analizarEmpresa(companyId, {
        hayApiKey: hayGeminiKey(),
        onProgreso: p => setProgreso(p.detalle ? `${p.fase} · ${p.detalle}` : p.fase),
      });
      setAnalisis(a);
    } catch (e) {
      setMsg(`❌ Análisis: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalizando(false); setProgreso('');
    }
  };

  // ── Decisión ──
  // Se registra en el doc padre. Las que exigen checker quedan
  // PENDIENTE_APROBACION: el sistema no puede aprobar su propia decisión.
  const decidir = async (tipo: TipoDecisionKyb, comentario: string) => {
    if (!sel) return;
    const { registrarDecisionKyb } = await import('../../services/kyb/kybDecisionService');
    try {
      await registrarDecisionKyb(sel.companyId, {
        tipo, comentario,
        actorId: user?.uid ?? 'system',
        actorNombre: user?.displayName ?? user?.email ?? 'system',
        actorTipo: user ? 'USER' : 'SYSTEM',
        automatica: false,
      });
      setMsg(`✅ Decisión registrada: ${tipo}${DECISIONES_CON_CHECKER.has(tipo) ? ' (pendiente de aprobación)' : ''}`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const filtrados = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    if (!f) return items;
    return items.filter(i =>
      i.razonSocial.toLowerCase().includes(f) ||
      i.companyId.includes(f) ||
      (i.identificacion ?? '').includes(f));
  }, [items, filtro]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 transition-colors">
      <header className="flex items-center justify-between gap-3 mb-5">
        <button onClick={onBack} className="text-xs font-semibold px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          ← Inicio
        </button>
        <div className="text-center flex-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">🏢 Cola KYB · Empresas</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            KYC de empresas: documentos contra Admin, 12 componentes y certidumbre explicable
          </p>
        </div>
        <button onClick={onToggleDarkMode} className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          {darkMode ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Encolar + filtro */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          value={companyIdNuevo}
          onChange={e => setCompanyIdNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') encolar(); }}
          placeholder="Company ID de Admin"
          className="text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 w-56"
        />
        <button
          onClick={encolar}
          disabled={encolando || !companyIdNuevo.trim()}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold"
        >
          {encolando ? 'Encolando…' : 'Encolar empresa'}
        </button>
        <input
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Filtrar por nombre, ID o RUT"
          className="text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 ml-auto w-64"
        />
      </div>

      {msg && (
        <p className={`text-xs mb-3 ${msg.startsWith('❌') ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{msg}</p>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">No se pudo leer la cola</p>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 break-all">{error}</p>
          {error.includes('index') && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
              Falta el índice compuesto <code>enCola ASC, recibidoEn DESC</code> en <code>kyb_empresas</code>.
              El mensaje de arriba trae el link para crearlo.
            </p>
          )}
        </div>
      )}

      {!sel && (
        <>
          {cargando && <p className="text-sm text-slate-400 py-10 text-center animate-pulse">Cargando cola…</p>}
          {!cargando && !error && filtrados.length === 0 && (
            <p className="text-sm text-slate-400 py-10 text-center">
              La cola está vacía. Encolá una empresa con su Company ID de Admin.
            </p>
          )}
          {filtrados.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-left text-xs">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Empresa</th>
                    <th className="py-3 px-4 font-semibold">Company ID</th>
                    <th className="py-3 px-4 font-semibold">Identificación</th>
                    <th className="py-3 px-4 font-semibold">Compliance</th>
                    <th className="py-3 px-4 font-semibold">Certidumbre</th>
                    <th className="py-3 px-4 font-semibold">Análisis</th>
                    <th className="py-3 px-4 font-semibold">Decisión</th>
                    <th className="py-3 px-4 font-semibold">Recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(i => (
                    <tr
                      key={i.companyId}
                      onClick={() => setSelId(i.companyId)}
                      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-100">{i.razonSocial}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{i.companyId}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{i.identificacion || '—'}</td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{i.complianceStatus || '—'}</td>
                      <td className="py-3 px-4 font-bold tabular-nums text-slate-800 dark:text-slate-100">
                        {/* Nunca 0%: sin análisis va guion. */}
                        {i.ultimoAnalisis?.certidumbre === null || i.ultimoAnalisis?.certidumbre === undefined
                          ? '—' : `${i.ultimoAnalisis.certidumbre}%`}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {i.ultimoAnalisis?.estado ?? 'SIN_ANALIZAR'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {i.decision?.tipo ?? '—'}
                        {i.decision?.aprobacion?.estado === 'PENDIENTE_APROBACION' && (
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400">pendiente aprobación</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {i.recibidoEn ? new Date(i.recibidoEn).toLocaleDateString('es-CL') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {sel && (
        <>
          {/* Si el análisis guardado quedó viejo respecto de los documentos
              actuales, se avisa en vez de mostrar un número desactualizado. */}
          <KybFicha
            empresa={sel}
            analisis={analisis}
            analizando={analizando}
            progreso={progreso}
            onAnalizar={() => correrAnalisis(sel.companyId)}
            onDecidir={decidir}
            onCerrar={() => { setSelId(null); cargadoPara.current = null; }}
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setStatusKyb(sel.companyId, 'CERRADO').catch(() => {})}
              className="text-xs px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600"
              title="Saca la empresa de la cola sin borrar el histórico"
            >
              Sacar de la cola
            </button>
            {!hayGeminiKey() && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                Sin API key de Gemini: el análisis va a correr solo con el lado de Admin.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export { analisisVigente };
