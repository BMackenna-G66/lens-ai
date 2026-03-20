

export const API_KEY_PLACEHOLDER = "MISSING_API_KEY_CONFIG_VALUE";

export const PREDEFINED_FIELDS: string[] = [
  "ID de la Sociendad",
  "Razón Social",
  "Fecha de Constitución en formato fecha",
  "Fecha de expedición",
  "Forma de administración",
  "Objeto Social",
  "Capital Social (suscrito y pagado)",
  "Número y tipo de acciones",
  "Accionistas y aportes",
  "Representante Legal o Administrador",
  "Duración de la sociedad",
  "Domicilio Legal",
  "Facultades del Administrador",
  "Información sobre Juntas de Accionistas",
  "Mecanismo de Resolución de Conflictos",
  "Método de Distribución de Utilidades",
  "Medio de Comunicación Oficial entre Socios y Sociedad",
  "¿Empresa con fines de lucro?",
  "Documento contiene modificaciones?"
];

export const GEMINI_COUNTRY_DETECTION_PROMPT_TEMPLATE = (documentText: string, countryList: string[]): string => `
Eres un experto en identificación de países a partir de documentos legales. Basado en la terminología, nombres y frases legales en el texto del documento proporcionado, determina su país de origen de la siguiente lista: ${countryList.join(', ')}.

Tu respuesta DEBE ser una única clave en minúsculas de la lista proporcionada (p. ej., 'chile', 'colombia', 'peru').
Si estás muy seguro, devuelve la clave del país. Si no puedes determinar el país con alta confianza, devuelve la cadena 'unknown'.
No proporciones ninguna explicación o texto adicional.

TEXTO DEL DOCUMENTO:
---
${documentText}
---
`;


export const GEMINI_PROMPT_TEMPLATE = (documentText: string, countryContext?: string): string => `
Eres un asistente legal especializado en el análisis de escrituras públicas de sociedades. Tu objetivo es extraer información clave de manera precisa.

${countryContext || 'Estás analizando un documento de origen no especificado.'}

Tu objetivo es leer el documento legal, incluso si tiene lenguaje técnico o jurídico complejo, y extraer los siguientes campos en el orden exacto, 
asegurando que el resultado siempre esté en formato tabla Markdown con dos columnas: "Campo" y "Valor extraído".

Extrae los siguientes 19 datos clave usando los nombres de campo EXACTOS proporcionados:
1. ${PREDEFINED_FIELDS[0]}
2. ${PREDEFINED_FIELDS[1]}
3. ${PREDEFINED_FIELDS[2]}
4. ${PREDEFINED_FIELDS[3]}
5. ${PREDEFINED_FIELDS[4]}
6. ${PREDEFINED_FIELDS[5]}
7. ${PREDEFINED_FIELDS[6]}
8. ${PREDEFINED_FIELDS[7]}
9. ${PREDEFINED_FIELDS[8]}
10. ${PREDEFINED_FIELDS[9]}
11. ${PREDEFINED_FIELDS[10]}
12. ${PREDEFINED_FIELDS[11]}
13. ${PREDEFINED_FIELDS[12]}
14. ${PREDEFINED_FIELDS[13]}
15. ${PREDEFINED_FIELDS[14]}
16. ${PREDEFINED_FIELDS[15]}
17. ${PREDEFINED_FIELDS[16]}
18. ${PREDEFINED_FIELDS[17]}
19. ${PREDEFINED_FIELDS[18]}


Debes ser conciso en la informacion entregada y se debe priorizar la extraccion de datos
Recuerda que luego de generada la ficha se te entregara información para validar contra los puntos anteriores, las respuestas deben ser cortas y concisas.

Si un campo no está presente en el texto, completa su valor como “No especificado”.
Ten especial cuidado con el campo 'Objeto Social' y 'Facultades del Administrador', estos deben ser resumidos y concisos.

Para el campo "${PREDEFINED_FIELDS[18]}", analiza si el documento menciona explícitamente modificaciones, saneamientos o rectificaciones a una escritura anterior. Si es así, responde "Sí contiene" y resume brevemente la modificación. Si no se mencionan, responde "No contiene".

El resultado siempre debe estar en formato tabla. No incluyas explicaciones, observaciones ni conclusiones. No busques información fuera del documento entregado.

EJEMPLO DE TABLA ESPERADA (No es parte del documento, solo un ejemplo de formato):
| Campo                          | Valor extraído                |
|--------------------------------|-------------------------------|
| ${PREDEFINED_FIELDS[0]}        | XX.XXX.XXX-X                  |
| ${PREDEFINED_FIELDS[1]}        | Sociedad Ejemplo SpA          |
| ... (otros campos) ...         | ... (valores correspondientes) ... |

DOCUMENTO A ANALIZAR:
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

Tu tarea es analizar el documento complementario en el contexto del documento principal y responder exclusivamente a las siguientes dos preguntas.
Formatea tu respuesta OBLIGATORIAMENTE como un objeto JSON con las claves "validezDocumentoSecundario" y "diferenciasEncontradas".

1.  **validezDocumentoSecundario**: ¿Los datos clave (como nombres, RUTs, fechas importantes, objeto social si aplica) presentes en el documento complementario parecen ser válidos y consistentes cuando se comparan con el resumen del documento principal? 
Proporciona una justificación breve y directa. Por ejemplo: "Sí, los datos como la Razón Social 'Empresa Ejemplo SpA' y el RUT 'XX.XXX.XXX-X' coinciden con el documento principal, 
lo que sugiere validez." o "No, existen discrepancias en el nombre del Representante Legal, lo que podría indicar invalidez o un cambio posterior." o "El documento complementario no contiene suficientes datos comparables para determinar su validez respecto al principal."

2.  **diferenciasEncontradas**: ¿Hay alguna diferencia relevante, adición o contradicción notable en la información presentada en el documento complementario en comparación con el resumen del documento principal? Menciona las diferencias específicas o confirma si no hay diferencias significativas. Por ejemplo: "El documento complementario detalla las facultades del apoderado que no estaban explícitas en el resumen principal." o "No se observan diferencias relevantes; el documento complementario parece ser un poder que es coherente." o "El documento complementario introduce una nueva dirección que no estaba en el domicilio legal del principal."

**IMPORTANTE: Tu respuesta DEBE ser únicamente un objeto JSON válido con las dos claves mencionadas. No incluyas texto explicativo antes o después del objeto JSON.**
Ejemplo de respuesta JSON esperada:
{
  "validezDocumentoSecundario": "Sí, los datos como la Razón Social y el RUT son consistentes.",
  "diferenciasEncontradas": "El documento complementario especifica un nuevo apoderado no listado previamente."
}
`;

export const GEMINI_CHAT_SYSTEM_INSTRUCTION = `Eres un asistente de IA especializado en responder preguntas basadas *únicamente* en un CONTEXTO DOCUMENTAL que se te ha proporcionado. Tu tarea es analizar este contexto y responder preguntas. NO DEBES usar conocimiento externo ni información no presente en dicho contexto. Si la respuesta a una pregunta no se encuentra explícitamente en el CONTEXTO DOCUMENTAL, debes indicar: 'La información solicitada no se encuentra en los documentos proporcionados.' Responde de forma concisa y directa. No añadas saludos ni preámbulos innecesarios.`;


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
    *   Busca en la sección "Objeto Social" o similar si el texto contiene alguna de las siguientes palabras clave (o sus variantes): "criptomonedas", "armas", "casinos", "offshore".
    *   Si encuentras alguna, establece "detected" en \`true\` y en "reason" especifica qué palabras encontraste. Ejemplo: "Se detectó la palabra clave 'criptomonedas' en el objeto social.".
    *   Si no encuentras ninguna, establece "detected" en \`false\` y en "reason" escribe "No se detectaron palabras clave de actividad económica sospechosa en el objeto social.".

2.  **suspiciousLanguage**:
    *   Busca en todo el documento cláusulas que sean excesivamente vagas o abiertas, como por ejemplo: "...y cualquier otra actividad lícita", "...cualquier otro negocio de lícito comercio", "...y en general, celebrar toda clase de actos y contratos que la ley permita".
    *   Si encuentras este tipo de lenguaje, establece "detected" en \`true\` y en "reason" cita un breve ejemplo de la cláusula encontrada. Ejemplo: "Se encontró una cláusula vaga: '...y cualquier otra actividad de lícito comercio que acuerden los socios.'".
    *   Si el lenguaje es específico y no contiene estas cláusulas genéricas, establece "detected" en \`false\` y en "reason" escribe "El lenguaje del documento parece ser específico y no contiene cláusulas vagas o no estándar.".

IMPORTANTE: Responde únicamente con el objeto JSON. No añadas texto, explicaciones ni markdown.
`;
