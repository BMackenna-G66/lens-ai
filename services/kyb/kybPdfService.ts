// PDF de la ficha KYB. Mismo orden que la ficha en pantalla, para que el papel y
// la pantalla se puedan comparar línea por línea.
//
// NO consulta nada: se arma con el análisis ya guardado. Un PDF que dispara
// consultas produce dos documentos distintos para el mismo caso.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AnalisisKyb, EmpresaKyb } from '../../types/kyb';
import type { DatosGeneralesEmpresa, PersonaCanonica } from '../../types/kybCanonico';
import type { ResultadoScreeningKyb } from './kybScreeningService';

const CAMPOS: { clave: keyof DatosGeneralesEmpresa; label: string }[] = [
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
  { clave: 'formaLegal', label: 'Forma legal' },
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

const txt = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
};

const ESTADO_LEGIBLE: Record<string, string> = {
  COINCIDE: 'Coincide',
  PARCIAL: 'Parcial',
  SOLO_LENS: 'Solo Lens',
  SOLO_ADMIN: 'Solo Admin',
  DISCREPA: 'DISCREPA',
  SIN_DATOS: 'Sin datos',
};

const ESTADO_SCREENING: Record<string, string> = {
  SIN_COINCIDENCIAS: 'Sin coincidencias',
  CON_COINCIDENCIAS: 'CON COINCIDENCIAS',
  SOLO_PEP: 'Solo PEP',
  SIN_DOCUMENTO: 'Sin documento (no consultable)',
  ERROR: 'ERROR del proveedor',
};

function personasAFilas(ps: PersonaCanonica[] | undefined): string[][] {
  return (ps ?? []).map(p => [
    p.nombre || '—',
    p.documento || '—',
    p.rol || (p.esRepresentanteLegal ? 'Representante legal' : '—'),
    p.participacionPct != null ? `${p.participacionPct}%` : '—',
    p.email || '—',
    p.estado || '—',
  ]);
}

// Título de sección con un salto de página si no cabe.
function seccion(doc: jsPDF, y: number, titulo: string): number {
  const alto = doc.internal.pageSize.getHeight();
  if (y > alto - 40) { doc.addPage(); y = 15; }
  doc.setFontSize(11).setFont('helvetica', 'bold');
  doc.text(titulo, 14, y);
  return y + 5;
}

const finY = (doc: jsPDF, fallback: number): number => {
  const t = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
  return (t?.finalY ?? fallback) + 9;
};

export async function generarPdfKyb(empresa: EmpresaKyb, a: AnalisisKyb): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const g = (a.datosGenerales ?? {}) as DatosGeneralesEmpresa;
  const scr = a.screening as ResultadoScreeningKyb | undefined;

  // ── Cabecera ──────────────────────────────────────────────────────────────
  doc.setFontSize(16).setFont('helvetica', 'bold');
  doc.text('Ficha KYB — Empresa', 14, 18);
  doc.setFontSize(11).setFont('helvetica', 'normal');
  doc.text(`${empresa.razonSocial}  ·  ${empresa.identificacion || 's/ identificación'}  ·  ID ${empresa.companyId}`, 14, 25);
  doc.setFontSize(9).setTextColor(110);
  doc.text(
    `Análisis ${a.estado} · corrida ${new Date(a.corridaEn).toLocaleString('es-CL')} · ` +
    `certidumbre ${a.certidumbre == null ? 'no publicada' : `${a.certidumbre}%`}`,
    14, 31,
  );
  doc.setTextColor(0);
  let y = 40;

  // Cuando el análisis quedó incompleto, el PDF lo dice arriba: el porcentaje no
  // se publica y hay que saber qué faltó antes de leer el resto.
  if (a.estado !== 'COMPLETO' && (a.faltantes?.length || a.mensajeError)) {
    y = seccion(doc, y, 'Análisis incompleto — qué faltó');
    autoTable(doc, {
      startY: y, theme: 'plain', styles: { fontSize: 8 },
      body: (a.faltantes ?? [a.mensajeError ?? '—']).map(f => [`• ${f}`]),
    });
    y = finY(doc, y);
  }

  // ── 1. Datos generales ────────────────────────────────────────────────────
  y = seccion(doc, y, '1 · Datos generales (Admin)');
  autoTable(doc, {
    startY: y, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [124, 58, 237] },
    head: [['Campo', 'Valor', 'Campo', 'Valor']],
    // Dos columnas de pares para que los campos entren en una página.
    body: Array.from({ length: Math.ceil(CAMPOS.length / 2) }, (_, i) => {
      const a1 = CAMPOS[i * 2], a2 = CAMPOS[i * 2 + 1];
      return [a1.label, txt(g[a1.clave]), a2?.label ?? '', a2 ? txt(g[a2.clave]) : ''];
    }),
  });
  y = finY(doc, y);

  // ── 2, 3, 4. Personas ─────────────────────────────────────────────────────
  const grupos: { titulo: string; personas?: PersonaCanonica[] }[] = [
    { titulo: '2 · Representantes legales', personas: a.admin?.representantesLegales },
    { titulo: '3 · Personas (usuarios de la cuenta)', personas: a.admin?.usuarios },
    { titulo: '4 · Beneficiarios finales / accionistas', personas: a.admin?.accionistas },
    { titulo: '4b · Directorio', personas: a.admin?.directorio },
  ];
  for (const gr of grupos) {
    const filas = personasAFilas(gr.personas);
    y = seccion(doc, y, `${gr.titulo} (${filas.length})`);
    autoTable(doc, {
      startY: y, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [71, 85, 105] },
      head: [['Nombre', 'Documento', 'Rol', '%', 'Email', 'Estado']],
      body: filas.length ? filas : [['Sin datos', '', '', '', '', '']],
    });
    y = finY(doc, y);

    // El conteo declarado por Admin contra los efectivamente cargados: si no
    // cuadran, Admin está incompleto.
    if (gr.titulo.includes('Representantes')
        && g.representantesDeclarados != null
        && g.representantesCargados != null
        && g.representantesDeclarados !== g.representantesCargados) {
      autoTable(doc, {
        startY: y - 6, theme: 'plain', styles: { fontSize: 8, textColor: [180, 83, 9] },
        body: [[`Admin declara ${g.representantesDeclarados} representante(s) pero tiene ${g.representantesCargados} cargado(s).`]],
      });
      y = finY(doc, y);
    }
  }

  // ── 5. Documentos ─────────────────────────────────────────────────────────
  const docs = a.documentos ?? [];
  y = seccion(doc, y, `5 · Documentos (${docs.length}, ${docs.filter(d => d.analizado).length} analizados)`);
  autoTable(doc, {
    startY: y, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [71, 85, 105] },
    head: [['Documento', 'Slot', 'Estado', 'Fecha', 'Analizado']],
    body: docs.length
      ? docs.map(d => [d.nombre, d.slot ?? '—', d.estado ?? '—', d.fecha ?? '—', d.analizado ? 'Sí' : 'No'])
      : [['Sin documentos', '', '', '', '']],
  });
  y = finY(doc, y);

  // ── 6. Comparativa: Admin · Lens · resultado ──────────────────────────────
  y = seccion(doc, y, '6 · Comparativa — Admin vs Lens vs resultado');
  autoTable(doc, {
    startY: y, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [124, 58, 237] },
    columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 10 }, 2: { cellWidth: 42 }, 3: { cellWidth: 42 }, 4: { cellWidth: 22 } },
    head: [['Componente', 'Peso', 'Admin', 'Lens (documentos)', 'Resultado']],
    body: a.componentes.map(c => [
      c.label,
      String(c.peso),
      c.valorAdmin || '—',
      c.valorLens || '—',
      `${ESTADO_LEGIBLE[c.estado] ?? c.estado}${c.detalle ? `\n${c.detalle}` : ''}`,
    ]),
  });
  y = finY(doc, y);

  // Desglose del porcentaje. La invariante del motor es que las razones suman
  // exactamente la certidumbre, así que el total va impreso para poder chequearlo.
  if (a.razones.length) {
    y = seccion(doc, y, 'Cómo se compone el porcentaje');
    autoTable(doc, {
      startY: y, theme: 'striped', styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [71, 85, 105] },
      head: [['Concepto', 'Aporte', 'Detalle']],
      body: [
        ...a.razones.map(r => [r.concepto, `${r.delta > 0 ? '+' : ''}${r.delta}`, r.detalle ?? '']),
        ['TOTAL', String(a.razones.reduce((s, r) => s + r.delta, 0)), ''],
      ],
    });
    y = finY(doc, y);
  }

  // ── 7. Screening y perfil criminal ────────────────────────────────────────
  y = seccion(doc, y, '7 · Screening y perfil criminal');
  if (!scr) {
    autoTable(doc, {
      startY: y, theme: 'plain', styles: { fontSize: 8 },
      body: [['Sin screening en esta corrida. Ausencia de screening NO es ausencia de hallazgos.']],
    });
    y = finY(doc, y);
  } else {
    autoTable(doc, {
      startY: y, theme: 'plain', styles: { fontSize: 8, cellPadding: 1 },
      body: [
        ['Sugerencia del motor (Chile)', scr.sugerenciaGlobal || '—'],
        ['Consultados', `${scr.totalConsultados}  ·  sin coincidencias ${scr.sinCoincidencias}  ·  con coincidencias ${scr.conCoincidencias}  ·  errores ${scr.conError}  ·  sin documento ${scr.sinDocumento}`],
        ['PEP', String(scr.peps)],
        ['Categorías sensibles', scr.categoriasSensibles.length ? scr.categoriasSensibles.join(', ') : '—'],
        [
          'Conclusión',
          scr.limpioVerificado
            ? 'La empresa y sus relacionados pasaron screening y NO arrojaron coincidencias.'
            : 'NO se puede afirmar que esté limpio: hay hallazgos, errores del proveedor o sujetos sin documento.',
        ],
      ],
      columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } },
    });
    y = finY(doc, y);

    autoTable(doc, {
      startY: y, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [124, 58, 237] },
      head: [['Tipo', 'Nombre', 'Documento', 'Resultado', 'Delitos', 'PEP', 'Sugerencia del motor']],
      body: scr.sujetos.map(s => [
        s.tipo,
        s.nombre,
        s.documento || '—',
        `${ESTADO_SCREENING[s.estado] ?? s.estado}${s.mensaje ? `\n${s.mensaje}` : ''}`,
        s.delitosUnicos ? `${s.delitosUnicos}\n${s.delitos.map(d => d.tipo).join(', ')}` : '0',
        s.pep ? 'Sí' : 'No',
        `${s.sugerencia ?? '—'}${s.razon ? `\n${s.razon}` : ''}`,
      ]),
    });
    y = finY(doc, y);

    // Otras listas: coincidencias fuera de causas penales y PEP.
    const otras = scr.sujetos.filter(s => s.otrasListas.length);
    if (otras.length) {
      y = seccion(doc, y, 'Coincidencias en otras listas');
      autoTable(doc, {
        startY: y, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [71, 85, 105] },
        head: [['Sujeto', 'Listas']],
        body: otras.map(s => [s.nombre, s.otrasListas.join(', ')]),
      });
      y = finY(doc, y);
    }
  }

  // ── 8. Alertas ────────────────────────────────────────────────────────────
  const evaluables = a.alertas.filter(al => al.evaluable);
  const noEvaluables = a.alertas.filter(al => !al.evaluable);
  y = seccion(doc, y, `8 · Alertas (${evaluables.length} evaluadas, ${noEvaluables.length} no evaluables)`);
  autoTable(doc, {
    startY: y, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [124, 58, 237] },
    head: [['Código', 'Alerta', 'Severidad', 'Estado', 'Detalle']],
    body: evaluables.length
      ? evaluables.map(al => [al.codigo, al.label, al.severidad, al.estado, al.detalle ?? ''])
      : [['—', 'Ninguna alerta evaluable se activó', '', '', '']],
  });
  y = finY(doc, y);

  // Las no evaluables van igual: si no se listan, parece que no hay hallazgos
  // cuando en realidad no se pudieron mirar.
  if (noEvaluables.length) {
    y = seccion(doc, y, 'Alertas que hoy NO se pueden evaluar');
    autoTable(doc, {
      startY: y, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [148, 163, 184] },
      head: [['Código', 'Alerta', 'Qué falta para evaluarla']],
      body: noEvaluables.map(al => [al.codigo, al.label, al.faltante ?? '—']),
    });
    y = finY(doc, y);
  }

  // ── 9. Decisión ───────────────────────────────────────────────────────────
  y = seccion(doc, y, '9 · Decisión');
  const d = empresa.decision;
  autoTable(doc, {
    startY: y, theme: 'plain', styles: { fontSize: 8, cellPadding: 1 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: 'bold' } },
    body: d
      ? [
          ['Decisión', d.tipo],
          ['Motivo', d.reasonCode ?? '—'],
          ['Comentario', d.comentario ?? '—'],
          ['Decidió', `${d.actorNombre} (${d.actorTipo}${d.automatica ? ', automática' : ''})`],
          ['Fecha', new Date(d.decididaEn).toLocaleString('es-CL')],
          ['Aprobación', d.aprobacion ? `${d.aprobacion.estado}${d.aprobacion.checkerNombre ? ` · ${d.aprobacion.checkerNombre}` : ''}` : 'no requiere'],
        ]
      : [['Estado', 'Sin decisión registrada']],
  });

  // Pie con numeración: un PDF de compliance suelto sin paginar no sirve.
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7).setTextColor(140);
    doc.text(
      `Lens AI · Ficha KYB ${empresa.companyId} · run ${a.runId} · página ${i} de ${total}`,
      14, doc.internal.pageSize.getHeight() - 8,
    );
  }

  const slug = (empresa.razonSocial || empresa.companyId).replace(/[^\w]+/g, '_').slice(0, 40);
  doc.save(`KYB_${slug}_${empresa.companyId}.pdf`);
}
