// REVISIÓN WEB — el panel flotante del Analizador.
//
// Es INDEPENDIENTE de la ficha: no recibe nada de ella —ni RUT, ni razón social,
// ni la escritura—. Las entradas son las del procedimiento y las carga el
// analista: URL, uso previsto y jurisdicción. Lo único compartido con el
// Analizador es dónde vive el botón.
//
// Corre en segundo plano: minimizar el panel no corta la revisión, y la ficha
// sigue usable mientras tanto.

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, FileDown, Globe, Loader2, Minus, RotateCcw, X } from 'lucide-react';
import { ejecutarRevision } from '../services/revisionWeb/revision';
import { ETIQUETA_USO, FACTORES, FACTORES_POR_USO, riesgoDeSuma, sumaPaso0, UMBRAL } from '../services/revisionWeb/paso0';
import { exportarPdf } from '../services/revisionWeb/pdf';
import { kpi } from '../services/revisionWeb/puntaje';
import { ultimasRevisiones } from '../services/revisionWeb/almacen';
import type { Avance, Decision, FactoresPaso0, Jurisdiccion, Resultado, Severidad, UsoPrevisto } from '../services/revisionWeb/tipos';

interface Props {
  abierto: boolean;
  onMinimizar: () => void;
  onAbrir: () => void;
}

const COLOR_DECISION: Record<Decision, string> = {
  ONBOARDING_APPROVED: 'bg-emerald-600',
  ONBOARDING_CONDITIONAL: 'bg-amber-500',
  ONBOARDING_ON_HOLD: 'bg-orange-600',
  ONBOARDING_REJECTED: 'bg-red-700',
};

const COLOR_SEVERIDAD: Record<Severidad, string> = {
  CRITICO: 'bg-red-100 text-red-800 border-red-300',
  MAYOR: 'bg-orange-100 text-orange-800 border-orange-300',
  MENOR: 'bg-amber-50 text-amber-800 border-amber-200',
  INFO: 'bg-slate-100 text-slate-600 border-slate-200',
};

const esUrl = (s: string) => /^https?:\/\//i.test(s);

export const RevisionWebPanel: React.FC<Props> = ({ abierto, onMinimizar, onAbrir }) => {
  const [url, setUrl] = useState('');
  const [uso, setUso] = useState<UsoPrevisto>('cliente_b2b');
  const [jurisdiccion, setJurisdiccion] = useState<Jurisdiccion>('');
  const [factores, setFactores] = useState<FactoresPaso0>(FACTORES_POR_USO.cliente_b2b);
  const [verPaso0, setVerPaso0] = useState(false);
  const [verDetalle, setVerDetalle] = useState(false);
  const [corriendo, setCorriendo] = useState(false);
  const [avances, setAvances] = useState<Avance[]>([]);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Resultado[]>([]);

  useEffect(() => { setFactores(FACTORES_POR_USO[uso]); }, [uso]);
  useEffect(() => { ultimasRevisiones(8).then(setHistorial).catch(() => setHistorial([])); }, [resultado]);

  const suma = useMemo(() => sumaPaso0(factores), [factores]);
  const riesgo = riesgoDeSuma(suma);

  const correr = async () => {
    if (!url.trim() || corriendo) return;
    setCorriendo(true); setError(null); setResultado(null); setAvances([]);
    try {
      const r = await ejecutarRevision({ url, uso, jurisdiccion, factores }, a =>
        setAvances(prev => [...prev.filter(p => p.etapa !== a.etapa), a]));
      setResultado(r);
    } catch (e) {
      setError((e as Error)?.message || String(e));
    } finally {
      setCorriendo(false);
    }
  };

  const nueva = () => { setResultado(null); setAvances([]); setError(null); };

  // Minimizado: una píldora con el avance, para no perder de vista la revisión.
  if (!abierto) {
    if (!corriendo && !resultado) return null;
    const ultimo = avances[avances.length - 1];
    return (
      <button onClick={onAbrir} className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-slate-800 text-white text-xs font-semibold px-4 py-2 shadow-xl hover:bg-slate-700">
        {corriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
        <span>Revisión web · {corriendo ? (ultimo?.texto || 'empezando…') : resultado?.decision}</span>
      </button>
    );
  }

  const k = resultado ? kpi(resultado) : null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[460px] max-w-[calc(100vw-2rem)] max-h-[88vh] flex flex-col p-3 bg-slate-100 rounded-lg shadow-2xl border border-slate-300">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-300/60">
        <div className="flex items-center gap-1.5 text-slate-600">
          <Globe className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Revisión web · screening</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMinimizar} title="Minimizar (la revisión sigue)" className="p-1 rounded hover:bg-slate-200 text-slate-500"><Minus className="w-4 h-4" /></button>
          {!corriendo && <button onClick={() => { nueva(); onMinimizar(); }} title="Cerrar" className="p-1 rounded hover:bg-slate-200 text-slate-500"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="flex-grow overflow-y-auto pr-1 custom-scrollbar space-y-3 text-sm text-slate-800">
        {/* ── Entradas (§3) ── */}
        {!resultado && (
          <div className="space-y-2 bg-white rounded-lg p-3 shadow-sm">
            <label className="block text-xs font-semibold text-slate-600">URL de la contraparte</label>
            <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') correr(); }}
              disabled={corriendo} placeholder="https://empresa.cl" className="w-full bg-white border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600">Uso previsto</label>
                <select value={uso} onChange={e => setUso(e.target.value as UsoPrevisto)} disabled={corriendo} className="w-full border border-slate-300 rounded-md p-2 text-sm bg-white">
                  {(Object.keys(ETIQUETA_USO) as UsoPrevisto[]).map(u => <option key={u} value={u}>{ETIQUETA_USO[u]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600">Jurisdicción (opcional)</label>
                <select value={jurisdiccion} onChange={e => setJurisdiccion(e.target.value as Jurisdiccion)} disabled={corriendo} className="w-full border border-slate-300 rounded-md p-2 text-sm bg-white">
                  <option value="">Sin indicar</option><option value="CL">Chile</option><option value="CO">Colombia</option><option value="OTRA">Otra</option>
                </select>
              </div>
            </div>
            <button onClick={() => setVerPaso0(v => !v)} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${verPaso0 ? 'rotate-180' : ''}`} />
              Paso 0 · riesgo inherente <b>{riesgo}</b> (suma {suma}, umbral {UMBRAL[riesgo]})
            </button>
            {verPaso0 && (
              <div className="space-y-1 pl-1">
                {FACTORES.map(f => (
                  <label key={f.clave} className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={factores[f.clave]} disabled={corriendo}
                      onChange={e => setFactores(prev => ({ ...prev, [f.clave]: e.target.checked }))} />
                    <span>{f.texto} <span className="text-slate-400">({f.peso > 0 ? '+' : ''}{f.peso})</span></span>
                  </label>
                ))}
              </div>
            )}
            <button onClick={correr} disabled={corriendo || !url.trim()}
              className="w-full bg-primary-500 hover:bg-primary-600 text-white font-semibold py-2 rounded-md disabled:opacity-50 flex items-center justify-center gap-2">
              {corriendo ? <><Loader2 className="w-4 h-4 animate-spin" /> Revisando…</> : 'Revisar sitio'}
            </button>
          </div>
        )}

        {/* ── Avance por ronda ── */}
        {(corriendo || (avances.length > 0 && !resultado)) && (
          <ol className="space-y-1 bg-white rounded-lg p-3 shadow-sm">
            {avances.map(a => (
              <li key={a.etapa} className="flex items-start gap-2 text-xs">
                {a.listo ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" /> : <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500 mt-0.5 shrink-0" />}
                <span>{a.texto}</span>
              </li>
            ))}
          </ol>
        )}

        {error && (
          <div className="p-2 bg-red-100 text-red-800 text-xs rounded flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /><span>No se pudo completar la revisión: {error}</span>
          </div>
        )}

        {/* ── Salida del SCREENING: cuatro bloques (§12) ── */}
        {resultado && k && (
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-xs text-slate-500 mb-1 truncate" title={resultado.entrada.url}>{resultado.entrada.url} · {ETIQUETA_USO[resultado.entrada.uso]} · {new Date(resultado.fecha).toLocaleString('es-CL')}</div>
              <div className={`text-white text-sm font-bold rounded px-2 py-1 inline-block ${COLOR_DECISION[resultado.decision]}`}>{k.decision}</div>
              <table className="w-full mt-2 text-xs">
                <thead><tr className="text-slate-500 text-left">
                  <th className="font-medium">Acreditación</th><th className="font-medium">Umbral</th><th className="font-medium">Riesgo</th><th className="font-medium">Gatillos</th><th className="font-medium">MAYOR / CRITICO</th>
                </tr></thead>
                <tbody><tr className="font-bold text-slate-800">
                  <td>{k.acreditacion}</td><td>{k.umbral}</td><td>{k.riesgo}</td><td>{k.gatillos}</td><td>{k.severos}</td>
                </tr></tbody>
              </table>
              <p className="mt-2 text-xs text-slate-700">{resultado.lectura}</p>
            </div>

            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-xs font-semibold text-slate-600 mb-1">Hallazgos</div>
              {resultado.hallazgos.length === 0 && <p className="text-xs text-slate-500">Sin hallazgos.</p>}
              <ul className="space-y-1">
                {resultado.hallazgos.slice(0, 6).map((h, i) => (
                  <li key={i} className="text-xs flex items-start gap-2">
                    <span className={`shrink-0 border rounded px-1.5 py-0.5 text-[10px] font-bold ${COLOR_SEVERIDAD[h.severidad]}`}>{h.severidad}</span>
                    <span>{h.texto} <span className="text-slate-400">— {esUrl(h.fuente) ? <a href={h.fuente} target="_blank" rel="noopener noreferrer" className="underline">fuente</a> : h.fuente}</span></span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-xs font-semibold text-slate-600 mb-1">No verificable</div>
              <ul className="list-disc pl-4 space-y-0.5 text-xs text-slate-700">
                {(resultado.noVerificable.length ? resultado.noVerificable : ['—']).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>

            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-xs font-semibold text-slate-600 mb-1">Siguiente paso</div>
              <p className="text-xs text-slate-800">{resultado.siguientePaso}</p>
            </div>

            <button onClick={() => setVerDetalle(v => !v)} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${verDetalle ? 'rotate-180' : ''}`} /> Puntaje por dimensión
            </button>
            {verDetalle && (
              <ul className="bg-white rounded-lg p-3 shadow-sm space-y-1 text-xs">
                {resultado.dimensiones.map(d => (
                  <li key={d.clave}><b>{d.nombre}</b> {d.puntos} / {d.max}{d.estado !== 'verificado' ? ` · ${d.estado.replace('_', ' ')}` : ''} — <span className="text-slate-600">{d.justificacion}</span></li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <button onClick={() => exportarPdf(resultado)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm">
                <FileDown className="w-4 h-4" /> Exportar PDF
              </button>
              <button onClick={nueva} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-2.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm">
                <RotateCcw className="w-4 h-4" /> Nueva revisión
              </button>
            </div>
          </div>
        )}

        {/* ── Revisiones anteriores, en este navegador ── */}
        {!resultado && !corriendo && historial.length > 0 && (
          <div className="bg-white rounded-lg p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-600 mb-1">Revisiones anteriores (en este navegador)</div>
            <ul className="space-y-1">
              {historial.map(h => (
                <li key={h.id}>
                  <button onClick={() => setResultado(h)} className="w-full text-left text-xs hover:bg-slate-50 rounded px-1 py-0.5 flex justify-between gap-2">
                    <span className="truncate">{h.sitio}</span>
                    <span className="shrink-0 text-slate-500">{h.decision.replace('ONBOARDING_', '')} · {h.acreditacion}/100 · {new Date(h.fecha).toLocaleDateString('es-CL')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
