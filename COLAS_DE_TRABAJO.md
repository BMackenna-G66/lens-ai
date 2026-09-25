# Colas de trabajo de Lens — cómo funcionan hoy

> **Para qué sirve este documento.** Describe el estado real del sistema al
> 22-09-2026, con el nivel de detalle necesario para **reemplazar el backend**
> (ingesta, cierres en Salesforce y Admin, flujo automático, persistencia)
> conservando el front de la Bandeja de Casos.
>
> Está escrito desde el código, no desde el diseño. Donde hay una trampa
> conocida está marcada con ⚠️ y con la fecha en que se midió: esas son las que
> cuestan caras si se reimplementan sin saberlas.

---

## 1. Qué son las colas

Salesforce genera casos de compliance que alguien tiene que resolver. Lens los
recibe, los enriquece con screening de listas, y los cierra en los dos sistemas
donde el cierre tiene efecto: **Salesforce** (el caso) y **Admin**
(`api.global66.com` — el cliente o la transacción).

Hay **tres colas**, y la clasificación sale del **asunto** del caso:

| Cola | Condición sobre el asunto | Qué se decide |
|---|---|---|
| `ofac` | asunto == `"Coincidencia OFAC"` (exacto, sin distinguir mayúsculas) | Qué pasa con el **cliente**: se libera, se deja en revisión o se bloquea |
| `remesa` | el asunto matchea `/DETIENE\s+TX/i` | Qué pasa con **una transacción**: se libera o se rechaza |
| `otros` | todo lo demás | Nada automatizado; queda a la vista |

`services/flujoDecision.ts` → `clasificarCola()`

⚠️ **Las colas no se mezclan y la regla es de negocio, no de presentación.** Si
un caso de remesa entrara al flujo de OFAC se cerraría con la tipología
equivocada. Por eso la función vive en el módulo compartido y no en la UI.

El número de transacción también sale del asunto: `/TX\s*(\d+)/i` →
`extraerRemesa()`.

---

## 2. Ingesta: de dónde salen los casos

Hay **dos** caminos de entrada y los dos escriben en la misma colección.

### 2.1 El receptor (principal)

```
Salesforce ──POST──> Lambda casos-receptor ──REST──> Firestore casos_sf
                     (Function URL, header x-api-secret)
```

- `aws/casos-receptor/src/app.py` (Python, ~240 líneas)
- Acepta un objeto o un array de objetos. Todos los campos son opcionales.
- El **id del documento** es el número de caso con `/` → `-`.
- Promueve a nivel superior cuatro campos y guarda el payload completo bajo
  `datos`:

| Campo del payload | Campo del documento |
|---|---|
| `Número del caso` | `numeroCaso` |
| `Asunto` | `asunto` |
| `Nombre de la cuenta` | `nombreCuenta` |
| `País` | `pais` |

- Escribe además `recibidoEn` (ISO, **momento de la ingesta**), `origen:
  "salesforce"` y, **solo si el documento no existía**, `statusCaso: "ABIERTO"`.
- ⚠️ **Nunca loguea el payload completo**: trae DNI y datos personales.

### 2.2 El import desde la app

Botón «Traer a la Bandeja». `services/salesforceColaService.ts` →
`importarCasos()`. Lee casos desde Salesforce vía el Worker
(`/salesforce/casos-cola`) y los escribe con `merge: true`.

⚠️ **Acá `recibidoEn` es la fecha de creación en Salesforce, no la de ahora** —
a propósito, para que la cola quede ordenada por antigüedad real. Consecuencia
no obvia: *el máximo `recibidoEn` de la colección no sirve como señal de "llegó
algo nuevo"*. Un caso creado ayer e importado hoy no mueve ese máximo.

⚠️ `statusCaso` se escribe **solo en los casos nuevos**. Escribirlo en los
existentes pisaría un `CERRADO`. Medido: 156 casos importados sin ese campo
quedaron invisibles para la consulta acotada y el flujo corrió sobre una cola
vacía sin avisar.

---

## 3. El modelo de datos

Colección **`casos_sf`** (Firestore). Un documento por caso. ~4.200 documentos
al 22-09-2026.

```ts
{
  numeroCaso: string        // "02646256" — ⚠️ con ceros a la izquierda, ancho 8
  asunto: string            // decide la cola
  nombreCuenta: string
  pais: string
  recibidoEn: string        // ISO
  origen: string            // "salesforce"
  datos: { ... }            // payload completo de Salesforce, tal cual llegó

  // ── Estado operativo ──
  statusCaso: 'ABIERTO' | 'GESTIONANDO' | 'CERRADO'
  estadoCaso?: string       // máquina de estados propia (§18 del diseño viejo)
  prioridad?: string        // CRITICA | ALTA | MEDIA | BAJA
  asignacion?: { analistaId, analistaNombre, asignadoEn, asignadoPor }
  versionCaso?: number

  // ── Cierres, uno por canal ──
  cierres?: {
    sf?:    { ok, en, tipologia, detalle }
    admin?: { ok, en, tipologia, detalle }
  }

  // ── Freno manual ──
  standby?: { activo: boolean, motivo: string, por: string, en: string }

  // ── Cachés (para no re-consultar ni re-pagar) ──
  screening?: { ... }               // cola OFAC: screening del CLIENTE
  screeningBeneficiario?: { ... }   // cola remesa: screening del BENEFICIARIO
  remesaRow?: { ... }               // fila de la TX traída de Redshift
  respuestaSalesforce?: { estado, idempotencyKey, intentos, ... }
}
```

### 3.1 Cómo se deriva el estado

`statusCaso` es **persistido pero también derivable**, y esa dualidad es fuente
de errores:

- `statusDeCaso(caso)` — para **leer**. Da prioridad al campo guardado; solo
  deriva si falta.
- `statusTrasCierre(cierres, previo, tieneAnalista)` — para **escribir después
  de cerrar**. Acá los canales mandan sobre el valor guardado.

⚠️ Usar la primera al escribir dejó **54 casos con los dos canales cerrados
marcados como ABIERTO**, reprocesándose en cada corrida e inflando el conteo de
cerrados.

Regla: **CERRADO = los dos canales en ok**. Un cierre a medias queda en
`GESTIONANDO` y sigue a la vista, que es lo correcto: es plata o un cliente en
un estado intermedio.

### 3.2 Otras colecciones

| Colección / documento | Qué guarda |
|---|---|
| `config/flujoAutomatico` | Switches del flujo automático |
| `config/whitelistClientes` + `_000`, `_001`… | Whitelist de clientes (cabecera + partes) |
| `config/flujoAutonomoLatido` | Último latido del proceso desatendido |
| `config/flujoAutonomoLock` | Candado de corrida |
| `flujo_autonomo_corridas` | Una traza por corrida del flujo |
| (subcolección del caso) | Auditoría por caso — `caseAuditService.ts` |

---

## 4. El cierre: dos canales

Cerrar un caso son **dos operaciones independientes** que pueden fallar por
separado. Ninguna es transaccional respecto de la otra.

```
                  ┌─────────────────────────────┐
   CASO ──────────┤  Canal SF: cierra el caso   │──> Salesforce
                  ├─────────────────────────────┤
                  │  Canal Admin: 5 pasos       │──> api.global66.com
                  └─────────────────────────────┘                 └─> ms-customer
```

Todo pasa por **un solo Worker de Cloudflare** —
`cloudflare/empresadocs-proxy` — que es la única costura con los sistemas de
Global66. Ahí están las credenciales; el navegador nunca las ve.

### 4.1 Endpoints del Worker

| Ruta | Método | Para qué |
|---|---|---|
| `/salesforce/casos-cola` | GET | Traer casos desde Salesforce |
| `/salesforce/case-update` | POST | **Cerrar el caso en Salesforce** |
| `/admin/customer-status` | POST | **Cierre en Admin del CLIENTE** (los 5 pasos) |
| `/admin/transaction-status` | POST | **Liberar/rechazar la TRANSACCIÓN** |
| `/admin/compliance-historial` | GET | Diagnóstico de solo lectura del paso 2 |
| `/admin/company-sweep` | GET | Barrido de empresas (KYB) |
| `/colas/log` | POST | Espejo a Redshift |
| `/flujo/cron`, `/flujo/correr` | POST | Prender/apagar y disparar el flujo |
| `/regcheq/sii` | POST | SII vía Regcheq |
| `/relay` | POST | Relay genérico |

⚠️ El case-update apunta a **producción** (`global66.my.salesforce.com`). Antes
iba a un sandbox y devolvía `CASE_NOT_FOUND`.

### 4.2 Canal Salesforce

`POST /salesforce/case-update` con el payload que arma `camposDeCierre(tipo, pais)`.

Campos que se envían:

| Campo | Ejemplo |
|---|---|
| `CaseNumber` | `"02646256"` |
| `C_Review__c` | `OFAC` / `PEP` / `Beneficiario` |
| `C_Status__c` | `Approved` / `Fully Blocked` / `Requested` / `Rejected` |
| `Status` | `Closed` |
| `Product__c` | `Cuenta G66` / `Transactions` |
| `Country__c` | del país del caso |
| `CAT_CMPL__c` | solo en algunas tipologías; ausente = sin cambio |
| `Comments` | texto fijo por tipología |

⚠️ **Los picklists reciben el VALUE, no el label.** Dos que difieren:

| Label que se ve en Salesforce | Value que hay que mandar |
|---|---|
| `Transacciones Bot` | `Beneficiario` |
| `💸 Transferencias` | `Transactions` |

Mandar el label devuelve `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST`.

⚠️ **El número de caso lleva ceros a la izquierda** (ancho 8). Si la integración
manda `2646256` en vez de `02646256`, el update falla con `CASE_NOT_FOUND`.
`normalizeCaseNumber()` lo recompone.

**Idempotencia** (`services/caseResolutionService.ts`): antes de enviar, una
transacción en Firestore sobre el propio caso:

- `respuestaSalesforce.estado === 'ENVIADA'` con la misma firma del payload → no
  se reenvía.
- `ENVIANDO` → hay un envío en curso… **con vencimiento a los 15 minutos**.
  ⚠️ Sin ese vencimiento, un envío cortado a la mitad (pestaña cerrada, red
  caída) dejaba el caso trabado **para siempre**: no se podía cerrar ni a mano.

La firma es un hash FNV-1a de `caseId + payload`.

### 4.3 Canal Admin — el cliente (cola OFAC)

`POST /admin/customer-status`. Autenticación: `POST
/admin/refresh-token` con un refresh token guardado como secreto del Worker →
`idToken` → header `Authorization`.

**Cinco pasos, en orden:**

| # | Paso | Método y ruta | Cuándo corre |
|---|---|---|---|
| 1 | Blacklist / OFAC | `POST /customer/bo/customer-info/{id}/blacklist` | siempre |
| 2 | **Estado de compliance** | ver §4.4 | siempre |
| 3 | PEP | `GET /customer/bo/customer-info/{id}` → `PUT …/pep/{pepId}` | solo si la tipología define `pepValue` |
| 4 | Risk Level | `PUT /customer/bo/customer-info/{id}/customer` | solo si la tipología define `riskLevel` |
| 5 | Last-step | `GET /customer/bo/{id}/{countryCode}/last-step` | solo si el estado final lo requiere |

⚠️ El **paso 3** necesita el `pepId` del KYC principal (`isMain === true`). No
está en el body: hay que ir a buscarlo.

⚠️ El **paso 5** se decide por el **estado final real**, no por el que se pidió.
Solo corre si el cliente quedó en `NORMAL`, `UNDER_COMPLIANCE_REVIEW` o
`UNDER_COMPLIANCE_REVIEW_2`.

### 4.4 El paso 2 y el modelo nuevo de ms-customer

**Es el único paso migrado.** Los otros cuatro siguen en `api.global66.com`.
Switch de vuelta atrás: la variable `MODELO_ADMIN` del Worker (`anterior` |
`nuevo`). No es un revert, es una variable.

**El cambio conceptual, y es el más importante del documento:**

> Admin ya **no "pone un estado"**. Se **crea** un registro de bloqueo o se
> **resuelven** los vigentes, y el estado efectivo del cliente lo **deriva el
> servicio** como el más restrictivo entre los no resueltos.

O sea: **el `status` que se manda no es un pedido, es a lo sumo una predicción.
Lo que manda es el `comment`.**

Rutas (carpeta **BO**, no `Iuse` — probado: Iuse no está publicada hacia
internet):

```
POST   /customer/bo/compliance                       → crear
PATCH  /customer/bo/compliance/{complianceId}/resolve → resolver (uno por llamada)
GET    /customer/bo/compliance/customers/{id}/history → listar
```

Acciones posibles por tipología: `resolver`, `crear`, `crear_y_resolver`.

⚠️ **Trampas medidas contra producción (17 y 18-09-2026):**

1. Resolver es **por `complianceId`, uno por llamada**. Hay que listar primero.
2. El campo real del historial es **`isResolved`**, no `resolved`.
3. El duplicado se detecta **del historial**, no del error: la respuesta real es
   un `CUSTOMER_COMPLIANCE_INVALID` genérico que también cubre
   `COMMENT_NOT_FOUND`.
4. **No mandar `Claim-Email`**: el gateway lo inyecta y mandarlo **concatena** el
   actor (`"benjamin...,benjamin..."`).
5. `observation` admite **solo letras, números y espacios**.
6. El actor sale del **token**, no del body. Para que quede otro usuario hace
   falta el refresh token de *ese* usuario.
7. Al crear-y-resolver hay que **excluir del resolve el registro recién creado**
   — por id *y* por comment. Si no, el segundo cierre resuelve el bloqueo propio.

**Catálogo de comments verificado (producción, 78 filas, AR-12755):**

| comment | id | estado que produce | área |
|---|---|---|---|
| `NORMAL` | 1 | NORMAL | — |
| `OTHER_BLOCKED` | 4 | BLOCKED | — |
| `OTHER_FULLY_BLOCKED` | 5 | FULLY_BLOCKED | — |
| `NO_COMMENTS` | 15 | BLOCKED | ACCOUNT |
| `UCR_CRIMINAL_RISK` | 32 | UNDER_COMPLIANCE_REVIEW | COMPLIANCE |
| `PEP_REQUEST` | 38 | BLOCKED | COMPLIANCE |
| `COMPLIANCE_OFFICER_REQUEST` | 40 | BLOCKED | COMPLIANCE |
| `OFAC_CONFIRMED` | 46 | FULLY_BLOCKED | COMPLIANCE |
| `BLACK_LIST_G66` | 53 | FULLY_BLOCKED | COMPLIANCE |

⚠️ De acá salió un error real: la tipología «Fully blocked» declaraba
`FULLY_BLOCKED` pero su comment `COMPLIANCE_OFFICER_REQUEST` produce `BLOCKED`.
El cliente quedaba **menos bloqueado de lo decidido, sin que fallara nada**.
Para bloqueo total hay que cambiar **las dos cosas**, status *y* comment.

### 4.5 Canal Admin — la transacción (cola remesa)

`POST /admin/transaction-status` con `transactionIds[]`, `targetStatusDB`,
`targetStatusLabel`, `requestedBy`.

| Tipología | statusDB | Label |
|---|---|---|
| Liberar | `DATOS_VERIFICADOS` | Datos verificados |
| Rechazar | `ENVIO_RECHAZADO` | Envío rechazado |

⚠️ **Admin va primero y Salesforce después.** Si Admin falla no tiene sentido
cerrar el caso diciendo que se resolvió. Al revés quedaría el caso cerrado con
la plata retenida, que no se ve.

---

## 5. Tipologías

Son el mantenedor del significado de cada cierre. Cambiar una cambia lo que
pasa en los dos sistemas.

### 5.1 Cola OFAC — `services/cierreTipos.ts` + `cierreAdminTipos.ts`

| id | Label | SF `C_Status__c` | Admin status | Admin comment | acción ms-customer | ofacFlag | last-step |
|---|---|---|---|---|---|---|---|
| `liberar_normal` | Liberar Normal | Approved | `NORMAL` | `NO_COMMENTS` | `resolver` | no | sí |
| `liberar_ucr` | Liberar UCR | Approved | `UNDER_COMPLIANCE_REVIEW` | `UCR_CRIMINAL_RISK` | `crear_y_resolver` | no | sí |
| `fully_blocked` | Bloqueado | Fully Blocked | `BLOCKED` | `COMPLIANCE_OFFICER_REQUEST` | `crear_y_resolver` | **sí** | no |
| `blocked_pep` | Blocked + formulario PEP | Requested | `BLOCKED` | `PEP_REQUEST` | `crear_y_resolver` | no | no |

⚠️ El **id** `fully_blocked` no se cambia aunque el label diga «Bloqueado»:
está referenciado en `flujoDecision.ts`, en `cierreTipos.ts` y en el histórico
de auditoría.

⚠️ `ofacFlag` es **explícito por tipología**, no derivado del status. Antes se
derivaba (`status === 'FULLY_BLOCKED'`) y al bajar la tipología a `BLOCKED` la
marca de blacklist se habría apagado sola, sin que nadie lo pidiera.

⚠️ `blocked_pep` usa `PEP_REQUEST`, **sin verificar contra el volcado del
catálogo**. Si no existiera, no falla ruidosamente: cae al genérico
`OTHER_BLOCKED` y se pierde la distinción en silencio.

### 5.2 Cola Remesa — `services/cierreRemesaTipos.ts`

| id | Label | statusDB | `automatico` |
|---|---|---|---|
| `liberar` | Liberar | `DATOS_VERIFICADOS` | **sí** |
| `rechazar` | Rechazar | `ENVIO_RECHAZADO` | **no** |

⚠️ `automatico: false` en rechazar es **un freno, no una preferencia**. El flujo
desatendido solo decide "este caso no tiene hallazgos"; si rechazar fuera
elegible, cambiar un desplegable haría que el cron rechace en masa todo lo
limpio. Los dos ejecutores lo vuelven a verificar, porque la config vive en
Firestore y se puede editar a mano.

---

## 6. El flujo automático

**Todo lo que decide vive en un único módulo puro: `services/flujoDecision.ts`.**
Lo importan los dos ejecutores: la app (navegador) y el Lambda desatendido.

> Escribir las reglas dos veces es el peor fallo posible de este sistema: las
> copias divergen y el proceso desatendido termina liberando de noche algo que
> la app habría retenido. Mientras sea un solo archivo importado por los dos
> lados, eso no puede pasar.

Ese módulo **no puede** hacer red, tocar Firestore, leer localStorage ni
importar React.

### 6.1 Decisión de OFAC — `evaluarCasoAuto(caso, screening, cfg)`

Orden, y el orden **es parte de la regla**:

1. `standby` → freno manual
2. `!cfg.enabled` → flujo apagado
3. país no habilitado
4. caso ya cerrado
5. **caso asignado a un analista** — quien lo tomó lo cierra
6. **delito sensible** → freno duro (`services/delitosSensibles.ts`)
7. **PEP** → freno duro
8. conclusión del screening → tipología, o `sin_conclusion`

### 6.2 Decisión de Remesa — `evaluarRemesaAuto(caso, screening, cfg, whitelist)`

1. `standby`
2. **whitelist** (ver §7)
3. flujo apagado
4. caso ya cerrado
5. destino del beneficiario no habilitado (`CL` / `CO` / `INTL`)
6. caso asignado
7. **envío a sí mismo** (same person) → libera sin consultar
8. sin screening resuelto, o el proveedor falló
9. sin nacionalidad del beneficiario
10. internacional sin documento (salvo que `intlSinDocumento` esté prendido)
11. **delito sensible** → freno duro
12. **coincidencia en listas de sanciones** → freno duro

**Dos diferencias deliberadas con OFAC**, las dos porque acá se libera una
transacción puntual y no se vincula a un cliente:

- **PEP no retiene** la remesa.
- **Las causas penales no sensibles tampoco.** La cola de remesas tiene un
  apetito de riesgo más amplio: detiene categorías sensibles (tráfico, lavado,
  terrorismo, armas, defraudaciones) y coincidencias en listas, no cualquier
  antecedente.

### 6.3 Envío a sí mismo (same person)

Si el documento del beneficiario es el mismo que el del cliente, no se consulta
a ningún proveedor y se libera. `services/remesaSamePerson.ts`.

Cuatro reglas que lo hacen seguro:

1. Coincidencia **exacta tras normalizar**. Nunca por nombre.
2. Los **dos** documentos tienen que existir y ser plausibles (piso de 7
   caracteres). ⚠️ Dos vacíos son iguales entre sí — ese es el bug que liberaría
   todo lo que no trae documento.
3. **Internacional queda afuera**.
4. Un **switch, apagado por defecto**, que gobierna las dos cosas a la vez:
   saltear el proveedor *y* liberar.

### 6.4 Config — `config/flujoAutomatico`

```ts
{
  ofac:   { enabled, paises: {CL,CO}, cerrarSF, cerrarAdmin,
            tipoLiberarNormal, tipoLiberarUcr, tipoBloquear },
  remesa: { enabled, cerrarSF, cerrarAdmin, tipoLiberar,
            paises: {CL,CO,INTL}, samePerson, intlSinDocumento }
}
```

⚠️ **Un campo ausente no puede habilitar nada.** `enabled` y los países ausentes
⇒ apagados. Los canales y las tipologías sí caen a su default. La normalización
(`normalizarFlujoConfig`) vive en el módulo compartido **por el mismo motivo que
la decisión**: con los `tipo*` ausentes, la app caía a sus defaults y el Lambda a
`''`, así que el Lambda dejaba de liberar — en silencio, porque cada caso salía
`sin_conclusion`, que es un motivo legítimo.

### 6.5 El ejecutor desatendido

`aws/flujo-autonomo` — Lambda Node, cron de EventBridge. **No reimplementa
nada**: importa `screenCaso`, `evaluarCasoAuto`, `camposDeCierre`,
`sendCaseUpdate` y `enviarCierreAdmin` del mismo `services/` que usa la app. El
build los empaqueta con esbuild.

Mecanismos propios:

- **Candado** (`config/flujoAutonomoLock`, TTL 15 min) — una corrida a la vez.
- **Presupuesto de reloj** (13 de los 15 min) — se corta por tiempo, no por
  cantidad. Regcheq tiene mediana ~4 s pero p90 ~47 s y máximo 104 s: "N casos
  por corrida" no acota nada.
- **Relectura de la config entre lotes** — apagar el switch frena la corrida en
  curso, no la siguiente.
- **Sondeo** — antes de leer la cola, dos señales baratas (conteo de documentos
  + versión de la whitelist) deciden si hay algo que hacer.
- **Cortafuegos de cuota** — tope de 10 s a la toma del candado y pausa de 15
  min si Firestore rechaza.
- **Latido** (`config/flujoAutonomoLatido`) — se escribe corra o no, para poder
  distinguir "apagado" de "muerto".

---

## 7. Whitelist de clientes

Lista de clientes que, cuando su remesa cae en la cola, **se liberan solos**.
**Solo aplica a la cola de remesas.**

⚠️ **Perdona todo, sin excepción**: libera aunque haya coincidencia en listas de
sanciones y aunque haya delito sensible. Es una decisión de negocio explícita y
autorizada. Lo único que no pasa por encima son dos frenos que no son de riesgo
sino de coordinación: caso ya cerrado y caso con analista asignado.

- Match por **documento O customerId**, exacto tras sacar puntos y guiones.
  ⚠️ Un RUT cargado sin dígito verificador coincide con **cero**, en silencio.
- Cada entrada guarda **motivo (obligatorio), referencia, autor, fecha** y
  vigencia opcional.
- **Switch propio**, aparte del flujo automático.
- Se guarda **partida**: cabecera + `whitelistClientes_000`, `_001`… como
  documentos **hermanos** dentro de `config`. ⚠️ No subcolección: las reglas de
  seguridad no están en el repo y `match /config/{doc}` no la cubriría; la
  cabecera se guardaría y las partes las rechazaría el servidor, dejando la
  lista prendida y vacía.

---

## 8. Stand by

Freno manual por caso, **en las dos colas**. Frena todo: flujo automático,
whitelist, cierre individual y los cinco caminos de cierre masivo.

⚠️ Es un **campo propio** (`standby`) y no un `statusCaso` nuevo. Un cuarto
valor haría **desaparecer el caso de la cola** — la consulta filtra por
`statusCaso in ['ABIERTO','GESTIONANDO']` — que es lo contrario de lo que se
busca. Además `statusDeCaso` y `statusTrasCierre` derivan esos tres valores de
los canales de cierre y un cuarto los rompe.

---

## 9. Screening

| Cola | Sujeto | Proveedor |
|---|---|---|
| OFAC | el **cliente** | Regcheq (Chile) / Inspektor (Colombia) |
| Remesa | el **beneficiario** | Regcheq (CL e INTL) / Inspektor (CO) |

- El resultado se **cachea en el caso** con una versión de esquema
  (`SCREENING_SCHEMA`). Subirla invalida el caché.
- ⚠️ `screeningVigente()` mira **dos** cosas: la versión **y** que el estado no
  sea `error`. El screening se guarda incluso cuando el proveedor falla, así que
  con solo la versión un fallo contaba como vigente y el caso no se reintentaba
  nunca. Medido: 7 de 9 remesas internacionales congeladas con un error de días.
- ⚠️ La remesa necesita la fila de la transacción desde **Redshift**, y el
  cluster **pausa 18:30–04:00 hora Chile**. En esa ventana el paso se omite con
  un aviso; marcar cada caso como error dejaría decenas de errores por corrida y
  el aviso dejaría de significar algo.
- ⚠️ Regcheq solo busca **por documento**. No hay endpoint por nombre.

---

## 10. Auditoría y espejo a Redshift

Dos registros paralelos:

1. **Firestore** — auditoría por caso (`caseAuditService.ts`), con tipos de
   evento: `CASO_RECIBIDO`, `CASO_ASIGNADO`, `ESTADO_CAMBIADO`, `CIERRE_ADMIN`,
   `CIERRE_ADMIN_REMESA`, `STATUS_CAMBIADO`, `CIERRE_AUTOMATICO`,
   `STANDBY_PUESTO`, `STANDBY_QUITADO`, entre otros.

2. **Redshift** — schema `colas_trabajo`, vía Worker → Lambda `colas-logger`
   (Data API). Tablas: `caso`, `analista`, `evento_auditoria`, `screening`,
   `cierre`, `liberacion_remesa`, y las de KYB (`kyb_empresa`, `kyb_analisis`,
   `kyb_componente`, `kyb_decision`, `kyb_alerta`).

⚠️ El logger arma el SQL **solo desde su whitelist `TABLAS`** y **descarta en
silencio** las columnas que no conoce. Agregar un campo exige desplegar la DDL y
el Lambda juntos.

⚠️ El cluster pausa de noche: los cierres de esa ventana **no llegan solos**.
Hay un botón de sincronización manual que los recupera (idempotente).

---

## 11. Mapa de archivos

### Decisión (puro — lo comparten app y Lambda)
| Archivo | Qué |
|---|---|
| `services/flujoDecision.ts` | **LA decisión**. Config, normalización, clasificación de cola, status, standby |
| `services/whitelistClientes.ts` | Whitelist: tipos, normalización, búsqueda, importación |
| `services/remesaSamePerson.ts` | Envío a sí mismo |
| `services/delitosSensibles.ts` | Categorías que frenan |
| `services/cierreTipos.ts` | Tipologías SF de OFAC |
| `services/cierreAdminTipos.ts` | Tipologías Admin de OFAC |
| `services/cierreRemesaTipos.ts` | Tipologías de remesa |

### Ejecución (con red / Firestore)
| Archivo | Qué |
|---|---|
| `services/caseResolutionService.ts` | Cierre en SF con idempotencia |
| `services/adminCierreService.ts` | Cierre en Admin del cliente |
| `services/remesaAdminService.ts` | Liberación de la transacción |
| `services/caseStatusService.ts` | `registrarCierreCanal` + status |
| `services/caseWorkflowService.ts` | Asignación, estado, prioridad |
| `services/casoStandby.ts` | Poner/quitar el freno |
| `services/flujoAutomaticoEngine.ts` | Ejecutor OFAC |
| `services/flujoRemesaEngine.ts` | Ejecutor remesa |
| `services/casosService.ts` | Lectura de la cola + cachés |
| `services/colasLogService.ts` | Espejo a Redshift |

### Infra
| Ruta | Qué |
|---|---|
| `cloudflare/empresadocs-proxy` | **El Worker**: única costura con SF y Admin |
| `aws/casos-receptor` | Ingesta desde Salesforce |
| `aws/flujo-autonomo` | Ejecutor desatendido |
| `aws/colas-logger` | Espejo a Redshift |

### Front
`components/CasosInbox.tsx` (~4.400 líneas) — la Bandeja completa, y
`components/WhitelistClientes.tsx` — el mantenedor de la lista.

---

## 12. Límites y trampas, en una sola lista

| # | Trampa | Consecuencia si se ignora |
|---|---|---|
| 1 | Cuota de Firestore: **50.000 lecturas/día** (plan Spark) compartidas por **todo** Lens | Al agotarse cae la app entera, no solo la Bandeja. Pasó el 05-09, 20-09, 21-09 y 22-09 |
| 2 | Firestore sin cuota **no falla rápido**: el SDK reintenta con backoff | Invocaciones colgadas ~4,6 min. Medido: ~USD 6,6/día de Lambda quemados sin hacer nada, y **sin un solo error en los logs** |
| 3 | «Ver cerrados» lee la colección completa | ~4.200 lecturas por apertura. Doce aperturas agotan el día |
| 4 | Redshift pausa 18:30–04:00 Chile | Las remesas de esa ventana no se pueden screenear |
| 5 | Picklists de SF: value ≠ label | `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST` |
| 6 | Número de caso con ceros a la izquierda | `CASE_NOT_FOUND` |
| 7 | En ms-customer manda el **comment**, no el status | El cliente queda en otro estado del decidido, **sin error** |
| 8 | `Claim-Email` lo inyecta el gateway | El actor queda concatenado |
| 9 | El caché del screening guarda también los errores | Casos congelados para siempre si solo se mira la versión |
| 10 | Un campo ausente en la config no puede habilitar nada | El Lambda dejaba de liberar en silencio |
| 11 | El id `fully_blocked` está en el histórico | Cambiarlo rompe la auditoría |
| 12 | El logger de Redshift descarta columnas desconocidas **en silencio** | Se pierde el dato sin aviso |

---

## 13. Qué reemplazar y qué no

Si el objetivo es **rehacer el backend conservando el front**:

### Se puede reemplazar entero
- La **persistencia** (`casos_sf` y las colecciones de config) — es lo que hoy
  duele por cuota.
- El **ejecutor desatendido** (`aws/flujo-autonomo`).
- El **espejo a Redshift**.
- La **ingesta** (`aws/casos-receptor`), si el nuevo backend expone su endpoint.

### Conviene NO reescribir
- **`services/flujoDecision.ts` y los módulos de tipologías.** Son puros, no
  dependen de Firestore, y concentran las reglas que costaron sangre. Cualquier
  backend nuevo puede importarlos tal cual. Reescribirlos en otro lenguaje es
  exactamente el riesgo que este diseño evita.
- **El Worker.** Es la costura con SF y Admin, ya tiene las credenciales, los
  reintentos y las trampas resueltas. Un backend nuevo puede seguir llamándolo.

### Lo que hay que reimplementar sí o sí
- La **idempotencia de los cierres** (§4.2). Sin ella se duplican updates a SF.
- El **candado** de una corrida a la vez.
- La **derivación del status** (§3.1) con la distinción leer/escribir.
