// Ficha FLOTANTE de una empresa: se abre sobre la cola, sin perderla de vista.
//
// El orden de las secciones no es decorativo, es el del trabajo del analista:
//
//   1. Datos generales      — quién es este cliente (todo de Admin)
//   2. Representantes legales
//   3. Personas (usuarios de la cuenta)
//   4. Beneficiarios finales / accionistas
//   5. Documentos           — cuántos hay y cómo abrirlos
//   6. Comparativa          — Admin · Lens · resultado final
//   7. Screening y perfil criminal
//   8. Decisión
//
// Primero se entiende al cliente, después se compara, y recién al final se decide.
// Este componente NO hace fetch: recibe todo por props.

import React, { useEffect, useState } from 'react';
import type { AnalisisKyb, EmpresaKyb, TipoDecisionKyb, DocumentoKyb } from '../../types/kyb';
import type { DatosGeneralesEmpresa, PersonaCanonica, LadoCanonico } from '../../types/kybCanonico';
import { datosGeneralesDesdeLado } from '../../services/kyb/kybAdminMapper';
import { KybFicha } from './KybFicha';
import { evaluarKybAuto, motivoKybLegible } from '../../services/kyb/flujoKybEngine';
import type { FlujoKybConfig } from '../../services/kyb/kybFlujoService';
import type { SnapshotAdmin } from '../../services/kyb/kybQueueService';

interface Props {
  empresa: EmpresaKyb;
  analisis: AnalisisKyb | null;
  analizando: boolean;
  progreso?: string;
  onAnalizar: () => void;
  onDecidir: (tipo: TipoDecisionKyb, comentario: string) => void;
  onEliminar: () => void;
  onAbrirDocumento: (d: DocumentoKyb) => void;
  onDescargarPdf: () => void;
  onCerrar: () => void;
  // Navegación sin salir de la ficha: se pasa de una empresa a otra de la cola.
  onAnterior?: () => void;
  onSiguiente?: () => void;
  posicion?: string;   // "3 / 80"
  // Snapshot de Admin del barrido, si la empresa todavía no se analizó. Llega por
  // prop porque vive en una subcolección y lo lee la cola, no este componente.
  snapshot?: SnapshotAdmin | null;
  flujo: FlujoKybConfig;
}

// ── Bloque de datos generales ────────────────────────────────────────────────
// Etiquetas en el orden pedido. Un campo sin dato se muestra igual, con guion:
// que un dato falte es información, y esconderlo obliga a ir a Admin a confirmar.
const CAMPOS_GENERALES: { clave: keyof DatosGeneralesEmpresa; label: string }[] = [
  { clave: 'nombre', label: 'Nombre' },
  { clave: 'pais', label: 'País' },
  { clave: 'tipoIdentificacion', label: 'Tipo de identificación' },
  { clave: 'numeroIdentificacion', label: 'N° de identificación' },
  { clave: 'tributacionInternacional', label: 'Tributación internacional' },
  { clave: 'region', label: 'Región / provincia' },
  { clave: 'ciudad', label: 'Localidad / ciudad' },
  { clave: 'calle', label: 'Calle / avenida' },
  { clave: 'numero', label: 'Número' },
  { clave: 'direccionComplementaria', label: 'Dirección complementaria' },
  { clave: 'administracionConjunta', label: 'Administración conjunta' },
  { clave: 'institucional', label: 'Institucional' },
  { clave: 'paginaWeb', label: 'Página web' },
  { clave: 'relacionContractual', label: 'Relación contractual' },
  { clave: 'industria', label: 'Industria' },
  { clave: 'actividad', label: 'Actividad' },
  { clave: 'facturacionAnualEstimada', label: 'Facturación anual estimada' },
  { clave: 'montosEnviosEsperados', label: 'Montos de envíos esperados' },
  { clave: 'frecuenciaEnviosEsperada', label: 'Frecuencia de envíos esperada' },
  { clave: 'segmentacion', label: 'Segmentación' },
  { clave: 'nivelRiesgoPartner', label: 'Nivel de riesgo partner' },
  { clave: 'nivelRiesgoGlobal66', label: 'Nivel de riesgo Global66' },
  { clave: 'fechaConstitucion', label: 'Fecha de constitución' },
  { clave: 'telefono', label: 'Teléfono' },
  // Admin NO expone una "última validación del partner" (verificado: 56 claves
  // en /company/bo). Lo que sí hay es el ciclo KYC de Global66, que va abajo.
  { clave: 'kycEtapa1', label: 'KYC etapa 1' },
  { clave: 'kycSubidoManualEn', label: 'Subido manual el' },
  { clave: 'kycAprobadoEn', label: 'KYC aprobado el' },
  { clave: 'kycRechazadoEn', label: 'KYC rechazado el' },
  { clave: 'kycEtapa2', label: 'KYC etapa 2' },
  { clave: 'kycEtapa3', label: 'KYC etapa 3' },
  { clave: 'inicioActividades', label: 'Inicio de actividades' },
  { clave: 'paisTributacion', label: 'País de tributación' },
  { clave: 'fatca', label: 'FATCA' },
  { clave: 'crs', label: 'CRS' },
  { clave: 'multiActividad', label: 'Multi-actividad' },
  { clave: 'propositoUso', label: 'Propósito de uso' },
  { clave: 'comentarioCompliance', label: 'Comentario de compliance' },
  { clave: 'comentarioKyc', label: 'Comentario KYC' },
];

const mostrar = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
};

const Seccion: React.FC<{ titulo: string; extra?: React.ReactNode; children: React.ReactNode }> =
  ({ titulo, extra, children }) => (
    <section className="mb-5">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-sm font-black text-slate-800 dark:text-slate-200">{titulo}</h3>
        {extra}
      </div>
      {children}
    </section>
  );

// Tabla de personas. Se muestran las columnas que Admin realmente devuelve.
const TablaPersonas: React.FC<{ personas: PersonaCanonica[] | undefined; vacio: string }> =
  ({ personas, vacio }) => {
    const l = personas ?? [];
    if (l.length === 0) return <p className="text-xs text-slate-500 dark:text-slate-400">{vacio}</p>;
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-left">
            <tr>
              <th className="py-2 px-3 font-semibold">Nombre</th>
              <th className="py-2 px-3 font-semibold">Documento</th>
              <th className="py-2 px-3 font-semibold">Tipo</th>
              <th className="py-2 px-3 font-semibold">Rol</th>
              <th className="py-2 px-3 font-semibold">Participación</th>
              <th className="py-2 px-3 font-semibold">Nacionalidad</th>
              {/* Lo que Admin declara de cada persona. Es lo DECLARADO, no el
                  resultado del screening: sirve para contrastar. */}
              <th className="py-2 px-3 font-semibold">PEP (Admin)</th>
              <th className="py-2 px-3 font-semibold">Riesgo</th>
              <th className="py-2 px-3 font-semibold">Ocupación</th>
              <th className="py-2 px-3 font-semibold">Email</th>
            </tr>
          </thead>
          <tbody>
            {l.map((p, i) => (
              <tr key={`${p.clave}-${i}`} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-2 px-3 font-bold text-slate-800 dark:text-slate-100">
                  {p.nombre || '—'}
                  {p.esRepresentanteLegal && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">rep. legal</span>}
                </td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-300">{p.documento || '—'}</td>
                <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{p.tipoDocumento || '—'}</td>
                <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{p.rol || '—'}</td>
                <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                  {p.participacionPct !== null && p.participacionPct !== undefined ? `${p.participacionPct}%` : '—'}
                </td>
                <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{p.nacionalidad || '—'}</td>
                <td className="py-2 px-3">
                  {p.pepDeclarado === true
                    ? <span className="font-bold text-amber-700 dark:text-amber-400">Sí{p.pepTipo ? ` · ${p.pepTipo}` : ''}</span>
                    : p.pepDeclarado === false
                      ? <span className="text-slate-500 dark:text-slate-400">No</span>
                      : <span className="text-slate-400">—</span>}
                  {p.sujetoObligado === true && (
                    <span className="block text-[10px] text-sky-700 dark:text-sky-400 font-semibold">sujeto obligado</span>
                  )}
                </td>
                <td className="py-2 px-3 text-slate-500 dark:text-slate-400">{p.nivelRiesgo || '—'}</td>
                <td className="py-2 px-3 text-slate-500 dark:text-slate-400 max-w-[140px] truncate" title={p.ocupacion}>{p.ocupacion || '—'}</td>
                <td className="py-2 px-3 text-slate-500 dark:text-slate-400 max-w-[180px] truncate" title={p.email}>{p.email || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

export const KybFichaFlotante: React.FC<Props> = ({
  empresa, analisis, analizando, progreso,
  onAnalizar, onDecidir, onEliminar, onAbrirDocumento, onDescargarPdf, onCerrar,
  onAnterior, onSiguiente, posicion, snapshot, flujo,
}) => {
  const [confirmaBorrado, setConfirmaBorrado] = useState(false);

  // Escape cierra la ficha. Es un overlay a pantalla completa: la salida tiene
  // que estar donde la mano ya está, no solo en la X de la esquina.
  //
  // Si hay una confirmación de borrado abierta, Escape la cancela a ELLA y deja
  // la ficha en pie. Cerrar las dos de un saque haría perder el contexto por un
  // reflejo, y la de borrado es justo la que conviene poder abortar rápido.
  //
  // Tampoco cierra mientras se escribe en un campo: el comentario de la decisión
  // se perdería entero. Ahí Escape saca el foco y ya.
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const foco = document.activeElement as HTMLElement | null;
      const escribiendo = !!foco && (
        foco.tagName === 'TEXTAREA'
        || (foco.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((foco as HTMLInputElement).type))
        || foco.isContentEditable
      );
      if (escribiendo) { foco?.blur(); return; }
      if (confirmaBorrado) { setConfirmaBorrado(false); return; }
      onCerrar();
    };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [confirmaBorrado, onCerrar]);

  // Snapshot del barrido: permite abrir la ficha con datos ANTES de analizar.
  // El análisis manda siempre que exista; el snapshot solo rellena el hueco.
  const snap = snapshot ?? undefined;
  const usandoSnapshot = !analisis && !!snap;
  const admin = analisis?.admin ?? (snap?.admin as LadoCanonico | undefined);
  const docs = analisis?.documentos ?? snap?.documentos ?? [];

  // Las corridas anteriores a este bloque no guardaron `datosGenerales`. Mostrar
  // 38 guiones se lee como "Admin no tiene nada", que es falso y es lo peor que
  // puede decir una ficha de compliance. Así que se distingue el caso y se
  // rellena con lo que el LadoCanonico sí tiene guardado.
  const guardados = (analisis?.datosGenerales ?? (analisis ? undefined : snap?.datosGenerales)) as DatosGeneralesEmpresa | undefined;
  const corridaSinBloque = !!analisis && !guardados;
  const g: DatosGeneralesEmpresa = guardados ?? datosGeneralesDesdeLado(admin);
  // Distinto de lo anterior: el bloque SÍ está pero vino vacío, o sea Admin no
  // devolvió el detalle de la empresa en esa corrida.
  const adminSinDetalle = !!guardados && !guardados.nombre && !guardados.numeroIdentificacion;

  return (
    // Overlay: la cola queda detrás, así al cerrar no hay que retroceder.
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-3 md:p-6 overflow-y-auto">
      <div className="w-full max-w-6xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">

        {/* Barra fija: identidad + navegación + acciones */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur rounded-t-2xl">
          <div className="min-w-0 mr-auto">
            <h2 className="text-lg font-black text-slate-900 dark:text-white truncate">
              {g.nombre || empresa.razonSocial}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {g.tipoIdentificacion || '—'} {g.numeroIdentificacion || empresa.identificacion || '—'}
              {' · '}Company ID {empresa.companyId}
              {empresa.complianceStatus ? ` · ${empresa.complianceStatus}` : ''}
            </p>
          </div>

          {(onAnterior || onSiguiente) && (
            <div className="flex items-center gap-1">
              <button onClick={onAnterior} disabled={!onAnterior} className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs disabled:opacity-40" title="Empresa anterior">◀</button>
              {posicion && <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums px-1">{posicion}</span>}
              <button onClick={onSiguiente} disabled={!onSiguiente} className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs disabled:opacity-40" title="Empresa siguiente">▶</button>
            </div>
          )}

          <button onClick={onDescargarPdf} disabled={!analisis} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40">
            ⬇ PDF
          </button>
          {!confirmaBorrado ? (
            <button onClick={() => setConfirmaBorrado(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400">
              🗑 Eliminar
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-red-700 dark:text-red-400">¿Sacar de la cola y borrar la ficha?</span>
              <button onClick={onEliminar} className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold">Sí</button>
              <button onClick={() => setConfirmaBorrado(false)} className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600">No</button>
            </span>
          )}
          <button onClick={onCerrar} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600">Cerrar</button>
        </div>

        <div className="p-5">
          {/* 1 — Datos generales */}
          <Seccion
            titulo="1 · Datos generales de la empresa"
            extra={<span className="text-[11px] text-slate-500 dark:text-slate-400">fuente: Admin</span>}
          >
            {!analisis && !snap ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sin analizar. Corré el análisis para traer los datos de Admin.
              </p>
            ) : (
              <>
              {usandoSnapshot && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-sky-300 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-950/30 px-4 py-2.5">
                  <p className="text-xs text-sky-900 dark:text-sky-300 flex-1 min-w-[16rem]">
                    <b>Snapshot del barrido</b> del {new Date(snap!.tomadoEn).toLocaleString('es-CL')}.
                    Son los datos que Admin tenía en ese momento — sirven para mirar, no para decidir.
                    El análisis vuelve a consultar y agrega documentos, comparativa y screening.
                  </p>
                  <button
                    onClick={onAnalizar}
                    disabled={analizando}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold"
                  >
                    {analizando ? (progreso || 'Analizando…') : 'Analizar'}
                  </button>
                </div>
              )}
              {corridaSinBloque && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5">
                  <p className="text-xs text-amber-800 dark:text-amber-300 flex-1 min-w-[16rem]">
                    <b>Esta corrida es anterior al bloque de datos generales.</b> Abajo va solo
                    lo que quedó guardado del cruce con Admin; el resto de los campos no se
                    extrajo en esa corrida — <b>no</b> significa que Admin no los tenga.
                  </p>
                  <button
                    onClick={onAnalizar}
                    disabled={analizando}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold"
                  >
                    {analizando ? 'Analizando…' : 'Volver a analizar'}
                  </button>
                </div>
              )}
              {adminSinDetalle && (
                <p className="mb-3 text-xs text-red-700 dark:text-red-400 font-semibold rounded-xl border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 px-4 py-2.5">
                  ⚠️ Admin no devolvió el detalle de esta empresa en la corrida. No es que los
                  datos no existan: la consulta no los trajo. Volvé a analizar.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                {CAMPOS_GENERALES.map(c => (
                  <div key={c.clave} className="flex items-baseline justify-between gap-2 text-xs border-b border-slate-100 dark:border-slate-800/60 py-1">
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">{c.label}</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 text-right break-words">
                      {mostrar(g[c.clave])}
                    </span>
                  </div>
                ))}
              </div>
              </>
            )}
          </Seccion>

          {/* 2 — Representantes legales */}
          <Seccion titulo="2 · Representantes legales" extra={<span className="text-[11px] text-slate-500 dark:text-slate-400">{(admin?.representantesLegales ?? []).length} en Admin</span>}>
            <TablaPersonas personas={admin?.representantesLegales} vacio="Admin no informa representantes legales." />
            {/* Admin trae un conteo declarado además de la lista. Si no cuadran,
                Admin está incompleto y el dato hay que buscarlo en la escritura:
                es un hallazgo, no un detalle de presentación. */}
            {g.representantesDeclarados != null
              && g.representantesCargados != null
              && g.representantesDeclarados !== g.representantesCargados && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                ⚠️ Admin declara {g.representantesDeclarados} representante(s) pero tiene {g.representantesCargados} cargado(s).
              </p>
            )}
          </Seccion>

          {/* 3 — Personas (usuarios de la cuenta) */}
          <Seccion titulo="3 · Personas de la cuenta" extra={<span className="text-[11px] text-slate-500 dark:text-slate-400">{(admin?.usuarios ?? []).length} usuario(s)</span>}>
            <TablaPersonas personas={admin?.usuarios} vacio="Sin usuarios registrados en la cuenta." />
          </Seccion>

          {/* 4 — Beneficiarios finales */}
          <Seccion titulo="4 · Beneficiarios finales y accionistas" extra={<span className="text-[11px] text-slate-500 dark:text-slate-400">{(admin?.accionistas ?? []).length} en Admin</span>}>
            <TablaPersonas personas={admin?.accionistas} vacio="Admin no informa accionistas ni beneficiarios finales." />
            {(admin?.directorio ?? []).length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">Directorio</p>
                <TablaPersonas personas={admin?.directorio} vacio="" />
              </div>
            )}
          </Seccion>

          {/* 5 — Documentos */}
          <Seccion
            titulo="5 · Documentos"
            extra={<span className="text-[11px] text-slate-500 dark:text-slate-400">
              {docs.length} en Admin{docs.length ? ` · ${docs.filter(d => d.analizado).length} analizado(s)` : ''}
              {usandoSnapshot && docs.length ? ' · del snapshot' : ''}
            </span>}
          >
            {docs.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">La empresa no tiene documentos cargados en Admin.</p>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {docs.map((d, i) => (
                  <div key={`${d.link}-${i}`} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate mr-auto" title={d.nombre}>
                      {d.nombre}
                      {!d.analizado && <span className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">no analizado</span>}
                    </span>
                    {d.slot && <span className="text-[10px] text-slate-400 shrink-0">{d.slot}</span>}
                    {d.estado && <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">{d.estado}</span>}
                    <button
                      onClick={() => onAbrirDocumento(d)}
                      className="text-[11px] font-bold px-2 py-1 rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-400 shrink-0"
                    >
                      Abrir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Seccion>

          {/* 6, 7 y 8 — Comparativa, screening y decisión.
              Se reusa la ficha que ya existía: trae la matriz de 11 con las tres
              lecturas (Admin, Lens y el resultado), las alertas, el screening
              criminal y el panel de decisión. */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 mb-2">
              6 · Comparativa, screening y decisión
            </h3>
            <KybFicha
              empresa={empresa}
              analisis={analisis}
              analizando={analizando}
              progreso={progreso}
              onAnalizar={onAnalizar}
              onDecidir={onDecidir}
              onCerrar={onCerrar}
              sinCabecera
            />

            {/* Por qué este caso no se cierra solo. Deja explícito qué freno
                aplicó, que es lo que hay que poder auditar del flujo automático. */}
            {(() => {
              const ev = evaluarKybAuto(empresa, analisis ?? undefined, flujo);
              if (ev.automatizable) {
                return (
                  <p className={`text-xs mt-3 ${ev.simulacion ? 'text-sky-700 dark:text-sky-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {ev.simulacion ? '🧪' : '✅'} El flujo automático {ev.simulacion ? 'habría' : 'va a'} <b>{ev.decision}</b> este caso · {ev.detalle}
                  </p>
                );
              }
              const duro = ['delito_sensible', 'pep', 'terminos_pendientes', 'alerta_critica', 'discrepancia_identidad'].includes(ev.motivo ?? '');
              return (
                <p className={`text-xs mt-3 ${duro ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}>
                  {duro ? '🛑 ' : '⏸️ '}No se decide solo: {motivoKybLegible(ev.motivo)}
                  {ev.detalle ? ` · ${ev.detalle}` : ''}
                </p>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};
