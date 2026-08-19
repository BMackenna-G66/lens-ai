// Ficha de una empresa en la cola KYB: matriz de 12, certidumbre explicada y
// panel de decisión.
//
// Este componente NO hace fetch: recibe el análisis ya cargado y avisa hacia
// arriba con callbacks. Toda la I/O vive en kybAnalysisService.

import React, { useState } from 'react';
import type { AnalisisKyb, TipoDecisionKyb, EmpresaKyb } from '../../types/kyb';
import { DECISIONES_CON_CHECKER } from '../../types/kyb';
import type { EstadoComparacion, ResultadoComponente } from '../../types/kybMatriz';
import { COMPONENTES_KYB } from '../../types/kybMatriz';

// Colores por estado de comparación. DISCREPA es el único en rojo: es el caso
// que exige acción. SOLO_* en ámbar porque falta corroborar, no hay contradicción.
const COLOR_ESTADO: Record<EstadoComparacion, string> = {
  COINCIDE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  PARCIAL: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  DISCREPA: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 font-bold',
  SOLO_LENS: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  SOLO_ADMIN: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  SIN_DATOS: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const ETIQUETA_ESTADO: Record<EstadoComparacion, string> = {
  COINCIDE: 'Coincide', PARCIAL: 'Parcial', DISCREPA: 'Discrepa',
  SOLO_LENS: 'Solo documentos', SOLO_ADMIN: 'Solo Admin', SIN_DATOS: 'Sin datos',
};

const DECISIONES: { tipo: TipoDecisionKyb; label: string; clase: string }[] = [
  { tipo: 'APROBAR', label: 'Aprobar', clase: 'bg-emerald-600 hover:bg-emerald-700' },
  { tipo: 'RECHAZAR', label: 'Rechazar', clase: 'bg-red-600 hover:bg-red-700' },
  { tipo: 'FALTA_INFORMACION', label: 'Falta información', clase: 'bg-amber-600 hover:bg-amber-700' },
  { tipo: 'APETITO_RIESGO', label: 'Apetito de riesgo', clase: 'bg-violet-600 hover:bg-violet-700' },
  { tipo: 'INSTITUCIONAL', label: 'Institucional', clase: 'bg-sky-600 hover:bg-sky-700' },
];

interface Props {
  empresa: EmpresaKyb;
  analisis: AnalisisKyb | null;
  analizando: boolean;
  progreso?: string;
  onAnalizar: () => void;
  onDecidir: (tipo: TipoDecisionKyb, comentario: string) => void;
  onCerrar: () => void;
}

export const KybFicha: React.FC<Props> = ({
  empresa, analisis, analizando, progreso, onAnalizar, onDecidir, onCerrar,
}) => {
  const [verRazones, setVerRazones] = useState(false);
  const [decisionSel, setDecisionSel] = useState<TipoDecisionKyb | ''>('');
  const [comentario, setComentario] = useState('');

  const cert = analisis?.certidumbre;
  const incompleto = analisis && analisis.estado !== 'COMPLETO';

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-xl font-black text-slate-900 dark:text-white truncate">{empresa.razonSocial}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Company ID {empresa.companyId}
            {empresa.identificacion ? ` · ${empresa.identificacion}` : ''}
            {empresa.complianceStatus ? ` · ${empresa.complianceStatus}` : ''}
            {empresa.kycStage1 ? ` · KYC1 ${empresa.kycStage1}` : ''}
          </p>
        </div>
        <button onClick={onCerrar} className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 shrink-0">
          Cerrar
        </button>
      </div>

      {/* Certidumbre. Sin análisis muestra "—", NUNCA 0%: un 0 diría que está
          todo mal, y lo que pasa es que no se sabe todavía. */}
      <div className="flex items-center gap-4 mb-4 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="text-center shrink-0">
          <p className="text-4xl font-black text-slate-900 dark:text-white leading-none">
            {cert === null || cert === undefined ? '—' : `${cert}%`}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">Certidumbre</p>
        </div>
        <div className="min-w-0 flex-1">
          {!analisis && !analizando && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Sin analizar. Corré el análisis para ver la matriz.</p>
          )}
          {analizando && (
            <p className="text-sm text-sky-600 dark:text-sky-400 animate-pulse">{progreso || 'Analizando…'}</p>
          )}
          {analisis && !analizando && (
            <>
              {incompleto && (
                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mb-1">
                  ⚠️ Análisis {analisis.estado === 'ERROR' ? 'con error' : 'incompleto'}: el porcentaje no se publica hasta tenerlo completo.
                </p>
              )}
              {analisis.mensajeError && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-1">{analisis.mensajeError}</p>
              )}
              {analisis.faltantes?.length ? (
                <ul className="text-[11px] text-slate-500 dark:text-slate-400 list-disc pl-4">
                  {analisis.faltantes.slice(0, 5).map((f, i) => <li key={i}>{f}</li>)}
                  {analisis.faltantes.length > 5 && <li>+{analisis.faltantes.length - 5} más</li>}
                </ul>
              ) : null}
              <button onClick={() => setVerRazones(v => !v)} className="text-xs text-sky-600 dark:text-sky-400 hover:underline mt-1">
                {verRazones ? '▾' : '▸'} Cómo se calculó ({analisis.razones.length} línea{analisis.razones.length === 1 ? '' : 's'})
              </button>
            </>
          )}
        </div>
        <button
          onClick={onAnalizar}
          disabled={analizando}
          className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold shrink-0"
        >
          {analizando ? 'Analizando…' : analisis ? 'Re-analizar' : 'Analizar'}
        </button>
      </div>

      {/* Desglose del porcentaje. La suma de estas líneas ES el porcentaje: es la
          invariante del motor, y es lo que hace que el número sea defendible. */}
      {verRazones && analisis && (
        <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <table className="w-full text-xs">
            <tbody>
              {analisis.razones.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{r.concepto}</td>
                  <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${r.delta < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'}`}>
                    {r.delta > 0 ? '+' : ''}{r.delta}
                  </td>
                  <td className="py-1.5 text-slate-500 dark:text-slate-400">{r.detalle}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                <td className="py-1.5 font-black text-slate-900 dark:text-white">Total</td>
                <td className="py-1.5 text-right font-black tabular-nums text-slate-900 dark:text-white">
                  {analisis.razones.reduce((s, r) => s + r.delta, 0).toFixed(2)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Matriz de los 12 */}
      <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-2">Matriz de 12 componentes</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-left">
            <tr>
              <th className="py-2 px-3 font-semibold">Componente</th>
              <th className="py-2 px-3 font-semibold">Peso</th>
              <th className="py-2 px-3 font-semibold">Estado</th>
              <th className="py-2 px-3 font-semibold">Documentos</th>
              <th className="py-2 px-3 font-semibold">Admin</th>
              <th className="py-2 px-3 font-semibold">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {(analisis?.componentes ?? placeholders()).map(c => (
              <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-100">{c.label}</td>
                <td className="py-2 px-3 tabular-nums text-slate-500 dark:text-slate-400">{c.peso}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${COLOR_ESTADO[c.estado]}`}>
                    {ETIQUETA_ESTADO[c.estado]}
                  </span>
                </td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-300 max-w-[180px] truncate" title={c.valorLens}>{c.valorLens || '—'}</td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-300 max-w-[180px] truncate" title={c.valorAdmin}>{c.valorAdmin || '—'}</td>
                <td className="py-2 px-3 text-slate-500 dark:text-slate-400">
                  {c.detalle || '—'}
                  {c.soloEnLens?.length ? <span className="block text-[10px] text-amber-600 dark:text-amber-400">Solo docs: {c.soloEnLens.join(', ')}</span> : null}
                  {c.soloEnAdmin?.length ? <span className="block text-[10px] text-amber-600 dark:text-amber-400">Solo Admin: {c.soloEnAdmin.join(', ')}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Decisión */}
      <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mt-5 mb-2">Decisión</h3>
      {empresa.decision ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs">
          <p className="font-bold text-slate-800 dark:text-slate-100">{empresa.decision.tipo}</p>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
            {empresa.decision.actorNombre} · {new Date(empresa.decision.decididaEn).toLocaleString('es-CL')}
            {empresa.decision.automatica ? ' · automática' : ''}
          </p>
          {empresa.decision.aprobacion?.estado === 'PENDIENTE_APROBACION' && (
            <p className="text-amber-700 dark:text-amber-400 font-semibold mt-1">Pendiente de aprobación de un segundo analista.</p>
          )}
          {empresa.decision.comentario && <p className="text-slate-600 dark:text-slate-300 mt-1">{empresa.decision.comentario}</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          {!analisis && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
              No se puede decidir sin análisis: primero corré el análisis.
            </p>
          )}
          <div className="flex flex-wrap gap-2 mb-3">
            {DECISIONES.map(d => (
              <button
                key={d.tipo}
                onClick={() => setDecisionSel(d.tipo)}
                disabled={!analisis}
                className={`px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-40 ${d.clase} ${decisionSel === d.tipo ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
              >
                {d.label}
                {DECISIONES_CON_CHECKER.has(d.tipo) && <span className="ml-1 opacity-80">·2</span>}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
            Las marcadas con «·2» requieren la aprobación de un segundo analista.
          </p>
          {decisionSel && (
            <div className="flex flex-col gap-2">
              <textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Comentario (queda en la auditoría)"
                rows={2}
                className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onDecidir(decisionSel, comentario); setDecisionSel(''); setComentario(''); }}
                  className="px-4 py-2 rounded-xl bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold"
                >
                  Confirmar «{DECISIONES.find(d => d.tipo === decisionSel)?.label}»
                </button>
                <button onClick={() => setDecisionSel('')} className="text-xs px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Matriz vacía cuando todavía no hay análisis: se muestran los 12 en gris para
// que se vea QUÉ se va a comparar, en vez de una tabla en blanco.
function placeholders(): ResultadoComponente[] {
  return COMPONENTES_KYB.map(c => ({
    id: c.id, label: c.label, peso: c.peso, estado: 'SIN_DATOS' as EstadoComparacion,
    detalle: c.descripcion,
  }));
}
