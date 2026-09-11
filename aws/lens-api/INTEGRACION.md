# Análisis documental de Lens — guía de integración

Un endpoint. Le mandás uno o más documentos, te devuelve una ficha estructurada
de 18 campos extraída de escrituras y documentos societarios.

**La ingesta corre por su cuenta.** El servicio no sabe de dónde salió el
archivo, no lo guarda y no lo vuelve a pedir: recibe bytes y devuelve JSON.

| | |
|---|---|
| **URL** | `https://7muyoqz3yiy7uprgondfexpyhe0jjopx.lambda-url.us-east-1.on.aws` |
| **Auth** | Header `x-api-secret` — pedírselo a Benjamín Mackenna |
| **Región** | us-east-1 |

---

## 1. Prueba en 30 segundos

No necesita ningún archivo. Copiar y pegar:

```bash
export LENS_URL="https://7muyoqz3yiy7uprgondfexpyhe0jjopx.lambda-url.us-east-1.on.aws"
export LENS_SECRET="<el secreto>"

# ¿Está vivo? (no pide auth)
curl -s "$LENS_URL/salud"

# Un análisis real, con el documento embebido
curl -s -X POST "$LENS_URL/v1/analisis" \
  -H "x-api-secret: $LENS_SECRET" \
  -H "content-type: application/json" \
  -d '{
    "documentos": [{
      "nombre": "prueba.txt",
      "contenido_base64": "Q09OU1RJVFVDSU9OIERFIFNPQ0lFREFEIFBPUiBBQ0NJT05FUyAiQUQgQVNUUkEgU3BBIi4gRWwgUlVUIGRlIGxhIHNvY2llZGFkIGVzIDc4LjQ1MS43OTItNi4gQ29tcGFyZWNlIGRvbiBKVUFOIFBFUkVaIFNPVE8sIGNlZHVsYSAxMi4zNDUuNjc4LTksIHF1aWVuIHN1c2NyaWJlIGVsIDY1JSBkZWwgY2FwaXRhbCBkZSAkMzIuNTAwLjAwMC4="
    }]
  }'
```

Debería volver un JSON con `"estado": "COMPLETO"` y los 18 campos.

## 2. Con un archivo real

```bash
# macOS
B64=$(base64 -i escritura.pdf)
# Linux / CI
B64=$(base64 -w0 escritura.pdf)

jq -n --arg b64 "$B64" '{documentos:[{nombre:"escritura.pdf",contenido_base64:$b64}]}' \
  | curl -s -X POST "$LENS_URL/v1/analisis" \
      -H "x-api-secret: $LENS_SECRET" -H "content-type: application/json" \
      --data @- | jq
```

También acepta `multipart/form-data` si les resulta más cómodo: cualquier parte
con `filename` se toma como documento.

---

## 3. Qué devuelve

```jsonc
{
  "ok": true,
  "estado": "COMPLETO",
  "pais_detectado": "chile",
  "campos": [
    { "field": "RUT de la sociedad", "value": "78.451.792-6" },
    { "field": "Razón Social",       "value": "AD ASTRA TECNOLOGIA SpA" }
    // … siempre los 18, siempre en el mismo orden
  ],
  "documentos": [
    { "nombre": "escritura.pdf", "ok": true, "metodo": "capa_texto",
      "paginas_totales": 41, "paginas_leidas": 41,
      "paginas_por_capa": 41, "paginas_por_ocr": 0,
      "caracteres": 73759, "avisos": [] }
  ],
  "avisos": [],
  "duracion_ms": 4219
}
```

**`campos` siempre trae los 18**, con `"No especificado"` donde no hubo dato.
No hace falta defenderse de campos ausentes. Para pasarlo a objeto:

```js
const ficha = Object.fromEntries(r.campos.map(c => [c.field, c.value]));
```

### Los 18 campos

```
 1 RUT de la sociedad              10 Domicilio Legal
 2 Razón Social                    11 Facultades
 3 Fecha de Constitución           12 Juntas de Accionistas
 4 Objeto Social                   13 Resolución de Conflictos
 5 Capital Social                  14 Distribución de Utilidades
 6 Acciones                        15 Medio de Comunicación
 7 Accionistas y aportes           16 ¿Empresa con fines de lucro?
 8 Representante Legal             17 Documento contains modificaciones?
 9 Duración                        18 Análisis de Facultades Específicas
```

> El 17 tiene un error de tipeo en inglés heredado del sistema original. Está
> así a propósito: renombrarlo rompería las fichas ya guardadas.

### Tres campos no devuelven texto libre

**`Representante Legal` y `Accionistas y aportes`** — una persona por línea,
tres columnas separadas por `|`:

```
JUAN ANDRÉS PÉREZ SOTO   | 12.345.678-9 | 65%
MARÍA JOSÉ GONZÁLEZ RUIZ | 9.876.543-2  | 35%
```

El tercer valor es el **porcentaje** para accionistas y el **cargo** para
representantes. Cuando el documento no lo dice, viene el literal
`sin documento` o `sin porcentaje`.

**`Análisis de Facultades Específicas`** — un JSON serializado como string:

```json
{"compraVentaBienes": true, "operacionesBancarias": true, "mandatos": false}
```

---

## 4. Los tres estados

Esto es lo más importante de todo el contrato.

| `estado` | Significa | Qué hacer |
|---|---|---|
| `COMPLETO` | Se leyó todo y se extrajo todo | Usar la ficha |
| `INCOMPLETO` | **Hay ficha**, pero algo no se pudo leer | Usar la ficha **y leer `avisos`** |
| `ERROR` | No hay ficha | Reintentar o revisar el input |

**`INCOMPLETO` no es un fallo.** Devuelve HTTP 200 y la ficha completa. Significa
que algo quedó fuera —un documento ilegible, un escaneo demasiado largo para el
presupuesto de tiempo— y `avisos` dice exactamente qué.

Es deliberado: un documento leído a medias **se declara**, no se esconde. Si la
identidad estaba en la página que no se alcanzó a leer, quien decide tiene que
saberlo. **No ignoren `avisos`.**

### Códigos HTTP

| Código | Cuándo |
|---|---|
| `200` | Hay ficha (`COMPLETO` o `INCOMPLETO`) |
| `400` | Entrada inválida — el mensaje dice cuál y en qué índice |
| `401` | Falta o no coincide `x-api-secret` |
| `404` / `405` | Ruta o método equivocado |
| `502` | Se leyó el documento pero el modelo falló. Reintentable |
| `500` | Bug del servicio. Avisar |

---

## 5. Parámetros opcionales

| Dónde | Parámetro | Para qué |
|---|---|---|
| Query | `?pais=chile` | Fuerza la jurisdicción y **ahorra ~1 s**: se saltea la detección automática |
| Query o cuerpo | `incluir_texto` | Devuelve además `texto_crudo`, el texto extraído completo |

Jurisdicciones reconocidas: `chile`, `colombia`, `peru`, `ecuador`, `argentina`,
`mexico`, `uruguay`, `panama`, `paraguay`, `costa_rica`, `brasil`, `espana`,
`usa`, `eeuu`, `reino_unido`, `francia`, `dinamarca`, `china`, `hong_kong`,
`islas_caiman`, `internacional`.

Si el documento está en otro idioma, la ficha igual vuelve **en español**.

---

## 6. Límites

| Límite | Valor |
|---|---|
| **Tamaño de la petición** | **~6 MB** |
| Documentos por petición | 12 |
| Páginas al OCR por documento | 15 |
| Tiempo máximo de respuesta | ~260 s |

**El de 6 MB es el que se va a sentir.** Es el tope de invocación de AWS Lambda,
y base64 infla un 33%, así que el PDF útil ronda los **4,4 MB**. Si necesitan
mandar más grandes, avisen: se habilita un modo donde mandan una URL presignada
en lugar del contenido.

Las páginas **con capa de texto no cuentan** contra el tope de OCR: son gratis.
Un PDF digital de 200 páginas se lee entero.

---

## 7. Tiempos medidos

| Caso | Tiempo |
|---|---|
| PDF con capa de texto (3 páginas) | **4,2 s** |
| Imagen escaneada (1 página, vía OCR) | **5,9 s** |
| Extracción de texto de un PDF de 41 páginas | 1,0 s (25 ms/página) |

El servicio intenta **primero la capa de texto del PDF** y solo cae al OCR en
las páginas que no la tienen. La mayoría de las escrituras de notarías modernas
y del Conservador la traen, así que el caso normal es el rápido. Un escaneo puro
de muchas páginas es el que puede acercarse al techo de tiempo — y ahí es cuando
van a ver `INCOMPLETO`.

---

## 8. Qué hace por dentro, en dos líneas

```
documento → texto (capa de texto del PDF, o Textract si es escaneo)
          → un modelo extrae los 18 campos
          → JSON
```

El modelo interviene **solo en la extracción**. No hay nada probabilístico
después: la respuesta es la ficha tal cual salió, sin puntajes ni decisiones.

---

## 9. Dudas y reportes

Benjamín Mackenna — Compliance & Risk.

Si algo devuelve `500`, o si un documento que debería leerse vuelve con
`ok: false`, mandar el `nombre` del documento y el `duracion_ms` de la respuesta:
con eso se ubica en los logs.
