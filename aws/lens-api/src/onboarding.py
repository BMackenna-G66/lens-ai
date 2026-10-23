"""Serialización al contrato de **Onboarding B2B** (v1.2, 25-sep-2026).

Esta es la Fase 6 del plan: los siete desajustes de formato entre lo que LENS
extrae y lo que Onboarding espera.

── Por qué es un módulo aparte y no un cambio en `contrato.py` ───────────────
`contrato.py` sirve `BusinessShareholders`, el contrato **compatible con el bot**
que ms-company consume. Está escrito para que la respuesta de LENS sea
indistinguible de la del bot, hasta en los detalles raros (errores con HTTP 200,
`AWS_ERROR` sin `msg_type`). Tocar sus funciones para acomodar a Onboarding
movería ese contrato.

Onboarding es un consumidor **distinto**, con reglas distintas. Así que vive al
lado. Es lo mismo que dice el plan sobre `/v1/analisis`: los endpoints nuevos se
agregan, no se reforman los viejos.

── Y por qué acá y no en el prompt ──────────────────────────────────────────
El contrato pide `personType: "LEGAL"`. LENS emite `"JURIDICA"`. La tentación es
cambiarlo en `constants.ts` y listo. **No.** Ese literal está en tres lugares que
se romperían:

  · `constants.ts` es la fuente de los prompts y la comparten la SPA y la API
    (vía `scripts/generar_prompts.py`). Tocar el prompt toca la cola KYB.
  · `tests/test_shareholders.py` fija el enum del esquema en
    `["NATURAL", "JURIDICA"]`, con ~20 aserciones más sobre ese literal.
  · `lens.analisis_persona` ya tiene filas históricas con `person_type` =
    `'JURIDICA'`. Cambiar el valor emitido parte la serie en dos.

La extracción y la persistencia se quedan como están. Se traduce **en el borde**,
al serializar. Un diccionario, no un cambio de prompt.

── La regla de fondo de esta fase ───────────────────────────────────────────
Del contrato, textual: *«Onboarding convierte estos valores de forma estricta. Un
valor fuera de formato no produce error: se guarda mal.»*

Por eso, cuando acá no se puede producir un valor válido, **se emite `null` y se
acompaña un aviso** en vez de mandar el texto crudo. Un dato ausente y declarado
se ve; uno mal guardado aparece recién en la revisión de Compliance, semanas
después.

Funciones PURAS: sin red, sin estado, sin I/O. Se testean solas.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from paises_anexo_a import NOMBRES as PAISES_ANEXO_A
from paises_anexo_a import POR_ISO as PAIS_POR_ISO
from paises_variantes import AMBIGUAS as PAISES_AMBIGUOS
from paises_variantes import VARIANTES as VARIANTES_PAIS

# ── Avisos que produce esta capa ────────────────────────────────────────────
# Los nombres NO se escriben acá: salen del catálogo de `errores.py`, que es la
# fuente única de los `reason` de los tres canales. Si un aviso se nombrara con
# un literal suelto, el catálogo publicado y lo que de verdad emite el servicio
# podrían separarse sin que nadie lo note — y el catálogo existe justamente para
# que un integrador pueda programar contra él.
from errores import AVISO as _CATALOGO_AVISOS

AVISO_TIPO_PERSONA = _CATALOGO_AVISOS["PERSON_TYPE_UNDETERMINED"].nombre
AVISO_PAIS = _CATALOGO_AVISOS["COUNTRY_NOT_IN_CATALOG"].nombre
AVISO_FECHA = _CATALOGO_AVISOS["DATE_FORMAT_UNPARSEABLE"].nombre
AVISO_TRUNCADO = _CATALOGO_AVISOS["VALUE_TRUNCATED"].nombre
AVISO_NOMBRE_ADIVINADO = _CATALOGO_AVISOS["NAME_SPLIT_INFERRED"].nombre
AVISO_TAX_ID_DISCREPA = _CATALOGO_AVISOS["TAX_ID_COUNTRY_MISMATCH"].nombre
AVISO_DATO_FALTANTE = _CATALOGO_AVISOS["EXPECTED_DATA_MISSING"].nombre


class Avisos:
    """Acumula los avisos de una serialización, sin lanzar.

    Que no lance es deliberado: un país que no matchea no puede tumbar el
    análisis entero de una empresa. Se degrada el campo, se anota, y el resto
    sale.
    """

    def __init__(self) -> None:
        self.items: list[dict[str, Any]] = []

    def agregar(self, reason: str, message: str, *, field: str | None = None,
                subject: str | None = None, **extra: Any) -> None:
        """`field` es la ruta del dato (`taxId`, `legalRepresentative.role`…) y
        `subject` la persona de la que es, si es de una. AJ-07: Onboarding le
        dice al usuario qué dato falta y de quién, y no puede sacarlo de un
        `message` en texto libre."""
        self.items.append({"reason": reason, "message": message,
                           "field": field, "subject": subject or None, **extra})

    def __len__(self) -> int:
        return len(self.items)


# ══════════════════════════════════════════════════════════════════════════
# A · personType:  JURIDICA → LEGAL
# ══════════════════════════════════════════════════════════════════════════

# El mapeo en el borde. La izquierda es lo que emite LENS hoy; la derecha, lo
# que espera Onboarding. Se acepta también la forma ya correcta para que la capa
# sea idempotente: serializar dos veces no puede dar distinto.
TIPO_PERSONA: dict[str, str] = {
    "NATURAL": "NATURAL",
    "JURIDICA": "LEGAL",
    "LEGAL": "LEGAL",
}


def tipo_persona(valor: Any) -> str | None:
    """`NATURAL` o `LEGAL`; `None` si no se puede determinar.

    El contrato dice que todo valor distinto de `NATURAL` se interpreta como
    persona jurídica, incluidos `null` y la cadena vacía — o sea que mandar
    basura "funcionaría". No se aprovecha esa regla de respaldo: depender de
    ella para producir el valor correcto no es una garantía, es una casualidad
    que se rompe cuando el otro lado la cambia.
    """
    return TIPO_PERSONA.get(str(valor or "").strip().upper())


# ══════════════════════════════════════════════════════════════════════════
# B · name / lastName
# ══════════════════════════════════════════════════════════════════════════

# Países cuyos registros escriben APELLIDOS PRIMERO. Es la señal que permite
# que el respaldo no invierta el caso más común de este contrato. Se compara
# contra `pais_normalizado`, así que «CO», «COL» o «Colombia» dan lo mismo.
PAISES_ORDEN_REGISTRAL = {"colombia"}


def partir_nombre(
    completo: str, *, name: str = "", last_name: str = "",
    pais: str = "", avisos: "Avisos | None" = None, field: str | None = None,
) -> tuple[str | None, str | None]:
    """Separa nombre y apellidos siguiendo la precedencia del contrato.

    Textual: *«Separados de origen: Onboarding no puede inferir el orden de los
    apellidos. Precedencia: columnas explícitas → coma → cantidad de palabras.»*

    1. **Columnas explícitas.** Es el camino NORMAL, no la excepción: el prompt
       de LENS ya pide `name` y `lastName` partidos, y los parte con el
       documento a la vista. Cuando vienen, mandan.
    2. **Coma.** `PÉREZ GONZÁLEZ, JUAN ANDRÉS` → apellidos antes. No admite
       ambigüedad.
    3. **Cantidad de palabras.** El respaldo, y el único tramo que adivina.

    ── El respaldo invertía los nombres colombianos ──────────────────────────
    La regla literal de §7.4 —cuatro palabras, las dos primeras son el nombre—
    asume orden chileno. Aplicada a un registro colombiano da vuelta la persona:

        PEREZ GOMEZ ANGELA VIVIANA
          con la regla de §7.4 →  name: «PEREZ GOMEZ»   lastName: «ANGELA VIVIANA»
          correcto            →  name: «ANGELA VIVIANA» lastName: «PEREZ GOMEZ»

    Y no es un caso raro: Colombia es donde vive el documento de composición
    accionaria. El propio prompt de LENS ya trae ESE ejemplo resuelto al derecho
    (`constants.ts`), con la explicación de que «VIVIANA» es un segundo NOMBRE y
    que «un error acá se repite en todo el registro colombiano».

    Así que el respaldo mira el país. Sigue siendo una conjetura —dos apellidos
    y dos nombres son indistinguibles sin contexto— y por eso **deja aviso
    siempre que adivina**. Lo que no hace es invertir en silencio.
    """
    n, a = name.strip(), last_name.strip()
    if n or a:
        return (n or None), (a or None)

    txt = " ".join(str(completo or "").split())
    if not txt:
        return None, None

    if "," in txt:
        apellidos, _, nombres = txt.partition(",")
        return (nombres.strip() or None), (apellidos.strip() or None)

    # Se cuenta por GRUPOS y no por palabras: una partícula va con la palabra
    # que sigue. «MARÍA DEL PILAR GÓMEZ DE LA TORRE» son cuatro grupos —María,
    # del Pilar, Gómez, de la Torre—, no siete palabras; contadas sueltas, «LA»
    # y «TORRE» salían como los dos apellidos.
    partes = _grupos_de_nombre(txt)
    if len(partes) == 1:
        # Un solo token: es un nombre, no hay apellido que inventar.
        return partes[0], None
    if len(partes) == 2:
        return partes[0], partes[1]

    registral = pais_normalizado(pais) in PAISES_ORDEN_REGISTRAL
    if len(partes) == 3:
        # Tres palabras: dos apellidos y un nombre, del lado que corresponda.
        nombre, apellido = ((partes[-1], " ".join(partes[:-1])) if registral
                            else (partes[0], " ".join(partes[1:])))
    else:
        # Cuatro o más: dos apellidos, del lado que corresponda.
        nombre, apellido = ((" ".join(partes[2:]), " ".join(partes[:2])) if registral
                            else (" ".join(partes[:-2]), " ".join(partes[-2:])))

    if avisos is not None:
        avisos.agregar(
            AVISO_NOMBRE_ADIVINADO,
            f"«{txt}» vino sin partir: se separó por cantidad de palabras asumiendo orden "
            + ("registral (apellidos primero)" if registral else "de nombres primero")
            + f"; el texto original va en el campo de nombre completo.",
            field=field, subject=txt, valor=txt, pais=pais or "",
        )
    return nombre, apellido


#: Las partículas de un nombre: van pegadas a la palabra que les sigue.
_PARTICULAS = {"de", "del", "la", "las", "los", "y", "da", "das", "do", "dos",
               "di", "van", "von", "der", "den", "san", "mac", "mc"}


def _grupos_de_nombre(txt: str) -> list[str]:
    """«MARÍA DEL PILAR GÓMEZ DE LA TORRE» → «MARÍA», «DEL PILAR», «GÓMEZ»,
    «DE LA TORRE». Una partícula al final, sin palabra que la siga, queda sola."""
    grupos: list[str] = []
    pendiente: list[str] = []
    for palabra in txt.split(" "):
        if _sin_tildes(palabra) in _PARTICULAS:
            pendiente.append(palabra)
            continue
        grupos.append(" ".join(pendiente + [palabra]))
        pendiente = []
    if pendiente:
        if grupos:
            grupos[-1] = grupos[-1] + " " + " ".join(pendiente)
        else:
            grupos.append(" ".join(pendiente))
    return grupos


def nombre_y_apellido(
    p: dict, tipo: str | None, pais: str = "", avisos: "Avisos | None" = None,
    ruta: str = "",
) -> tuple[str | None, str | None]:
    """`(name, lastName)` según el tipo de persona.

    En personas jurídicas, `name` es la **razón social** y `lastName` va en
    `null`. No es cosmético: hoy LENS deja los dos vacíos y el contrato pide
    explícitamente que la razón social viaje en `name`.

    `ruta` es de quién es el nombre (`legalRepresentative`, `shareholder`), para
    el `field` del aviso.
    """
    if tipo == "LEGAL":
        razon = str(p.get("shareholderName") or p.get("name") or "").strip()
        return (razon or None), None
    return partir_nombre(
        str(p.get("shareholderName") or p.get("fullName") or ""),
        name=str(p.get("name") or ""),
        last_name=str(p.get("lastName") or ""),
        pais=pais, avisos=avisos, field=f"{ruta}.name" if ruta else None,
    )


# ══════════════════════════════════════════════════════════════════════════
# C · isPEP
# ══════════════════════════════════════════════════════════════════════════

def es_pep(valor: Any, tipo: str | None) -> bool | None:
    """`False` siempre en personas jurídicas; en naturales solo si se declaró.

    OJO CON EL ORIGEN DE ESTA REGLA: viene de la especificación **v1.1** (tabla
    de los 14 campos de EP-6), donde además está marcada «Por confirmar». La
    v1.2 —que es la vigente— **no la repite**. No la contradice tampoco, así que
    se implementa; pero si Onboarding la cambia, se cambia acá y en ningún otro
    lado.

    Una persona jurídica no puede ser PEP: la condición es de personas físicas.
    `null` ahí no es "no sé", es una pregunta mal hecha.
    """
    # Se normaliza el tipo en vez de comparar contra "LEGAL" a secas: llamada
    # suelta con el valor crudo («JURIDICA») devolvía None donde el contrato
    # pide False. `tipo_persona` es idempotente y tiene test; esto lo alinea.
    if tipo_persona(tipo) == "LEGAL":
        return False
    if isinstance(valor, bool):
        return valor
    return None


# ══════════════════════════════════════════════════════════════════════════
# D · shareholderId:  solo dígitos, salvo los documentos alfanuméricos
# ══════════════════════════════════════════════════════════════════════════

#: Los tipos de EP-6 cuyo identificador lleva LETRAS por naturaleza. Quitarles
#: las letras deja un número que no identifica a nadie: un RFC de 13
#: caracteres salía con 8 dígitos, y los pasaportes `X9876543` y `Y9876543`
#: quedaban iguales (AJ-02, 13-10-2026).
#:
#: El RUT chileno va en este grupo por decisión de Compliance (13-10-2026): su
#: dígito verificador se CONSERVA, también cuando es `K`. Para un RUT numérico
#: el resultado es el mismo de siempre (`12.345.678-5` → `123456785`); lo que
#: cambia es que `12.345.678-K` ya no pierde la K.
TIPOS_ALFANUMERICOS: frozenset[str] = frozenset(
    {"RFC", "CURP", "INE", "Pasaporte", "VAT Number", "Tax ID", "RUT"})


def id_accionista(valor: Any, tipo: str | None = None) -> str | None:
    """El identificador del accionista, según su `identificationType` de EP-6.

    Del contrato: el de la empresa y el del representante van *tal como figuran
    en el documento*; el del accionista va normalizado. Son reglas distintas
    para el mismo tipo de dato, así que hay dos funciones y no una con un
    booleano — un parámetro se pasa mal, dos nombres no.

      · tipos alfanuméricos (`TIPOS_ALFANUMERICOS`): letras y dígitos, sin
        puntos, guiones ni espacios, en mayúsculas;
      · los demás —CC, NIT, DNI, CUIT…— y el tipo desconocido: solo dígitos.

    *«LENS no recalcula dígitos»*: no se toca lo que no se entiende.
    """
    if tipo in TIPOS_ALFANUMERICOS:
        # SOLO puntos, guiones y espacios: un RFC puede traer «Ñ» o «&».
        limpio = re.sub(r"[.\-\s]", "", str(valor or "")).upper()
        return limpio or None
    digitos = re.sub(r"\D", "", str(valor or ""))
    return digitos or None


def porcentaje(valor: Any) -> int | float | None:
    """El porcentaje con UNA sola forma por valor: `51`, nunca a veces `51.0`.

    El modelo devuelve el mismo número como `51` en una corrida y `51.0` en la
    otra, y el JSON los escribe distinto. Onboarding comparó dos lecturas del
    mismo documento y vio el formato cambiar (AJ-04). Un valor entero sale
    entero y uno con decimales sale con decimales, hasta cuatro.

    No estima: lo que no es un número sale `None`. Un `True` no es un 1.
    """
    if valor is None or isinstance(valor, bool):
        return None
    if isinstance(valor, (int, float)):
        n = float(valor)
    else:
        try:
            n = float(str(valor).strip().rstrip("%").strip().replace(",", "."))
        except ValueError:
            return None
    if n != n or n in (float("inf"), float("-inf")):
        return None
    n = round(n, 4)
    return int(n) if n.is_integer() else n


def id_tal_cual(valor: Any) -> str | None:
    """El identificador de la empresa o del representante, sin tocar."""
    return str(valor or "").strip() or None


# ══════════════════════════════════════════════════════════════════════════
# E · countryOfOrigin:  uno de los 238 del Anexo A
# ══════════════════════════════════════════════════════════════════════════

def _sin_tildes(s: str) -> str:
    """Minúsculas y sin diacríticos, para comparar. Nunca para emitir."""
    desarmado = unicodedata.normalize("NFD", s)
    return "".join(c for c in desarmado if unicodedata.category(c) != "Mn").casefold().strip()


# Índice tolerante → forma canónica. Se arma una vez al importar.
_INDICE_PAISES: dict[str, str] = {_sin_tildes(n): n for n in PAISES_ANEXO_A}


def clave_pais(valor: Any) -> str:
    """La clave de `paises_variantes`: sin tildes, sin signos ni espacios, en
    minúsculas. «EE. UU.», «EEUU» y «ee uu» son la misma."""
    return re.sub(r"[^a-z0-9]", "", _sin_tildes(str(valor or "")))


def resolver_pais(valor: Any) -> tuple[str, str] | None:
    """`(código ISO-2, nombre del Anexo A)` de cualquier forma de escribir un
    país —en español, inglés o portugués, con su ISO-2 o su ISO-3, o su
    gentilicio («Mexicana», «chilenos»)—, o `None` si no es un país del
    catálogo o si es ambiguo (AJ-08)."""
    iso = VARIANTES_PAIS.get(clave_pais(valor))
    return (iso, PAIS_POR_ISO[iso]) if iso else None


def paises_posibles(valor: Any) -> tuple[str, ...]:
    """Los nombres del catálogo entre los que se duda, si la forma es ambigua
    («Corea» → Corea del Sur o Corea del Norte); vacío si no lo es."""
    return tuple(PAIS_POR_ISO[i] for i in PAISES_AMBIGUOS.get(clave_pais(valor), ()))


def pais_normalizado(valor: Any) -> str:
    """El país como lo comparan las reglas por país: el nombre del catálogo en
    minúsculas y sin tildes —«colombia», «mexico»—, venga como venga («CO»,
    «COL», «Colombia»). Lo que no es del catálogo, igual en minúsculas y sin
    tildes, como antes."""
    r = resolver_pais(valor)
    return _sin_tildes(r[1]) if r else _sin_tildes(str(valor or ""))


def pais_anexo_a(valor: Any, avisos: Avisos | None = None, *, field: str | None = None,
                 subject: str | None = None) -> str | None:
    """El nombre del país con la grafía exacta del Anexo A, o `None`.

    **Tolerante al leer, estricto al escribir.** Del otro lado se compara
    ignorando mayúsculas y espacios de los extremos pero **no la grafía**: si
    LENS manda `Mexico` sin tilde, Onboarding lo guarda como país desconocido y
    no avisa. Así que acá se reconoce cualquier forma (`resolver_pais`) y se
    emite la forma canónica de la tabla.

    Lo que NO se hace es mandar el texto crudo cuando no matchea. Eso es
    exactamente el modo de fallo silencioso que el contrato advierte. Se emite
    `None` y se anota un aviso con el valor original, para que se vea.
    """
    crudo = str(valor or "").strip()
    if not crudo:
        return None
    r = resolver_pais(crudo)
    if r is None and avisos is not None:
        # Ambiguo no es lo mismo que desconocido: «Corea» puede ser Corea del
        # Norte, que está sancionada. Adivinar una nacionalidad sancionable es
        # peor que preguntar, así que se dice entre cuáles se duda.
        posibles = paises_posibles(crudo)
        avisos.agregar(
            AVISO_PAIS,
            (f"El país «{crudo}» es ambiguo ({' o '.join(posibles)}); se envía vacío." if posibles
             else f"El país «{crudo}» no está en el catálogo de Onboarding; se envía vacío."),
            field=field, subject=subject, valor=crudo,
        )
    return r[1] if r else None


def codigo_pais(valor: Any) -> str | None:
    """El código ISO-2 del país (AJ-08), o `None` si no es del catálogo."""
    r = resolver_pais(valor)
    return r[0] if r else None


# ══════════════════════════════════════════════════════════════════════════
# F · constitutionDate:  YYYY-MM-DD
# ══════════════════════════════════════════════════════════════════════════

_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
    # Abreviados, y en inglés y portugués (14-10-2026): «Feb 28, 2019»,
    # «28 February 2019», «28 de fevereiro de 2019».
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "jun": 6, "jul": 7, "ago": 8,
    "sep": 9, "sept": 9, "set": 9, "oct": 10, "nov": 11, "dic": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12, "jan": 1, "apr": 4, "aug": 8, "dec": 12,
    "janeiro": 1, "fevereiro": 2, "marco": 3, "maio": 5, "junho": 6, "julho": 7,
    "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
}

#: Dónde se escribe MES/DÍA/AÑO. En el resto del catálogo, DÍA/MES/AÑO.
_PAISES_MES_PRIMERO = {"estados unidos", "filipinas", "micronesia", "belice"}

# Los números en palabras, que es como las escrituras chilenas escriben la
# fecha: «a doce de marzo de dos mil diecinueve». Si esto no se soporta, la
# fecha de constitución sale vacía para la mayoría de las escrituras reales.
_UNIDADES = {
    "cero": 0, "uno": 1, "un": 1, "primero": 1, "dos": 2, "tres": 3, "cuatro": 4,
    "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
    "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
    "dieciseis": 16, "diecisiete": 17, "dieciocho": 18, "diecinueve": 19,
    "veinte": 20, "veintiuno": 21, "veintidos": 22, "veintitres": 23,
    "veinticuatro": 24, "veinticinco": 25, "veintiseis": 26, "veintisiete": 27,
    "veintiocho": 28, "veintinueve": 29, "treinta": 30, "cuarenta": 40,
    "cincuenta": 50, "sesenta": 60, "setenta": 70, "ochenta": 80, "noventa": 90,
}
_CIENTOS = {
    "cien": 100, "ciento": 100, "doscientos": 200, "trescientos": 300,
    "cuatrocientos": 400, "quinientos": 500, "seiscientos": 600,
    "setecientos": 700, "ochocientos": 800, "novecientos": 900,
}


def _numero_en_palabras(texto: str) -> int | None:
    """Convierte «dos mil diecinueve» → 2019. `None` si no se entiende entero.

    Cubre lo que aparece en una fecha: unidades, decenas, centenas y miles.
    Deliberadamente NO intenta ser un parser general de numerales en español —
    si algo no encaja, devuelve `None` y la fecha se reporta como ilegible.
    Adivinar una fecha de constitución es peor que no tenerla.
    """
    palabras = [p for p in _sin_tildes(texto).replace("-", " ").split() if p and p != "y"]
    if not palabras:
        return None
    total, parcial, hubo = 0, 0, False
    for p in palabras:
        if p in _UNIDADES:
            parcial += _UNIDADES[p]; hubo = True
        elif p in _CIENTOS:
            parcial += _CIENTOS[p]; hubo = True
        elif p == "mil":
            parcial = (parcial or 1) * 1000
            total += parcial
            parcial = 0
            hubo = True
        else:
            return None
    return (total + parcial) if hubo else None


_RE_ISO = re.compile(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$")
_RE_NUMERICA = re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$")
_RE_ORDINAL = re.compile(r"^(\d{1,2})(?:st|nd|rd|th|ro|er|do|to|vo|no|mo)$")

_PALABRAS_NUMERO = set(_UNIDADES) | set(_CIENTOS) | {"mil", "y"}


def _tokens(texto: str) -> list[str]:
    """Palabras sin tildes, en minúscula y sin puntuación pegada."""
    return [t for t in re.split(r"[^\wáéíóúñÁÉÍÓÚÑ]+", _sin_tildes(texto)) if t]


def _tomar_numero(tokens: list[str], *, desde_el_final: bool) -> int | None:
    """El número en palabras más largo pegado a un extremo de la lista.

    Se busca por extremo y no con una expresión regular porque el año son
    VARIAS palabras —«dos mil diecinueve»— y cualquier grupo no codicioso se
    corta en el primer espacio. Eso es justo lo que fallaba.
    """
    seq = list(reversed(tokens)) if desde_el_final else list(tokens)
    # El «de» que separa («15 **de** marzo») se saltea antes de empezar a contar.
    while seq and seq[0] in ("de", "del", "a"):
        seq = seq[1:]
    if not seq:
        return None
    # En cifras: «15 de marzo». Se resuelve acá y no en el llamador para que la
    # forma mixta —día en número, año en palabras— también funcione. Con su
    # ordinal pegado también: «28th», «1ro».
    if seq[0].isdigit():
        return int(seq[0])
    if (o := _RE_ORDINAL.match(seq[0])):
        return int(o.group(1))
    tomados: list[str] = []
    for t in seq:
        if t in _PALABRAS_NUMERO:
            tomados.append(t)
        else:
            break
    if not tomados:
        return None
    if desde_el_final:
        tomados.reverse()
    return _numero_en_palabras(" ".join(tomados))


def fecha_iso(valor: Any, avisos: Avisos | None = None, pais: Any = "",
              campo: str = "constitutionDate") -> str | None:
    """`YYYY-MM-DD`, o `None` con aviso si no se puede leer con certeza.

    Formatos que entiende:

      1. ISO, con guion, barra o punto  → `2019-03-15`, `2019/03/15`
      2. Numérica día/mes/año           → `15/03/2019`, `15-3-19`, `15.03.2019`
      3. Día y año en cifras            → `15 de marzo de 2019`
      4. Día y año en palabras          → `doce de marzo de dos mil diecinueve`
      5. En inglés                      → `Feb 28, 2019`, `28 February 2019`

    El cuarto es el que importa: las escrituras chilenas escriben la fecha con
    letras, y el prompt de LENS **no pide ningún formato** — sale tal como está
    en el documento. Se ancla en el nombre del mes y se lee hacia los dos lados,
    así que también funciona dentro de una frase.

    Nunca adivina. `02/03/2019` puede ser el 2 de marzo o el 3 de febrero: manda
    la convención del país —mes primero solo en Estados Unidos y pocos más— y,
    si no se sabe el país, sale `None` con aviso. Un año de dos dígitos se
    expande con la regla habitual (≤ 69 → 2000, si no 1900). El aviso lleva el
    texto original.
    """
    crudo = str(valor or "").strip()
    if not crudo:
        return None

    def _armar(d: int, m: int, a: int) -> str | None:
        if not (1 <= m <= 12 and 1 <= d <= 31 and 1500 <= a <= 2999):
            return None
        return f"{a:04d}-{m:02d}-{d:02d}"

    if (g := _RE_ISO.match(crudo)):
        if (iso := _armar(int(g.group(3)), int(g.group(2)), int(g.group(1)))):
            return iso

    ambigua = False
    if (g := _RE_NUMERICA.match(crudo)):
        x, y, a = int(g.group(1)), int(g.group(2)), int(g.group(3))
        if a < 100:
            a += 2000 if a <= 69 else 1900
        p = pais_normalizado(pais)
        if x > 12 or y > 12 or x == y:
            # Sin ambigüedad: el que pasa de 12 es el día.
            d, m = (y, x) if y > 12 else (x, y)
        elif p:
            d, m = (y, x) if p in _PAISES_MES_PRIMERO else (x, y)
        else:
            d = m = 0
            ambigua = True
        if not ambigua and (iso := _armar(d, m, a)):
            return iso

    # Ancla en el mes y lectura hacia los dos lados. En inglés el día puede ir
    # DESPUÉS del mes («February 28, 2019»): si no hay día antes, se lee el
    # primero que sigue y el año a continuación.
    toks = _tokens(crudo)
    for i, t in enumerate(toks):
        mes = _MESES.get(t)
        if mes is None:
            continue
        dia = _tomar_numero(toks[:i], desde_el_final=True)
        anio = _tomar_numero(toks[i + 1:], desde_el_final=False)
        if dia is None and len(toks) > i + 2:
            dia = _tomar_numero(toks[i + 1:i + 2], desde_el_final=False)
            anio = _tomar_numero(toks[i + 2:], desde_el_final=False)
        if dia is not None and anio is not None and (iso := _armar(dia, mes, anio)):
            return iso

    if avisos is not None:
        avisos.agregar(
            AVISO_FECHA,
            (f"La fecha «{crudo}» es ambigua —día y mes pueden ser cualquiera de los dos— y no "
             "se sabe la convención del país; se envía vacía." if ambigua else
             f"No se pudo interpretar la fecha «{crudo}»; se envía vacía."),
            field=campo, valor=crudo,
        )
    return None


# ══════════════════════════════════════════════════════════════════════════
# G · legalForm y activity:  máximo 30 caracteres
# ══════════════════════════════════════════════════════════════════════════

TOPE_FORMA_LEGAL = 30
TOPE_ACTIVIDAD = 30
TOPE_CARGO = 60   # el cargo se entrega completo; Onboarding guarda hasta 60

# ── legalForm ───────────────────────────────────────────────────────────────
# NO se recorta, se NOMBRA. Recortar «Sociedad de Responsabilidad Limitada» a
# 30 dejaba «Sociedad de Responsabilidad»: se perdía justo la palabra que la
# define, y le pasaba a TODAS las limitadas de Chile.
#
# Cada forma tiene un nombre fijo que cabe en 30. La regla: el nombre completo si
# cabe, y si no, el nombre con que se la conoce — nunca un fragmento.

FORMAS_LEGALES: dict[str, str] = {
    "SPA": "Sociedad por Acciones",
    "SA": "Sociedad Anónima",
    "LIMITADA": "Sociedad Limitada",
    "SAS": "S.A.S.",
    "EIRL": "E.I.R.L.",
}

#: Sufijo de la razón social → forma. El sufijo es parte del nombre inscrito, así
#: que es la señal más confiable que hay — salvo el de Sociedad Anónima.
_SUFIJOS_FUERTES = {
    "SPA": "SPA", "SOCIEDAD POR ACCIONES": "SPA",
    "LIMITADA": "LIMITADA", "LTDA": "LIMITADA",
    "SAS": "SAS", "SOCIEDAD POR ACCIONES SIMPLIFICADA": "SAS",
    "EIRL": "EIRL",
}
#: «SA» es DÉBIL: es el principio de «SAS», y basta que la extracción se coma la
#: última letra para que una SAS parezca anónima. Pasó con una SAS colombiana
#: cuya razón social salió «… S A».
_SUFIJOS_DEBILES = {"SA": "SA", "SOCIEDAD ANONIMA": "SA"}


def _sufijo_societario(razon_social: Any) -> tuple[str | None, bool]:
    """`(forma, es_fuerte)` según cómo termina la razón social.

    Las siglas con puntos (`S.A.S.`, `E.I.R.L.`) quedan como letras sueltas al
    sacar los puntos. No se juntan a lo bruto: una razón social con iniciales
    —«COMERCIAL A Y B S.A.»— terminaría toda pegada en una sigla que no existe.
    Se prueba cada sigla conocida contra las ÚLTIMAS letras sueltas, de la más
    larga a la más corta.
    """
    nombre = re.sub(r"[.,]", " ", _sin_tildes(str(razon_social or "")).upper())
    toks = nombre.split()
    cola = " ".join(toks)

    sueltas: list[str] = []
    for tok in reversed(toks):
        if len(tok) == 1 and tok.isalpha():
            sueltas.insert(0, tok)
        else:
            break

    for tabla, fuerte in ((_SUFIJOS_FUERTES, True), (_SUFIJOS_DEBILES, False)):
        for sufijo, forma in sorted(tabla.items(), key=lambda kv: -len(kv[0])):
            if cola == sufijo or cola.endswith(" " + sufijo):
                return forma, fuerte
            k = len(sufijo)
            if " " not in sufijo and len(sueltas) >= k and "".join(sueltas[-k:]) == sufijo:
                return forma, fuerte
    return None, False


def forma_legal(razon_social: Any, del_documento: Any = None,
                avisos: Avisos | None = None) -> str | None:
    """La forma legal, con un nombre que cabe en 30 y nunca cortado.

    Dos fuentes, y el orden entre ellas es la regla:

      · el SUFIJO de la razón social, que es parte del nombre inscrito;
      · lo que DICE EL DOCUMENTO, leído por el modelo en su propia pasada.

    Un sufijo fuerte (`SpA`, `Limitada`, `SAS`, `EIRL`) gana siempre. El débil
    —`S.A.`— cede ante el documento si el documento dice otra cosa: es el que
    aparece cuando la extracción se come la última letra de una SAS.
    """
    sufijo, fuerte = _sufijo_societario(razon_social)
    doc = str(del_documento or "").strip().upper() or None
    doc = doc if doc in FORMAS_LEGALES else None

    forma = sufijo if fuerte else (doc or sufijo)
    if forma is None and avisos is not None:
        avisos.agregar(AVISO_DATO_FALTANTE,
                       "No se pudo determinar la forma legal de la sociedad.",
                       field="legalForm")
    return FORMAS_LEGALES.get(forma) if forma else None


#: La forma societaria escrita con todas sus letras. Solo frases completas:
#: una sigla suelta («S.A.») aparece en cualquier escritura que nombre a un
#: socio que es sociedad.
_FORMAS_EN_TEXTO = (
    (re.compile(r"sociedad\s+por\s+acciones\s+simplificada", re.IGNORECASE), "SAS"),
    (re.compile(r"empresa\s+individual\s+de\s+responsabilidad\s+limitada", re.IGNORECASE), "EIRL"),
    (re.compile(r"sociedad\s+de\s+responsabilidad\s+limitada", re.IGNORECASE), "LIMITADA"),
    (re.compile(r"sociedad\s+por\s+acciones(?!\s+simplificada)", re.IGNORECASE), "SPA"),
    (re.compile(r"sociedad\s+an[oó]nima", re.IGNORECASE), "SA"),
)


def forma_legal_desde_texto(texto: Any) -> str | None:
    """La forma legal que el documento nombra con todas sus letras, o `None`.

    Solo si nombra UNA: una escritura que constituye una SAS con una sociedad
    anónima de socia nombra las dos, y ahí no se puede saber cuál es la de la
    sociedad. Es el respaldo de AJ-07 cuando la pasada de identidad no la dio.
    """
    t = str(texto or "")
    vistas = {forma for rx, forma in _FORMAS_EN_TEXTO if rx.search(t)}
    return vistas.pop() if len(vistas) == 1 else None


#: Lo que encabeza un objeto social y no es la actividad.
_ENCABEZADO_OBJETO = re.compile(
    r"^(?:la\s+sociedad\s+)?(?:tendr[aá]\s+(?:como|por)\s+objeto(?:\s+social)?|"
    r"(?:su|el)\s+objeto(?:\s+social)?(?:\s+de\s+la\s+sociedad)?\s+(?:ser[aá]|es|consiste\s+en)|"
    r"objeto(?:\s+social)?)\s*:?\s*", re.IGNORECASE)
_ARRANQUE_OBJETO = re.compile(
    r"^(?:(?:la|el|los|las)\s+)?(?:realizaci[oó]n\s+de\s+|realizar\s+|desarrollar\s+|"
    r"ejercer\s+|efectuar\s+)?(?:(?:la|el|los|las|toda\s+clase\s+de)\s+)?", re.IGNORECASE)


def actividad_desde_objeto(objeto: Any) -> str | None:
    """Un resumen de la actividad sacado del objeto social, sin el modelo.

    El respaldo de AJ-07 cuando la pasada de identidad no resumió: la primera
    actividad que el objeto social nombra, hasta la primera coma o «y». La valida
    después `actividad`, que la achica por palabras enteras hasta 30 o la
    descarta si es una lista.
    """
    t = " ".join(str(objeto or "").split())
    t = _ENCABEZADO_OBJETO.sub("", t)
    t = re.split(r"[,;:.(]|\s+(?:y|e)\s+", t, maxsplit=1)[0]
    t = _ARRANQUE_OBJETO.sub("", t).strip()
    return (t[:1].upper() + t[1:]) if t else None


#: Palabras que no pueden cerrar un resumen: dejan la frase colgando.
_CONECTORES = {"y", "e", "o", "u", "de", "del", "la", "las", "el", "los", "en", "para",
               "con", "a", "al", "por", "su", "sus", "sin", "entre", "sobre"}


def _palabra_cortada(palabra: str, objeto_social: str) -> bool:
    """¿`palabra` es el comienzo de una palabra MÁS LARGA del objeto social?

    El modelo, para caber en 30, a veces corta su propio resumen a mitad de
    palabra: pasó «Comercio nacional e internac». Largo y puntuación están bien,
    así que lo único que lo delata es comparar contra el texto de donde salió:
    «internac» no está entera en el objeto social, y es el comienzo de
    «internacional».

    Se exige que la palabra larga tenga al menos tres letras más, para no tomar
    un singular por un corte: «venta» no es «ventas» cortada.
    """
    p = _sin_tildes(palabra.strip(" ,;:.-"))
    if len(p) < 3:
        return False
    palabras = set(re.findall(r"\w+", _sin_tildes(objeto_social or "")))
    if p in palabras:
        return False
    return any(o.startswith(p) and len(o) >= len(p) + 3 for o in palabras)


def actividad(resumen: Any, objeto_social: Any = "", avisos: Avisos | None = None) -> str | None:
    """La actividad principal, RESUMIDA. §7.6: «LENS resume la actividad
    principal del objeto social sin superar el máximo».

    El resumen lo hace el modelo en su pasada propia, y acá se valida y se
    ajusta — siempre por PALABRAS ENTERAS, nunca cortando una:

      1. si la última palabra está cortada, sale;
      2. si no entra en 30, salen palabras del final hasta que entre;
      3. si queda colgando de un conector («… y», «… de»), sale el conector.

    Achicar así el RESUMEN no es lo mismo que recortar el objeto social, que es
    lo que se hacía antes y dejaba «Comercialización,» o «Compra, venta,
    importación,»: un fragmento que parece un dato y no lo es. Acá siempre queda
    una frase completa.

    Pero una LISTA que no entra no se achica: si el modelo devolvió «Compra,
    venta, importación y exportación…» en vez de un resumen, quedarse con las
    primeras palabras da «Compra, venta, importación» —un pedazo de lista, que es
    justo lo que no se quiere—. Eso es que el modelo no resumió, y va `null`.

    Si no queda nada —o el modelo no devolvió resumen—, `null` + aviso. Nunca un
    fragmento.
    """
    txt = " ".join(str(resumen or "").split()).strip(" ,;:.-")
    palabras = txt.split()
    if palabras and _palabra_cortada(palabras[-1], str(objeto_social or "")):
        palabras.pop()
    if len(" ".join(palabras)) > TOPE_ACTIVIDAD and re.search(r"[,;]", " ".join(palabras)):
        palabras = []
    while palabras and len(" ".join(palabras)) > TOPE_ACTIVIDAD:
        palabras.pop()
    while palabras and _sin_tildes(palabras[-1].strip(" ,;:.-")) in _CONECTORES:
        palabras.pop()
    limpio = " ".join(palabras).strip(" ,;:.-")
    if limpio:
        return limpio
    if avisos is not None:
        avisos.agregar(AVISO_DATO_FALTANTE,
                       "No se pudo obtener un resumen de la actividad principal.",
                       field="activity")
    return None


def recortar(valor: Any, tope: int, campo: str, avisos: Avisos | None = None,
             subject: str | None = None) -> str | None:
    """Recorta a `tope` caracteres **avisando**, sin partir una palabra al medio.

    Se recorta acá y no se deja que lo haga Onboarding porque del otro lado el
    recorte es mudo. Si el objeto social de una empresa se guarda a la mitad,
    conviene que quede dicho de dónde salió.

    El corte busca el último espacio para no dejar una palabra cortada; si no
    hay ninguno dentro del tope, corta duro.
    """
    txt = " ".join(str(valor or "").split())
    if not txt:
        return None
    if len(txt) <= tope:
        return txt
    corte = txt[:tope].rstrip()
    # Si el corte cae justo entre dos palabras, la última está entera y se
    # queda: «Apto. 1201 T. B» en 10 es «Apto. 1201», no «Apto.».
    if " " in corte and txt[tope] != " ":
        corte = corte[:corte.rindex(" ")].rstrip()
    # Y sin un conector colgando al final: «… bienes raíces y» no es un valor.
    palabras = corte.split(" ")
    while len(palabras) > 1 and _sin_tildes(palabras[-1].strip(" ,;:.-")) in _CONECTORES:
        palabras.pop()
    corte = " ".join(palabras).rstrip(" ,;:-") or txt[:tope]
    if avisos is not None:
        avisos.agregar(
            AVISO_TRUNCADO,
            f"«{campo}» tenía {len(txt)} caracteres y el contrato admite {tope}; se recortó.",
            field=campo, subject=subject, original=txt,
        )
    return corte


#: Lo que admite la base de Onboarding en los textos que no tienen un tope
#: propio: calle, ciudad, región, razón social, identificadores, nombres y
#: apellidos (AJ-09, consultado por Onboarding en su esquema).
TOPE_TEXTO = 255

#: `address_country.apt` es de 10 caracteres. «Oficina 999» tiene 11.
TOPE_APTO = 10

#: Cómo se abrevia la parte «oficina» de una dirección para que entre en 10 sin
#: cortar palabras.
_ABREVIATURAS_APTO = (
    (re.compile(r"\boficinas\b\.?", re.IGNORECASE), "Ofs."),
    (re.compile(r"\bbodegas\b\.?", re.IGNORECASE), "Bods."),
    (re.compile(r"\blocales\b\.?", re.IGNORECASE), "Locs."),
    (re.compile(r"\boficina\b\.?", re.IGNORECASE), "Of."),
    (re.compile(r"\bapartamento\b\.?", re.IGNORECASE), "Apto."),
    (re.compile(r"\bdepartamento\b\.?", re.IGNORECASE), "Depto."),
    (re.compile(r"\binterior\b\.?", re.IGNORECASE), "Int."),
    (re.compile(r"\bpiso\b\.?", re.IGNORECASE), "P."),
    (re.compile(r"\btorre\b\.?", re.IGNORECASE), "T."),
    (re.compile(r"\blocal\b\.?", re.IGNORECASE), "Loc."),
    (re.compile(r"\bbloque\b\.?", re.IGNORECASE), "Bl."),
    (re.compile(r"\bbodega\b\.?", re.IGNORECASE), "Bod."),
    # «12 y 13» → «12-13»: dos oficinas siguen siendo dos, en menos lugar.
    (re.compile(r"(\d+)\s+(?:y|e|&)\s+(\d+)", re.IGNORECASE), r"\1-\2"),
)


def apto_corto(valor: Any, avisos: Avisos | None = None) -> str | None:
    """`apt` en 10 caracteres: primero se ABREVIA —«Oficina 999» → «Of. 999»—,
    que no pierde nada; si igual no entra, se recorta por palabras con aviso."""
    txt = " ".join(str(valor or "").split())
    if not txt or len(txt) <= TOPE_APTO:
        return txt or None
    for rx, corta in _ABREVIATURAS_APTO:
        txt = rx.sub(corta, txt)
    txt = " ".join(txt.split())
    return recortar(txt, TOPE_APTO, "address.apt", avisos)


# ══════════════════════════════════════════════════════════════════════════
# identificationType — dos vocabularios, uno por endpoint
# ══════════════════════════════════════════════════════════════════════════
# §7.5 define vocabularios DISTINTOS para EP-4 y EP-6, y no es un descuido de
# ellos: EP-4 usa el catálogo de documentos de personas de Onboarding y EP-6 el
# que su procesador de accionistas ya recibe. El pasaporte lo deja a la vista —
# `PASS` en uno, `Pasaporte` en el otro—. Un vocabulario único los rompe a los dos.
#
# El valor lo EXTRAE el modelo: el prompt ya pide `identificationType` («CC, NIT,
# RUT, CE, PASAPORTE, DNI… lo que corresponda»). Acá solo se normaliza al
# vocabulario del endpoint. Lo que no se puede mapear sale `null`, que es un
# valor válido del contrato; inventar uno no lo es.

#: RFC y CURP entraron el 13-10-2026 (CO-05): el representante mexicano llegaba
#: con su RFC en `identificationNumber` y `identificationType: null`.
VOCAB_EP4: frozenset[str] = frozenset(
    {"RUT", "CC", "DNI", "CE", "PASS", "PPT", "CV", "CP", "DRIVERS", "RFC", "CURP"})
VOCAB_EP6: frozenset[str] = frozenset(
    {"RUT", "RUC", "DNI", "CC", "CE", "NIT", "RFC", "CURP", "INE", "CUIT",
     "CUIL", "CPF", "CNPJ", "Pasaporte", "Tax ID", "EIN", "VAT Number"})

# Cómo se escribe cada tipo en cada endpoint. La clave es la forma normalizada
# de lo que puede venir del modelo; el valor, cómo se emite en cada lado.
# `None` = ese endpoint no tiene ese tipo en su vocabulario.
_EQUIVALENCIAS: dict[str, tuple[str | None, str | None]] = {
    #  normalizado        EP-4          EP-6
    "rut":              ("RUT",        "RUT"),
    "cc":               ("CC",         "CC"),
    "cedula":           ("CC",         "CC"),
    "cedulaciudadania": ("CC",         "CC"),
    "dni":              ("DNI",        "DNI"),
    "ce":               ("CE",         "CE"),
    "cedulaextranjeria":("CE",         "CE"),
    "ppt":              ("PPT",        None),
    "nit":              (None,         "NIT"),
    "ruc":              (None,         "RUC"),
    "rfc":              ("RFC",        "RFC"),
    "curp":             ("CURP",       "CURP"),
    "ine":              (None,         "INE"),
    "cuit":             (None,         "CUIT"),
    "cuil":             (None,         "CUIL"),
    "cpf":              (None,         "CPF"),
    "cnpj":             (None,         "CNPJ"),
    "ein":              (None,         "EIN"),
    "taxid":            (None,         "Tax ID"),
    "vatnumber":        (None,         "VAT Number"),
    "cv":               ("CV",         None),
    "cp":               ("CP",         None),
    "drivers":          ("DRIVERS",    None),
    "pasaporte":        ("PASS",       "Pasaporte"),
    "pass":             ("PASS",       "Pasaporte"),
    "passport":         ("PASS",       "Pasaporte"),
}


# El tipo por defecto según el país y si es persona o empresa. Es la derivación
# que piden §6.8 y §6.10 («derivado del formato y del país») para cuando el
# documento no declara el tipo.
#
# Va por PAÍS y no por formato porque los formatos no se distinguen: una cédula
# colombiana y un DNI peruano son los dos una tira de dígitos. El país es la
# única señal que separa uno de otro, y encima viene declarado.
TIPO_POR_PAIS: dict[str, tuple[str, str]] = {
    #  país           NATURAL   LEGAL
    "chile":        ("RUT",    "RUT"),
    "colombia":     ("CC",     "NIT"),
    "peru":         ("DNI",    "RUC"),
    "argentina":    ("DNI",    "CUIT"),
    "mexico":       ("CURP",   "RFC"),
    "brasil":       ("CPF",    "CNPJ"),
    "brazil":       ("CPF",    "CNPJ"),
    "ecuador":      ("CC",     "RUC"),
    "uruguay":      ("CC",     "RUT"),
}


def tipo_identificacion(
    valor: Any, *, endpoint: str, pais: Any = "", tipo_persona_: str | None = None,
) -> str | None:
    """El tipo de documento con el vocabulario de `endpoint` (`"EP-4"`, `"EP-6"`
    o `"shareholders"`).

    Primero **traduce** lo que el documento declaró —el prompt ya pide
    `identificationType`, así que normalmente viene— y si no vino, lo **deriva**
    del país y del tipo de persona, que es lo que describen §6.8 y §6.10.

    `"shareholders"` es el `shareholders[]` de EP-3 (contrato v3.2): la forma
    de EP-4 —`PASS`, no «Pasaporte»—, más los identificadores de persona
    jurídica que EP-4 no tiene (`NIT`, `RUC`…). Un accionista puede ser una
    sociedad; un representante, en la práctica, no.

    `None` cuando no alcanza para saberlo, incluido el caso de un tipo que
    existe pero **no en ese endpoint**: emitir un valor que el consumidor no
    tiene en su lista no falla, guarda mal.
    """
    clave = _sin_tildes(str(valor or "")).replace(" ", "").replace("_", "").replace(".", "")
    par = _EQUIVALENCIAS.get(clave)

    if par is None and not clave:
        # No vino declarado: se deriva. Solo con el país; sin él no se adivina.
        porpais = TIPO_POR_PAIS.get(pais_normalizado(pais))
        if porpais:
            derivado = porpais[1] if tipo_persona_ == "LEGAL" else porpais[0]
            par = _EQUIVALENCIAS.get(_sin_tildes(derivado).replace(" ", ""))

    if par is None:
        return None
    if endpoint == "shareholders":
        return par[0] or par[1]
    return par[0] if endpoint == "EP-4" else par[1]


# ══════════════════════════════════════════════════════════════════════════
# La persona completa, con los siete ajustes aplicados
# ══════════════════════════════════════════════════════════════════════════

def _sujeto(p: dict) -> str | None:
    """De quién es el dato, para el `subject` del aviso: el nombre como figura."""
    return " ".join(str(p.get("shareholderName") or p.get("fullName") or p.get("name") or "").split()) or None


#: Lo que en un nombre dice «esto es una sociedad», además de la sigla de la
#: forma legal: siglas extranjeras y palabras que una persona no lleva.
_RE_JURIDICA = re.compile(
    r"\b(?:inc|llc|llp|ltd|limited|corp|corporation|gmbh|srl|s\s?r\s?l|sac|s\s?a\s?c|saa|sapi|"
    r"plc|bv|nv|ag|s\s?de\s?r\s?l|sociedad|inversiones|holding|fundacion|corporacion|"
    r"compania|asociacion|cooperativa|fideicomiso|banco|trust)\b", re.IGNORECASE)

#: Tipos de documento que solo tiene una persona natural.
_DOCS_NATURAL = {"cc", "cedula", "cedulaciudadania", "ce", "cedulaextranjeria", "dni",
                 "pasaporte", "pass", "passport", "curp", "ine", "ppt", "ti"}


def inferir_tipo_persona(p: dict) -> str | None:
    """`NATURAL` o `JURIDICA` cuando el modelo no lo dijo, o `None`.

    Por orden de certeza (14-10-2026, Onboarding bloquea la lectura con
    PERSON_TYPE_UNDETERMINED, así que vale la pena decidir lo decidible):

      1. el identificador: un RFC de 12 caracteres es persona moral y uno de
         13, física; un RUC que empieza con 20 es empresa y con 10 persona; un
         CUIT con 30, 33 o 34 es empresa y con 20, 23, 24 o 27 persona;
      2. la sigla societaria o una palabra que una persona no lleva en el
         nombre («S.A.S.», «LTDA», «Inc.», «Inversiones»…);
      3. el tipo de documento: CC, CE, DNI, pasaporte, CURP o INE es de una
         persona natural, y NIT de una jurídica.

    Si nada de eso alcanza, `None`: no se adivina.
    """
    declarado = str(p.get("personType") or "").strip().upper()
    if declarado in ("NATURAL", "JURIDICA", "LEGAL"):
        return "JURIDICA" if declarado == "LEGAL" else declarado

    ident = re.sub(r"[\s.\-]", "", str(p.get("shareholderId") or p.get("identificationNumber") or "")).upper()
    tipo_doc = _sin_tildes(str(p.get("identificationType") or "")).replace(" ", "").replace(".", "")
    if tipo_doc == "rfc" or re.fullmatch(r"[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}", ident):
        if len(ident) == 12:
            return "JURIDICA"
        if len(ident) == 13:
            return "NATURAL"
    # Solo con el tipo declarado: 11 dígitos que empiezan con 20 son un RUC de
    # empresa en Perú y un CUIT de persona en Argentina.
    if ident.isdigit() and len(ident) == 11:
        if tipo_doc == "ruc":
            return "JURIDICA" if ident.startswith("20") else (
                "NATURAL" if ident[:2] in ("10", "15", "17") else None)
        if tipo_doc == "cuit":
            return "JURIDICA" if ident[:2] in ("30", "33", "34") else (
                "NATURAL" if ident[:2] in ("20", "23", "24", "27") else None)

    nombre = str(p.get("shareholderName") or p.get("fullName") or p.get("name") or "")
    if _sufijo_societario(nombre)[0] or _RE_JURIDICA.search(_sin_tildes(nombre)):
        return "JURIDICA"

    if tipo_doc in _DOCS_NATURAL:
        return "NATURAL"
    if tipo_doc == "nit":
        return "JURIDICA"
    return None


def _tipo_o_aviso(p: dict, avisos: Avisos | None, ruta: str, omite: bool) -> str | None:
    """El tipo de persona —el declarado o el que se puede deducir—, o `None`
    dejando el aviso con `subject`.

    En EP-4 el representante sin tipo se omite (§7.1): del otro lado todo lo que
    no sea `NATURAL` se guarda como jurídica. En EP-6 va con `personType: null`
    desde el 14-10-2026: Onboarding prefiere ver a la persona y bloquear la
    lectura con el aviso, a que desaparezca.
    """
    tipo = tipo_persona(p.get("personType")) or tipo_persona(inferir_tipo_persona(p))
    if tipo is None and avisos is not None:
        avisos.agregar(
            AVISO_TIPO_PERSONA,
            "No se pudo determinar si es persona natural o jurídica; "
            + ("se omite la entidad." if omite else "va con el tipo de persona vacío."),
            field=f"{ruta}.personType", subject=_sujeto(p),
            valor=str(p.get("personType") or ""),
        )
    return tipo


def persona(p: dict, avisos: Avisos | None = None) -> dict:
    """Un accionista con los once campos de EP-6 (§6.10).

    `shareholderName` conserva el texto original y no es decorativo: la
    partición en `name` / `lastName` **no es reversible**. Con el orden registral
    colombiano, concatenarlos de vuelta da «ANGELA VIVIANA PEREZ GOMEZ», que no
    es lo que decía la escritura. Quien después cruce contra el registro necesita
    el nombre como está escrito.

    Una persona cuyo tipo no se puede determinar va con `personType: null` y su
    aviso. Hasta el 14-10-2026 se omitía.
    """
    ruta = "shareholder"
    tipo = _tipo_o_aviso(p, avisos, ruta, omite=False)
    quien = _sujeto(p)

    def tope(valor: Any, campo: str) -> str | None:
        return recortar(valor, TOPE_TEXTO, f"{ruta}.{campo}", avisos, quien)

    pais_crudo = str(p.get("countryOfOrigin") or "")
    name, last_name = nombre_y_apellido(p, tipo, pais_crudo, avisos, ruta)
    tipo_id = tipo_identificacion(
        p.get("identificationType"), endpoint="EP-6", pais=pais_crudo, tipo_persona_=tipo)
    return {
        "personType": tipo,
        "shareholderName": tope(p.get("shareholderName"), "shareholderName"),
        "shareholderId": tope(id_accionista(p.get("shareholderId"), tipo_id), "shareholderId"),
        "countryOfOrigin": pais_anexo_a(pais_crudo, avisos, field=f"{ruta}.countryOfOrigin",
                                        subject=quien),
        # AJ-08: el ISO-2 al lado del nombre. Onboarding guarda la nacionalidad
        # con 2 caracteres y hoy la traduce comparando nombres.
        "countryOfOriginCode": codigo_pais(pais_crudo),
        "identificationType": tipo_id,
        "lastName": tope(last_name, "lastName"),
        "name": tope(name, "name"),
        "ownershipPercentage": porcentaje(p.get("ownershipPercentage")),
        # La clave va SIEMPRE, aunque quede vacía: el consumidor no tiene que
        # defenderse de campos ausentes. Y `[]` significa «el documento no las
        # revela», que no es lo mismo que «no se sabe». No se inventan personas.
        "indirectShareholders": [persona(x, avisos) for x in (p.get("indirectShareholders") or [])],
        "isPEP": es_pep(p.get("isPEP"), tipo),
    }


#: Las abreviaturas con que la casilla 98 del RUT de la DIAN escribe el tipo de
#: representación. Onboarding le muestra el cargo al usuario y «REPRS LEGAL
#: PRIN» no se entiende (CO-09). Solo estas se expanden: son propias de ese
#: formulario, así que no hace falta saber de qué documento vino la persona. El
#: resto del cargo va tal como figura.
_CARGOS_DIAN = (
    (re.compile(r"^REPRS?\.?\s+LEGAL\s+PRIN(?:CIPAL)?\.?(?:\s+(\d+))?$", re.I),
     "Representante legal principal"),
    (re.compile(r"^REPRS?\.?\s+LEGAL\s+SUPL(?:ENTE)?\.?(?:\s+(\d+))?$", re.I),
     "Representante legal suplente"),
    (re.compile(r"^REPRS?\.?\s+LEGAL\.?(?:\s+(\d+))?$", re.I), "Representante legal"),
)


def cargo_legible(cargo: Any) -> str | None:
    """El cargo con las abreviaturas de la DIAN escritas enteras."""
    txt = " ".join(str(cargo or "").split())
    for rx, legible in _CARGOS_DIAN:
        m = rx.match(txt)
        if m:
            return legible + (f" {m.group(1)}" if m.group(1) else "")
    return txt or None


def representante(p: dict, avisos: Avisos | None = None) -> dict | None:
    """Un representante legal con los SIETE campos de EP-4 (§6.8).

    NO es `persona()` con un campo más: EP-4 tiene otras claves y otras reglas.
    El identificador se llama `identificationNumber` y va **tal como figura** —
    no solo dígitos, que es la regla del accionista—, y el vocabulario de
    `identificationType` es el otro. Reusar la forma de EP-6 acá emitiría las
    claves equivocadas con los valores equivocados.
    """
    ruta = "legalRepresentative"
    tipo = _tipo_o_aviso(p, avisos, ruta, omite=True)
    if tipo is None:
        return None
    quien = _sujeto(p)

    def tope(valor: Any, campo: str, maximo: int = TOPE_TEXTO) -> str | None:
        return recortar(valor, maximo, f"{ruta}.{campo}", avisos, quien)

    pais_crudo = str(p.get("countryOfOrigin") or "")
    name, last_name = nombre_y_apellido(p, tipo, pais_crudo, avisos, ruta)
    return {
        "fullName": tope(p.get("shareholderName") or p.get("fullName"), "fullName"),
        "name": tope(name, "name"),
        "lastName": tope(last_name, "lastName"),
        "personType": tipo,
        "identificationType": tipo_identificacion(
            p.get("identificationType"), endpoint="EP-4", pais=pais_crudo, tipo_persona_=tipo),
        "identificationNumber": tope(
            id_tal_cual(p.get("shareholderId") or p.get("identificationNumber")), "identificationNumber"),
        "role": tope(cargo_legible(p.get("position") or p.get("role")), "role", TOPE_CARGO),
    }


# ══════════════════════════════════════════════════════════════════════════
# shareholders[] de EP-3 — contrato v3.2 (pedido de Onboarding, 23-10-2026)
# ══════════════════════════════════════════════════════════════════════════
# Onboarding precarga la declaración de beneficiarios finales con los
# accionistas, y su front lee EP-3 de una vez y filtra por nodo. Por eso el
# nodo va en EP-3 y con el estilo de `legalRepresentatives`, no de EP-6:
# `fullName` e `identificationNumber` tal como figuran, y `PASS`, no
# «Pasaporte». EP-6 sigue igual.

#: El país que CANDIDATEA cada tipo de documento. DNI y PASS no están: un DNI
#: puede ser de Perú, de Argentina o de España, y un pasaporte, de cualquier
#: país. Los demás tampoco bastan solos —ver `pais_del_documento`—.
PAIS_DEL_DOCUMENTO: dict[str, str] = {
    "CC": "CO", "CE": "CO", "NIT": "CO",
    "RUT": "CL",
    "RFC": "MX", "CURP": "MX", "INE": "MX",
    "CUIT": "AR", "CUIL": "AR",
    "CPF": "BR", "CNPJ": "BR",
}


def porcentaje_accionista(valor: Any, avisos: Avisos | None = None,
                          subject: str | None = None) -> int | float | None:
    """El porcentaje de `shareholders[]`: de 0 a 100 y con hasta 2 decimales.

    Como el de EP-6, no se estima ni se ajusta para que la suma dé 100. Uno
    fuera de rango no es un porcentaje: va en `null` con su aviso, porque
    mandarlo como viene dejaría que la declaración lo guarde.
    """
    n = porcentaje(valor)
    if n is None:
        return None
    if not 0 <= n <= 100:
        if avisos is not None:
            avisos.agregar(
                AVISO_DATO_FALTANTE,
                f"El porcentaje de participación de {subject or 'un accionista'} ({n}) está "
                "fuera de 0 a 100; se envía vacío.",
                field="shareholder.ownershipPercentage", subject=subject)
        return None
    n = round(float(n), 2)
    return int(n) if n.is_integer() else n


def pais_del_documento(tipo_id: str | None, *paises: Any) -> str | None:
    """El ISO-2 del país que emitió el documento, o `None`.

    El tipo solo CANDIDATEA un país, y se usa nada más si coincide con alguno de
    `paises` —el de la corrida o el `countryOfOrigin` de la persona—. Ninguno de
    estos tipos es exclusivo de un país de la región: hay RUT en Uruguay, NIT en
    Bolivia y Guatemala, CC en Ecuador y carné de extranjería (CE) en Perú. En
    una declaración de beneficiarios finales un país equivocado es peor que
    vacío, y el pedido dice «null si no se puede determinar».

    La cédula de un accionista de una empresa colombiana sigue saliendo `CO`,
    que es el caso de Onboarding; un RUT en una corrida de Uruguay, `None`.
    """
    candidato = PAIS_DEL_DOCUMENTO.get(tipo_id or "")
    return candidato if candidato and candidato in {codigo_pais(x) for x in paises} else None


def accionista(p: dict, avisos: Avisos | None = None, pais_corrida: Any = "") -> dict:
    """Un accionista de `shareholders[]` con sus nueve campos.

    Con las reglas de `representante()` —nombre e identificador tal como
    figuran— salvo dos: un accionista sin tipo de persona NO se omite (va en
    `null` con su aviso, como en EP-6), y el vocabulario de
    `identificationType` suma los documentos de persona jurídica.

    Acá no se decide si entra al nodo: eso lo hace `falta_para_incluir`.
    `pais_corrida` es el país declarado de la corrida: lo usa
    `documentCountryCode`.

    `nationalityCode` es el `countryOfOrigin` SOLO si el modelo marcó
    `nationalityDeclared`: que el documento escribe la nacionalidad. Solo,
    `countryOfOrigin` no distingue lo declarado de lo deducido, y el contrato
    pide «no se infiere».
    """
    ruta = "shareholder"
    tipo = _tipo_o_aviso(p, avisos, ruta, omite=False)
    quien = _sujeto(p)

    def tope(valor: Any, campo: str) -> str | None:
        return recortar(valor, TOPE_TEXTO, f"{ruta}.{campo}", avisos, quien)

    pais_crudo = str(p.get("countryOfOrigin") or "")
    name, last_name = nombre_y_apellido(p, tipo, pais_crudo, avisos, ruta)
    tipo_id = tipo_identificacion(
        p.get("identificationType"), endpoint="shareholders", pais=pais_crudo, tipo_persona_=tipo)
    # Si no está en el catálogo, `pais_anexo_a` deja el aviso y devuelve None.
    # Una sociedad no tiene nacionalidad en este nodo: su `countryOfOrigin` es
    # el país de constitución.
    declarada = p.get("nationalityDeclared") is True and tipo != "LEGAL"
    nacionalidad = pais_anexo_a(pais_crudo if declarada else None,
                                avisos, field=f"{ruta}.nationalityCode", subject=quien)
    return {
        "fullName": tope(p.get("shareholderName") or p.get("fullName"), "fullName"),
        "name": tope(name, "name"),
        "lastName": tope(last_name, "lastName"),
        "personType": tipo,
        "identificationType": tipo_id,
        "identificationNumber": tope(
            id_tal_cual(p.get("shareholderId") or p.get("identificationNumber")), "identificationNumber"),
        "ownershipPercentage": porcentaje_accionista(p.get("ownershipPercentage"), avisos, quien),
        "nationalityCode": codigo_pais(nacionalidad),
        "documentCountryCode": pais_del_documento(tipo_id, pais_corrida, pais_crudo),
    }


def clave_de_nombre(nombre: Any) -> tuple[str, ...]:
    """El nombre para reconocer a la misma persona escrita en otro orden:
    «RAMÍREZ ECHEVERRI JUAN» y «Juan Ramírez Echeverri» dan la misma clave."""
    return tuple(sorted(re.sub(r"[^a-z0-9\s]", " ", _sin_tildes(str(nombre or ""))).split()))


def falta_para_incluir(a: dict) -> str | None:
    """El `field` del dato mínimo que le falta al accionista, o `None` si entra.

    Uno solo, el más de fondo: sin nombre no se sabe de quién es lo demás, y
    sin número un tipo de documento no identifica a nadie. «Un problema, un
    aviso».
    """
    if not (a.get("name") or a.get("fullName")):
        return "shareholder.name"
    if not a.get("identificationNumber"):
        return "shareholder.identificationNumber"
    if not a.get("identificationType"):
        return "shareholder.identificationType"
    return None


# El identificador tributario de la EMPRESA (§6.9). Es un tercer vocabulario,
# más suelto que los de las personas: «identificador tributario según el país,
# por ejemplo RUT, NIT o RUC».
TAX_ID_POR_PAIS: dict[str, str] = {
    "chile": "RUT",
    "colombia": "NIT",
    "peru": "RUC",
    "argentina": "CUIT",
    "mexico": "RFC",
    "brasil": "CNPJ",
    "brazil": "CNPJ",
    "uruguay": "RUT",
    "ecuador": "RUC",
}

# Un RUT chileno se reconoce por su forma SOLO SI TRAE SU PUNTUACIÓN: el guion
# del verificador, o una K.
#
# Sin eso no se distingue. `900123456` son nueve dígitos y es un NIT colombiano
# perfectamente válido, pero también encaja en «7 u 8 dígitos más verificador».
# La primera versión de esta regex hacía los puntos y el guion opcionales y
# clasificaba todos los NIT como RUT — en silencio, que es el modo de fallo que
# esta fase entera existe para evitar.
# Solo las formas que NO puede tener un identificador de otro país de la región:
# con puntos, o con la K del verificador. Un `12345678-9` pelado queda afuera a
# propósito — es idéntico a un NIT colombiano de ocho dígitos con verificador.
_RE_RUT_INEQUIVOCO = re.compile(r"^\d{1,2}(\.\d{3}){2}-[\dkK]$|^\d{7,8}-[kK]$|^\d{7,8}[kK]$", re.I)

#: Las formas INEQUÍVOCAS de un identificador tributario y de qué país son
#: (14-10-2026: antes solo se reconocía el RUT chileno). Cada una se mira sobre
#: el valor tal como figura, salvo el RFC, que se mira compacto.
#:
#: 11 dígitos que empiezan con 20 son un RUC peruano y también un CUIT
#: argentino sin guiones: esa forma vale para los dos países y no avisa en
#: ninguno.
_FORMAS_TAX_ID: tuple[tuple[re.Pattern, frozenset[str], str, str], ...] = (
    (re.compile(r"^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$"), frozenset({"mexico"}), "RFC mexicano", "RFC"),
    (re.compile(r"^\d{3}\.\d{3}\.\d{3}-\d$"), frozenset({"colombia"}), "NIT colombiano", "NIT"),
    (re.compile(r"^20\d{9}$"), frozenset({"peru", "argentina"}), "RUC peruano o CUIT argentino", "RUC"),
    (re.compile(r"^(?:10|15|17)\d{9}$"), frozenset({"peru"}), "RUC peruano", "RUC"),
    (re.compile(r"^\d{2}-\d{8}-\d$"), frozenset({"argentina"}), "CUIT argentino", "CUIT"),
    (_RE_RUT_INEQUIVOCO, frozenset({"chile"}), "RUT chileno", "RUT"),
)


def _forma_tax_id(t: str) -> tuple[frozenset[str], str, str] | None:
    compacto = re.sub(r"[\s.\-]", "", t).upper()
    for rx, paises, nombre, tipo in _FORMAS_TAX_ID:
        if rx.match(compacto if tipo == "RFC" else t):
            return paises, nombre, tipo
    return None


def tipo_tax_id(tax_id: Any, pais: Any = "", avisos: Avisos | None = None) -> str | None:
    """El `taxIdType` de la empresa, derivado del país y del formato (§6.9).

    ── El país MANDA sobre el formato, y no al revés ─────────────────────────
    La primera versión invertía esa prioridad y se equivocaba dos veces:

        tipo_tax_id("80012345-6", "colombia") → "RUT"   ✗ es un NIT
        tipo_tax_id("12345678-9", "colombia") → "RUT"   ✗ es un NIT

    Un NIT colombiano de ocho dígitos con verificador tiene **exactamente** la
    forma de un RUT chileno sin puntos. No hay nada en el string que los separe.

    El punto de fondo: el país viene **declarado** en el cuerpo de EP-1, no
    inferido. Es información dura. Hacer que una heurística de formato le gane a
    un dato declarado es descartar lo que se sabe a favor de lo que se adivina.
    El formato solo decide cuando el país NO se sabe.

    ── Cuando el formato contradice al país declarado ───────────────────────
    Gana el país igual, pero se avisa. Un `76.123.456-K` declarado como
    colombiano no es un NIT ni un RUT: es una señal de que algo vino mal más
    arriba, y elegir en silencio cualquiera de los dos la tapa. Vale para todas
    las formas inequívocas de `_FORMAS_TAX_ID`: RFC, NIT con verificador, RUC,
    CUIT y RUT.

    `None` si no alcanza para saberlo. Igual que con las personas: un valor
    inventado no falla, se guarda mal.
    """
    t = str(tax_id or "").strip()
    # Sin identificador no hay tipo de identificador. §6.9 usa la ausencia de
    # `taxId` para dejar el contraste en NOT_COMPARABLE; un `taxIdType` poblado
    # ahí es ruido justo en el camino que decide eso.
    if not t:
        return None

    p = pais_normalizado(pais)
    del_pais = TAX_ID_POR_PAIS.get(p)
    forma = _forma_tax_id(t)

    if del_pais:
        if forma and p not in forma[0] and avisos is not None:
            avisos.agregar(
                AVISO_TAX_ID_DISCREPA,
                f"el identificador «{t}» tiene forma de {forma[1]} pero el país declarado "
                f"corresponde a {del_pais}; se usa el del país.",
                field="taxId", valor=t, pais=str(pais or ""),
            )
        return del_pais

    return forma[2] if forma else None


def empresa(datos: dict, avisos: Avisos | None = None) -> dict:
    """El bloque `company` de EP-5 (§6.9).

    Con los largos de la base de Onboarding (AJ-09): `apt` en 10 —abreviando
    antes de recortar— y 255 para la razón social, el identificador y las partes
    del domicilio. Lo que se recorta, se avisa con su `field`.
    """
    tax_id = datos.get("taxId")
    pais = datos.get("country") or datos.get("pais")
    dom = domicilio(datos.get("address"), avisos, datos.get("addressLine"))
    for parte in ("street", "city", "state"):
        dom[parte] = recortar(dom[parte], TOPE_TEXTO, f"address.{parte}", avisos)
    dom["apt"] = apto_corto(dom["apt"], avisos)
    return {
        "legalName": recortar(datos.get("legalName"), TOPE_TEXTO, "legalName", avisos),
        "taxId": recortar(id_tal_cual(tax_id), TOPE_TEXTO, "taxId", avisos),
        "taxIdType": tipo_tax_id(tax_id, pais, avisos),
        "constitutionDate": fecha_iso(datos.get("constitutionDate"), avisos, pais),
        "legalForm": forma_legal(datos.get("legalName"), datos.get("legalFormDoc"), avisos),
        "address": dom,
        "activity": actividad(datos.get("activity"), datos.get("objetoSocial"), avisos),
        # §11. `boolean | null`: `null` cuando el documento no permite
        # determinarlo. Solo pasa un booleano de verdad — un `"true"` de texto o
        # un 1 son «no lo dijo». Este valor decide cuántas aprobaciones necesita
        # una empresa para operar, así que adivinarlo es peor que no tenerlo.
        "jointAdministration": (
            datos.get("jointAdministration")
            if isinstance(datos.get("jointAdministration"), bool) else None
        ),
    }


# ══════════════════════════════════════════════════════════════════════════
# El domicilio, que es parte del bloque `company`
# ══════════════════════════════════════════════════════════════════════════
# Vive acá abajo y no junto a `empresa()` solo porque `empresa()` está definida
# más arriba en el archivo y esto es su ayudante.

#: Palabras que marcan la parte «departamento / oficina» de una dirección.
#: Se buscan como palabra entera al principio del fragmento: `of` suelto
#: aparece en cualquier lado, pero `of 302` solo en esta posición.
_MARCAS_APTO = (
    "depto", "dpto", "departamento", "of", "ofic", "oficina", "piso",
    "local", "casa", "block", "bloque", "torre", "apto", "apartamento",
)

_RE_APTO = re.compile(
    r"^(?:" + "|".join(_MARCAS_APTO) + r")\b\.?\s*\S", re.IGNORECASE)


def _es_apto(fragmento: str) -> bool:
    return bool(_RE_APTO.match(fragmento.strip()))


#: Lo que marca la parte «calle» de una dirección. Una parte que no tiene ni un
#: número ni una de estas palabras NO es una calle, aunque venga primera: es el
#: error que ponía «Santiago» como calle y «Chile» como ciudad.
_MARCAS_CALLE = (
    "calle", "avenida", "av", "avda", "pasaje", "psje", "camino", "carrera", "cra",
    "cr", "kr", "diagonal", "dg", "transversal", "tv", "autopista", "ruta", "km",
    "kilometro", "kilómetro", "parcela", "lote", "sitio", "fundo", "manzana", "mz",
    "paseo", "plaza", "boulevard", "bulevar", "costanera", "circunvalacion",
    "circunvalación", "jiron", "jirón",
)
_RE_CALLE = re.compile(r"^(?:" + "|".join(_MARCAS_CALLE) + r")\b\.?", re.IGNORECASE)

#: Lo que marca la parte «región / departamento».
_RE_REGION = re.compile(
    r"^(?:regi[oó]n|departamento|depto\.?\s+de|provincia|estado\s+de)\b|\bmetropolitana\b",
    re.IGNORECASE,
)

#: Prefijos que acompañan a la comuna o ciudad y que NO son parte de su nombre.
#: `city` guarda el nombre: «Lo Barnechea», no «Comuna de Lo Barnechea».
_RE_PREFIJO_CIUDAD = re.compile(
    r"^(?:comuna|ciudad|municipio|localidad|distrito|cant[oó]n)\s+de\s+", re.IGNORECASE)


def _es_calle(parte: str) -> bool:
    return bool(re.search(r"\d", parte)) or bool(_RE_CALLE.match(parte.strip()))


def _es_region(parte: str) -> bool:
    return bool(_RE_REGION.search(parte.strip()))


def _es_pais(parte: str) -> bool:
    return _sin_tildes(parte) in _INDICE_PAISES


#: Una sigla al final de la parte: `D.C.`, `S.A.`. Su punto final es parte del
#: nombre y no se saca.
_RE_SIGLA_FINAL = re.compile(r"(?:^|\s)(?:\w\.)+$")


def _limpiar_parte(parte: str) -> str:
    """Saca la puntuación que cierra la frase, no la que es parte del nombre.

    Las escrituras terminan el domicilio con punto: «…, Lo Barnechea, Chile.».
    Con ese punto, «Chile.» no se reconocía como país y terminaba metido en la
    ciudad —pasó con una escritura real: `city = «Lo Barnechea, Chile.»`—. Pero
    «Bogotá D.C.» tiene que quedar como está: ese punto es de la sigla.
    """
    p = parte.strip().rstrip(";:").strip()
    if p.endswith(".") and not _RE_SIGLA_FINAL.search(p):
        p = p[:-1].rstrip()
    return p


#: Las etiquetas de la línea de DIRECCIÓN, en orden de preferencia (AJ-01).
#: En el certificado colombiano, «Domicilio principal» es la ciudad y la
#: dirección viene en otra línea: con solo «Domicilio Legal», `street` y `apt`
#: salían siempre en `null`. La de «notificación judicial» NUNCA: es una
#: dirección para recibir notificaciones, no la de la empresa.
_ETIQUETAS_DIRECCION = (
    re.compile(r"direcci[oó]n\s+del\s+domicilio\s+principal[ \t]*:?", re.IGNORECASE),
    re.compile(r"direcci[oó]n\s+comercial[ \t]*:?", re.IGNORECASE),
    re.compile(r"direcci[oó]n\s+principal[ \t]*:?", re.IGNORECASE),
)

#: Lo que, en la misma línea, ya es otra casilla del certificado.
_FIN_DIRECCION = re.compile(
    r"\s{2,}|\s(?:municipio|ciudad|departamento|pa[ií]s|correo|e-?mail|tel[eé]fono"
    r"|c[oó]digo\s+postal)\b", re.IGNORECASE)

#: Una marca de oficina o departamento DENTRO de la calle, sin coma antes:
#: «Carrera 7 # 71-21 Torre B Piso 3».
_APTO_EN_LINEA = re.compile(
    r"\s(?=(?:of|ofic|oficina|apto|apartamento|piso|torre|interior|int|depto|dpto)\b\.?\s*\w)",
    re.IGNORECASE)


def linea_de_direccion(textos: list[str]) -> str | None:
    """La dirección que el documento pone detrás de su etiqueta, o `None`.

    Se busca cada etiqueta en todos los textos —el del principal primero— antes
    de pasar a la siguiente: la preferencia es por etiqueta, no por documento.
    Una línea sin número ni palabra de calle no es una dirección.
    """
    for etiqueta in _ETIQUETAS_DIRECCION:
        for texto in textos:
            t = str(texto or "")
            for m in etiqueta.finditer(t):
                for linea in t[m.end():].split("\n")[:2]:
                    linea = linea.strip()
                    corte = _FIN_DIRECCION.search(linea)
                    valor = (linea[:corte.start()] if corte else linea).strip(" ,;:")
                    if valor and _es_calle(valor.split(",")[0]):
                        return valor
    return None


def calle_y_apto(linea: Any) -> tuple[str | None, str | None]:
    """`(street, apt)` de una línea de dirección. Lo demás —ciudad, país— se
    ignora: sale de *Domicilio Legal*."""
    partes = [_limpiar_parte(p) for p in str(linea or "").split(",")]
    partes = [p for p in partes if p and not _es_pais(p)]
    if not partes or not _es_calle(partes[0]):
        return None, None
    street = partes[0]
    apt = next((p for p in partes[1:] if _es_apto(p)), None)
    if apt is None:
        dentro = _APTO_EN_LINEA.search(street)
        if dentro:
            street, apt = street[:dentro.start()].strip(), street[dentro.end():].strip()
    return street or None, apt or None


def domicilio(texto: Any, avisos: Avisos | None = None, linea: Any = None) -> dict:
    """Parte *Domicilio Legal* en `street` / `apt` / `city` / `state`.

    ── Se clasifica cada parte, no se reparte por posición ─────────────────
    La primera versión repartía por posición —primera parte calle, segunda
    ciudad, tercera región—, y con escrituras reales falló en 5 de 6: cuando la
    escritura da el domicilio como ciudad, todo se corre un nivel.

        "Santiago, Chile"   →  street="Santiago"  city="Chile"          ✗

    Onboarding guarda la dirección por componente, así que eso habría guardado la
    ciudad como calle y el país como ciudad. Ahora cada parte se reconoce por lo
    que ES:

      · **país** — está en el Anexo A → se descarta: el contrato no tiene campo
        país, y meterlo en `city` o `state` es un dato equivocado.
      · **calle** — tiene un número o una palabra de calle (`Av.`, `Calle`,
        `Pasaje`…). Sin ninguna de las dos no es una calle, venga donde venga.
      · **apartamento** — `Of`, `Depto`, `Piso`…
      · **región** — `Región…`, `Departamento…`, `…Metropolitana…`
      · lo que queda es **comuna / ciudad**, sin el «Comuna de» adelante.

        "Santiago, Chile"                                  → city
        "Comuna de Lo Barnechea, Región Metropolitana…"    → city, state
        "Los Aromos 1450, comuna de Quilpué, Región…"   → street, city, state

    Solo cuando no hay marca de región se vuelve a la posición —«calle, ciudad,
    región», de lo específico a lo general—, que es la única señal que queda:

        "10 norte 882, Viña del Mar, Valparaíso"           → street, city, state

    Lo que no se puede clasificar **no se inventa**. Si solo hay ciudad,
    `street` queda en `null`: una calle adivinada es peor que ninguna, porque
    nadie la va a revisar.

    El aviso por domicilio faltante NO se emite acá: lo emite la evaluación de
    datos esperados de `companies`, que es la que decide el estado de la corrida
    y la única que sabe qué faltó en total. Emitirlo en los dos lados lo duplicaba.

    `linea` es la línea de dirección del documento (`linea_de_direccion`).
    Cuando trae una calle, `street` y `apt` salen de ahí; `city` y `state`
    siguen saliendo de *Domicilio Legal* (AJ-01).
    """
    base = _domicilio_legal(texto)
    calle, apto = calle_y_apto(linea)
    if calle:
        base["street"], base["apt"] = calle, apto or base["apt"]
    return base


def _domicilio_legal(texto: Any) -> dict:
    vacio = {"street": None, "apt": None, "city": None, "state": None}
    crudo = str(texto or "").strip()
    if not crudo or crudo.lower() in ("no especificado", "sin documento"):
        return vacio

    partes = [_limpiar_parte(p) for p in crudo.split(",")]
    partes = [p for p in partes if p and not _es_pais(p)]
    if not partes:
        return vacio

    street = apt = state = None
    resto: list[str] = []
    for i, p in enumerate(partes):
        if apt is None and i > 0 and _es_apto(p):
            apt = p
        elif street is None and not resto and _es_calle(p):
            # Solo al principio: un número suelto más adelante («Región 5») no
            # convierte esa parte en calle.
            street = p
        elif state is None and _es_region(p):
            state = p
        else:
            resto.append(p)

    if state is None and len(resto) >= 2:
        # Sin marca de región, la posición manda: la última es la región.
        state = resto.pop()

    # Sin repetidos: hay escrituras que nombran la comuna dos veces —«comuna de
    # X, … , X»—, y `city = "X, X"` no es una ciudad.
    ciudades: list[str] = []
    for c in resto:
        nombre = _RE_PREFIJO_CIUDAD.sub("", c).strip()
        if nombre and _sin_tildes(nombre) not in {_sin_tildes(x) for x in ciudades}:
            ciudades.append(nombre)
    city = ", ".join(ciudades) or None
    return {"street": street, "apt": apt, "city": city, "state": state}


