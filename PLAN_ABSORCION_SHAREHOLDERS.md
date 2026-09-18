# Plan de construcción — Lens absorbe el procesador de shareholders

Qué hay que programar y generar. Seis fases, en orden, cada una entregable por
su cuenta.

**Contexto:** el `lambda-shareholders-processor` se elimina. Lens pasa a ser el
único extractor, y ms-company hace la misma llamada contra Lens. El contrato de
salida es el `BusinessShareholders` que ya consume hoy.

---

## Regla que gobierna todo el plan

> **Nada de lo que existe puede cambiar de forma. Todo se suma.**

No es una preferencia de estilo: es la única manera de que el proyecto no se
rompa mientras se construye. Concretamente hay **una** cosa que puede romperlo, y
hay que tenerla presente en cada fase:

`constants.ts` es la **fuente de verdad única de los prompts**. La API no tiene
prompts propios — los genera con `scripts/generar_prompts.py` leyendo la SPA, y
`verificar_prompts.py` falla el despliegue si quedaron desincronizados.

**Tocar un prompt existente cambia lo que devuelve la SPA.** El formato
`NOMBRE | DOCUMENTO | DATO` que hoy produce 550 líneas limpias en
`lens.analisis_campo` sale de ahí.

**Por eso el bloque de shareholders se agrega como extracción NUEVA**, con su
propio prompt y su propia salida. Los 18 campos no se tocan.

### La consecuencia: dos llamadas al modelo, no una

| Extracción | Entrada | Produce |
|---|---|---|
| 18 campos (existente) | **texto** (pypdf + Textract) | `analisis_campo`, sin cambios |
| Shareholders (nueva) | **PDF nativo** | `analisis_persona` |

Cuesta una llamada más por análisis. Es el precio de que los 18 campos sigan
produciendo exactamente lo mismo que hoy. Cuando el bloque nuevo esté validado se
puede evaluar converger a una sola llamada multimodal — **no antes**.

---

## Fase 1 — Fundaciones (no toca nada existente)

Todo aditivo: columnas nuevas nullable y tablas nuevas.

### 1.1 `company_id` en `lens.analisis`

Columna nueva, nullable, capturada del POST.

Hoy la única clave para cruzar `lens` con el resto del warehouse es
`rut_sociedad`, **que lo extrae el modelo**. Es una inferencia: si lee mal un
dígito, la empresa se parte en dos. `company_id` viene del llamador y es un hecho.

### 1.2 `lens.analisis_persona` — tabla nueva

Cubre representantes, accionistas directos, indirectos **y la cadena anidada**,
con auto-referencia. Una tabla, no varias.

```
persona_uid          analisis_id|rol|ruta          PK sintética
analisis_id                                        DISTKEY
rol                  representante | accionista_directo | accionista_indirecto
persona_padre_uid    NULL en raíz · uid de la jurídica en los anidados
nivel                0 raíz · 1 detrás de una jurídica
person_type          NATURAL | JURIDICA
nombre_completo      → shareholderName
nombre               → name
apellido             → lastName
documento            → shareholderId
documento_canon      sin puntos ni guiones, mayúscula — clave de cruce
tipo_documento       → identificationType
pais_origen          → countryOfOrigin
participacion_pct    → ownershipPercentage
es_pep               → isPEP   (tres estados: true / false / null)
cargo                solo representante
origen · ejecutado_en · cargado_en
```

**PK sintética obligatoria.** El logger borra por la primera columna: con PK
compuesta, escribir una persona borraría las demás del mismo análisis. Misma
convención que `analisis_campo`.

**Restricciones verificables** que se derivan de la regla de oro del contrato:

- `rol = 'accionista_directo'` ⇒ `person_type = 'NATURAL'`
- `rol = 'accionista_indirecto'` y `nivel = 0` ⇒ `person_type = 'JURIDICA'`
- `nivel = 1` ⇒ `persona_padre_uid IS NOT NULL`

### 1.3 Backfill de `analisis_persona`

Poblar hacia atrás parseando el texto que **ya está guardado** en
`analisis_campo`. No requiere re-analizar ni gastar un token.

Verificado el 10-09-2026: **550 de 550 líneas parsean, cero descartes**. La query
de desdoble está en `LENS_MODELO_DATOS_Y_PERSONAS.md` §3.4.

Los campos que el texto viejo no tiene (`person_type`, `tipo_documento`,
`pais_origen`, `es_pep`, la cadena) quedan `NULL` y se llenan de acá en adelante.

### 1.4 `lens.analisis_actividad` — tabla nueva

`economicActivities[]` es una lista; necesita su tabla. Mismo patrón: PK
sintética `analisis_id|orden`, DISTKEY por `analisis_id`.

### 1.5 Columnas 1:1 en `lens.analisis`

Todas nuevas y nullable:

```
domicilio_pais · domicilio_region · domicilio_ciudad · domicilio_calle
domicilio_numero · domicilio_complemento · domicilio_cp · domicilio_raw
notaria_registro · fecha_constitucion_iso
flag_administracion_conjunta · flag_limites_monto · flag_18a
```

### 1.6 Vista materializada pivoteada

Los 18 campos como columnas, sobre `analisis_campo`. Responde la observación de
tech sobre consultas pesadas **sin romper el formato largo**, que se eligió a
propósito y cuyos motivos siguen en pie.

La tabla larga sigue siendo la fuente de verdad; la vista es para consultar.

### 1.7 Llenar las columnas de costo

`paginas_totales`, `paginas_por_capa`, `paginas_por_ocr`, `tokens_prompt`,
`tokens_salida` están en **0 de 181**.

**Verificar primero:** `lens-api/src/extraccion.py` ya calcula `paginas_por_capa`,
`paginas_por_ocr` y `metodo`. Puede que la ruta de la API ya las llene y el hueco
sea solo de la SPA. `api_solicitud` tiene 0 filas, así que nunca corrió en
producción.

Hay que llenarlo antes de la Fase 2: sin línea base no hay con qué comparar el
costo de la ruta multimodal.

---

## Fase 2 — Ruta multimodal (nueva, en paralelo)

Es la **precondición técnica** de todo lo demás.

Hoy ninguna ruta de Lens le manda el PDF al modelo:

| Camino | Le manda a Gemini |
|---|---|
| SPA | texto (Tesseract.js) |
| `lens-api` | texto (pypdf + Textract) |
| Bot de shareholders | **PDF nativo en base64** |

El `ownershipPercentage` por persona sale de la **estructura de la tabla**, que es
exactamente lo que el OCR destruye. Sin esta fase, el contrato se cumple con
`ownershipPercentage: null` y personas fusionadas.

**Qué construir:** enviar el archivo en base64 con su MIME como parte del request
a Gemini, junto al prompt. Un módulo nuevo, que **no reemplaza** el camino de
texto: convive con él.

Aplica a `.pdf`, `.jpg`, `.jpeg`, `.png`.

---

## Fase 3 — Extracción estructurada de shareholders

### 3.1 Prompt nuevo, aditivo

No toca `GEMINI_PROMPT_TEMPLATE` ni `PREDEFINED_FIELDS`. Se agrega como bloque
propio en `constants.ts`, se regenera con `generar_prompts.py`, y
`verificar_prompts.py` sigue pasando.

Salida forzada a `application/json` con el esquema del contrato.

### 3.2 Vocabulario que hay que trasladar

El prompt del bot homologa explícitamente estas etiquetas como «accionista». Es
lo que hace que funcione en Colombia y **nada de esto existe hoy en Lens**:

```
Accionista · Socio · Asociado · Miembro · Miembro Fundador · Fundador
Aportante · Constituyente · Cooperado · Adherente
Beneficiario (cuando figura como dueño directo)
Columnas TIPO DE ASOCIADO · TIPO DE SOCIO · CALIDAD con valores
  «Fundador», «Activo», «Honorario» ⇒ esa fila es dueño directo
```

Con la prohibición explícita de excluir **ESAL, cooperativas, asociaciones y
fundaciones** por su tipo legal: sus asociados y miembros fundadores son
equivalentes a accionistas para KYC.

### 3.3 La regla de oro

- Persona **NATURAL** en la tabla → `directOwnership[]`
- Persona **JURÍDICA** en la tabla → `indirectShareholders[]` raíz, sin anidar
- Persona **NATURAL** detrás de una jurídica → `indirectShareholders[]` **anidado**

`directOwnership` nunca lleva jurídicas. El `indirectShareholders` raíz nunca
lleva naturales. Las dos claves aparecen siempre, aunque una quede vacía.

Cadena no revelada ⇒ arreglo anidado en `[]`. **Instrucción explícita de no
inventar personas.**

### 3.4 `name` / `lastName` — corregir, no heredar

El ejemplo del propio contrato tiene el bug:

```
shareholderName: "PEREZ GOMEZ ANGELA VIVIANA"
name:     "ANGELA"              ← metió un nombre de pila en el apellido
lastName: "VIVIANA PEREZ GOMEZ"
correcto: name "ANGELA VIVIANA" / lastName "PEREZ GOMEZ"
```

La documentación del bot lo admite: los ejemplos few-shot contradicen la regla de
4 tokens, y con temperatura 0.2 **gana el ejemplo**.

En Colombia el registro va **apellidos primero**, así que el error es
sistemático, no ocasional. Los ejemplos few-shot del prompt nuevo tienen que ser
coherentes con la regla, y hay que incluir al menos un caso en orden registral
colombiano.

### 3.5 Persistencia

Escribir a `lens.analisis_persona`. Los 18 campos siguen yendo a
`analisis_campo` sin cambios.

---

## Fase 4 — Ingesta desde S3

- **Rol IAM** que lea el bucket `g66-company`. `lens-api` no lo tiene hoy; es
  dependencia de infra, no de código.
- **Resolver `folder_path`**: prefijo S3 con paginación completa (soporta más de
  1.000 objetos) y lista explícita de archivos con `head_object`.
- **Filtros de archivo**, los tres del bot, en este orden:
  - nombre empieza con `company_shareholders_document_`
  - extensión en `.pdf` `.jpg` `.jpeg` `.png`
  - máximo 10 MB por archivo
- **Tope de 50 archivos**, con aviso cuando se recorta.
- **Descarga en paralelo**, hasta 10 hilos.
- Lo rechazado **no corta la ejecución**: se acumula en avisos.

---

## Fase 5 — El contrato HTTP

### 5.1 Ruta nueva, conviviendo con la actual

`POST /v1/analyses` **se agrega**; `/v1/analisis` sigue funcionando sin cambios.
Es lo que permite migrar sin ventana de corte.

### 5.2 Idempotencia por `analysisId`

El contrato dice que ms-company genera el UUID justamente para esto.

Hoy Lens genera su propio ULID en `nuevoAnalisisId()` y es la PK. **Un segundo
POST con el mismo `analysisId` tiene que devolver lo guardado, no re-analizar.**
Lens no hace eso hoy — es comportamiento nuevo.

### 5.3 `GET /v1/analyses/{analysisId}`

Devuelve exactamente la misma respuesta que el POST.

### 5.4 Códigos de error del bot

El consumidor no cambia, así que hay que replicarlos tal cual. **Todos devuelven
HTTP 200**: el error viaja en el cuerpo.

| `reason` | `statusCode` | `msg_type` |
|---|---|---|
| `MISSING_FOLDER_PATH` | 400 | `SHAREHOLDERS_DOCS_ERROR` |
| `NO_DOCUMENTS_FOUND` | 404 | `SHAREHOLDERS_DOCS_ERROR` |
| `NO_VALID_FILES` | 400 | `SHAREHOLDERS_DOCS_ERROR` |
| `AWS_ERROR` | 500 | *(ausente)* |

### 5.5 `session_id`

Viaja de ida y vuelta sin interpretarse — el consumidor lo usa para correlacionar
con su WebSocket.

### 5.6 Mapeo de la respuesta

Armar `company{}`, `legalRepresentatives[]` y `shareholders[]` desde
`analisis`, `analisis_persona` y `analisis_actividad`.

`rawText[]` solo cuando `options.includeRawText` es true — leyéndolo de
`analisis_texto`, que hoy está en 0 filas y hay que empezar a llenar.

---

## Fase 6 — Naming en inglés (al final, y sin renombrar)

Tech pidió estandarizar en inglés. **Renombrar rompe**: la app, el dict `TABLAS`
del logger, y cualquier query ya escrita.

La forma no destructiva es **un juego de vistas en inglés sobre las tablas en
español**. Aditivo, reversible, y tech consulta los nombres que pidió.

Queda pendiente de decisión: el resto del warehouse (`colas_trabajo`,
`liberacion_remesa`, `kyb_empresa`) también está en español. Si el estándar es
para todo, es un proyecto aparte.

---

## Hitos y cómo se verifica cada uno

Cada fase cierra con una comprobación objetiva, consultable contra el cluster.

| # | Hito | Verificación |
|---|---|---|
| 1 | Fundaciones | `company_id` no nulo en los análisis nuevos · `analisis_persona` con **550 filas** del backfill · vista pivoteada devuelve 18 columnas · columnas de costo dejan de estar en 0 |
| 2 | Ruta multimodal | Un análisis con PDF nativo produce los mismos 18 campos que la ruta de texto sobre el mismo documento |
| 3 | Shareholders | `person_type` y `tipo_documento` no nulos en los análisis nuevos · cadena anidada con `persona_padre_uid` poblado · las tres restricciones de la regla de oro se cumplen en el 100 % |
| 4 | Ingesta S3 | Un `folder_path` real resuelve, filtra y descarga · lo rechazado aparece en avisos sin cortar |
| 5 | Contrato | POST repetido con el mismo `analysisId` no crea una segunda fila · los 4 códigos de error responden como el bot |
| 6 | Vistas en inglés | Las vistas devuelven lo mismo que las tablas |

**Control transversal, en cada hito:** que la SPA siga produciendo los 18 campos
con el formato de personas intacto. Se comprueba con la misma consulta de
integridad de `LENS_MODELO_DATOS_Y_PERSONAS.md` §3.3 — tiene que seguir dando
**100 % de líneas parseando y cero caídas a prosa**.

Si ese número se mueve, algo del plan rompió la herramienta.
