"""Prompts de Lens — GENERADO, NO EDITAR A MANO.

Fuente de verdad: `constants.ts`, `components/DocumentAnalyzer.tsx` y
`services/countryKeywords.ts` de la SPA.

Para actualizar:  python3 scripts/generar_prompts.py
Para verificar:   python3 scripts/generar_prompts.py --check

Si editás este archivo a mano, el verificador va a fallar en el próximo deploy.
"""

# ruff: noqa: E501

CAMPOS_PREDEFINIDOS: list[str] = [    'RUT de la sociedad',
    'Razón Social',
    'Fecha de Constitución',
    'Objeto Social',
    'Capital Social',
    'Acciones',
    'Accionistas y aportes',
    'Representante Legal',
    'Duración',
    'Domicilio Legal',
    'Facultades',
    'Juntas de Accionistas',
    'Resolución de Conflictos',
    'Distribución de Utilidades',
    'Medio de Comunicación',
    '¿Empresa con fines de lucro?',
    'Documento contains modificaciones?',
    'Análisis de Facultades Específicas',
]

PAISES: list[str] = [
    'chile',
    'colombia',
    'peru',
    'ecuador',
    'argentina',
    'mexico',
    'uruguay',
    'panama',
    'islas_caiman',
    'eeuu',
    'espana',
    'reino_unido',
    'paraguay',
    'costa_rica',
    'hong_kong',
    'brasil',
    'usa',
    'francia',
    'dinamarca',
    'internacional',
    'china',
]

CONTEXTO_POR_PAIS: dict[str, str] = {
    'chile': 'Estás analizando una escritura pública o documento legal chileno. Usa terminología legal chilena (RUT, SpA, SA, Ltda, Notaría, Conservador de Bienes Raíces).',
    'colombia': 'Estás analizando un documento legal colombiano. Usa terminología legal colombiana (NIT, SAS, SA, Ltda, Cámara de Comercio, matrícula mercantil).',
    'peru': 'Estás analizando un documento legal peruano. Usa terminología legal peruana (RUC, SAC, SA, EIRL, Registros Públicos, SUNARP).',
    'ecuador': 'Estás analizando un documento legal ecuatoriano. Usa terminología legal ecuatoriana (RUC, Superintendencia de Compañías).',
    'argentina': 'Estás analizando un documento legal argentino. Usa terminología legal argentina (CUIT, SA, SRL, IGJ, AFIP).',
    'mexico': 'Estás analizando un documento legal mexicano. Usa terminología legal mexicana (RFC, SA de CV, SAPI, Registro Público de Comercio).',
    'uruguay': 'Estás analizando un documento legal uruguayo. Usa terminología legal uruguaya (RUT, SA, SRL, DGI, Registro de Comercio).',
    'panama': 'Estás analizando un documento legal panameño. Usa terminología legal panameña (RUC, SA, Registro Público de Panamá).',
    'islas_caiman': 'Estás analizando un documento legal de Islas Caimán. Usa terminología de derecho corporativo de Caimán (exempted company, Cayman Islands Registry).',
    'eeuu': 'Estás analizando un documento legal estadounidense. Usa terminología legal de EE.UU. (EIN, LLC, Corp, Inc, Secretary of State, Articles of Incorporation).',
    'usa': 'Estás analizando un documento legal estadounidense en inglés. Traduce todo el contenido al español. Usa terminología legal de EE.UU. (EIN, Tax ID, LLC, Corp, Inc, Articles of Incorporation).',
    'espana': 'Estás analizando un documento legal español. Usa terminología legal española (NIF, CIF, SA, SL, Registro Mercantil, escritura pública).',
    'reino_unido': 'Estás analizando un documento legal del Reino Unido. Traduce el contenido al español. Usa terminología legal del Reino Unido (Companies House, Ltd, PLC, UTR).',
    'paraguay': 'Estás analizando un documento legal paraguayo. Usa terminología legal paraguaya (RUC, SA, SRL, Registro Público de Comercio).',
    'costa_rica': 'Estás analizando un documento legal costarricense. Usa terminología legal costarricense (cédula jurídica, SA, SRL, Registro Nacional).',
    'hong_kong': 'Estás analizando un documento legal de Hong Kong. Traduce el contenido al español. Usa terminología de derecho corporativo de Hong Kong (Companies Registry, Ltd, BRN).',
    'brasil': 'Estás analizando un documento legal brasileño en portugués. Traduce todo el contenido al español. Usa terminología legal brasileña (CNPJ, CPF, Razão Social, Junta Comercial, Ltda, SA).',
    'china': 'Estás analizando un documento legal chino (mandarín). Traduce todo el contenido al español. Usa la guía de mapeo para documentos chinos incluida a continuación.',
    'francia': 'Estás analizando un documento legal francés. Traduce todo el contenido al español. Usa terminología legal francesa (SIRET, SIREN, SARL, SA, Raison sociale, Registre du Commerce).',
    'dinamarca': 'Estás analizando un documento legal danés. Traduce todo el contenido al español. Usa terminología legal danesa (CVR-nummer, ApS, A/S, Selskabsnavn, Erhvervsstyrelsen).',
    'internacional': 'Estás analizando un documento legal de origen internacional. Traduce todo el contenido al español e identifica la jurisdicción si es posible.',
}

CONTEXTO_POR_DEFECTO = 'Estás analizando un documento de origen no especificado.'

PROMPT_DETECCION_PAIS = '''\

Eres un experto en identificación de países a partir de documentos legales. Basado en la terminología, nombres y frases legales en el texto del documento proporcionado, determina su país de origen de la siguiente lista: {lista_paises}.

Tu respuesta DEBE ser una única clave en minúsculas de la lista proporcionada (p. ej., 'chile', 'colombia', 'peru', 'china', 'brasil', 'usa', 'francia', 'dinamarca', 'internacional').
Si estás muy seguro, devuelve la clave del país. Si no puedes determinar el país con alta confianza, devuelve la cadena 'unknown'.
Para documentos en chino o mandarín, devuelve 'china'. Para documentos en portugués de Brasil, devuelve 'brasil'. Para documentos en inglés de EE.UU., devuelve 'usa'. Para documentos en francés, devuelve 'francia'. Para documentos en danés, devuelve 'dinamarca'. Para documentos internacionales sin país claro, devuelve 'internacional'.
No proporciones ninguna explicación o texto adicional.

TEXTO DEL DOCUMENTO:
---
{texto_documento}
---
'''

PROMPT_EXTRACCION = '''\

Eres un asistente legal experto en análisis y traducción de documentos corporativos (escrituras, actas, estatutos). Tu tarea es extraer información específica y presentarla COMPLETAMENTE EN ESPAÑOL.

{contexto_pais}

**REGLAS DE ORO:**
1. **IDIOMA DE SALIDA:** Todo el contenido extraído DEBE estar en español. Si el documento original está en inglés, portugués, chino u otro idioma, traduce los términos técnicos y el contenido al español de forma profesional.
2. **PRECISIÓN:** Extrae los datos basándote estrictamente en el texto. No inventes información.
3. **VALORES AUSENTES:** Si un campo no existe en el documento, responde exactamente: "No especificado".
4. **CONCISIÓN:** Para "Objeto Social" y "Facultades del Administrador", resume los puntos principales en español.
5. **MODIFICACIONES:** Para "Documento contains modificaciones?", indica si el documento es una modificación de uno anterior. Responde "Sí contiene" (y resume) o "No contiene".

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

**INSTRUCCIONES PARA LOS DOCUMENTOS DE IDENTIDAD (RUT / NIT / cédula):**
Es el dato con MÁS peso en la comparación automática: es lo que permite decir que
dos registros son la misma empresa o la misma persona. Un documento perdido o mal
leído convierte una coincidencia real en una discrepancia.

- **"RUT de la sociedad"**: el identificador tributario de la SOCIEDAD, nunca el
  de una persona. Inclúyelo SIEMPRE con su dígito verificador, en el formato en
  que aparece (ej: 78.451.792-6). Si el dígito es K, escríbelo como K.
- **Búscalo en TODO el documento**, no solo en el encabezado: la comparecencia,
  la cláusula de constitución, el timbre notarial y el pie suelen traerlo aunque
  el título no.
- Si el documento nombra varios RUT, el de la sociedad que se constituye o
  modifica — no el de la notaría, ni el del conservador, ni el de los socios.
- **NUNCA inventes, completes ni corrijas un dígito.** Si el número aparece
  incompleto o ilegible, escribe exactamente: No especificado
- **El documento de cada persona** va en la segunda columna del formato de
  personas que se describe abajo. Búscalo junto al nombre en la comparecencia:
  "don Juan Pérez, cédula nacional de identidad número 12.345.678-9".

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
Ejemplo: "{"compraVentaBienes": true, "operacionesBancarias": false, "mandatos": true}"

DOCUMENTO:
---
{texto_documento}
---
'''

PROMPT_SHAREHOLDERS = '''\
Eres un analista de KYC. Del documento adjunto extrae los REPRESENTANTES LEGALES y TODOS los dueños que figuren en la tabla de propiedad.

Devuelve SOLO JSON con el esquema pedido. No expliques nada.

═══ QUIÉN CUENTA COMO DUEÑO ═══
Trata como DUEÑO a quien figure con cualquiera de estas etiquetas:
Accionista · Socio · Asociado · Miembro · Miembro Fundador · Fundador ·
Aportante · Constituyente · Cooperado · Adherente ·
Beneficiario (solo cuando figura como dueño directo).

Si hay una columna TIPO DE ASOCIADO, TIPO DE SOCIO o CALIDAD con valores como
"Fundador", "Activo" u "Honorario", esa fila ES un dueño directo.

PROHIBIDO excluir a una entidad por su tipo legal. Las ESAL, cooperativas,
asociaciones y fundaciones SÍ entran: sus asociados y miembros fundadores son
equivalentes a accionistas para KYC.

═══ UNA SOLA SOCIEDAD: LA PRINCIPAL ═══
Primero identificá cuál es la sociedad PRINCIPAL del documento: la que se
constituye, se modifica o se certifica. Es la del encabezado.

"owners" lleva ÚNICAMENTE a los dueños de ESA sociedad.

ESTO ES LO QUE MÁS SE FALLA: un documento puede traer TAMBIÉN la composición de
OTRA empresa —una que es socia de la principal, su matriz, o una relacionada—,
normalmente en una cláusula aparte con su propia tabla y su propio encabezado.
Los socios de ESA OTRA empresa NO son dueños de la principal y NO van en
"owners". Ignoralos por completo en esta respuesta; se preguntan aparte.

Regla para no equivocarse: si una tabla está encabezada por el nombre de una
empresa distinta a la principal, esa tabla NO es de "owners".

Verificación antes de responder: los "ownershipPercentage" de "owners" tienen
que sumar aproximadamente 100. Si te da más, metiste gente de otra tabla.

═══ TODO PLANO, SIN ANIDAR ═══
Poné a los dueños en "owners", naturales y jurídicas por igual, marcando cada
uno con su "personType".

NO anides nada. NO busques quién está detrás de las jurídicas: eso se pregunta
aparte.

═══ name / lastName — leelo con cuidado ═══
"shareholderName" es el nombre completo TAL CUAL figura en el documento.
Además hay que partirlo:
  · "name"     = TODOS los nombres de pila
  · "lastName" = TODOS los apellidos

En los registros de Colombia el orden es APELLIDOS PRIMERO. En Chile suele ser
nombres primero. Decidí por el contexto del documento, no por la posición fija.

Ejemplos correctos:
  "PEREZ GOMEZ ANGELA VIVIANA"  → name: "ANGELA VIVIANA"  lastName: "PEREZ GOMEZ"
  "JUAN ANDRES PEREZ SOTO"      → name: "JUAN ANDRES"     lastName: "PEREZ SOTO"
  "MARIA JOSE GONZALEZ RUIZ"    → name: "MARIA JOSE"      lastName: "GONZALEZ RUIZ"

Fijate en el primero: es orden registral colombiano, y "VIVIANA" es un segundo
NOMBRE, no un apellido. Un error acá se repite en todo el registro colombiano.

Para personas JURÍDICAS: "shareholderName" es la razón social, y "name" y
"lastName" van vacíos.

═══ EL RESTO DE LOS CAMPOS ═══
· personType: "NATURAL" o "JURIDICA"
· shareholderId: el documento tal como figura (RUT, cédula, NIT, DNI, pasaporte).
  Si el documento lo escribe en palabras, transcribí los DÍGITOS.
  Si no aparece, dejalo vacío.
· identificationType: CC, NIT, RUT, CE, PASAPORTE, DNI… lo que corresponda
· countryOfOrigin: país de la persona o de constitución de la jurídica
· ownershipPercentage: número, sin el signo %. Si el documento da acciones y el
  total, calculalo. Si no se puede saber, dejalo en null — NO lo estimes.
· isPEP: true solo si el documento lo dice; false si dice que no; null si no lo menciona.

Para los REPRESENTANTES LEGALES, además: "position" con el cargo (Gerente
General, Representante Legal, Administrador…).

Extraé lo que el documento dice. Si un dato no está, va vacío o null.'''

PROMPT_SHAREHOLDERS_CADENA = '''\
Del documento adjunto, extrae ÚNICAMENTE los socios, accionistas o asociados de esta empresa:

  {empresa}

Devuelve SOLO JSON con el esquema pedido.

Buscá en TODO el documento: la información suele estar en una cláusula aparte, un
anexo o un certificado de cámara de comercio, con su propio encabezado y su
propia tabla. NO es la tabla de accionistas de la sociedad principal.

Si el documento NO dice quiénes son sus socios, devolvé "members" vacío: [].
NO INVENTES PERSONAS. Nunca completes una cadena que el documento no muestra.

"shareholderName" va TAL CUAL figura en el documento, SIN REORDENAR. Si el
documento dice "PEREZ GOMEZ ANGELA VIVIANA", eso es lo que va — no lo pases a
"ANGELA VIVIANA PEREZ GOMEZ". El orden registral es un dato, y quien después
cruce contra el registro necesita el nombre como está escrito.

El reordenamiento va SOLO en "name" y "lastName", que son la partición:
  "PEREZ GOMEZ ANGELA VIVIANA"  → shareholderName: "PEREZ GOMEZ ANGELA VIVIANA"
                                  name: "ANGELA VIVIANA"  lastName: "PEREZ GOMEZ"

Y las mismas para el resto: "personType" NATURAL o JURIDICA, "shareholderId" con
el documento tal como figura, "identificationType", "countryOfOrigin",
"ownershipPercentage" como número sin el signo % (null si no se puede saber, NO
lo estimes) e "isPEP" en true/false/null.'''
