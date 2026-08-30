
export const API_KEY_PLACEHOLDER = "MISSING_API_KEY_CONFIG_VALUE";

export const PREDEFINED_FIELDS: string[] = [
  "RUT de la sociedad",
  "Razón Social",
  "Fecha de Constitución",
  "Objeto Social",
  "Capital Social",
  "Acciones",
  "Accionistas y aportes",
  "Representante Legal",
  "Duración",
  "Domicilio Legal",
  "Facultades",
  "Juntas de Accionistas",
  "Resolución de Conflictos",
  "Distribución de Utilidades",
  "Medio de Comunicación",
  "¿Empresa con fines de lucro?",
  "Documento contains modificaciones?",
  "Análisis de Facultades Específicas"
];

export const GEMINI_COUNTRY_DETECTION_PROMPT_TEMPLATE = (documentText: string, countryList: string[]): string => `
Eres un experto en identificación de países a partir de documentos legales. Basado en la terminología, nombres y frases legales en el texto del documento proporcionado, determina su país de origen de la siguiente lista: ${countryList.join(', ')}.

Tu respuesta DEBE ser una única clave en minúsculas de la lista proporcionada (p. ej., 'chile', 'colombia', 'peru', 'china', 'brasil', 'usa', 'francia', 'dinamarca', 'internacional').
Si estás muy seguro, devuelve la clave del país. Si no puedes determinar el país con alta confianza, devuelve la cadena 'unknown'.
Para documentos en chino o mandarín, devuelve 'china'. Para documentos en portugués de Brasil, devuelve 'brasil'. Para documentos en inglés de EE.UU., devuelve 'usa'. Para documentos en francés, devuelve 'francia'. Para documentos en danés, devuelve 'dinamarca'. Para documentos internacionales sin país claro, devuelve 'internacional'.
No proporciones ninguna explicación o texto adicional.

TEXTO DEL DOCUMENTO:
---
${documentText}
---
`;


export const GEMINI_PROMPT_TEMPLATE = (documentText: string, countryContext?: string): string => `
Eres un asistente legal experto en análisis y traducción de documentos corporativos (escrituras, actas, estatutos). Tu tarea es extraer información específica y presentarla COMPLETAMENTE EN ESPAÑOL.

${countryContext || 'Estás analizando un documento de origen no especificado.'}

**REGLAS DE ORO:**
1. **IDIOMA DE SALIDA:** Todo el contenido extraído DEBE estar en español. Si el documento original está en inglés, portugués, chino u otro idioma, traduce los términos técnicos y el contenido al español de forma profesional.
2. **PRECISIÓN:** Extrae los datos basándote estrictamente en el texto. No inventes información.
3. **VALORES AUSENTES:** Si un campo no existe en el documento, responde exactamente: "No especificado".
4. **CONCISIÓN:** Para "Objeto Social" y "Facultades del Administrador", resume los puntos principales en español.
5. **MODIFICACIONES:** Para "${PREDEFINED_FIELDS[16]}", indica si el documento es una modificación de uno anterior. Responde "Sí contiene" (y resume) o "No contiene".

**GUÍA PARA DOCUMENTOS EN CHINO / MANDARÍN:**
Si el documento es de China, utiliza esta guía de mapeo para identificar los campos:
- RUT de la sociedad: Tax ID / Unified Social Credit Code / 统一社会信用代码
- Razón Social: Name / Company Name / 名称
- Fecha de Constitución: Date of Incorporation / Establishment Date / 成立日期
- Objeto Social: Business Scope / 经营范围
- Capital Social: Registered Capital / 注册资本
- Acciones: Shares / Equity interest
- Accionistas y aportes: Shareholders / 股东
- Representante Legal: Legal Representative / 法定代表人
- Duración: Operating Period / Term / 营业期限
- Domicilio Legal: Registered Address / 住所
- Facultades: Governance / Executive Director
- Juntas de Accionistas: Shareholders' Meetings
- Resolución de Conflictos: Dispute Resolution / Arbitration
- Distribución de Utilidades: Profit Distribution
- Medio de Comunicación: Official Communication / Notices

**INSTRUCCIONES PARA LOS CAMPOS DE PERSONAS** ("Representante Legal", "Accionistas y aportes"):
Estos campos alimentan una comparación automática contra el registro del cliente,
así que NO uses prosa. Devuelve **UNA PERSONA POR LÍNEA** con este formato exacto:

NOMBRE COMPLETO | DOCUMENTO | DATO

- **NOMBRE COMPLETO**: todos los nombres y apellidos como figuran en el documento.
  NUNCA abrevies, ni cortes un apellido, ni uses iniciales. Si el apellido materno
  aparece, inclúyelo.
- **Si el documento nombra a varias personas juntas** —"Juan Pérez y María Soto",
  o separadas por comas— son LÍNEAS DISTINTAS, una por persona. Nunca las juntes.
- **DOCUMENTO**: RUT, cédula, DNI o pasaporte con su formato original. Si el
  documento no lo dice, escribe exactamente: sin documento
- **DATO**: para "Accionistas y aportes", el PORCENTAJE de participación (ej: 50%).
  Si el documento da acciones y no porcentaje, calcúlalo sobre el total y escríbelo
  igual. Si no se puede, escribe: sin porcentaje
  Para "Representante Legal", el CARGO (ej: Gerente General).

Ejemplo de "Accionistas y aportes":
JUAN ANDRÉS PÉREZ SOTO | 12.345.678-9 | 50%
MARÍA JOSÉ GONZÁLEZ RUIZ | 9.876.543-2 | 50%

Ejemplo de "Representante Legal":
JUAN ANDRÉS PÉREZ SOTO | 12.345.678-9 | Gerente General

**INSTRUCCIONES PARA "Análisis de Facultades Específicas":**
Busca estas facultades y devuelve un JSON stringified con estas claves exactas:
- "compraVentaBienes": true/false (comprar, vender, enajenar bienes).
- "operacionesBancarias": true/false (abrir cuentas, girar cheques, representar ante bancos).
- "mandatos": true/false (otorgar poderes, delegar facultades).
Ejemplo: "{\\"compraVentaBienes\\": true, \\"operacionesBancarias\\": false, \\"mandatos\\": true}"

DOCUMENTO:
---
${documentText}
---
`;

export const GEMINI_COMPARISON_PROMPT_TEMPLATE = (primaryDocumentExtractedDataJSON: string, supplementaryDocumentText: string): string => `
Eres un asistente legal experto comparando y extrayendo informacion de los documentos.
Se te proporcionará un resumen de datos extraídos de un documento legal principal y el texto completo de un documento complementario.

**Resumen del Documento Principal (en formato JSON de campos extraídos):**
${primaryDocumentExtractedDataJSON}

**Texto Completo del Documento Complementario:**
---
${supplementaryDocumentText}
---

Tu tarea es analizar el documento complementario en el contexto del documento principal y responder exclusivamente a las siguientes dos preguntas. Si alguno de los documentos está en un idioma distinto al español, traduce la información necesaria para que tu respuesta esté completamente en español.
Formatea tu respuesta OBLIGATORIAMENTE como un objeto JSON con las claves "validezDocumentoSecundario" y "diferenciasEncontradas".

1.  **validezDocumentoSecundario**: ¿Los datos clave (como nombres, RUTs, fechas importantes, objeto social si aplica) presentes en el documento complementario parecen ser válidos y consistentes cuando se comparan con el resumen del documento principal? 
Proporciona una justificación breve y directa. Por ejemplo: "Sí, los datos como la Razón Social 'Empresa Ejemplo SpA' y el RUT 'XX.XXX.XXX-X' coinciden con el documento principal, 
lo que sugiere validez." o "No, existen discrepancias en el nombre del Representante Legal, lo que podría indicar invalidez o un cambio posterior." o "El documento complementario no contiene suficientes datos comparables para determinar su validez respecto al principal."

2.  **diferenciasEncontradas**: ¿Hay alguna diferencia relevante, adición o contradicción notable in la información presentada en el documento complementario en comparación con el resumen del documento principal? Menciona las diferencias específicas o confirma si no hay diferencias significativas. Por ejemplo: "El documento complementario detalla las facultades del apoderado que no estaba explícitamente en el resumen principal." o "No se observan diferencias relevantes; el documento complementario parece ser un poder que es coherente." o "El documento complementario introduce una nueva dirección que no estaba en el domicilio legal del principal."

**IMPORTANTE: Tu respuesta DEBE ser únicamente un objeto JSON válido con las dos claves mencionadas. No incluyas texto explicativo antes o después del objeto JSON.**
Ejemplo de respuesta JSON esperada:
{
  "validezDocumentoSecundario": "Sí, los datos como la Razón Social y el RUT son consistentes.",
  "diferenciasEncontradas": "El documento complementario especifica un nuevo apoderado no listado previamente."
}
`;

export const GEMINI_CHAT_SYSTEM_INSTRUCTION = `Eres un asistente legal de IA experto. Tu función es responder preguntas basándote ÚNICAMENTE en el CONTEXTO DOCUMENTAL proporcionado.

REGLAS CRÍTICAS:
1. IDIOMA: Responde SIEMPRE en español, sin importar el idioma del documento original.
2. FIDELIDAD: Si la información no está en el documento, di: 'La información solicitada no se encuentra en los documentos proporcionados.'
3. TRADUCCIÓN: Si el documento está en otro idioma (ej. inglés), traduce los términos al español al responder para que el usuario entienda perfectamente.
4. ESTILO: Sé directo, profesional y conciso. No uses preámbulos.`;

export const FINANCIAL_CHAT_SYSTEM_INSTRUCTION = `Eres un Analista Financiero Senior.
Tu objetivo es ayudar al usuario a interpretar los estados financieros proporcionados.
A diferencia de un asistente básico, TIENES PERMISO para:
1. Dar opiniones profesionales sobre la salud financiera de la empresa basadas en los datos.
2. Interpretar los ratios financieros (ej: explicar si la liquidez es buena o peligrosa).
3. Sacar conclusiones y detectar riesgos (ej: "La empresa depende mucho de inventarios").
4. Usar tu conocimiento general de finanzas para explicar conceptos.

Sin embargo, para los DATOS ESPECÍFICOS (montos, nombres), usa estrictamente lo que hay en el documento. No inventes cifras.`;


export const GEMINI_RISK_ANALYSIS_PROMPT_TEMPLATE = (documentText: string): string => `
Eres un analista de cumplimiento y riesgos legales. Tu tarea es analizar el texto de un documento legal y detectar dos tipos específicos de riesgos. Tu respuesta DEBE ser un objeto JSON válido y nada más.

Texto del Documento a Analizar:
---
${documentText}
---

Analiza el texto y responde en el siguiente formato JSON:

{
  "suspiciousActivity": {
    "detected": boolean,
    "reason": "string"
  },
  "suspiciousLanguage": {
    "detected": boolean,
    "reason": "string"
  }
}

Instrucciones para completar el JSON:

1.  **suspiciousActivity**:
    *   Busca en la sección "Objeto Social" o similar si el texto contiene alguna de las siguientes palabras clave (o sus variantes): "criptomonedas", "armas", "remesedoras", "activo digital", "casinos", "offshore".
    *   Si encuentras alguna, establece "detected" en \`true\`, de lo contrario \`false\`.
    *   Si no encuentras ninguna, establece "detected" en \`false\` y en "reason" escribe "No se detectaron palabras clave de actividad económica sospeosa en el objeto social.".

2.  **suspiciousLanguage**:
    *   Busca en todo el documento cláusulas que sean excesivamente vagas o abiertas, como por ejemplo: "...y cualquier otra actividad lícita", "...cualquier otro negocio de lícito comercio", "...y en general, celebrar toda clase de actos y contratos que la ley permita".
    *   Si encuentras este tipo de lenguaje, establece "detected" en \`true\` y en "reason" cita un breve ejemplo de la cláusula encontrada. Ejemplo: "Se encontró una cláusula vaga: '...y cualquier otra actividad de lícito comercio que acuerden los socios.'".
    *   Si el lenguaje es específico y no contiene estas cláusulas genéricas, establece "detected" en \`false\` y en "reason" escribe "El lenguaje del documento parece ser específico y no contiene cláusulas vagas o no estándar.".

IMPORTANTE: Responde únicamente con el objeto JSON. No añadas texto, explicaciones ni markdown.
`;

export const GEMINI_INTEGRITY_ANALYSIS_PROMPT_TEMPLATE = (documentText: string): string => `
Actúa como un experto en análisis forense de documentos digitales. Has recibido el contenido de texto extraído de un documento. Tu tarea es evaluar su nivel de integridad basándote ÚNICAMENTE en este texto. Como no tienes acceso al archivo original, debes inferir las respuestas a partir de la calidad y estructura del texto.

Analiza el siguiente texto y responde OBLIGATORIAMENTE con un objeto JSON válido con las claves "criteria", "fidedignidadLevel" y "recommendation". No incluyas explicaciones fuera del JSON.

TEXTO DEL DOCUMENTO A ANALIZAR:
---
${documentText}
---

CRITERIOS A EVALUAR Y PREGUNTAS A RESPONDER EN EL JSON:
1.  **¿El documento es completamente digital (no escaneado)?**: Infiere la respuesta. Si el texto es limpio, coherente y sin errores extraños, responde "Probablemente digital". Si contiene errores de reconocimiento de caracteres (OCR) como letras confundidas (ej. 'l' por '1', 'O' por '0') o palabras mal formadas, responde "Probablemente escaneado". Si no hay suficiente evidencia, responde "Indeterminado".
2.  **¿Los metadatos indican un origen confiable (como Word, Acrobat)?**: Responde siempre "Indeterminado (sin acceso a metadatos)", ya que solo analizas el texto.
3.  **¿Existe coherencia en la fuente, tamaño y estilo del texto?**: Busca en el texto indicios de inconsistencia, como cambios abruptos en espaciado, alineación o estructura de frases que sugieran que partes del texto fueron pegadas desde diferentes fuentes. Responde "Sí" si parece coherente, "No" si detectas inconsistencias claras.
4.  **¿Existen capas ocultas, texto superpuesto o elementos insertados?**: Busca fragmentos de texto que parezcan lógicamente fuera de lugar, interrumpan el flujo de una oración o no tengan relación con el contexto circundante. Responde "Sí" si encuentras anomalías, si no, responde "No".
5.  **¿Se detectan errores de OCR (caracteres mal reconocidos)?**: Busca y cuenta errores obvios de OCR. Responde "Sí" si encuentras uno o más errores claros. Si el texto es perfectamente legible, responde "No".
6.  **¿Se observan frases o patrones típicos generados por IA?**: Evalúa si el lenguaje es excesivamente genérico, demasiado formal (robótico) o si utiliza estructuras de frases repetitivas comunes en modelos de lenguaje. Responde "Sí" si detectas patrones sospechosos. Si el lenguaje parece natural y humano, responde "No".
7.  **¿Hay campos rellenados posteriormente o signos de edición?**: Busca inconsistencias en el estilo de redacción o formato entre diferentes cláusulas o secciones que puedan sugerir que fueron escritas en momentos diferentes o por personas diferentes. Responde "Sí" si hay indicios claros de edición, si no, responde "No".

FORMATO DE RESPUESTA JSON ESTRICTO:
{
  "criteria": [
    { "criterion": "¿El documento es completamente digital (no escaneado)?", "result": "..." },
    { "criterion": "¿Los metadatos indican un origen confiable (como Word, Acrobat)?", "result": "Indeterminado (sin acceso a metadatos)" },
    { "criterion": "¿Existe coherencia en la fuente, tamaño y estilo del texto?", "result": "..." },
    { "criterion": "¿Existen capas ocultas, texto superpuesto o elementos insertados?", "result": "..." },
    { "criterion": "¿Se detectan errores de OCR (caracteres mal reconocidos)?", "result": "..." },
    { "criterion": "¿Se observan frases o patrones típicos generados por IA?", "result": "..." },
    { "criterion": "¿Hay campos rellenados posteriormente o signos de edición?", "result": "..." }
  ],
  "fidedignidadLevel": "Alta Fidedignidad" | "Fidedignidad Media" | "Baja Fidedignidad",
  "recommendation": "Una recomendación breve y concisa para el analista basada en los hallazgos. Indica si el documento parece confiable para propósitos legales o de onboarding."
}
`;

export const GEMINI_FINANCIAL_PROMPT_TEMPLATE = (documentText: string): string => `
Eres un experto en auditoría financiera internacional. Tu tarea es extraer datos de estados financieros y presentarlos COMPLETAMENTE EN ESPAÑOL.

**REGLAS DE ORO:**
1. **IDIOMA:** Todo el contenido extraído DEBE estar en español. Traduce términos contables (ej: "Revenue" -> "Ingresos", "Current Assets" -> "Activo Corriente").
2. **EXTRACCIÓN:** Extrae el nombre de la empresa y la moneda (ISO 4217).
3. **DATOS NUMÉRICOS:** Extrae los valores para cada año reportado en su moneda original. Usa números enteros.
4. **CÁLCULOS:** Calcula el Capital de Trabajo Neto (Activo Corriente - Pasivo Corriente).

TEXTO:
---
${documentText}
---

Responde en formato JSON:
{
  "companyName": "Nombre",
  "currencyCode": "ISO",
  "years": [
    {
      "year": "202X",
      "data": {
        "efectivoEnCaja": 0,
        "efectivoEnBancos": 0,
        "totalEfectivoEquivalentes": 0,
        "ingresosOperativos": 0,
        "inventarios": 0,
        "activoCorriente": 0,
        "pasivoCorriente": 0,
        "capitalTrabajoNeto": 0
      }
    }
  ]
}
`;

export const GEMINI_BANK_STATEMENT_PROMPT_TEMPLATE = (documentText: string): string => `
Eres un analista bancario experto. Tu tarea es resumir extractos bancarios y presentar la información COMPLETAMENTE EN ESPAÑOL.

**REGLAS DE ORO:**
1. **IDIOMA:** Todo el contenido extraído DEBE estar en español.
2. **EXTRACCIÓN:** Identifica el Banco, Mes/Año y Moneda.
3. **TOTALES:** Extrae Total Ingresos, Total Egresos y Saldo al Cierre.
4. **ADB:** Extrae o estima el Saldo Promedio Diario.

TEXTO:
---
${documentText}
---

Responde en formato JSON:
{
  "currencyCode": "ISO",
  "summaries": [
    {
      "banco": "Nombre",
      "mesAnio": "Mes Año",
      "totalIngresos": 0,
      "totalEgresos": 0,
      "saldoCierre": 0,
      "promedioDiario": 0
    }
  ]
}
`;

export const GEMINI_CROSS_ANALYSIS_PROMPT_TEMPLATE = (documentText: string): string => `
Eres un Auditor Financiero Senior experto. Tu tarea es realizar un análisis cruzado entre Estados Financieros y Cartolas Bancarias, presentando TODO EL ANÁLISIS EN ESPAÑOL.

**REGLAS DE ORO:**
1. **IDIOMA:** Todo el contenido (análisis, conclusiones, alertas) DEBE estar en español. Si los documentos están en otro idioma, traduce los términos técnicos.
2. **EXTRACCIÓN:** Extrae datos contables y bancarios con precisión.
3. **CRUCE:** Compara ingresos declarados vs depósitos bancarios reales.
4. **ANÁLISIS:** Proporciona una conclusión analítica profunda sobre la coherencia de los flujos.

TEXTO:
---
${documentText}
---

Responde en formato JSON:
{
  "financial": { ... },
  "bank": { ... },
  "crossCheck": {
      "totalDeclaredIncome": 0,
      "totalBankDeposits": 0,
      "difference": 0,
      "matchPercentage": 0,
      "conclusion": "Análisis detallado en español...",
      "riskAlerts": ["Alerta 1 en español", "Alerta 2 en español"]
  }
}
`;

export const GEMINI_TAX_FOLDER_PROMPT_TEMPLATE = (documentText: string): string => `
Eres un Auditor Tributario Experto del SII (Chile) especializado en análisis de riesgo y capacidad económica. Tu objetivo es realizar una extracción forense, precisa y estructurada de la Carpeta Tributaria Electrónica.

**REGLAS CRÍTICAS DE EXTRACCIÓN:**

1.  **MONEDA Y FORMATO**: Todos los montos deben ser Pesos Chilenos (CLP). Si el OCR pegó el código al monto (ej. 53815000000), los primeros 3 dígitos (538) son el código y el resto es el monto.
2.  **IDENTIFICACIÓN DE CASILLAS F29**:
    *   [538]: Total Débitos / Ventas Netas (Crucial).
    *   [563]: Base Imponible de Ventas.
    *   [585]: Exportaciones.
    *   [048]: Retención Impuesto Único (Segunda Categoría).
    *   [062]: PPM Neto Determinado.
    *   [089]: IVA Determinado del Periodo.
3.  **INTEGRIDAD**: Si un periodo (YYYYMM) aparece en el documento, DEBES extraerlo. No alucines periodos inexistentes. Si un valor no se encuentra, usa null o "0".
4.  **PRECISIÓN FORENSE**: No asumas ceros por flojera. Si ves tablas con montos grandes asociados a ventas o impuestos, asócialos a sus códigos correspondientes.

**RESPUESTA JSON OBLIGATORIA (JERARQUÍA EXACTA):**

{
  "extraction": {
    "datos_contribuyente": {
      "nombre": "string",
      "rut": "string",
      "inicio_actividades": "string (DD-MM-YYYY)",
      "actividades": ["string"],
      "categoria_tributaria": "string",
      "domicilio": "string",
      "sucursales": "string",
      "doc_timbrados": [{"fecha": "string", "desc": "string"}],
      "observaciones_tributarias": "string"
    },
    "info_tributaria": {
      "Representantes(s) Legales(s)": [{"Nombre o Razón Social": "string", "RUT": "string", "Fecha de Incorporación": "string"}],
      "Conformacion de la sociedad": [{"Nombre o Razón Social": "string", "RUT": "string", "Fecha de Incorporación": "string"}],
      "Participación en sociedades vigentes": [{"Nombre o Razón Social": "string", "RUT": "string", "Fecha de Incorporación": "string"}]
    },
    "bienes_raices": [],
    "boletas_honorarios": [{"periodo": "string", "honorario_bruto": "string", "retencion_de_terceros": "string"}],
    "F29": {
      "YYYYMM": {
        "048": {"name": "RETENCIONES", "value": "string (solo numero)"},
        "062": {"name": "PPM NETO DET.", "value": "string (solo numero)"},
        "089": {"name": "IVA DETERM.", "value": "string (solo numero)"},
        "538": {"name": "VENTAS NETAS", "value": "string (solo numero)"},
        "563": {"name": "BASE IMPONIBLE", "value": "string (solo numero)"},
        "585": {"name": "EXPORTACIONES", "value": "string (solo numero)"},
        "tipo_declaracion": "string",
        "banco": "string",
        "fecha_presentacion": "string"
      }
    },
    "F22": {
      "YYYY": {
        "305": {"name": "RESULTADO LIQUIDACIÓN", "value": "string"},
        "315": {"name": "Fecha Presentación", "value": "string"}
      }
    }
  },
  "checklist": {
    "kyb_checklist_carpeta_tributaria": [
      { "item": "Identidad y RUT coinciden", "estado": "PASS|FAIL|REVIEW", "hallazgo": "string", "riesgo_si_falla": "string" }
    ]
  },
  "funds_origin": {
    "capacidad_economica_tributaria_proxy": {
      "moneda": "CLP",
      "exportaciones_total": number,
      "exportaciones_promedio_mensual": number,
      "comentarios_limitaciones": ["string"]
    },
    "red_flags_carpeta_tributaria": [
       { "red_flag": "string", "severidad": "string" }
    ]
  }
}

TEXTO DEL DOCUMENTO:
---
${documentText}
---
`;

export const GEMINI_CRYPTO_FORENSIC_PROMPT = (walletDataJson: string): string => `
Actúas como un Investigador Forense de Blockchain Senior (similar a Chainalysis o TRM Labs).
Tu objetivo es perfilar una billetera de criptomonedas basándote en sus transacciones recientes y saldos.

A continuación se presentan los datos crudos extraídos de la blockchain para la billetera en formato JSON:
${walletDataJson}

TU TAREA:
1. **IDIOMA:** Todo el análisis y el resumen ejecutivo DEBEN estar en español.
2. Analiza los patrones de transacciones (entradas/salidas, frecuencia, montos redondos, interacción con contratos) y genera un perfil de riesgo.

1. **Risk Score (0-100)**: Calcula un puntaje de riesgo.
   - < 30: Bajo (Uso normal/retail).
   - 30-70: Medio (Uso intensivo, patrones mixtos).
   - 70-90: Alto (Patrones sospechosos, structuring, mezcla excesiva).
   - > 90: Crítico (Patrones claros de lavado, scams, hacks).

2. **Perfil de Actor**: Determina qué tipo de entidad parece ser:
   - "Retail User", "Whale/Institucional", "Bot/High Frequency", "Exchange Hot Wallet", "Mule Account", "Gambling User", etc.

3. **Patrones Sospechosos**: Detecta si existen comportamientos como:
   - **Structuring/Smurfing**: Múltiples txs pequeñas por debajo de umbrales.
   - **Layering**: Movimiento rápido de fondos (entra y sale casi inmediatamente).
   - **Wash Trading**: Movimientos circulares.
   - **Interaction with High Risk**: Interacción con contratos desconocidos o mixers (si se puede inferir).

4. **Interacción con CEX**: Basado en las direcciones "To" o "From", ¿puedes identificar si interactúa con grandes exchanges (Binance, OKX, etc)? (Infiere si ves muchas txs a direcciones variadas o contratos masivos, o simplemente indica "No identificado" si no hay etiquetas).

FORMATO JSON ESPERADO:
{
  "riskScore": 0,
  "riskLevel": "BAJO" | "MEDIO" | "ALTO" | "CRÍTICO",
  "riskFactors": ["Factor 1", "Factor 2"],
  "profileType": "Retail User", 
  "patternsDetected": [
    { "name": "Structuring", "description": "Explicación breve...", "detected": boolean },
    { "name": "Layering", "description": "Explicación breve...", "detected": boolean }
  ],
  "cexInteractions": ["Binance", "Unknown"],
  "summaryAnalysis": "Resumen ejecutivo del perfil de la billetera..."
}
`;

export const GEMINI_CRYPTO_PATTERN_ALERT_PROMPT = (transactionsJson: string, walletAddress: string, network: string): string => `
Eres un experto en análisis forense de blockchain y detección de patrones de lavado de activos.
Analiza las siguientes transacciones de la wallet ${walletAddress} en la red ${network} y detecta patrones sospechosos.

Transacciones:
${transactionsJson}

Detecta específicamente estos patrones:
1. **Structuring (Pitufeo)**: Múltiples transacciones justo por debajo de umbrales regulatorios (ej: muchas txs de $9,500 cuando el umbral es $10,000)
2. **Layering (Estratificación)**: Fondos que se mueven rápidamente entre múltiples wallets para ocultar origen
3. **Smurfing**: Múltiples pequeñas transacciones que en conjunto suman montos significativos
4. **Round-trip transactions**: Fondos que salen y regresan a la misma wallet
5. **Velocity anomalies**: Frecuencia inusualmente alta de transacciones en períodos cortos
6. **Mixer/Tumbler usage**: Interacciones con servicios de mezcla conocidos

Responde ÚNICAMENTE con JSON válido:
{
  "alertas": [
    {
      "tipo": "Structuring" | "Layering" | "Smurfing" | "Round-trip" | "Velocity" | "Mixer",
      "severidad": "Alta" | "Media" | "Baja",
      "detectado": boolean,
      "descripcion": "descripción específica con evidencia de las transacciones",
      "transaccionesRelacionadas": ["txHash1", "txHash2"]
    }
  ],
  "nivelRiesgoGeneral": "Bajo" | "Medio" | "Alto" | "Crítico",
  "resumenPatrones": "resumen ejecutivo del análisis de patrones",
  "recomendacionesUAF": ["recomendación 1 para reportar a la UAF/UIAF"]
}
`;

export const GEMINI_COMPLIANCE_AUDIT_PROMPT = (documentText: string): string => `
Eres un experto en Compliance y AML (Prevención de Lavado de Activos). Tu tarea es auditar documentos contra el Estándar de Global66 y presentar el informe COMPLETAMENTE EN ESPAÑOL.

**REGLAS DE ORO:**
1. **IDIOMA:** Todo el informe (resumen, evidencias, riesgos, recomendaciones) DEBE estar en español.
2. **TRADUCCIÓN:** Si el documento original está en otro idioma, traduce las cláusulas y hallazgos al español de forma precisa.
3. **AUDITORÍA:** Evalúa los pilares A a I del estándar.
4. **DICTAMEN:** Emite un juicio claro sobre la aptitud de onboarding.

TEXTO:
---
${documentText}
---

Responde en formato JSON:
{
  "summary": "Resumen ejecutivo en español...",
  "commonPoints": ["Punto 1", "Punto 2"],
  "comparisonTable": [
    {
      "pillar": "Nombre del Pilar",
      "status": "Cumple" | "Parcial" | "No cumple",
      "evidence": "Evidencia traducida al español...",
      "risk": "Riesgo en español...",
      "recommendation": "Mejora en español..."
    }
  ],
  "gaps": ["Brecha 1", "Brecha 2"],
  "specificRecommendations": ["Rec 1", "Rec 2"],
  "onboardingDictum": "Apto" | "Apto con condiciones" | "No apto",
  "dictumJustification": "Justificación en español."
}
`;

export const GEMINI_BATCH_ENRICHMENT_PROMPT = (documentText: string): string => `
Eres un analista de compliance KYB especializado en documentos corporativos, tributarios e identitarios latinoamericanos.

Analiza el siguiente conjunto de documentos y extrae la información estructurada solicitada.

REGLAS CRÍTICAS:
1. Solo extrae información EXPLÍCITAMENTE presente en los documentos. No inventes, no inferas.
2. Si un campo no está presente en ningún documento, usa exactamente el string: "No disponible"
3. Para campos booleanos de consistencia: usa true si los documentos coinciden, false si hay discrepancia, null si no hay suficientes documentos para comparar.
4. Responde ÚNICAMENTE con el objeto JSON válido. Sin texto antes ni después.
5. No calcules riesgos, no hagas juicios AML, solo extrae y estructura.
6. NORMALIZACIÓN AL COMPARAR IDENTIFICADORES (RUT/RUN/DNI/NIT): antes de decidir si un RUT o número de documento es consistente entre documentos, NORMALIZA ambos valores eliminando puntos, guiones y espacios, y tratando el dígito verificador "k"/"K" como equivalente (sin distinguir mayúsculas). Ejemplo: "13.869.118-7" y "138691187" son el MISMO RUT → consistente. Una diferencia que es SOLO de formato (puntos, guión, espacios, mayúscula/minúscula del dígito verificador) NUNCA es una inconsistencia ni una "diferencia en el dígito verificador"; solo marca discrepancia si los dígitos normalizados realmente difieren.

DOCUMENTOS:
---
${documentText.slice(0, 28000)}
---

Devuelve ÚNICAMENTE este JSON:
{
  "estructuraSocietaria": {
    "tipoSociedad": "SpA | S.A. | Ltda. | SRL | otro tipo, o No disponible",
    "cantidadAccionistas": "número entero como string, o No disponible",
    "participacionAccionaria": "Nombre Accionista: XX%\\nNombre Accionista2: XX% (uno por línea), o No disponible",
    "accionistaControlador": "nombre completo del accionista con mayor participación, o No disponible",
    "formaAdministracion": "Administrador Único | Directorio | Gerente | otro, o No disponible"
  },
  "restriccionesSocietarias": {
    "restriccionTransferenciaAcciones": "descripción textual si existe expresamente, o No disponible",
    "derechoPreferente": "descripción textual si existe expresamente, o No disponible",
    "delegacionFacultades": "descripción textual si existe expresamente, o No disponible"
  },
  "informacionTributaria": {
    "fechaInicioActividades": "DD-MM-AAAA o No disponible",
    "empresaMenorTamano": "Sí | No | No disponible",
    "actividadesEconomicas": ["463020 | Descripción actividad", "otro código | descripción"]
  },
  "verificacionRepresentante": {
    "documentoIdentidad": "número de documento o No disponible",
    "nacionalidad": "código país (CHL, COL, PER, etc.) o No disponible",
    "fechaNacimiento": "AAAA-MM-DD o No disponible",
    "sexo": "M | F | No disponible",
    "lugarNacimiento": "ciudad o No disponible",
    "fechaEmisionDocumento": "fecha o No disponible",
    "fechaExpiracionDocumento": "fecha o No disponible",
    "identityVerification": "PASSED | FAILED | No disponible",
    "similarity": "PASSED | FAILED | No disponible",
    "liveness": "PASSED | FAILED | No disponible",
    "riskScore": "número o No disponible"
  },
  "informacionComercial": {
    "marcasRepresentadas": "marcas separadas por coma, o No disponible",
    "correosCorporativos": "emails separados por coma, o No disponible",
    "telefonosCorporativos": "teléfonos separados por coma, o No disponible",
    "horarioAtencion": "horario o No disponible"
  },
  "consistenciaDocumental": {
    "razonSocialConsistente": true,
    "rutConsistente": true,
    "representanteConsistente": true,
    "fechaConstitucionConsistente": true,
    "inconsistencias": []
  }
}
`;

// ─── COMPARATIVA CONTRA ADMIN (EmpresaDocs) ──────────────────────────────────
// Compara lo extraído de los documentos vs los datos oficiales registrados en
// EmpresaDocs (fuente de verdad administrativa).
export const GEMINI_ADMIN_COMPARISON_PROMPT = (extraidoDeDocumentos: string, datosAdmin: string): string => `
Eres un analista de compliance KYB. Debes comparar la información EXTRAÍDA DE LOS DOCUMENTOS de una empresa contra los DATOS OFICIALES registrados en el sistema administrativo (EmpresaDocs), que es la fuente de verdad.

REGLAS CRÍTICAS:
1. Compara solo lo que puedas determinar con la información disponible. Si un lado no tiene el dato, ese campo es null (no lo cuentes como discrepancia).
2. NORMALIZACIÓN OBLIGATORIA antes de comparar (aplícala SIEMPRE):
   - RUT/RUN/DNI/NIT: elimina TODOS los puntos, guiones y espacios, y trata "k"/"K" como equivalente, ANTES de comparar. Compara solo la secuencia de dígitos resultante + dígito verificador. "13.869.118-7", "13869118-7", "13.869.118 7" y "138691187" son EXACTAMENTE el MISMO RUT → consistente. Una diferencia de puntuación, guión, espacios o mayúsculas NUNCA cuenta como discrepancia ni la menciones en inconsistencias.
   - Nombres de personas y razones sociales: ignora mayúsculas/minúsculas, tildes, orden de nombres/apellidos y sufijos societarios (S.A., SpA, Ltda., etc.). "Sebastián Fontbona Urdangarín" y "SEBASTIAN FONTBONA" refieren a la misma persona → consistente.
   - Actividades económicas: compara por código y/o descripción equivalente; el orden no importa.
3. QUÉ COMPARAR EN CADA CAMPO:
   - razonSocialRutConsistente: razón social y RUT del documento vs los oficiales.
   - representanteConsistente: representante(s) legal(es) del documento vs los oficiales.
   - actividadesConsistente: las actividades económicas / giro del documento vs los campos de INDUSTRIA y ACTIVIDADES del registro oficial (busca en registroOficial claves como industry, activities, economicActivity, giro, rubro, etc.). Si el registro oficial no trae industria ni actividades, deja este campo en null.
   - accionistasConsistente: los accionistas / beneficiarios finales que aparecen en LOS DOCUMENTOS vs los del registro oficial (representantesLegales/accionistasBeneficiarios/registroOficial). Si ninguno de los dos lados los declara, deja este campo en null.
4. Para cada campo booleano: true si coincide, false si hay discrepancia real, null si no hay datos suficientes en alguno de los dos lados.
5. En "inconsistencias" describe SOLO discrepancias reales (no de formato), en frases cortas y claras en español.
6. Responde ÚNICAMENTE con el objeto JSON válido. Sin texto antes ni después.

INFORMACIÓN EXTRAÍDA DE LOS DOCUMENTOS:
---
${extraidoDeDocumentos.slice(0, 14000)}
---

DATOS OFICIALES REGISTRADOS (EmpresaDocs):
---
${datosAdmin.slice(0, 20000)}
---

Devuelve ÚNICAMENTE este JSON:
{
  "razonSocialRutConsistente": true,
  "representanteConsistente": true,
  "actividadesConsistente": true,
  "accionistasConsistente": true,
  "inconsistencias": [],
  "resumen": "una frase breve con la conclusión general de la comparación"
}
`;

export const GEMINI_EXECUTIVE_SUMMARY_PROMPT = (extractedFields: string, fileName: string): string => `
Eres un analista legal senior especializado en escrituras públicas latinoamericanas.
Basándote en los siguientes campos extraídos del documento "${fileName}", genera un resumen ejecutivo profesional y conciso.

Campos extraídos:
${extractedFields}

Genera un resumen ejecutivo en español de máximo 250 palabras que incluya:
1. Una descripción del tipo y propósito del documento
2. Los datos más relevantes de la sociedad (nombre, RUT, constitución)
3. Aspectos clave de la administración y capital
4. Observaciones importantes o alertas (modificaciones, cláusulas especiales)
5. Una conclusión breve sobre el estado del documento

El tono debe ser formal y profesional. No uses listas con viñetas, escribe en párrafos fluidos.
Responde SOLO con el texto del resumen, sin títulos ni formato adicional.
`;

// ─── COMPLIANCE vs MANUAL COMPARISON PROMPT ──────────────────────────────────
export const GEMINI_COMPLIANCE_VS_MANUAL_PROMPT = (manualText: string, documentText: string): string => `
Eres un experto auditor de cumplimiento AML/LAFT especializado en estándares GAFI/GAFILAT.

Se te proporciona:
1. MANUAL DE REFERENCIA: El Manual de Prevención LAFT v9.0 de Global66 (G81-MAN-003), que es el estándar de comparación.
2. DOCUMENTO A EVALUAR: Un documento de política o manual de cumplimiento de otra organización que debe ser evaluado.

Tu tarea es hacer una comparación exhaustiva entre ambos documentos, identificando semejanzas, diferencias y brechas en 13 pilares clave.

MANUAL DE REFERENCIA (Global66 G81-MAN-003 v9.0):
---
${manualText.slice(0, 15000)}
---

DOCUMENTO A EVALUAR:
---
${documentText.slice(0, 12000)}
---

Devuelve SOLO un JSON válido con esta estructura exacta:
{
  "resumenGeneral": "Resumen ejecutivo de 3-4 oraciones sobre el nivel general de alineación",
  "tablaPilares": [
    {
      "seccion": "Nombre del pilar (ej: Política de Aceptación de Clientes)",
      "referenciaManual": "Qué exige el manual Global66 en este pilar (1-2 oraciones)",
      "estadoDocumento": "Cumple" | "Cumple Parcialmente" | "No Cumple" | "No Aplica",
      "semejanzas": "Qué coincide entre los documentos en este pilar",
      "diferencias": "Qué difiere o se trata de manera distinta",
      "brechas": "Qué le falta al documento evaluado para alinearse al manual",
      "nivelRiesgo": "Alto" | "Medio" | "Bajo" | "Sin Riesgo"
    }
  ],
  "semejanzasGlobales": ["lista de puntos de coincidencia entre ambos documentos"],
  "diferenciasGlobales": ["lista de diferencias importantes identificadas"],
  "brechasCriticas": ["lista de brechas críticas que deben resolverse con urgencia"],
  "recomendacionesPriorizadas": ["lista de recomendaciones ordenadas de mayor a menor urgencia"],
  "nivelCumplimientoGlobal": 75,
  "dictamen": "Alineado" | "Parcialmente Alineado" | "No Alineado",
  "dictamenJustificacion": "Justificación del dictamen en 2-3 oraciones"
}

Los 13 pilares a evaluar obligatoriamente son:
1. Política de Aceptación de Clientes
2. Política de Gestión de Riesgo AML/CFT
3. Política KYC (Conozca a su Cliente)
4. Política de Monitoreo y Reportes
5. Reportes a la UAF (ROS/ROE)
6. Política KYE (Conozca a su Empleado)
7. Política de Formación del Personal
8. Política de Transferencias
9. Política de Regalos y Conflictos de Interés
10. Roles y Responsabilidades (Oficial de Cumplimiento)
11. Cumplimiento y Sanciones
12. Revisión Independiente
13. Gestión de PEPs y Listas Negras

Para cada pilar, basa la evaluación en el contenido real de ambos documentos. Si el documento a evaluar no menciona el pilar, marca "No Cumple" con brecha crítica.

El nivelCumplimientoGlobal debe calcularse como el porcentaje de pilares que "Cumple" o "Cumple Parcialmente" sobre el total.
`;
