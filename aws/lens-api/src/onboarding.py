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

    def agregar(self, reason: str, message: str, **extra: Any) -> None:
        self.items.append({"reason": reason, "message": message, **extra})

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
# que el respaldo no invierta el caso más común de este contrato.
PAISES_ORDEN_REGISTRAL = {"colombia", "co"}


def partir_nombre(
    completo: str, *, name: str = "", last_name: str = "",
    pais: str = "", avisos: "Avisos | None" = None,
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

    partes = txt.split(" ")
    if len(partes) == 1:
        # Un solo token: es un nombre, no hay apellido que inventar.
        return partes[0], None
    if len(partes) == 2:
        return partes[0], partes[1]

    registral = _sin_tildes(pais) in PAISES_ORDEN_REGISTRAL
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
            valor=txt, pais=pais or "",
        )
    return nombre, apellido


def nombre_y_apellido(
    p: dict, tipo: str | None, pais: str = "", avisos: "Avisos | None" = None,
) -> tuple[str | None, str | None]:
    """`(name, lastName)` según el tipo de persona.

    En personas jurídicas, `name` es la **razón social** y `lastName` va en
    `null`. No es cosmético: hoy LENS deja los dos vacíos y el contrato pide
    explícitamente que la razón social viaje en `name`.
    """
    if tipo == "LEGAL":
        razon = str(p.get("shareholderName") or p.get("name") or "").strip()
        return (razon or None), None
    return partir_nombre(
        str(p.get("shareholderName") or p.get("fullName") or ""),
        name=str(p.get("name") or ""),
        last_name=str(p.get("lastName") or ""),
        pais=pais, avisos=avisos,
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
# D · shareholderId:  solo dígitos
# ══════════════════════════════════════════════════════════════════════════

def id_accionista(valor: Any) -> str | None:
    """El identificador del accionista **solo con dígitos**.

    Del contrato: el de la empresa y el del representante van *tal como figuran
    en el documento*; el del accionista, *solo con dígitos*. Son reglas
    distintas para el mismo tipo de dato, así que hay dos funciones y no una
    con un booleano — un parámetro se pasa mal, dos nombres no.

    El dígito verificador `K` de un RUT chileno **se pierde** en esta
    conversión. Es lo que pide el contrato, y también dice que *«LENS no
    recalcula dígitos»*: no se toca lo que no se entiende.
    """
    digitos = re.sub(r"\D", "", str(valor or ""))
    return digitos or None


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


def pais_anexo_a(valor: Any, avisos: Avisos | None = None) -> str | None:
    """El nombre del país con la grafía exacta del Anexo A, o `None`.

    **Tolerante al leer, estricto al escribir.** Del otro lado se compara
    ignorando mayúsculas y espacios de los extremos pero **no la grafía**: si
    LENS manda `Mexico` sin tilde, Onboarding lo guarda como país desconocido y
    no avisa. Así que acá se empareja sin tildes y sin distinguir mayúsculas, y
    se emite la forma canónica de la tabla.

    Lo que NO se hace es mandar el texto crudo cuando no matchea. Eso es
    exactamente el modo de fallo silencioso que el contrato advierte. Se emite
    `None` y se anota un aviso con el valor original, para que se vea.
    """
    crudo = str(valor or "").strip()
    if not crudo:
        return None
    canonico = _INDICE_PAISES.get(_sin_tildes(crudo))
    if canonico is None and avisos is not None:
        avisos.agregar(
            AVISO_PAIS,
            f"El país «{crudo}» no está en el catálogo de Onboarding; se envía vacío.",
            valor=crudo,
        )
    return canonico


# ══════════════════════════════════════════════════════════════════════════
# F · constitutionDate:  YYYY-MM-DD
# ══════════════════════════════════════════════════════════════════════════

_MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

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


_RE_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_RE_NUMERICA = re.compile(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$")

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
    # forma mixta —día en número, año en palabras— también funcione.
    if seq[0].isdigit():
        return int(seq[0])
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


def fecha_iso(valor: Any, avisos: Avisos | None = None) -> str | None:
    """`YYYY-MM-DD`, o `None` con aviso si no se puede leer con certeza.

    Formatos que entiende:

      1. Ya viene ISO            → `2019-03-15`
      2. Numérica día/mes/año    → `15/03/2019`, `15-3-19`
      3. Día y año en cifras     → `15 de marzo de 2019`
      4. Día y año en palabras   → `doce de marzo de dos mil diecinueve`

    El cuarto es el que importa: las escrituras chilenas escriben la fecha con
    letras, y el prompt de LENS **no pide ningún formato** — sale tal como está
    en el documento. Se ancla en el nombre del mes y se lee hacia los dos lados,
    así que también funciona dentro de una frase.

    Nunca adivina. Un año de dos dígitos se expande con la regla habitual
    (≤ 69 → 2000, si no 1900); cualquier cosa que no encaje sale `None` con aviso.
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

    if (g := _RE_NUMERICA.match(crudo)):
        d, m, a = int(g.group(1)), int(g.group(2)), int(g.group(3))
        if a < 100:
            a += 2000 if a <= 69 else 1900
        if (iso := _armar(d, m, a)):
            return iso

    # Ancla en el mes y lectura hacia los dos lados.
    toks = _tokens(crudo)
    for i, t in enumerate(toks):
        mes = _MESES.get(t)
        if mes is None:
            continue
        dia = _tomar_numero(toks[:i], desde_el_final=True)
        anio = _tomar_numero(toks[i + 1:], desde_el_final=False)
        if dia is not None and anio is not None and (iso := _armar(dia, mes, anio)):
            return iso

    if avisos is not None:
        avisos.agregar(
            AVISO_FECHA,
            f"No se pudo interpretar la fecha «{crudo}»; se envía vacía.",
            campo="constitutionDate",
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
                       campo="legalForm")
    return FORMAS_LEGALES.get(forma) if forma else None


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
                       campo="activity")
    return None


def recortar(valor: Any, tope: int, campo: str, avisos: Avisos | None = None) -> str | None:
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
    if " " in corte:
        corte = corte[:corte.rindex(" ")].rstrip()
    corte = corte or txt[:tope]
    if avisos is not None:
        avisos.agregar(
            AVISO_TRUNCADO,
            f"«{campo}» tenía {len(txt)} caracteres y el contrato admite {tope}; se recortó.",
            campo=campo, original=txt,
        )
    return corte


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

VOCAB_EP4: frozenset[str] = frozenset(
    {"RUT", "CC", "DNI", "CE", "PASS", "PPT", "CV", "CP", "DRIVERS"})
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
    "rfc":              (None,         "RFC"),
    "curp":             (None,         "CURP"),
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
    """El tipo de documento con el vocabulario de `endpoint` (`"EP-4"`/`"EP-6"`).

    Primero **traduce** lo que el documento declaró —el prompt ya pide
    `identificationType`, así que normalmente viene— y si no vino, lo **deriva**
    del país y del tipo de persona, que es lo que describen §6.8 y §6.10.

    `None` cuando no alcanza para saberlo, incluido el caso de un tipo que
    existe pero **no en ese endpoint**: emitir un valor que el consumidor no
    tiene en su lista no falla, guarda mal.
    """
    clave = _sin_tildes(str(valor or "")).replace(" ", "").replace("_", "").replace(".", "")
    par = _EQUIVALENCIAS.get(clave)

    if par is None and not clave:
        # No vino declarado: se deriva. Solo con el país; sin él no se adivina.
        porpais = TIPO_POR_PAIS.get(_sin_tildes(str(pais or "")))
        if porpais:
            derivado = porpais[1] if tipo_persona_ == "LEGAL" else porpais[0]
            par = _EQUIVALENCIAS.get(_sin_tildes(derivado).replace(" ", ""))

    if par is None:
        return None
    return par[0] if endpoint == "EP-4" else par[1]


# ══════════════════════════════════════════════════════════════════════════
# La persona completa, con los siete ajustes aplicados
# ══════════════════════════════════════════════════════════════════════════

def _tipo_o_aviso(p: dict, avisos: Avisos | None) -> str | None:
    """El tipo de persona, o `None` dejando el aviso que pide el contrato.

    *«Si LENS no puede determinarlo, omite la entidad y lo informa como aviso»*
    (§7.1). Omitir es más seguro que mandarla: del otro lado, todo lo que no sea
    `NATURAL` se guarda como jurídica, así que una persona natural sin tipo
    entraría al registro como empresa.
    """
    tipo = tipo_persona(p.get("personType"))
    if tipo is None and avisos is not None:
        avisos.agregar(
            AVISO_TIPO_PERSONA,
            "No se pudo determinar si es persona natural o jurídica; se omite la entidad.",
            valor=str(p.get("personType") or ""),
            nombre=str(p.get("shareholderName") or ""),
        )
    return tipo


def persona(p: dict, avisos: Avisos | None = None) -> dict | None:
    """Un accionista con los DIEZ campos de EP-6 (§6.10), o `None` si se omite.

    `shareholderName` conserva el texto original y no es decorativo: la
    partición en `name` / `lastName` **no es reversible**. Con el orden registral
    colombiano, concatenarlos de vuelta da «ANGELA VIVIANA PEREZ GOMEZ», que no
    es lo que decía la escritura. Quien después cruce contra el registro necesita
    el nombre como está escrito.
    """
    tipo = _tipo_o_aviso(p, avisos)
    if tipo is None:
        return None

    pais_crudo = str(p.get("countryOfOrigin") or "")
    name, last_name = nombre_y_apellido(p, tipo, pais_crudo, avisos)
    return {
        "personType": tipo,
        "shareholderName": str(p.get("shareholderName") or "").strip() or None,
        "shareholderId": id_accionista(p.get("shareholderId")),
        "countryOfOrigin": pais_anexo_a(pais_crudo, avisos),
        "identificationType": tipo_identificacion(
            p.get("identificationType"), endpoint="EP-6", pais=pais_crudo, tipo_persona_=tipo),
        "lastName": last_name,
        "name": name,
        "ownershipPercentage": p.get("ownershipPercentage"),
        # La clave va SIEMPRE, aunque quede vacía: el consumidor no tiene que
        # defenderse de campos ausentes. Y `[]` significa «el documento no las
        # revela», que no es lo mismo que «no se sabe». No se inventan personas.
        "indirectShareholders": [
            h for h in (persona(x, avisos) for x in (p.get("indirectShareholders") or []))
            if h is not None
        ],
        "isPEP": es_pep(p.get("isPEP"), tipo),
    }


def representante(p: dict, avisos: Avisos | None = None) -> dict | None:
    """Un representante legal con los SIETE campos de EP-4 (§6.8).

    NO es `persona()` con un campo más: EP-4 tiene otras claves y otras reglas.
    El identificador se llama `identificationNumber` y va **tal como figura** —
    no solo dígitos, que es la regla del accionista—, y el vocabulario de
    `identificationType` es el otro. Reusar la forma de EP-6 acá emitiría las
    claves equivocadas con los valores equivocados.
    """
    tipo = _tipo_o_aviso(p, avisos)
    if tipo is None:
        return None

    pais_crudo = str(p.get("countryOfOrigin") or "")
    name, last_name = nombre_y_apellido(p, tipo, pais_crudo, avisos)
    return {
        "fullName": str(p.get("shareholderName") or p.get("fullName") or "").strip() or None,
        "name": name,
        "lastName": last_name,
        "personType": tipo,
        "identificationType": tipo_identificacion(
            p.get("identificationType"), endpoint="EP-4", pais=pais_crudo, tipo_persona_=tipo),
        "identificationNumber": id_tal_cual(p.get("shareholderId") or p.get("identificationNumber")),
        "role": recortar(p.get("position") or p.get("role"), TOPE_CARGO, "role", avisos),
    }


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
    arriba, y elegir en silencio cualquiera de los dos la tapa.

    `None` si no alcanza para saberlo. Igual que con las personas: un valor
    inventado no falla, se guarda mal.
    """
    t = str(tax_id or "").strip()
    # Sin identificador no hay tipo de identificador. §6.9 usa la ausencia de
    # `taxId` para dejar el contraste en NOT_COMPARABLE; un `taxIdType` poblado
    # ahí es ruido justo en el camino que decide eso.
    if not t:
        return None

    del_pais = TAX_ID_POR_PAIS.get(_sin_tildes(str(pais or "")))
    # Inequívoco = trae la K del verificador o los puntos. Un `12345678-9` pelado
    # NO es inequívoco y por eso no entra acá.
    inequivoco_rut = bool(_RE_RUT_INEQUIVOCO.match(t))

    if del_pais:
        if inequivoco_rut and del_pais != "RUT" and avisos is not None:
            avisos.agregar(
                AVISO_TAX_ID_DISCREPA,
                f"el identificador «{t}» tiene forma de RUT chileno pero el país declarado "
                f"corresponde a {del_pais}; se usa el del país.",
                valor=t, pais=str(pais or ""),
            )
        return del_pais

    return "RUT" if inequivoco_rut else None


def empresa(datos: dict, avisos: Avisos | None = None) -> dict:
    """El bloque `company` de EP-5 (§6.9)."""
    tax_id = datos.get("taxId")
    return {
        "legalName": str(datos.get("legalName") or "").strip() or None,
        "taxId": id_tal_cual(tax_id),
        "taxIdType": tipo_tax_id(tax_id, datos.get("country") or datos.get("pais"), avisos),
        "constitutionDate": fecha_iso(datos.get("constitutionDate"), avisos),
        "legalForm": forma_legal(datos.get("legalName"), datos.get("legalFormDoc"), avisos),
        "address": domicilio(datos.get("address"), avisos),
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


def domicilio(texto: Any, avisos: Avisos | None = None) -> dict:
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
    """
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


