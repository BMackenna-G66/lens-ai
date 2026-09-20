// MANTENEDOR de la whitelist de clientes.
//
// Qué hace la lista está en `services/whitelistClientes.ts`. Lo que importa acá,
// que es lo que esta pantalla tiene que dejar imposible de ignorar:
//
//   **Un cliente de esta lista se libera solo, sin mirar el screening.** Se
//   cierra su caso en Salesforce y se ejecuta el cierre en Admin — en remesas,
//   eso es plata que sale. Perdona coincidencias en listas de sanciones y
//   perdona delitos sensibles. Por decisión de negocio explícita.
//
// De ahí las tres cosas que esta pantalla hace y que no son decorativas:
//
//   1. El switch general está aparte del flujo automático y arranca apagado.
//   2. Antes de guardar, dice **cuántos casos de la cola actual** se liberarían.
//      Es el único aviso posible contra el modo de fallo silencioso de una carga
//      masiva: el match es exacto tras normalizar, así que una base de RUTs sin
//      dígito verificador coincide con CERO casos y nadie se entera. Si el
//      número sorprende para cualquiera de los dos lados, algo está mal.
//   3. Toda entrada guarda quién, cuándo y por qué. Sin motivo no se carga.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  subscribeWhitelist, guardarWhitelist, whitelistDisponible,
  parsearPegado, parsearArchivo, fusionarEntradas, whitelistACsv, construirEntrada,
  buscarEnWhitelist, normalizarWhitelist, entradaVigente, hoyISO,
  WHITELIST_DEFAULT, TOPE_ENTRADAS, AVISO_ENTRADAS, POR_PARTE,
} from '../services/whitelistClientesService';
import type {
  WhitelistClientes as Lista, EntradaWhitelist, WhitelistNormalizada, ResultadoImportacion,
} from '../services/whitelistClientesService';
import type { CasoSF } from '../services/casosService';
import { clasificarCola } from '../services/flujoDecision';

interface Props {
  /** Los casos que hoy están en la cola. Se usan SOLO para el preview de coincidencias. */
  casos: CasoSF[];
  actor: { uid: string; nombre: string; email?: string } | null;
  onCerrar: () => void;
}

const VER_MAX = 200;   // cuántas filas se pintan; con 20.000 el navegador se traba

export const WhitelistClientesPanel: React.FC<Props> = ({ casos, actor, onCerrar }) => {
  const [lista, setLista] = useState<Lista>(WHITELIST_DEFAULT);
  const [descartadas, setDescartadas] = useState<WhitelistNormalizada['descartadas']>([]);
  const [borrador, setBorrador] = useState<Lista>(WHITELIST_DEFAULT);
  const [msg, setMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState('');

  useEffect(() => subscribeWhitelist((wl, desc) => {
    setLista(wl); setBorrador(wl); setDescartadas(desc);
  }, m => setMsg(`❌ ${m}`)), []);

  // ── Carga masiva ──────────────────────────────────────────────────────────
  const [pegado, setPegado] = useState('');
  const [impOfac, setImpOfac] = useState(true);
  const [impRemesa, setImpRemesa] = useState(false);
  const [impMotivo, setImpMotivo] = useState('');
  const [impReferencia, setImpReferencia] = useState('');
  const [impVigencia, setImpVigencia] = useState('');
  const [previa, setPrevia] = useState<ResultadoImportacion | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const opcionesImp = () => ({
    ofac: impOfac, remesa: impRemesa,
    agregadoPor: actor?.email || actor?.nombre || 'desconocido',
    motivoPorDefecto: impMotivo.trim(),
    referenciaPorDefecto: impReferencia.trim(),
    vigenciaPorDefecto: impVigencia.trim(),
  });

  const leerArchivo = async (f: File) => {
    setLeyendo(true); setMsg(null);
    try { setPrevia(await parsearArchivo(f, opcionesImp())); }
    catch (e) { setMsg(`❌ No se pudo leer el archivo: ${(e as Error).message}`); }
    finally { setLeyendo(false); }
  };

  // ── El preview que importa ────────────────────────────────────────────────
  // Cuántos casos de la cola ACTUAL liberaría la lista del borrador (o la lista
  // que resultaría de aplicar la importación pendiente). Se evalúa con la misma
  // función que usan la app y el Lambda, y se fuerza `enabled: true` porque la
  // pregunta es "si prendo esto, ¿qué pasa?", no "qué está pasando".
  const listaSimulada = useMemo(() => {
    const entradas = previa
      ? fusionarEntradas(borrador.entradas, previa.entradas).entradas
      : borrador.entradas;
    return normalizarWhitelist({ enabled: true, entradas }).wl;
  }, [borrador.entradas, previa]);

  const impacto = useMemo(() => {
    const ofac = casos.filter(c => clasificarCola(c.asunto) === 'ofac');
    const remesa = casos.filter(c => clasificarCola(c.asunto) === 'remesa');
    return {
      ofac: ofac.filter(c => !!buscarEnWhitelist(c, listaSimulada, 'ofac')).length,
      ofacTotal: ofac.length,
      remesa: remesa.filter(c => !!buscarEnWhitelist(c, listaSimulada, 'remesa')).length,
      remesaTotal: remesa.length,
    };
  }, [casos, listaSimulada]);

  const aplicarImportacion = () => {
    if (!previa) return;
    const f = fusionarEntradas(borrador.entradas, previa.entradas);
    setBorrador(b => ({ ...b, entradas: f.entradas }));
    setMsg(`✔️ ${f.agregadas} agregada(s), ${f.reemplazadas} actualizada(s). Falta guardar.`);
    setPrevia(null); setPegado('');
    if (fileRef.current) fileRef.current.value = '';
  };

  // ── Alta de a uno ─────────────────────────────────────────────────────────
  const [uno, setUno] = useState({ documento: '', customerId: '', nombre: '', motivo: '', referencia: '', vigenciaHasta: '', ofac: true, remesa: false });
  const agregarUno = () => {
    const r = construirEntrada(uno, actor?.email || actor?.nombre || 'desconocido');
    if (!r.ok) { setMsg(`❌ ${r.error}`); return; }
    const f = fusionarEntradas(borrador.entradas, [r.entrada]);
    setBorrador(b => ({ ...b, entradas: f.entradas }));
    setUno({ documento: '', customerId: '', nombre: '', motivo: '', referencia: '', vigenciaHasta: '', ofac: true, remesa: false });
    setMsg(f.reemplazadas ? '✔️ Cliente actualizado. Falta guardar.' : '✔️ Cliente agregado. Falta guardar.');
  };

  const quitar = (e: EntradaWhitelist) => {
    setBorrador(b => ({ ...b, entradas: b.entradas.filter(x => x !== e) }));
    setMsg('✔️ Quitado del borrador. Falta guardar.');
  };

  const guardar = async () => {
    setGuardando(true); setMsg(null);
    try {
      await guardarWhitelist(borrador, actor ?? undefined);
      setMsg('✅ Guardado.');
    } catch (e) { setMsg(`❌ ${(e as Error).message}`); }
    finally { setGuardando(false); }
  };

  const descargar = () => {
    const blob = new Blob(['﻿' + whitelistACsv(borrador.entradas)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `whitelist-clientes-${hoyISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Derivados para la cabecera ────────────────────────────────────────────
  const hoy = hoyISO();
  const stats = useMemo(() => ({
    total: borrador.entradas.length,
    ofac: borrador.entradas.filter(e => e.ofac).length,
    remesa: borrador.entradas.filter(e => e.remesa).length,
    vencidas: borrador.entradas.filter(e => !entradaVigente(e, hoy)).length,
  }), [borrador.entradas, hoy]);

  const estable = (v: unknown) => JSON.stringify(v);
  const sinCambios = borrador.enabled === lista.enabled
    && estable(borrador.entradas) === estable(lista.entradas);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const base = q
      ? borrador.entradas.filter(e =>
        e.documento.toLowerCase().includes(q) || e.customerId.includes(q)
        || e.nombre.toLowerCase().includes(q) || e.motivo.toLowerCase().includes(q)
        || e.referencia.toLowerCase().includes(q))
      : borrador.entradas;
    return { filas: base.slice(0, VER_MAX), total: base.length };
  }, [borrador.entradas, filtro]);

  const inp = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-emerald-400 w-full';
  const sw = (on: boolean) => `relative w-10 h-5 rounded-full transition-colors ${on ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'}`;
  const knob = (on: boolean) => `absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`;

  return (
    <div className="mb-4 rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-black text-emerald-800 dark:text-emerald-300">✅ Whitelist de clientes</h3>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
            Clientes que se liberan <b>solos</b> cuando caen en una cola: se cierra el caso en Salesforce
            y se ejecuta el cierre en Admin.
          </p>
        </div>
        <button onClick={onCerrar} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700">Cerrar</button>
      </div>

      {!whitelistDisponible() && (
        <p className="text-xs text-red-600 dark:text-red-400 mb-3">Firestore no está configurado: la lista no se puede guardar en esta instancia.</p>
      )}

      {/* La advertencia. Va arriba y en rojo porque describe exactamente lo que
          la lista hace, no una precaución genérica. */}
      <div className="mb-3 rounded-lg border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 px-3 py-2.5">
        <p className="text-xs font-bold text-red-800 dark:text-red-300">🛑 Esta lista no hace excepciones</p>
        <p className="text-[11px] text-red-700 dark:text-red-400 mt-1">
          Un cliente de la whitelist se libera <b>aunque el screening traiga coincidencia en listas de
          sanciones</b> (OFAC, ONU, UE, GAFI) y <b>aunque traiga un delito sensible</b>. En la cola de
          remesas eso es <b>plata que sale</b> sin consultar a ningún proveedor. Lo único que la lista
          no pasa por encima es un caso ya cerrado y uno que tenga analista asignado.
        </p>
      </div>

      {/* Switch general. Aparte del flujo automático a propósito: la lista
          funciona con el flujo apagado, que es como está hoy la cola. */}
      <div className="mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 px-3 py-2.5">
        <button onClick={() => setBorrador(b => ({ ...b, enabled: !b.enabled }))} className="flex items-center gap-2 w-full text-left">
          <span className={sw(borrador.enabled)}><span className={knob(borrador.enabled)} /></span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Whitelist activa</span>
          <span className={`text-[11px] font-bold ${borrador.enabled ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
            {borrador.enabled ? 'LIBERANDO' : 'APAGADA'}
          </span>
        </button>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
          Interruptor propio: <b>no</b> depende del flujo automático. Con el flujo apagado, la whitelist
          igual libera a los clientes de la lista.
        </p>
        {/* La demora es una decisión de costo, no un defecto, y si no se dice
            acá alguien va a pensar que la lista no funciona. */}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          Con el flujo automático apagado, el proceso desatendido revisa la cola <b>cada 30 minutos</b> en
          vez de cada 5: leer la cola cuesta lecturas de Firestore y la cuota la comparte todo Lens. O sea
          que un caso puede tardar hasta media hora en salir solo. Con el flujo prendido no hay demora.
        </p>
      </div>

      {/* Conteos + el preview de impacto */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        {([
          ['En la lista', stats.total, ''],
          ['Aplican a OFAC', stats.ofac, ''],
          ['Aplican a Remesas', stats.remesa, ''],
          ['Vencidas (no aplican)', stats.vencidas, stats.vencidas ? 'text-amber-600 dark:text-amber-400' : ''],
        ] as const).map(([l, v, cls]) => (
          <div key={l} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{l}</p>
            <p className={`text-lg font-black ${cls || 'text-slate-800 dark:text-slate-100'}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="mb-3 rounded-lg border border-sky-200 dark:border-sky-800/50 bg-sky-50/70 dark:bg-sky-950/20 px-3 py-2.5">
        <p className="text-xs font-bold text-sky-800 dark:text-sky-300">🎯 Qué liberaría sobre la cola de hoy</p>
        <p className="text-sm font-black text-sky-900 dark:text-sky-200 mt-1">
          {impacto.ofac} de {impacto.ofacTotal} casos OFAC · {impacto.remesa} de {impacto.remesaTotal} remesas
        </p>
        <p className="text-[11px] text-sky-700 dark:text-sky-400 mt-1">
          Contado con la misma función que corre en producción, sobre los casos que la Bandeja tiene
          cargados ahora e incluyendo la importación pendiente si hay una.
          {' '}<b>Si cargaste una base y esto dice 0, la carga no está coincidiendo</b>: el cruce es exacto
          tras sacar puntos y guiones, así que un RUT sin dígito verificador no empata con el del caso.
        </p>
      </div>

      {/* ── Carga masiva ──────────────────────────────────────────────────── */}
      <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">📥 Cargar una base de clientes</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
          Excel (.xlsx) o CSV, o pegando desde una planilla. Las columnas se leen <b>por orden</b>, no
          por nombre: <code className="text-[10px]">documento · customerId · nombre · motivo · referencia · vigencia (YYYY-MM-DD)</code>.
          Con una de las dos llaves alcanza. Un cliente que ya esté en la lista se <b>actualiza</b>, no se duplica.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <label className="text-[11px] text-slate-600 dark:text-slate-300">
            Motivo por defecto (para las filas sin motivo propio)
            <input value={impMotivo} onChange={e => setImpMotivo(e.target.value)} placeholder="Ej: homonimia validada lote AR-12755" className={inp} />
          </label>
          <label className="text-[11px] text-slate-600 dark:text-slate-300">
            Referencia por defecto
            <input value={impReferencia} onChange={e => setImpReferencia(e.target.value)} placeholder="Acta, ticket o nombre de la base" className={inp} />
          </label>
          <label className="text-[11px] text-slate-600 dark:text-slate-300">
            Vigencia por defecto (opcional)
            <input value={impVigencia} onChange={e => setImpVigencia(e.target.value)} placeholder="YYYY-MM-DD" className={inp} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 mb-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Aplicar a:</span>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={impOfac} onChange={e => setImpOfac(e.target.checked)} className="w-3.5 h-3.5" />
            Cola OFAC
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={impRemesa} onChange={e => setImpRemesa(e.target.checked)} className="w-3.5 h-3.5" />
            Cola Remesas <span className="text-red-600 dark:text-red-400 font-bold">(libera plata)</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,.tsv"
            onChange={e => { const f = e.target.files?.[0]; if (f) void leerArchivo(f); }}
            className="text-[11px] text-slate-600 dark:text-slate-300 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-800 file:text-white file:text-[11px] file:font-bold"
          />
          {leyendo && <span className="text-[11px] text-slate-500">Leyendo…</span>}
        </div>

        <textarea
          value={pegado} onChange={e => setPegado(e.target.value)} rows={4}
          placeholder={'…o pegá acá desde Excel:\n12.345.678-9\t9990001\tJuan Pérez\tHomonimia validada'}
          className={`${inp} font-mono`}
        />
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button
            onClick={() => setPrevia(parsearPegado(pegado, opcionesImp()))}
            disabled={!pegado.trim() || (!impOfac && !impRemesa)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-xs font-bold"
          >
            Revisar lo pegado
          </button>
          {(!impOfac && !impRemesa) && (
            <span className="text-[11px] text-amber-700 dark:text-amber-400">Elegí al menos una cola.</span>
          )}
        </div>

        {previa && (
          <div className="mt-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 p-3">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {previa.filasLeidas} fila(s) leída(s) → <b className="text-emerald-700 dark:text-emerald-400">{previa.entradas.length}</b> entrada(s)
              {previa.errores.length > 0 && <> · <b className="text-red-700 dark:text-red-400">{previa.errores.length}</b> descartada(s)</>}
              {previa.encabezadoSalteado && <span className="text-slate-500"> · se salteó el encabezado</span>}
            </p>
            {previa.errores.length > 0 && (
              <div className="mt-2 max-h-40 overflow-auto rounded border border-red-200 dark:border-red-900/60">
                <table className="w-full text-[11px]">
                  <tbody>
                    {previa.errores.slice(0, 50).map(e => (
                      <tr key={e.linea} className="border-b border-red-100 dark:border-red-900/40">
                        <td className="px-2 py-1 text-slate-500 w-12">#{e.linea}</td>
                        <td className="px-2 py-1 font-mono text-slate-600 dark:text-slate-300 truncate max-w-[18rem]">{e.crudo}</td>
                        <td className="px-2 py-1 text-red-700 dark:text-red-400">{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previa.errores.length > 50 && (
                  <p className="text-[11px] text-slate-500 px-2 py-1">…y {previa.errores.length - 50} más.</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={aplicarImportacion}
                disabled={previa.entradas.length === 0}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold"
              >
                Sumar {previa.entradas.length} al borrador
              </button>
              <button
                onClick={() => { setPrevia(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
              >
                Descartar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Alta de a uno ─────────────────────────────────────────────────── */}
      <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">➕ Agregar un cliente</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <input value={uno.documento} onChange={e => setUno(u => ({ ...u, documento: e.target.value }))} placeholder="Documento" className={inp} />
          <input value={uno.customerId} onChange={e => setUno(u => ({ ...u, customerId: e.target.value }))} placeholder="Customer ID" className={inp} />
          <input value={uno.nombre} onChange={e => setUno(u => ({ ...u, nombre: e.target.value }))} placeholder="Nombre" className={inp} />
          <input value={uno.motivo} onChange={e => setUno(u => ({ ...u, motivo: e.target.value }))} placeholder="Motivo (obligatorio)" className={`${inp} md:col-span-2`} />
          <input value={uno.vigenciaHasta} onChange={e => setUno(u => ({ ...u, vigenciaHasta: e.target.value }))} placeholder="Vence YYYY-MM-DD" className={inp} />
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-2">
          <input value={uno.referencia} onChange={e => setUno(u => ({ ...u, referencia: e.target.value }))} placeholder="Referencia (caso, ticket, acta)" className={`${inp} max-w-xs`} />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={uno.ofac} onChange={e => setUno(u => ({ ...u, ofac: e.target.checked }))} className="w-3.5 h-3.5" /> OFAC
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={uno.remesa} onChange={e => setUno(u => ({ ...u, remesa: e.target.checked }))} className="w-3.5 h-3.5" /> Remesas
          </label>
          <button onClick={agregarUno} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold">Agregar</button>
        </div>
      </div>

      {/* Entradas que el documento guardado trae y que NO se están usando. */}
      {descartadas.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
            ⚠️ {descartadas.length} entrada(s) del documento guardado NO se están usando
          </p>
          <ul className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 space-y-0.5 max-h-24 overflow-auto">
            {descartadas.slice(0, 20).map(d => <li key={d.indice}>#{d.indice}: {d.motivo}</li>)}
          </ul>
        </div>
      )}

      {/* ── La lista ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/40 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Buscar por documento, id, nombre, motivo…" className={`${inp} max-w-sm`} />
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {visibles.total} de {stats.total}
            {visibles.total > VER_MAX && <> · se muestran las primeras {VER_MAX}</>}
          </span>
          <button onClick={descargar} disabled={!stats.total} className="ml-auto text-[11px] underline text-slate-600 dark:text-slate-300 disabled:opacity-40">
            descargar CSV
          </button>
        </div>
        <div className="max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
              <tr className="text-left text-slate-600 dark:text-slate-300">
                {['Documento', 'Customer ID', 'Nombre', 'Colas', 'Motivo', 'Vence', 'Cargó', ''].map(h => (
                  <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.filas.map((e, i) => {
                const vencida = !entradaVigente(e, hoy);
                return (
                  <tr key={`${e.documento}|${e.customerId}|${i}`} className={`border-b border-slate-100 dark:border-slate-800 ${vencida ? 'opacity-50' : ''}`}>
                    <td className="px-2 py-1 font-mono text-slate-700 dark:text-slate-200">{e.documento || '—'}</td>
                    <td className="px-2 py-1 font-mono text-slate-700 dark:text-slate-200">{e.customerId || '—'}</td>
                    <td className="px-2 py-1 text-slate-600 dark:text-slate-300 truncate max-w-[12rem]">{e.nombre || '—'}</td>
                    <td className="px-2 py-1">
                      {e.ofac && <span className="mr-1 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold">OFAC</span>}
                      {e.remesa && <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300 font-semibold">REMESA</span>}
                    </td>
                    <td className="px-2 py-1 text-slate-600 dark:text-slate-300 truncate max-w-[16rem]" title={e.motivo}>
                      {e.motivo}{e.referencia && <span className="text-slate-400"> · {e.referencia}</span>}
                    </td>
                    <td className="px-2 py-1 text-slate-500">{e.vigenciaHasta ?? '—'}{vencida && ' (vencida)'}</td>
                    <td className="px-2 py-1 text-slate-500 truncate max-w-[10rem]" title={`${e.agregadoPor} · ${e.agregadoEn}`}>{e.agregadoPor}</td>
                    <td className="px-2 py-1">
                      <button onClick={() => quitar(e)} className="text-red-600 dark:text-red-400 hover:underline font-semibold">quitar</button>
                    </td>
                  </tr>
                );
              })}
              {visibles.filas.length === 0 && (
                <tr><td colSpan={8} className="px-2 py-6 text-center text-slate-400">
                  {stats.total === 0 ? 'La lista está vacía.' : 'Nada coincide con el filtro.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {stats.total > AVISO_ENTRADAS && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
          ⚠️ La lista tiene {stats.total} entradas y el tope es {TOPE_ENTRADAS} (se guarda en trozos de {POR_PARTE}).
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <button
          onClick={guardar}
          disabled={guardando || sinCambios || !whitelistDisponible()}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold"
        >
          {guardando ? 'Guardando…' : 'Guardar whitelist'}
        </button>
        {!sinCambios && (
          <button
            onClick={() => { setBorrador(lista); setPrevia(null); setMsg(null); }}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold"
          >
            Descartar cambios
          </button>
        )}
        {!sinCambios && <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Hay cambios sin guardar.</span>}
        {msg && <span className={`text-xs ${msg.startsWith('❌') ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{msg}</span>}
      </div>

      {lista.actualizadoEn && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          Último guardado: {new Date(lista.actualizadoEn).toLocaleString('es-CL')} por {lista.actualizadoPor ?? '—'}.
        </p>
      )}
    </div>
  );
};

export default WhitelistClientesPanel;
