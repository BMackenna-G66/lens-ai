# Módulo Regcheq KYC — Documentación Técnica

> Documento para replicar el módulo en otro proyecto.  
> Stack: React + TypeScript + Vite. Sin backend propio — todo corre en el cliente.

---

## 1. Descripción general

El módulo Regcheq es una herramienta de screening AML/KYC que permite:

- **Consulta individual**: buscar a una persona natural o jurídica por RUT/cédula y obtener su perfil de riesgo en múltiples listas internacionales.
- **Consulta masiva**: subir un Excel con N personas y procesarlas en lote con control de delay y abort.
- **Lista de interés**: gestionar una lista propia de personas de interés (CRUD).
- **Colombia (Inspektor/DataLAFT)**: flujo alternativo para colombianos vía una API diferente.

Cada consulta produce una **ficha de resultado** visualizable en pantalla + exportable a **PDF** o **Excel**.

---

## 2. Variables de entorno requeridas

```env
VITE_REGCHEQ_API_KEY=<tu_api_key_de_regcheq>
VITE_INSPEKTOR_USER=WS_Global81
VITE_INSPEKTOR_PASS=Risk5397#0ft
```

En Vite se accede así:
```typescript
const API_KEY = (import.meta as any).env.VITE_REGCHEQ_API_KEY ?? '';
const INSPEKTOR_USER = (import.meta as any).env.VITE_INSPEKTOR_USER ?? '';
```

---

## 3. APIs involucradas

### 3.1 API Regcheq (Chile)

**Base URL**: `https://external-api.regcheq.com`

| Operación | Método | Endpoint | Body |
|---|---|---|---|
| Obtener perfil | GET | `/record/{dni}/{apiKey}` | — |
| Crear/actualizar ficha | POST | `/record/{apiKey}` | JSON con campos del perfil |
| Listar "lista de interés" | GET | `/interest-list/{apiKey}` | — |
| Agregar a lista de interés | POST | `/interest-list/{apiKey}` | `{ dni, name, personType, reason, status }` |

#### Respuesta del endpoint GET `/record/{dni}/{apiKey}`

```typescript
interface PerfilRaw {
  name?: string;
  socialReason?: string;       // para personas jurídicas
  fatherName?: string;
  motherName?: string;
  nationality?: string;
  country?: string;
  email?: string;
  phone?: string;
  position?: string;
  employer?: string;
  birthDate?: string;
  businessType?: string;
  effectiveRisk?: string;       // "HIGH" | "MEDIUM" | "LOW"
  calculatedRisk?: string;      // fallback si effectiveRisk no existe
  pepLevel?: string;            // nivel PEP si aplica
  listas: Record<string, {
    coincidence: boolean;
    risk: string;
    data: unknown;              // estructura variable por lista
  }>;
}
```

#### Listas que devuelve la API

| Clave en JSON | Nombre visible |
|---|---|
| `pepChile` | PEP Chile |
| `interpol` | INTERPOL |
| `ofac` | OFAC |
| `un` | ONU |
| `eu` | Unión Europea |
| `rtp` | RTP / PDI |
| `secondCriminalCasesChile` | Causas Penales Chile |
| `pdi` | PDI Chile |
| `gafi` | GAFI |
| `screeningGlobal` | Screening Global |
| `interestList` | Lista de Interés |

Si una clave no viene en la respuesta, se muestra como "Sin coincidencia" (no rompe el flujo).

---

### 3.2 API Inspektor / DataLAFT (Colombia)

**Base URL**: `https://inspektor.datalaft.com:2121/api`

**Auth**: JWT obtenido vía login. El token se obtiene en cada consulta (no se cachea).

#### Step 1 — Login

```http
POST /Auth/login
Content-Type: application/json

{ "user": "WS_Global81", "password": "Risk5397#0ft" }
```
Respuesta: `{ "token": { "access_token": "<jwt>" } }`

#### Step 2 — Consulta principal

```http
POST /ConsultaPrincipal
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "nombre": "JUAN PEREZ",
  "identificacion": "123456789",
  "tipoDocumento": 1,
  "tienePrioridad_4": true,
  "cantidadPalabras": "3",
  "procuraduria": true,
  "ramaJudicial": true,
  "ramaJEPMS": true
}
```

#### Tipos de documentos Colombia (`tipoDocumento`)

| Valor | Tipo |
|---|---|
| 1 | Cédula de ciudadanía |
| 2 | Cédula de extranjería |
| 3 | NIT |
| 4 | Pasaporte |

#### Estructura de respuesta Inspektor

```typescript
interface InspektorResult {
  riesgo?: string;
  listas?: InspektorListaItem[];
  listas_propias?: InspektorListaItem[];
  procuraduria?: unknown;
  ramaJudicial?: InspektorRJProceso[];
  ramaJEPMS?: unknown[];
}

interface InspektorListaItem {
  nombreCompleto?: string;
  tipoDocumento?: string;
  documento?: string;
  grupo?: string;
  lista?: string;
  pais?: string;
  // ... más campos dependiendo de la lista
}
```

Las listas de Inspektor se clasifican por `grupo` en:
- **OBJETIVO** (grupos que activan alerta): `PEPS`, `TERRORISMO`, `NARCOTRÁFICO`, `LAVADO DE ACTIVOS`, `LISTAS RESTRICTIVAS`
- Otros grupos son informativos

---

## 4. Motor de decisión local (Causas Penales Chile)

Este motor evalúa los delitos de "Causas Penales Chile" usando un **catálogo local** (no API) y genera una decisión automática.

### 4.1 Archivos fuente del catálogo

El catálogo se embebe en `services/defaultCatalogData.ts` y viene originalmente de tres Excel:

| Excel | Contenido |
|---|---|
| `Catalogo_Delitos.xlsx` | 706 delitos, cada uno con `nombre`, `riesgoG66`, `valor`, `tipo` |
| `Parametros.xlsx` | 8 parámetros de configuración |
| `Tabla_Decision.xlsx` | 384 reglas de decisión |

### 4.2 Estructura del catálogo

```typescript
interface CatalogItem {
  nombre: string;        // nombre del delito (lowercase)
  riesgoG66: string;     // "ALTO" | "MEDIO" | "BAJO"
  valor: number;         // peso numérico del delito
  tipo: string;          // "DELITOS PRECEDENTES" | etc.
}

interface DecisionRule {
  decision: string;          // "FORZAR_BLOQUEO" | "UNDER_COMPLIANCE_REVIEW" | "APROBAR"
  razon: string;             // texto descriptivo
  totalEquivalente: number;  // umbral mínimo de score para activar esta regla
  precedentesCount: number;
  noPrecedentesCount: number;
}
```

### 4.3 Algoritmo de scoring

```
1. Para cada delito en additionalData de "Causas Penales Chile":
   - Normalizar nombre a lowercase y trim
   - Buscar en catalogMap (Map<nombre, CatalogItem>)
   - Si existe: scoreTotal += item.valor

2. Ordenar DecisionRules por totalEquivalente DESC

3. La primera regla donde scoreTotal >= rule.totalEquivalente es la decisión

4. Posibles decisiones:
   - FORZAR_BLOQUEO  → bloqueo automático (rojo)
   - UNDER_COMPLIANCE_REVIEW → revisión manual (ámbar)
   - APROBAR → sin acción (verde)
```

### 4.4 Dónde se ejecuta

```typescript
// En fetchPerfil(), después de obtener el perfil de la API:
const causasEntry = listas['Causas Penales Chile'];
if (causasEntry?.coincidence && causasEntry.data) {
  const raw = causasEntry.data as Record<string, unknown>;
  const additionalData = Array.isArray(raw['additionalData'])
    ? raw['additionalData'] as Record<string, unknown>[]
    : [];
  decision = computeDecisionFromCrimes(additionalData);
}
```

---

## 5. Generación de PDF

**Librería**: `jspdf` + `jspdf-autotable`

### Estructura del PDF (orden de secciones)

1. **Header**: banner navy + logo Global66 (cargado desde `/logo_global.jpg`)
2. **Info box**: nombre, DNI, riesgo coloreado, nivel PEP
3. **Alert banner**: rojo si hay alertas, verde si está limpio
4. **Datos del perfil**: tabla de campos de la ficha (`autoTable`)
5. **Resultados de listas**: tabla de todas las listas ordenadas (alertas primero, `autoTable`)
6. **Decisión**: box coloreado con decisión del motor local (si aplica)
7. **Footer en todas las páginas**: logo + número de página + timestamp

### Colores del PDF

```typescript
const PDF_NAVY   = [30, 58, 95]
const PDF_INDIGO = [79, 70, 229]
const PDF_RED    = [185, 28, 28]
const PDF_GREEN  = [21, 128, 61]
const PDF_AMBER  = [146, 64, 14]
```

### Nombre del archivo

```
regcheq_{dni}_{YYYYMMDD}.pdf
```

---

## 6. Consulta masiva

### Input

Excel (.xlsx) con columnas:
- `rut` o `dni` (obligatorio)
- `nombre`, `apellido_paterno`, `apellido_materno` (opcional)
- `persona_juridica` = `"si"` → activa modo empresa
- `razon_social`, `tipo_empresa`, `email`, `pais` (para jurídicas)

Parsing con librería `xlsx`:
```typescript
const wb = XLSX.read(buffer, { type: 'array' });
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
```

### Lógica de procesamiento

```
Para cada fila:
  1. Extraer DNI (normalizado: uppercase, sin puntos/guiones)
  2. Si crearMasivo=true → POST /record/{apiKey} (crear ficha)
  3. GET /record/{dni}/{apiKey} (obtener perfil)
  4. Delay configurable entre consultas (0.5s default)
  5. Abort check (abortRef.current)
  6. Acumular resultados en masivoResults[]
```

### Output Excel (4 hojas)

| Hoja | Contenido |
|---|---|
| `Resultados Regcheq` | Una fila por persona: DNI, nombre, riesgo, + columna por lista |
| `Coincidencias` | Solo personas con alertas, desglose por lista |
| `Causas Penales Chile` | Una fila por **delito** (si hay causas penales) |
| `Resumen` | Total personas, errores API, High Risk count, PEP count |

---

## 7. Lista de interés (CRUD)

### Carga

```typescript
const resp = await fetch(`${API_BASE}/interest-list/${API_KEY}`);
const data = await resp.json();  // ListaInteres[]
```

### Agregar

```typescript
await fetch(`${API_BASE}/interest-list/${API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dni: string,
    name: string,
    personType: 'natural' | 'legal',
    reason: string,
    status: 'active',
  }),
});
```

No hay DELETE en la API. Para eliminar hay que hacerlo desde el panel de Regcheq.

---

## 8. Estructura del componente React

### Componentes principales

```
RegcheqTool (componente raíz)
├── CountrySelectorLanding    → pantalla de selección Chile/Colombia
├── [Chile mode]
│   ├── Tab: Individual        → formulario + botón "Analizar"
│   ├── Tab: Masivo            → drag&drop Excel + progreso
│   └── Tab: Lista de interés  → tabla CRUD
└── [Colombia mode]
    └── InspektorColombia      → componente separado, llama Inspektor API
```

### Estado principal del componente

```typescript
// Modo país
const [countryMode, setCountryMode] = useState<'chile' | 'colombia' | null>(null);

// Individual
const [tipo, setTipo] = useState<'natural' | 'legal'>('natural');
const [result, setResult] = useState<PerfilResult | null>(null);
const [loading, setLoading] = useState(false);

// Masivo
const [masivoResults, setMasivoResults] = useState<PerfilResult[]>([]);
const [masivoRunning, setMasivoRunning] = useState(false);
const [logs, setLogs] = useState<LogLine[]>([]);
const abortRef = useRef(false);    // ← controla el abort del loop masivo

// Lista de interés
const [listaItems, setListaItems] = useState<ListaInteres[]>([]);
```

### Subcomponentes internos (todos en el mismo archivo)

| Componente | Qué hace |
|---|---|
| `RiskBadge` | Badge coloreado "⚠ ALTO" / "⚡ MEDIO" / "✓ BAJO" |
| `ListaRow` | Fila expandible por lista (clickeable si tiene alerta) |
| `DetailTable` | Tabla de datos del detalle de una lista. Sorteable por columna. Deduplicación por RUC. |
| `DecisionBox` | Box de decisión del motor local con colores según resultado |
| `ResultCard` | Tarjeta completa con perfil, listas, decisión y botón PDF |
| `normalizeData` | Parser universal para el campo `data` de cada lista (maneja arrays, objetos, causas penales, screening global) |

---

## 9. Normalización de datos de listas (`normalizeData`)

El campo `data` de cada lista tiene estructura distinta según la fuente. Esta función lo unifica en `{ meta, items }`:

```typescript
function normalizeData(raw: unknown): {
  meta: { label: string; value: string }[] | null;
  items: Record<string, unknown>[] | null;
}
```

Casos especiales manejados:
- **Causas Penales Chile**: detecta por presencia de `crimen` / `tribunal` / `ruc` en `additionalData[]`
- **Screening Global**: detecta por `additionalData.hits[].doc` con campos `name`, `entity_type`, `sources`, `aka`
- **Genérico**: busca arrays en `matches`, `results`, `hits`, `records`, `persons`, `entities`, `data`, `items`, `list`

---

## 10. Dependencias npm necesarias

```json
{
  "jspdf": "^3.0.1",
  "jspdf-autotable": "^5.0.2",
  "xlsx": "^0.18.5"
}
```

No requiere backend. Todo corre en el browser. Las llamadas a las APIs (Regcheq e Inspektor) deben tener CORS habilitado en el servidor de la API, o las solicitudes fallarán con "Failed to fetch".

---

## 11. Consideraciones para replicar

1. **CORS**: Regcheq API permite llamadas desde browser directamente. Inspektor también. Si en el nuevo entorno hay problemas de CORS, se necesitará un proxy o backend.

2. **API Key**: `VITE_REGCHEQ_API_KEY` debe ser un secreto. No hardcodear. En Vite va en `.env.local`.

3. **Catálogo de delitos**: el `defaultCatalogData.ts` tiene los datos embebidos. Si se quiere actualizar el catálogo, se puede reemplazar ese archivo o permitir carga via UI (ya existe el `CatalogManager` en el módulo Criminal Profiler).

4. **Dark mode**: el componente recibe `darkMode: boolean` como prop. Todas las clases Tailwind tienen variantes `dark:` correspondientes.

5. **Flujo Colombia**: es un componente separado (`InspektorColombia.tsx`) con su propio estado. Se renderiza condicionalmente cuando `countryMode === 'colombia'`.

6. **Abort masivo**: se usa un `useRef<boolean>` (no `useState`) para el flag de abort, porque las actualizaciones de estado son asíncronas y dentro del loop necesitamos leer el valor actual sin re-render.

---

## 12. Endpoints resumen rápido

```
# Regcheq
GET  https://external-api.regcheq.com/record/{dni}/{apiKey}
POST https://external-api.regcheq.com/record/{apiKey}
GET  https://external-api.regcheq.com/interest-list/{apiKey}
POST https://external-api.regcheq.com/interest-list/{apiKey}

# Inspektor / DataLAFT
POST https://inspektor.datalaft.com:2121/api/Auth/login
POST https://inspektor.datalaft.com:2121/api/ConsultaPrincipal
```
