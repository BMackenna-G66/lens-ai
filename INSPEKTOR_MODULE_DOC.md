# Inspektor (Datalaft) — Consulta AML/judicial Colombia · Documentación

Proveedor: **Inspektor / Datalaft**. Se usa para screening de personas y empresas
colombianas (listas AML, Procuraduría, Rama Judicial, JEPMS).

## 1. Proveedor y conexión

- **Base URL directa:** `https://inspektor.datalaft.com:2121/api`
- **Vía proxy (producción):** el navegador no alcanza ese host directo, así que se
  enruta por el Cloudflare Worker: `${EMPRESADOCS_PROXY_URL}/inspektor/<path>`
  (el Worker reenvía a la base directa server-side, con CORS).
- **Credenciales:** `VITE_INSPEKTOR_USER` / `VITE_INSPEKTOR_PASS`
  (por defecto `WS_Global81` / `Risk5397#0ft`).

## 2. Cómo se hace la consulta

Son **dos llamadas**: login (obtener token) y consulta.

### 2.1 Login
```
POST /Auth/login
Content-Type: application/json
{ "user": "<usuario>", "password": "<password>" }
```
Respuesta:
```json
{ "token": { "access_token": "<JWT>" } }
```

### 2.2 Consulta principal
```
POST /ConsultaPrincipal
Authorization: Bearer <access_token>
Content-Type: application/json
{
  "nombre": "NOMBRE COMPLETO O RAZÓN SOCIAL",
  "identificacion": "1234567890",     // documento sin puntos/guiones
  "tipoDocumento": 1,                  // ver tabla
  "tienePrioridad_4": true,            // incluir coincidencias de prioridad 4
  "cantidadPalabras": "3",             // sensibilidad del match por nombre
  "procuraduria": true,                // incluir bloque Procuraduría
  "ramaJudicial": true,                // incluir bloque Rama Judicial
  "ramaJEPMS": true                    // incluir bloque JEPMS
}
```

**tipoDocumento:**

| Valor | Documento |
|-------|-----------|
| 1 | Cédula de Ciudadanía (CC) |
| 2 | Cédula de Extranjería (CE) |
| 3 | NIT (empresas) |
| 4 | Pasaporte |
| 5 | Tarjeta de Identidad |

> El **individual** (Vista 360°) y el **masivo** usan **el mismo endpoint**
> `ConsultaPrincipal` con el mismo payload. La diferencia es solo cómo se procesa
> la respuesta (ver §4 y §5). En el masivo se hace **una consulta por fila** del
> Excel (con reintentos, dedupe y caché de reanudación).

## 3. Estructura del JSON de respuesta (`ConsultaPrincipal`)

Es idéntica para individual y masivo:

```json
{
  "numConsulta": 123456,
  "cantCoincidencias": 3,
  "usuario": { "usuario": "WS_Global81", "idEmpresa": "...", "idRol": "..." },

  "listas": [
    {
      "nombreGrupoLista": "LISTAS ASOCIADAS A LA/FT/FPADM, CORRUPCIÓN U OTROS DELITOS (PENAL) Y EXTINCIÓN DE DOMINIO",
      "grupoLista": "...",
      "grupo": "...",
      "categoria": "...",
      "nombreCategoria": "...",
      "tipoLista": "...",
      "nombreTipoLista": "...",
      "Prioridad": "1",
      "prioridad": "1",
      "nombreCompleto": "JUAN PEREZ",
      "documentoIdentidad": "1234567890",
      "peps": "...",
      "delito": "...",
      "fuenteConsulta": "...",
      "zona": "...",
      "fechaActualizacion": "2026-01-01"
    }
  ],

  "listas_propias": [ /* misma forma que "listas" (listas internas/propias) */ ],

  "procuraduria": {
    "hasError": false,
    "data": [
      {
        "identification": "1234567890",
        "name": "JUAN PEREZ",
        "num_siri": "...",
        "sanciones":   [ { "sancion": "...", "termino": "...", "clase": "..." } ],
        "delitos":     [ { "descripcion": "..." } ],
        "instancias":  [ { "nombre": "...", "autoridad": "...", "fecha_provincia": "...", "fecha_efecto_juridicos": "..." } ],
        "inhabilidades": [ { "modulo": "...", "inhabilidad_legal": "...", "fecha_inicio": "...", "fecha_fin": "..." } ]
      }
    ]
  },

  "ramaJudicial": {
    "hasError": false,
    "data": [
      {
        "idProceso": "...",
        "llaveProceso": "...",
        "despacho": "...",
        "departamento": "...",
        "fechaProceso": "...",
        "fechaUltimaActuacion": "...",
        "esPrivado": false,
        "sujetosProcesales": "..."
      }
    ]
  },

  "ramaJudicialJEPMS": {
    "hasError": false,
    "data": [
      {
        "cityName": "...",
        "nameResult": "JUAN PEREZ",
        "identificationNumberResult": "1234567890",
        "isSuccess": true,
        "queryDate": "2026-01-01",
        "link": "https://..."
      }
    ]
  }
}
```

**Notas sobre los bloques judiciales (`procuraduria`, `ramaJudicial`, `ramaJudicialJEPMS`):**
el valor puede venir de **tres formas** y el parser las tolera:
1. objeto con `{ "hasError": true }` → se trata como **sin resultados**;
2. objeto con `{ "data": [ ... ] }` → se usa `data`;
3. array directo `[ ... ]` → se usa tal cual.

## 4. Extracción en el flujo INDIVIDUAL (Vista 360°)

`fetchInspektor()` en `services/lens360Service.ts`. Simplifica la respuesta a un
resumen para el veredicto:
- Une `listas` + `listas_propias`.
- Por cada ítem arma `{ grupo, detalle }`:
  - `grupo` = `nombreGrupoLista` / `grupoLista` / `grupo` / `categoria` / `tipoLista`.
  - `detalle` = `nombreCompleto` / `name` / `nombre`.
- Devuelve `{ coincidencias: cantCoincidencias, hits: [...] }`.
- No procesa Procuraduría / Rama Judicial / JEPMS en detalle (solo el screening de listas).

## 5. Extracción en el flujo MASIVO (`components/InspektorColombia.tsx`)

Una consulta por fila del Excel de entrada (columnas: tipo, número/identificación,
nombre). Robustez: normalización de documento, dedupe, reintentos, timeouts
(login 20s / consulta 30s) y caché de reanudación (IndexedDB).

**Clasificación por fila:**
- Riesgo por cantidad de coincidencias: `0 = LOW`, `1–2 = MEDIUM`, `>2 = HIGH`.
- Prioridad tomada de `item.Prioridad` / `item.prioridad` (P1–P4).
- Filtro de grupo objetivo (`GRUPO_OBJETIVO`):
  `"LISTAS ASOCIADAS A LA/FT/FPADM, CORRUPCIÓN U OTROS DELITOS (PENAL) Y EXTINCIÓN DE DOMINIO"`.

**Salida: Excel con 5 hojas.**

| Hoja | Contenido (una fila por…) | Campos principales |
|------|---------------------------|--------------------|
| `Resumen` | cada consultado | documento, nombre, riesgo, prioridad_maxima, listas, total_procuraduria, total_rama_judicial, total_jepms |
| `Detalle_Listas` | coincidencia en `listas` + `listas_propias` | grupo, categoría, tipoLista, prioridad, nombreCompleto, coincidencia_identificacion (`documentoIdentidad`), peps, delito, fuente, zona, fecha, origen (lista/lista_propia) |
| `Procuraduria` | registro de `procuraduria.data` | registro_identificacion (`identification`), name, num_siri, sanciones, delitos, instancias, inhabilidades |
| `Rama_Judicial` | proceso de `ramaJudicial.data` | idProceso, llaveProceso, despacho, departamento, fechaProceso, fechaUltimaActuacion, sujetosProcesales |
| `JEPMS` | ítem de `ramaJudicialJEPMS.data` | cityName, nameResult, identificacion_resultado (`identificationNumberResult`), isSuccess, queryDate, link |

---
*Generado como documentación del módulo Inspektor de Lens AI.*
