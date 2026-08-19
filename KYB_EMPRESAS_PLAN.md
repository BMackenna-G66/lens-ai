# Cola de trabajo KYC de Empresas (KYB) — Plan de integración

> Cerrar las etapas 5, 6 y 7 del proceso Lens vs Admin: alertas, decisión y resultado registrado.
> Las etapas 1 a 4 ya están construidas. Este documento sólo especifica **trabajo neto nuevo**;
> todo lo que ya existe se declara en §1 y no se vuelve a describir en las fases.
>
> Referencia del módulo de colas actual: [`COLAS_TRABAJO_ARQUITECTURA.md`](COLAS_TRABAJO_ARQUITECTURA.md)

---

## 0. Qué se construye

Una cola donde una empresa entra, se analiza contra sus documentos y contra Admin, se comparan
**12 componentes** campo a campo, se produce un **porcentaje de certidumbre explicable**, y un
analista decide entre **Aprobar · Rechazar · Falta información · Apetito de riesgo · Institucional**
con trazabilidad completa.

**Decisiones cerradas** (no re-litigar):

| | |
|---|---|
| Ubicación | Módulo nuevo dentro de `lens---ai` |
| Colección | `kyb_empresas`, doc id = `companyId` de Admin |
| Ingesta | Tres vías: encolado manual (v1), barrido de Admin (v2), Salesforce (v2) |
| Automatismo | Auto-aprobar y auto-rechazar por umbral, toggles independientes, **apagados por defecto** |
| Salida | Tres canales: registro en Lens, escritura en Admin, respuesta en Salesforce |
| Comparación | Determinista en TypeScript. Gemini **extrae**, TypeScript **compara** |

---

## 1. Inventario de reutilización — lo que NO se vuelve a escribir

Esta es la sección que evita duplicar trabajo. Nada de lo listado acá aparece como tarea en las
fases, salvo la acción indicada en la última columna.

### 1.1 Se usa tal cual — sin tocar

| Pieza | Archivo | Qué aporta |
|---|---|---|
| Workflow del caso | `services/caseWorkflowService.ts` | tomar · liberar · asignar · cambiar estado y prioridad |
| Investigación versionada | `services/caseInvestigationService.ts` | hallazgos con versionado optimista |
| Respuesta a Salesforce | `services/caseResolutionService.ts` → `salesforceCaseService.ts` | idempotencia por hash FNV-1a |
| Mantenedor de campos SF | `services/salesforceCaseFields.ts` | nombres de API y picklists; el form se genera solo |
| Freno duro de delitos | `services/delitosSensibles.ts` | 5 categorías regex, no configurable |
| Prioridad preliminar | `services/casePriority.ts` | función pura |
| Contrato de screening | `services/screeningNormalizer.ts` | screening → alertas |
| Espejo analítico | `services/colasLogService.ts` | buffer de reintento en localStorage |
| Notificaciones | `services/notificacionesService.ts` | campanita in-app |
| PDF | `services/pdfGenerator.ts` | generación de ficha |
| Pipeline Lens | `services/batchProcessor.ts`, `geminiService.ts`, `fileProcessorService.ts`, `workers/ocrWorker.ts` | OCR + extracción + enrichment |
| Conexión a Admin | `services/empresaDocsClient.ts`, `empresaDocsAuth.ts` | búsqueda, ficha, presigned, descarga en cascada |
| Concurrencia acotada | `runPool` en `services/casosCriminalService.ts` | pool con límite |
| Worker — rutas vigentes | `cloudflare/empresadocs-proxy/src/index.ts` | `/relay` · `/salesforce/case-update` · `/salesforce/casos-cola` · `/admin/customer-status` |
| Esquema analítico | `redshift/colas_trabajo/001_schema.sql` | `cierre` y `evento_auditoria` sirven sin cambios |

### 1.2 Se usa como patrón — se copia la forma, no el contenido

| Patrón | Dónde está | Qué se replica |
|---|---|---|
| Config compartida apagada por defecto | `services/flujoAutomaticoService.ts` | `subscribe` + `normalizar` + `guardar` sobre doc de Firestore |
| Motor automático puro con motivos | `services/flujoAutomaticoEngine.ts` | `evaluar(...) → {automatizable, motivo}`; frenos antes del número |
| Consolidación multifuente | `services/lens360Service.ts` | `sources{}` por fuente + `verdictReasons[]` acumulados |
| UI de decisión | `components/CriminalProfiler/TriageView.tsx` | `ACTION_BUTTONS` declarativo, cursor de cola, contador revisados/total |
| Mantenedor como fuente de verdad | `cierreTipos.ts`, `cierreAdminTipos.ts` | un archivo por catálogo, con `id`/`label`/`campos` |
| Invalidación por versión de esquema | `SCREENING_SCHEMA` + `screeningVigente()` en `casosService.ts` | caché que se invalida sola al subir la constante |
| Writer coalescido | `services/casosService.ts` (ventana 1500 ms) | evitar un snapshot por escritura |
| Merge sin pisar trabajo | `importarCasos()` en `salesforceColaService.ts` | whitelist de campos de ingesta |
| Ingesta server-side a Firestore | `aws/casos-receptor/src/app.py` | REST + service account + `updateMask` |
| Job con schedule | `aws/colas-sync/` | SAM + cron + cursor |

### 1.3 Se porta desde `empresa_docs_app.py` — ya está resuelto en Python

La app Flask del Desktop es una implementación probada del mapeo de Admin. **No hay que diseñarlo,
hay que traducirlo.**

| Qué | Origen | Destino |
|---|---|---|
| Normalizador de personas | `fmt_person()` L319-337 | `services/kyb/kybAdminMapper.ts` |
| Dedup por documento normalizado | `_doc_key()` L362 | el mismo archivo — es el primitivo de emparejamiento |
| Consolidación de 4 fuentes de personas | L340-380 | rep. legales · beneficiarios · directorio · usuarios |
| Mapeo de ficha de empresa | L385-420 | `LadoAdminCanonico` |
| Industria anidada | `_extract_industry()` L693 | objeto `{name, industry:{name}}` |

**Campos reales de `/company/bo`, confirmados por ese código:**

```
legalForm · constitutionDate · addressCountry{} · indActivity | nosisActivity | activity
complianceStatus + complianceStatusComment · kycStage1/2/3 + comentarios
riskLevel · riskLevelRegcheq · hasJointAdministration · institutional
estimatedAnnualBillings · monthlyIncome · monthlyExpenses · totalAssets · totalLiabilities
segmentationType · purposeUse · identificationType · identificationNumber
```

**Shape de persona:** `firstName|name` · `lastName|surname` · `email` · `status|state` · `level` ·
`identificationType|docType` · `identificationNumber|docNumber` · `phoneCountryCode`+`phoneNumber` ·
`kycStage1` · `isLegalRepresentative|legalRepresentative` · `role|userType` ·
`nationality|nationalityCode`.

`shareholders` es un **dict `{categoría: [personas]}`** — se itera y la clave se usa como `role`.

### 1.4 Se arregla — bugs y deuda en código existente

| Qué | Dónde | Por qué |
|---|---|---|
| `mergeAlertas` resucita alertas suprimidas | `services/alertDeduplication.ts:24` | `{...prev, ...n}` sobrescribe `estado`. Regresión de compliance |
| 4ª promesa descartada | `services/empresaDocsClient.ts:171-177` | `relationships/{id}` se pide y se tira. Mismo bug en `empresa_docs_app.py:313` |
| 6 llamadas Gemini sin uso | `services/batchProcessor.ts:98-108` | `allSettled` cuyo resultado nadie lee |
| Colección hardcodeada | `caseDecisionService` · `caseAuditService` · `caseStatusService` · `caseWorkflowService` · `caseInvestigationService` | parámetro opcional al final, default `CASOS_COLLECTION` — firmas públicas intactas |
| Cierre atado a 2 canales | `services/caseStatusService.ts:67-72` | generalizar a "todos los canales **requeridos**", con estado `no_aplica` |
| URL del Worker hardcodeada | `services/salesforceColaService.ts:21` | usar `EMPRESADOCS_PROXY_URL` como el resto |

### 1.5 Endpoints de Admin ya documentados y hoy sin llamar

| Endpoint | Para qué |
|---|---|
| `GET /company/bo/relationships/{id}` | malla societaria → componente 10 comparable, destraba DOC_035 |
| `GET /company/bo/onboarding/rejections/reasons?companyId=` | catálogo de razones de rechazo → `reasonCode` de la decisión |
| `GET /route/bo/documents/{país}?entityType=COMPANY` | documentos obligatorios por país → validación del componente 3 |
| `GET /company/bo/industries` | catálogo de industrias → normalización del componente 9 |
| `GET /company/bo/onboarding/terms?companyId=` | T&C aceptados → freno duro nuevo |
| `GET /company/bo/segmentation/{id}`, `/purposes/selected-company` | contexto de riesgo |

---

## 2. Trabajo neto nuevo

Todo lo que no está en §1. Es la lista corta:

**Motores puros** — `kybNormalizadores` · `kybComparador` · `kybCertaintyEngine` · `flujoKybEngine`
**Catálogos** — `kybAlertasCatalogo` (36) · `kybTipologias` · `kybRazonesRechazo` · `kybCertaintyConfig`
**Tipos** — `types/kyb.ts` · `types/kybCanonico.ts` · `types/kybMatriz.ts`
**Servicios de datos** — `kybQueueService` · `kybIngestaService` · `kybAnalysisService` · `kybAdminMapper`
**UI** — `components/KybQueue/*` + primitivos nuevos en `components/ui/*`
**Infra** — rutas `/admin/company-sweep` y `/admin/company-status` en el Worker · `aws/kyb-sweep/` ·
`redshift/colas_trabajo/005_kyb.sql` · entradas en la whitelist `TABLAS` de `aws/colas-logger`

---

## 3. Fases

### Fase 0 — Habilitación · sin comportamiento nuevo

Todo aditivo. Al terminar, las colas OFAC y Remesa funcionan idénticas.

- Aplicar los seis arreglos de §1.4.
- Ampliar `TipoCasoCompliance` con `'KYB'` y `TipoEventoAuditoria` con los eventos de esta cola.
  **No ampliar `TipoDecision`** — se usa una union propia `TipoDecisionKyb` para no arrastrar los
  switches exhaustivos de `CasosInbox.tsx`.
- Extender `requiereAprobacion()`: exigen checker `RECHAZAR`, `APETITO_RIESGO`, `INSTITUCIONAL` y
  **todo lo automático**.
- Cablear los seis GET de §1.5 en `empresaDocsClient.ts` y tipar sus respuestas.
- Capturar en DevTools la request de guardado del modal "Información de compliance de la empresa".
- Confirmar contra una respuesta cruda si existen **capital social** y **% de participación
  accionaria** — hoy ninguno aparece mapeado.

**Verificación:** `npx tsc --noEmit` · abrir la Bandeja de Casos y cerrar un caso por ambos canales.

### Fase 1 — Tipos, mapeo de Admin y persistencia

- `types/kyb.ts`, `types/kybCanonico.ts`, `types/kybMatriz.ts`.
- `services/kyb/kybAdminMapper.ts` — **el port de §1.3**.
- `services/kyb/kybQueueService.ts` — suscripción con `where` + `limit` reales (no repetir el
  `subscribeCasos` que lee la colección entera). Índice compuesto `enCola ASC, recibidoEn DESC`.
- Doc padre liviano + subcolección `kyb_empresas/{companyId}/analisis/{runId}` — **Firestore topa en
  1 MiB por documento** y el bloque completo no cabe. El `rawText` del OCR no se persiste; el PDF se
  regenera.

**Verificación:** `npx tsc --noEmit` · encolar una empresa a mano desde consola y verificar el doc.

### Fase 2 — Comparador, certidumbre y alertas · el núcleo

Tres motores puros, sin I/O.

**`kybNormalizadores.ts`** — RUT con validación de módulo 11 · razón social sin sufijos societarios ·
montos con moneda y tolerancia relativa · direcciones con sinónimos de vía → huella ·
fechas multiformato. Reutiliza `normalizarTexto` (`casosComplianceMapper.ts:15`), `nameSimilarity`
y sus cortes calibrados (`colombiaCriminalModel.ts:163` + `CRIMINAL_CONFIG_DEFAULT.identity`), y
`mesesDesde` (`validationRules.ts`).

**`kybComparador.ts`** — 12 comparadores + `emparejarPersonas` (greedy: documento exacto primero,
similitud de nombre después). Estados: `COINCIDE · PARCIAL · DISCREPA · SOLO_LENS · SOLO_ADMIN ·
SIN_DATOS`. Los de fuente única se **validan**, no se comparan.

**`kybCertaintyEngine.ts`** — denominador **fijo en 100**. Factores: `COINCIDE` 1.00 · `PARCIAL` 0.60 ·
`SOLO_*` 0.35 · `DISCREPA` y `SIN_DATOS` 0.00 con el peso en el denominador. Penalización por
alertas: crítica −25 (tope −60), preventiva −8/−5/−3 (tope −24), informativa 0; tope global −70.
Invariante: `razones.reduce((s,r) => s + r.delta, 0) === certidumbre`.

**`kybAlertasCatalogo.ts`** — las 36 con predicado puro. Las bloqueadas van igual con
`evaluable:false` y `faltante` poblado, para que el inventario sea 36 de 36.

**Extracción canónica** — `GEMINI_KYB_EXTRACCION_PROMPT` con `responseSchema` y enums forzados,
para las cuatro cosas que ningún regex resuelve: facultades, accionistas con `participacionPct`
numérico, malla multinivel, y objeto social → actividades. Se elimina `analyzeAdminComparison`.
Neto: **de 8 llamadas Gemini por empresa a 3**.

**Verificación:** script temporal en el scratchpad contra 3 empresas ya analizadas; contrastar la
matriz con el PDF que hoy genera el Analizador Batch para las mismas.

> ⚠️ **Dependencia:** los 12 componentes y sus pesos son definición de negocio. Si no están firmados
> antes de esta fase, la matriz y el porcentaje churnean y arrastran la UI detrás.

### Fase 3 — Módulo y UI · **corte v1**

Registro en cuatro lugares: `Suite` en `App.tsx:21` · `ModulePermissions` en
`firestoreService.ts:26` **como campo opcional** (un módulo ausente se considera habilitado) ·
`ModuleKey`/`MODULOS`/`MODULOS_DEFAULT` en `AdminModule.tsx:27` · el launcher.

`components/KybQueue/` — ningún archivo por encima de ~350 líneas, ningún componente hace fetch.
Cola · filtros · ficha · matriz de 12 · panel de alertas · panel de decisión · panel de salidas.

Primitivos nuevos en `components/ui/`: `Badge` · `SortableTh` · `DrawerModal` · `ConfirmButton`, y
`FiltroCombo` **copiado** de `CasosInbox.tsx:136`.

> **Criterio de aceptación: la v1 no toca `CasosInbox.tsx`.** Refactorizar un monolito de 3225
> líneas en producción sin test runner no es parte de este trabajo. La convergencia del
> `FiltroCombo` compartido queda para después.

Análisis on-demand al abrir la ficha, más "analizar seleccionados" con **concurrencia 2** (cada
empresa son N descargas + OCR CPU-bound + varias llamadas a Gemini). Caché invalidado por hash de
documentos: si el cliente sube uno nuevo, el análisis se marca desactualizado. Sin API key el item
queda "sin analizar" y muestra `—`, **nunca `0%`**.

Decisión: los 5 botones llaman a `caseDecisionService` con `reasonCode` del catálogo de Admin.

**Verificación:** `npm run dev` → encolar → analizar → revisar matriz → decidir → **recargar la
página y confirmar que todo sigue ahí**. Es exactamente lo que hoy se pierde.

### Fase 4 — Ingesta automática

Barrido: primero ruta `GET /admin/company-sweep?...&dryRun=1` en el Worker (pass-through con
allowlist de params, para descubrir los nombres de filtro sin redesplegar el cliente). Después
`aws/kyb-sweep/` con schedule, SSM, cursor y topes.

Salesforce: **pull primero** por la ruta que ya existe — cero dependencia externa. El push queda
para cuando SF exponga el Company ID.

Reapertura de ciclo: si cambia el `kycEstado` de un item cerrado, **no se reabre solo** — se marca
`reingresoPendiente` y se notifica.

### Fase 5 — Trazabilidad y automatismo

`redshift/colas_trabajo/005_kyb.sql` — incluye una fila **por componente por corrida**: es lo que
permite responder qué componente falla más seguido y dónde se pierde el tiempo.

> ⚠️ `aws/colas-logger/src/app.py` arma el SQL sólo desde la whitelist `TABLAS` y **descarta en
> silencio** lo que no esté ahí. Sin agregar las tablas nuevas y redesplegar, toda la traza se
> pierde sin un error visible.

`flujoKybEngine` con los cortes en este orden — los frenos duros van **antes** del número:

1. Flujo apagado
2. Dirección apagada (auto-aprobar o auto-rechazar por separado)
3. País no habilitado
4. Ya cerrado
5. Decisión ya registrada
6. **Análisis incompleto** — nunca decidir a ciegas
7. **Delito sensible** en la empresa o en cualquier representante o beneficiario
8. **PEP**
9. **Términos y condiciones pendientes**
10. **Alerta crítica abierta**
11. **Discrepancia de identidad** — razón social, RUT o representante legal
12. Cobertura bajo el mínimo
13. Zona gris entre umbrales
14. Recién acá decide el porcentaje

Los frenos 10 y 11 **frenan las dos direcciones**: una alerta crítica es lo que un humano tiene que
confirmar, y una discrepancia de identidad significa que *los datos* están mal, no la empresa.

El auto-rechazo no necesita lógica de control nueva: se registra con actor `system`, queda
`PENDIENTE_APROBACION`, y `resolverAprobacion` rechaza a quien tenga el mismo uid que el maker. El
sistema no puede aprobar su propia decisión. El auto-**aprobar** sí queda final — asimetría
deliberada.

> **Requisito de proceso:** modo simulación durante N días antes de prender nada. Un falso
> auto-aprobar en KYC de empresas es un incidente regulatorio, no un bug.

---

## 4. Bloqueos

| Bloqueo | Estado | Mitigación |
|---|---|---|
| Endpoint de escritura de compliance de **empresa** | Abierto. La doc del módulo declara 13 GET y 1 POST (una lectura); el modal dice "Guardar" sin nombrar la request | v1 en **modo manual**: bloque para copiar + deep link + "confirmo que lo apliqué". El item igual llega a CERRADO |
| 12 componentes y pesos | Definición de negocio pendiente | Bloquea la Fase 2 |
| Catálogo de actividades sensibles | No existe en el repo | Únicas 2 alertas que quedan sin evaluar |
| Parámetros de filtro del listado | Sin confirmar | Pass-through en el Worker |
| Picklists de Salesforce para KYB | Los actuales son OFAC/remesa | Canal SF en manual mientras tanto |
| Sin `firestore.rules` en el repo | Los toggles serían escribibles por cualquiera con la clave pública | Confirmar fuera del repo antes de Fase 5 |
| Sin Admin fuera de producción | Toda prueba de escritura es contra prod | Empresa de test controlada + responsable que firme |
| Sin test runner | Los motores se entregan sin tests en v1 | Evaluar `vitest` |
| Capital social y % de participación | No aparecen mapeados | Confirmar en Fase 0; si no existen, capital baja a fuente única |

**Deuda de seguridad heredada:** hay un refresh token de producción hardcodeado en
`services/empresaDocsAuth.ts:18`, commiteado y dentro del bundle público. Este módulo **no debe
colgar de ahí** — barrido y escrituras van por Worker o Lambda con el secret server-side. Rotarlo
es una tarea con dueño propio. Igual aplica a las credenciales de Inspektor en
`services/casosCriminalService.ts:15-16`.

---

## 5. Verificación transversal

```bash
npx tsc --noEmit
```
```bash
npm run build
```

No hay script de typecheck ni test runner en `package.json` — sólo `dev`, `build` y `preview`. El
compilador con `strict`, `noUnusedLocals` y `noUnusedParameters` es la única red automática.

Prueba manual obligatoria en cada fase: la Bandeja de Casos existente sigue funcionando sin cambios
de comportamiento.

---

## 6. Estado de las 36 alertas

| | |
|---|---|
| Evaluables con datos que ya existen | 21 |
| Que habilita la matriz | +4 |
| Que habilita la extracción canónica | +6 |
| Que habilitan los campos reales de Admin y la malla | +3 |
| **Total** | **34 de 36** |
| Bloqueadas | 2 — `DOC_005` y `DOC_006`, ambas por el catálogo de actividades sensibles |
