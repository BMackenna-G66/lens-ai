# lens-api — el análisis de Lens por HTTP

Un endpoint. Entran documentos, sale la ficha de 18 campos que produce Lens.

**La ingesta corre por cuenta de quien llama.** El servicio no sabe de dónde
salió el archivo, no lo guarda y no lo vuelve a pedir: recibe bytes y devuelve
JSON. De dónde vengan esos bytes —S3, un upload, un correo, otro sistema— es
decisión del equipo que integra.

**No toca la SPA.** Es un stack aparte con su propio despliegue. Los prompts se
generan leyendo `constants.ts` en modo solo lectura, así que la herramienta
queda intacta y aun así las dos puntas usan exactamente el mismo texto.

---

## 1. Para el que integra: lo mínimo

```bash
# macOS: base64 -i archivo · Linux/CI: base64 -w0 archivo
B64=$(base64 -i escritura.pdf)

jq -n --arg b64 "$B64" '{documentos:[{nombre:"escritura.pdf",contenido_base64:$b64}]}' \
  | curl -s -X POST "$LENS_API_URL/v1/analisis" \
      -H "x-api-secret: $LENS_API_SECRET" \
      -H "content-type: application/json" --data @-
```

> Para pasarle algo al equipo que integra, usar
> **[INTEGRACION.md](INTEGRACION.md)**, no este README: es la versión sin los
> comandos de despliegue ni la deuda de infra interna.

```jsonc
{
  "ok": true,
  "estado": "COMPLETO",
  "pais_detectado": "chile",
  "campos": [
    { "field": "RUT de la sociedad",   "value": "78.451.792-6" },
    { "field": "Razón Social",         "value": "AD ASTRA TECNOLOGIA SpA" },
    { "field": "Accionistas y aportes","value": "JUAN ANDRES PEREZ SOTO | 12.345.678-9 | 65%\nMARIA JOSE GONZALEZ RUIZ | 9.876.543-2 | 35%" }
    // … siempre los 18, en el mismo orden
  ],
  "documentos": [
    { "nombre": "escritura.pdf", "ok": true, "metodo": "capa_texto",
      "paginas_totales": 41, "paginas_leidas": 41,
      "paginas_por_capa": 41, "paginas_por_ocr": 0,
      "caracteres": 73759, "avisos": [] }
  ],
  "avisos": [],
  "duracion_ms": 5459
}
```

**`campos` siempre trae los 18**, en el orden del catálogo, con
`"No especificado"` donde no hubo dato. No hay que defenderse de campos
ausentes. Para pasarlo a objeto:

```js
const ficha = Object.fromEntries(r.campos.map(c => [c.field, c.value]));
```

---

## 2. Contrato

### `POST /v1/analisis`

Header obligatorio: `x-api-secret`.

**Cuerpo — JSON (recomendado).** Un documento por elemento, con
`contenido_base64` o `url`:

| Campo | Tipo | Notas |
|---|---|---|
| `documentos[].nombre` | string | Se usa para reportar y para inferir el tipo |
| `documentos[].contenido_base64` | string | El archivo en base64 |
| `documentos[].url` | string | Alternativa. **Desactivada por defecto** — ver §6 |
| `incluir_texto` | bool | Devuelve además `texto_crudo`. Default `false` |

**Cuerpo — `multipart/form-data`.** Cualquier parte con `filename` se toma como
documento. Útil desde formularios y clientes que no quieren armar base64.

**Query params:**

| Param | Notas |
|---|---|
| `pais` | Fuerza la jurisdicción (`chile`, `colombia`, …) y **saltea una llamada al modelo** |
| `incluir_texto=true` | Igual que el campo del cuerpo, para el camino multipart |

### Respuesta

| Campo | Qué es |
|---|---|
| `ok` | `false` solo si no hay ficha que devolver |
| `estado` | `COMPLETO` · `INCOMPLETO` · `ERROR` — ver abajo |
| `pais_detectado` | Clave de jurisdicción, o `unknown` |
| `campos[]` | Los 18 `{field, value}` |
| `documentos[]` | Cómo se leyó cada archivo: método, páginas, caracteres, avisos |
| `avisos[]` | Todo lo que el que decide tiene que saber |
| `duracion_ms` | Tiempo total |
| `texto_crudo` | Solo si se pidió |

**Los tres estados no son lo mismo y la diferencia importa:**

| Estado | Significa | Qué hacer |
|---|---|---|
| `COMPLETO` | Se leyó todo y se extrajo todo | Usar la ficha |
| `INCOMPLETO` | **Hay ficha**, pero algo no se pudo leer | Usar la ficha **y leer `avisos`** |
| `ERROR` | No hay ficha | Reintentar o revisar el input |

`INCOMPLETO` no es un fallo. Es la misma semántica que usa la cola KYB: un
documento leído a medias **se declara**, no se esconde. Si la identidad estaba
en la página que no se leyó, quien revisa tiene que saberlo.

### Códigos HTTP

| Código | Cuándo |
|---|---|
| `200` | Hay ficha (`COMPLETO` o `INCOMPLETO`) |
| `400` | Entrada inválida — el mensaje dice cuál y en qué índice |
| `401` | Falta o no coincide `x-api-secret` |
| `404` / `405` | Ruta o método equivocado |
| `502` | Se leyó el documento pero el modelo falló |
| `500` | Bug del servicio. No debería pasar |

### `GET /salud`

Sin auth. Devuelve la configuración efectiva: modelo, motor de OCR y topes.
Sirve para confirmar contra qué se está hablando.

### `POST /v1/analyses` — el contrato `BusinessShareholders`

Ruta **aparte**, para ms-company. `/v1/analisis` sigue igual y sin cambios: que
las dos convivan es lo que permite migrar sin ventana de corte.

No recibe el documento: recibe **dónde está en S3**.

```jsonc
{
  "analysisId": "uuid que genera el consumidor",   // idempotencia
  "folderPath": "empresas/76123456/escrituras/",   // o "files": ["a/b.pdf"]
  "companyId": "...",
  "session_id": "...",                             // opaco, vuelve tal cual
  "options": { "includeRawText": false }
}
```

Tres cosas que parecen errores y no lo son:

1. **Los errores viajan con HTTP 200.** El `statusCode` real va en el cuerpo.
   Es como responde el bot que se reemplaza y el consumidor lo lee de ahí.
2. **`AWS_ERROR` no lleva `msg_type`.** Tampoco lo lleva el bot, y el consumidor
   distingue por su ausencia.
3. **Un segundo POST con el mismo `analysisId` no vuelve a analizar.** Devuelve
   lo guardado, con el `session_id` refrescado.

La composición societaria sale de **dos pasadas planas** sobre el PDF nativo: la
tabla de propiedad primero y, por cada sociedad que aparezca entre los dueños,
una pregunta propia por sus socios. El reparto entre `directOwnership` e
`indirectShareholders` lo decide `personType`, no dónde el modelo puso a cada
uno — la regla de oro del contrato deja de depender de que el modelo la respete.

Medido contra Gemini sobre una escritura sintética con una sociedad entre los
dueños: 2 llamadas, 593 tokens de salida, la cadena resuelta y la participación
directa cerrando en **100,0** sin que se cuele la tabla de la otra empresa.

> **Por qué dos pasadas y no un esquema anidado.** Con el anidado, sobre 8
> corridas del mismo documento la cadena salía 6 de 8, y una de cada cinco se
> desbocaba hasta 45.358 tokens devolviendo JSON truncado. Las corridas malas
> eran exactamente las que tocaban el tope de salida. Hay un test que falla si
> alguien vuelve a anidar el esquema.

Si la composición societaria falla, las tres claves van vacías y el motivo va en
`warnings`: la ficha de 18 campos ya está lista y perderla por esto sería peor
que devolverla sin socios. Lo mismo si se acaba el presupuesto de tiempo — cada
sociedad entre los dueños cuesta una llamada más.

---

## 3. Por qué es síncrono

Porque con la capa de texto primero, casi nunca hay OCR.

Medido sobre un PDF digital real de 41 páginas (338 KB):

| | Resultado |
|---|---|
| Método | `capa_texto` |
| Páginas por OCR | **0** |
| Extracción de texto | **1.027 ms** (25 ms/página) |
| Análisis completo con Gemini | **5,4 s** |

El async con cola y almacén de estado se justifica cuando el trabajo tarda
minutos de forma habitual. Con este orden de lectura no es el caso, y montarlo
igual sería pagar SQS, DynamoDB y una máquina de estados para el caso raro.

**El caso raro está cubierto sin async.** Hay un presupuesto de 260 s; cuando se
agota, la respuesta devuelve lo que alcanzó a leer con `estado: "INCOMPLETO"` y
el motivo en `avisos`. Nunca deja al cliente colgado ni tira un 502 sin cuerpo.

> Si más adelante los datos muestran que el corpus real es mayoritariamente
> escaneado, el paso a async es aditivo: mismo contrato, más un `202 + job_id`.
> No hay que rehacer nada.

---

## 4. Cómo lee los documentos

Es un reemplazo del `fileProcessorService.ts` de la SPA, no un port: la SPA
rasteriza con `document.createElement('canvas')`, que es DOM y no existe en
Lambda. Y de paso arregla la deuda #1 del analizador.

```
                    ┌─ ¿la página tiene capa de texto? ─┐
   PDF ── pypdf ────┤                                    ├── texto
                    │  sí → se usa. Exacto y gratis.     │
                    │  no → Textract (una llamada/pág).  │
                    └────────────────────────────────────┘
```

**La decisión es por página, no por documento.** Una escritura digital con un
anexo escaneado usa capa de texto en las primeras y OCR solo en el anexo. Un
umbral por documento obligaría a elegir mal en ese caso.

| Entra | Camino |
|---|---|
| PDF con texto embebido | Capa de texto. Extracción exacta, sin error de reconocimiento |
| PDF escaneado | Textract, página por página, 4 en paralelo |
| PNG · JPG · TIFF | Textract directo |
| TXT | Lectura directa |
| Otro | `ok: false` con el motivo. **No tumba al resto del lote** |

La extensión no se cree a ciegas: si los bytes empiezan con `%PDF-`, se trata
como PDF aunque se llame `.txt`.

### Dependencias

`pypdf` y `requests`. **`sam build` funciona sin Docker** en macOS arm64 —
verificado. `pypdf` es Python puro; `requests` arrastra `charset_normalizer`,
que trae una extensión C opcional, pero el PythonPipBuilder de SAM baja el wheel
de `manylinux aarch64` correcto, así que no hace falta `--use-container`.

No se usa PyMuPDF ni Pillow a propósito: son binarios pesados y sin wheel para
todas las combinaciones. No hace falta rasterizar porque el OCR lo hace
Textract, que recibe la página como PDF o como imagen.

---

## 5. Los prompts no se copian: se generan

La API tiene que usar **exactamente** los mismos prompts que Lens o devolvería
otra cosa que la herramienta, y nadie podría comparar resultados. Copiarlos a
mano se desincroniza en silencio la primera vez que alguien toca
`constants.ts`. Compartir el archivo obligaría a tocar la SPA.

`scripts/generar_prompts.py` lee la SPA en **modo solo lectura** y emite
`src/prompts_generado.py`. La fuente de verdad sigue siendo `constants.ts`.

```bash
python3 scripts/generar_prompts.py            # regenerar tras cambiar un prompt
python3 scripts/generar_prompts.py --check    # falla si quedó desactualizado
```

**El `--check` va antes de cada deploy.** Es el guardia que impide que la API
quede atrás sin que nadie se entere.

Se generan: los 18 campos, los 21 países, los 21 contextos de jurisdicción y
los dos prompts.

---

## 6. Seguridad

| Qué | Cómo |
|---|---|
| Auth | Header `x-api-secret`, comparado con `hmac.compare_digest` |
| Exposición | Lambda Function URL, `AuthType: NONE`. **No API Gateway**: el rol `compliance-admin` no tiene `apigateway:POST` |
| Secretos | Variables de entorno de la Lambda. SSM queda pendiente de permisos, igual que en `casos-receptor` |
| Descarga por URL | **Desactivada por defecto.** Requiere `DOMINIOS_URL_PERMITIDOS` y solo acepta `https`. Sin lista, el servicio sería un SSRF con pasos extra |
| Persistencia | **Ninguna.** El documento vive en memoria durante la petición y se va |
| Logs | Retención de 30 días. El texto de documentos de clientes no debe quedar para siempre en CloudWatch |

Rotar el secreto: generar uno nuevo y redesplegar cambiando `ApiSecretValue`.

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(40))"
```

---

## 7. Límites

| Límite | Valor | Configurable |
|---|---|---|
| Tamaño de la petición | **~6 MB** (tope de invocación síncrona de Lambda) | No |
| Tamaño por documento | 25 MB | `MAX_BYTES_DOC` |
| Documentos por petición | 12 | `MAX_DOCUMENTOS` |
| Páginas al OCR por documento | 15 | `MAX_PAGINAS_OCR` |
| Presupuesto de la corrida | 260 s | `PRESUPUESTO_S` |
| Timeout de la Lambda | 300 s | `template.yaml` |

> **El de 6 MB es el que se va a sentir.** Base64 infla un 33%, así que el PDF
> útil ronda los 4,4 MB. Para documentos más grandes: habilitar la descarga por
> URL con un dominio permitido y mandar una URL presignada en vez del contenido.

Las páginas **con** capa de texto no cuentan contra el tope de OCR: son gratis.
Un PDF digital de 200 páginas se lee entero.

---

## 8. Desplegado

| | |
|---|---|
| Stack | `lens-analisis-fnurl` |
| Lambda | `lens-analisis` |
| Cuenta · región | 561521480266 · us-east-1 |
| Perfil | `compliance-admin` |
| Endpoint | `https://7muyoqz3yiy7uprgondfexpyhe0jjopx.lambda-url.us-east-1.on.aws` |
| Secreto | `~/.secretos/lens-api-secret` (modo 600) |

### Verificado en vivo

| Caso | Resultado |
|---|---|
| `GET /salud` | 200, configuración correcta |
| `POST` sin secreto / con secreto errado | 401 en ambos |
| PDF de 3 páginas con capa de texto | 200 · `COMPLETO` · **4,2 s** · `metodo: capa_texto` · **0 páginas por OCR** |
| PNG de una página escaneada | 200 · `COMPLETO` · **5,9 s** · `metodo: ocr` · 2.048 caracteres |

En el caso por OCR, Textract devolvió los tres RUT exactos
(`78.451.792-6`, `12.345.678-9`, `9.876.543-2`) y los accionistas salieron en el
formato `NOMBRE | DOCUMENTO | DATO` con sus porcentajes. **Queda confirmado que
`DetectDocumentText` acepta la página en `Bytes`**, así que no hace falta S3.

### Redesplegar

```bash
cd aws/lens-api
python3 scripts/generar_prompts.py --check
.venv/bin/python -m pytest tests -q
sam build
sam deploy --parameter-overrides \
  "ApiSecretValue=$(tr -d '\n' < ~/.secretos/lens-api-secret)" \
  "GeminiApiKey=$(tr -d '\n' < ~/.secretos/gemini-key)" \
  "MotorOcr=textract"
```

Los secretos se leen de archivo con `$(...)` para que no queden en el historial
del shell.

**Sin Textract:** `MotorOcr=ninguno`. Los PDF con capa de texto funcionan igual;
los escaneos vuelven con aviso en lugar de texto.

### Deuda de infraestructura

Dos cosas quedaron pendientes porque `compliance-admin` no tiene los permisos.
Ninguna afecta el funcionamiento, pero conviene resolverlas:

1. **Dos stacks huérfanos para borrar**: `lens-api` (ROLLBACK_FAILED) y
   `lens-api-fnurl` (ROLLBACK_COMPLETE), de dos intentos fallidos. No contienen
   recursos vivos —se verificó que no quedó ninguna Lambda con la key— pero
   ocupan esos nombres. Borrarlos necesita `cloudformation:DeleteStack`.
2. **Retención de logs**: el grupo `/aws/lambda/lens-analisis` queda con
   "nunca expira" porque el rol no puede `logs:CreateLogGroup`. El servicio no
   registra el contenido de los documentos, así que no hay dato de cliente
   ahí — pero conviene fijar 30 días cuando se habiliten los permisos:

   ```bash
   aws logs put-retention-policy \
     --log-group-name /aws/lambda/lens-analisis --retention-in-days 30
   ```

---

## 9. Tests

La primera vez hay que montar el entorno — `pytest` no viene con el Python del
sistema:

```bash
python3 -m venv .venv
.venv/bin/pip install -r src/requirements.txt pytest reportlab
```

```bash
.venv/bin/python -m pytest tests -q # 109 tests, sin AWS y sin gastar tokens
.venv/bin/python tests/smoke_real.py # contra Gemini de verdad (gasta tokens)
```

Los tests cubren lo que puede romperse en silencio: ruteo y auth, las tres
formas de entrada, el relleno a 18 campos, el descarte de campos inventados
por el modelo, la sustitución de marcadores en un prompt que tiene llaves
literales, y que un documento ilegible no tumbe al resto del lote.

De la composición societaria se verifica sobre todo lo que costó medirse: que
los esquemas sigan **planos**, que el reparto salga de `personType` y no de
dónde puso el modelo a cada uno, que una cadena rota no tire abajo el análisis,
y que la suma de participación detecte la tabla de otra empresa colada en la
principal.

`smoke_real.py` manda escrituras sintéticas —inventadas, **nunca documentos de
clientes**— y verifica que las personas salgan como `NOMBRE | DOCUMENTO | DATO`,
que es lo que necesita la comparación automática, y que las dos pasadas de
shareholders devuelvan el contrato completo con la participación cerrando en 100.

---

## 10. Archivos

| Archivo | Qué es |
|---|---|
| `src/app.py` | Handler: ruteo, auth, parseo de entrada, orquestación |
| `src/extraccion.py` | Documento → texto. Capa de texto primero, OCR después |
| `src/gemini.py` | Las llamadas al modelo: país, 18 campos y composición societaria |
| `src/contrato.py` | La forma exacta de la respuesta de `BusinessShareholders` |
| `src/ingesta_s3.py` | `folderPath` → archivos, con los tres filtros del bot |
| `src/almacen.py` | DynamoDB para la idempotencia por `analysisId` |
| `src/prompts_generado.py` | **Generado.** No editar a mano |
| `scripts/generar_prompts.py` | Lee la SPA y regenera lo anterior (`--check` en el deploy) |
| `template.yaml` | SAM: Lambda + Function URL + permiso de Textract + logs |
| `tests/test_app.py` | Ruteo, auth y el pipeline de los 18 campos |
| `tests/test_shareholders.py` | Las dos pasadas, el reparto y el presupuesto |
| `tests/test_contrato.py` | Los 4 códigos del bot y la idempotencia |
| `tests/test_ingesta_s3.py` | Filtros, paginación y tope, contra un S3 simulado |
| `tests/smoke_real.py` | Prueba de humo contra Gemini |
