// «⛔ Listas negras» de Regcheq: alta y edición masiva de las listas negras de
// Compliance de Admin G66 (DNI, dominios de correo y cuentas bancarias). Es lo
// que hacían `blacklist_cargar.py` y `blacklist_editar.py`, con la misma lógica
// (services/listasNegras.ts) y la misma regla de oro: primero la vista previa.
//
// Aislado a propósito:
//   · va dentro de su propio límite de errores: si algo de acá falla, el resto
//     de Regcheq sigue igual;
//   · todo pasa por el Worker con el ID token del analista; el Worker verifica
//     el permiso y registra cada cambio con el actor del token;
//   · la ejecución vuelve a leer la lista antes de empezar y no ejecuta un plan
//     distinto del que se confirmó.

import React, { useMemo, useRef, useState } from 'react';
import {
  COLUMNAS, contar, csvLog, extractList, filasLog, loadCountries, mismoPlan, normAccount, normDomain, parseCsv,
  planificar, resultadoSinOperacion, type FilaLog, type Lista, type Modo, type PasoPlan, type RegistroAdmin,
} from '../services/listasNegras';
import {
  completarIds, escribir, leerLista, leerPaises, mensajeDeError, registrarSinOperacion, type RespuestaWorker,
} from '../services/listasNegrasApi';

const PAUSA_MS = 250;   // como SLEEP_BETWEEN_REQUESTS de los scripts

const NOMBRE_LISTA: Record<Lista, string> = {
  DNI: 'Lista negra de DNI', DOMINIO: 'Lista negra de correos (dominios)', CUENTA: 'Lista negra de cuentas bancarias',
};

type Ejecutado = { ok: boolean; status?: number; error?: string; respuesta?: unknown; cambioId?: string; registro?: string };

interface Props { dark: boolean }

class LimiteListasNegras extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300">
          <strong>El módulo Listas negras falló:</strong> {this.state.error}. El resto de Regcheq sigue funcionando.
        </div>
      );
    }
    return this.props.children;
  }
}

export const ListasNegrasAdmin: React.FC<Props> = props => (
  <LimiteListasNegras><Panel {...props} /></LimiteListasNegras>
);

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));
const bool = (e?: string) => (e === 'ACTIVO' ? true : e === 'INACTIVO' ? false : null);

const Panel: React.FC<Props> = ({ dark }) => {
  const [lista, setLista] = useState<Lista>('DNI');
  const [modo, setModo] = useState<Modo>('cargar');
  const [defaultReason, setDefaultReason] = useState('');
  const [targetStatus, setTargetStatus] = useState(false);
  const [entrada, setEntrada] = useState('');
  const [registros, setRegistros] = useState<RegistroAdmin[] | null>(null);
  const [actor, setActor] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [plan, setPlan] = useState<PasoPlan[] | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enCurso, setEnCurso] = useState(false);
  const [hechos, setHechos] = useState(0);
  const [ejecutado, setEjecutado] = useState<Record<number, Ejecutado>>({});
  const [log, setLog] = useState<FilaLog[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const cortar = useRef(false);

  const card = dark ? 'bg-slate-800/60 border-slate-700/50' : 'bg-white border-violet-200';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const input = dark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-violet-200 text-slate-800';
  const btn = 'font-bold px-4 py-2 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed';

  const reiniciar = () => { setPlan(null); setEjecutado({}); setLog([]); setConfirmando(false); setAviso(''); setError(''); };

  /** La lista vigente de Admin (y los países, para el countryName de DNI). */
  async function leer(): Promise<{ recs: RegistroAdmin[]; countries: Record<string, string> } | null> {
    const r = await leerLista(lista);
    if (r.http !== 200) { setError(`No se pudo leer la lista: ${mensajeDeError(r)}`); return null; }
    setActor(r.actor || '');
    const recs = extractList(r.datos).filter(x => x && typeof x === 'object');
    let countries: Record<string, string> = {};
    if (lista === 'DNI' && modo === 'cargar') {
      const p = await leerPaises();
      if (p.http === 200) countries = loadCountries(p.datos);
      else setAviso('No se pudo leer el catálogo de países: hace falta la columna country_name.');
    }
    setRegistros(recs);
    return { recs, countries };
  }

  async function verLista() {
    setCargando(true); setError('');
    try { await leer(); } finally { setCargando(false); }
  }

  async function vistaPrevia() {
    reiniciar();
    const filas = parseCsv(entrada);
    if (!filas.length) { setError('No hay filas: pegá un CSV con encabezado o cargá un archivo.'); return; }
    setCargando(true);
    try {
      const l = await leer();
      if (!l) return;
      const p = planificar(modo, lista, filas, l.recs, { defaultReason, targetStatus, countries: l.countries });
      setPlan(p);
      setLog(p.flatMap(x => filasLog(modo, lista, x)));
    } finally { setCargando(false); }
  }

  async function ejecutar() {
    if (!plan) return;
    setConfirmando(false); setError(''); setAviso('');
    setEnCurso(true); setHechos(0); setEjecutado({});
    cortar.current = false;
    try {
      // La lista pudo cambiar desde la vista previa: se vuelve a planificar y,
      // si no es el mismo plan, no se ejecuta.
      const l = await leer();
      if (!l) return;
      const fresco = planificar(modo, lista, parseCsv(entrada), l.recs, { defaultReason, targetStatus, countries: l.countries });
      if (!mismoPlan(plan, fresco)) {
        setPlan(fresco);
        setLog(fresco.flatMap(x => filasLog(modo, lista, x)));
        setError('La lista cambió desde la vista previa. Revisá la vista previa nueva y volvé a ejecutar.');
        return;
      }
      const ejecucionId = crypto.randomUUID();
      const resultados: Record<number, Ejecutado> = {};
      const logReal: FilaLog[] = [];
      let n = 0;
      for (const p of plan) {
        if (p.accion !== 'crear' && p.accion !== 'editar') { logReal.push(...filasLog(modo, lista, p)); continue; }
        if (cortar.current) break;
        const r: RespuestaWorker = await escribir(lista, p.accion === 'crear' ? 'POST' : 'PUT', p.body!, {
          ejecucionId, estadoAnterior: bool(p.estadoAnterior), reasonAnterior: p.reasonAnterior ?? null, valor: p.valor ?? null,
        });
        const ok = r.http >= 200 && r.http < 300;
        const e: Ejecutado = { ok, status: r.status || r.http, respuesta: r.datos, cambioId: r.cambioId, registro: r.registro,
                               error: ok ? undefined : mensajeDeError(r) };
        resultados[p.n] = e;
        setEjecutado({ ...resultados });
        logReal.push(...filasLog(modo, lista, p, e));
        setHechos(++n);
        if (r.registro === 'no_disponible' || r.http === 401 || (r.http === 403 && r.error === 'sin permiso')) {
          setError(`Se detuvo la ejecución: ${mensajeDeError(r)} Las filas siguientes no se enviaron.`);
          break;
        }
        await dormir(PAUSA_MS);
      }
      setLog(logReal);

      // Lo que no llegó a Admin también queda en el registro de Lens.
      const sinOp = plan.filter(p => resultadoSinOperacion(p)).map(p => ({
        valor: p.valor, countryCode: p.countryCode, accountType: p.accountType ?? null, adminId: p.adminId ?? null,
        resultado: resultadoSinOperacion(p)!, estadoAnterior: bool(p.estadoAnterior), estadoNuevo: bool(p.estadoNuevo),
        error: p.error ?? null,
      }));
      const avisos: string[] = [];
      if (sinOp.length && !(await registrarSinOperacion(lista, ejecucionId, modo, sinOp))) {
        avisos.push('No se pudieron registrar las filas omitidas o con error (los cambios sí quedaron registrados).');
      }
      if (Object.values(resultados).some(x => x.registro === 'sin_resultado')) {
        avisos.push('Hay cambios cuyo resultado no quedó registrado en Lens: van a aparecer como SIN_CONFIRMAR.');
      }

      // La lista después del cambio, y los ids que Admin no devolvió al crear.
      const despues = await leer();
      if (despues && modo === 'cargar' && lista !== 'DNI') {
        const clave = (r: RegistroAdmin) => lista === 'DOMINIO' ? normDomain(r.domain) : normAccount(r.accountNumber);
        const porClave = new Map(despues.recs.map(r => [clave(r), r]));
        const ids = plan.filter(p => p.accion === 'crear' && resultados[p.n]?.ok && resultados[p.n]?.cambioId)
          .map(p => ({ cambioId: resultados[p.n].cambioId!, adminId: porClave.get(p.valor ?? '')?.id }))
          .filter((x): x is { cambioId: string; adminId: string } => x.adminId != null)
          .map(x => ({ ...x, adminId: String(x.adminId) }));
        if (ids.length && !(await completarIds(lista, ids))) avisos.push('No se pudieron registrar los ids de Admin de las altas.');
      }
      if (cortar.current) avisos.push('Ejecución cortada: las filas que faltaban no se enviaron.');
      setAviso(avisos.join(' '));
    } finally {
      setEnCurso(false);
    }
  }

  function descargarLog() {
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const blob = new Blob([csvLog(modo, log)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blacklist_${modo === 'cargar' ? 'cargar' : 'editar'}_${lista.toLowerCase()}_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function leerArchivo(f: File | undefined) {
    if (!f) return;
    reiniciar();
    setEntrada(await f.text());
  }

  const c = plan ? contar(plan) : null;
  const aEnviar = c ? c.crear + c.editar : 0;
  const filtrados = useMemo(() => {
    if (!registros) return [];
    const q = busqueda.trim().toLowerCase();
    return q ? registros.filter(r => JSON.stringify(r).toLowerCase().includes(q)) : registros;
  }, [registros, busqueda]);
  const cols = lista === 'DNI' ? ['dni', 'countryCode', 'countryName', 'reason', 'blacklistStatus']
    : lista === 'DOMINIO' ? ['id', 'domain', 'reason', 'blacklistStatus']
    : ['id', 'accountNumber', 'accountType', 'countryCode', 'reason', 'enable'];

  const colorAccion: Record<string, string> = {
    crear: 'text-emerald-400', editar: 'text-sky-400', omitir: muted, sin_cambios: muted, error: 'text-red-400',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>⛔ Listas negras · Admin G66</h2>
        <p className={`text-sm mt-1 ${muted}`}>
          Alta y edición masiva de las listas negras de Compliance. Primero la vista previa: nada se envía hasta que
          confirmes. Cada cambio queda registrado con tu usuario{actor ? ` (${actor})` : ''}.
        </p>
      </div>

      <div className={`border rounded-2xl p-5 space-y-4 ${card}`}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Lista</span>
            <select value={lista} disabled={enCurso} onChange={e => { setLista(e.target.value as Lista); setRegistros(null); reiniciar(); }}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm ${input}`}>
              <option value="DNI">DNI</option>
              <option value="DOMINIO">Dominio de correo</option>
              <option value="CUENTA">Cuenta bancaria</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Modo</span>
            <select value={modo} disabled={enCurso} onChange={e => { setModo(e.target.value as Modo); reiniciar(); }}
              className={`w-full border rounded-xl px-4 py-2.5 text-sm ${input}`}>
              <option value="cargar">Cargar (alta)</option>
              <option value="editar">Editar (activar / desactivar)</option>
            </select>
          </label>
          {modo === 'editar' && (
            <label className="space-y-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>Estado si la fila no trae status</span>
              <select value={targetStatus ? 'true' : 'false'} disabled={enCurso} onChange={e => { setTargetStatus(e.target.value === 'true'); reiniciar(); }}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm ${input}`}>
                <option value="false">Desactivar</option>
                <option value="true">Activar</option>
              </select>
            </label>
          )}
        </div>
        <label className="block space-y-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>
            Razón por defecto {modo === 'cargar' ? '(obligatoria si la fila no trae reason)' : '(vacío = se mantiene la actual)'}
          </span>
          <input value={defaultReason} disabled={enCurso} onChange={e => { setDefaultReason(e.target.value); reiniciar(); }}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm ${input}`} placeholder="Fraude documental" />
        </label>
        <div className="space-y-1.5">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${muted}`}>
            CSV con encabezado — columnas: <code>{COLUMNAS[modo][lista]}</code>
          </span>
          <textarea value={entrada} disabled={enCurso} onChange={e => { setEntrada(e.target.value); reiniciar(); }} rows={6}
            className={`w-full border rounded-xl px-4 py-2.5 text-xs font-mono ${input}`}
            placeholder={`${COLUMNAS[modo][lista].replace(/ o id/g, '').replace(/ /g, '')}\n…`} />
          <input type="file" accept=".csv,text/csv,text/plain" disabled={enCurso}
            onChange={e => leerArchivo(e.target.files?.[0])} className={`text-xs ${muted}`} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={vistaPrevia} disabled={cargando || enCurso || !entrada.trim()} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>
            {cargando ? 'Leyendo…' : 'Vista previa'}
          </button>
          <button onClick={verLista} disabled={cargando || enCurso}
            className={`${btn} border ${dark ? 'border-slate-600 text-slate-300' : 'border-violet-300 text-violet-700'}`}>
            Ver lista actual
          </button>
        </div>
      </div>

      {error && <div className="bg-red-950/40 border border-red-800/50 rounded-xl px-5 py-4 text-sm text-red-300">{error}</div>}
      {aviso && <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl px-5 py-4 text-sm text-amber-300">{aviso}</div>}

      {plan && c && (
        <div className={`border rounded-2xl p-5 space-y-4 ${card}`}>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-bold">{c.total} filas:</span>
            <span className="text-emerald-400">{c.crear} a crear</span>·
            <span className="text-sky-400">{c.editar} a editar</span>·
            <span className={muted}>{c.omitir} omitidas</span>·
            <span className={muted}>{c.sin_cambios} sin cambios</span>·
            <span className="text-red-400">{c.error} con error</span>
          </div>

          {!enCurso && !Object.keys(ejecutado).length && !confirmando && (
            <button onClick={() => setConfirmando(true)} disabled={!aEnviar} className={`${btn} bg-red-600 hover:bg-red-500 text-white`}>
              Ejecutar {aEnviar} cambio(s)
            </button>
          )}
          {confirmando && (
            <div className="border border-red-700/60 bg-red-950/30 rounded-xl p-4 space-y-3 text-sm">
              <p className="text-red-200">
                Vas a {c.crear ? `crear ${c.crear} registro(s)` : ''}{c.crear && c.editar ? ' y ' : ''}{c.editar ? `editar ${c.editar} registro(s)` : ''} en
                la <strong>{NOMBRE_LISTA[lista]}</strong> de <strong>producción</strong> (Admin G66). Las {c.omitir + c.sin_cambios + c.error} filas
                restantes no se envían. Los registros no se pueden borrar: solo desactivar.
              </p>
              <div className="flex gap-2">
                <button onClick={ejecutar} className={`${btn} bg-red-600 hover:bg-red-500 text-white`}>Sí, ejecutar</button>
                <button onClick={() => setConfirmando(false)} className={`${btn} border ${dark ? 'border-slate-600 text-slate-300' : 'border-slate-300 text-slate-600'}`}>Cancelar</button>
              </div>
            </div>
          )}
          {enCurso && (
            <div className="space-y-2">
              <div className={`h-2 rounded-full overflow-hidden ${dark ? 'bg-slate-700' : 'bg-violet-100'}`}>
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${aEnviar ? (100 * hechos) / aEnviar : 0}%` }} />
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>{hechos} de {aEnviar}</span>
                <button onClick={() => { cortar.current = true; }} className={`${btn} border border-red-700 text-red-400`}>Cortar</button>
              </div>
            </div>
          )}
          {!!log.length && !enCurso && (
            <button onClick={descargarLog} className={`${btn} border ${dark ? 'border-slate-600 text-slate-300' : 'border-violet-300 text-violet-700'}`}>
              Descargar log (CSV)
            </button>
          )}

          <div className="overflow-x-auto max-h-[28rem]">
            <table className="w-full text-xs">
              <thead>
                <tr className={muted}>
                  {['#', 'Registro', 'Acción', 'Resultado', modo === 'editar' ? 'Estado' : '', 'Detalle'].filter(Boolean).map(h => (
                    <th key={h} className="text-left px-2 py-2 font-bold uppercase tracking-widest text-[10px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plan.map(p => {
                  const e = ejecutado[p.n];
                  return (
                    <tr key={p.n} className={`border-t ${dark ? 'border-slate-800' : 'border-violet-100'}`}>
                      <td className={`px-2 py-1.5 ${muted}`}>{p.n}</td>
                      <td className="px-2 py-1.5 font-mono">{p.registro}</td>
                      <td className={`px-2 py-1.5 font-bold ${colorAccion[p.accion]}`}>{p.accion}</td>
                      <td className="px-2 py-1.5">{e ? (e.ok ? <span className="text-emerald-400">OK {e.status}</span>
                        : <span className="text-red-400">ERROR</span>) : p.resultado}</td>
                      {modo === 'editar' && <td className={`px-2 py-1.5 ${muted}`}>{p.estadoAnterior ? `${p.estadoAnterior} → ${p.estadoNuevo}` : ''}</td>}
                      <td className={`px-2 py-1.5 max-w-md truncate ${p.error || e?.error ? 'text-red-400' : muted}`}
                        title={e?.error || p.error || p.detalle}>{e?.error || p.error || p.detalle}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {registros && (
        <div className={`border rounded-2xl p-5 space-y-3 ${card}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-bold">{NOMBRE_LISTA[lista]} — {registros.length} registro(s)</h3>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar…"
              className={`border rounded-xl px-3 py-1.5 text-xs ${input}`} />
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-xs">
              <thead><tr className={muted}>{cols.map(h => <th key={h} className="text-left px-2 py-2 text-[10px] uppercase tracking-widest">{h}</th>)}</tr></thead>
              <tbody>
                {filtrados.slice(0, 300).map((r, i) => (
                  <tr key={i} className={`border-t ${dark ? 'border-slate-800' : 'border-violet-100'}`}>
                    {cols.map(h => <td key={h} className="px-2 py-1.5 font-mono">{typeof r[h] === 'boolean' ? (r[h] ? 'ACTIVO' : 'INACTIVO') : String(r[h] ?? '')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length > 300 && <p className={`text-xs ${muted}`}>Se muestran 300 de {filtrados.length}: afiná la búsqueda.</p>}
        </div>
      )}
    </div>
  );
};
