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

def partir_nombre(completo: str, *, name: str = "", last_name: str = "") -> tuple[str | None, str | None]:
    """Separa nombre y apellidos siguiendo la precedencia del contrato.

    Textual: *«Separados de origen: Onboarding no puede inferir el orden de los
    apellidos. Precedencia: columnas explícitas → coma → cantidad de palabras.»*

    1. **Columnas explícitas.** Si el documento ya los trae separados, mandan.
    2. **Coma.** `PÉREZ GONZÁLEZ, JUAN ANDRÉS` → apellidos antes, nombres después.
       Es la convención de los registros y no admite ambigüedad.
    3. **Cantidad de palabras.** Convención chilena: los DOS últimos son los
       apellidos (paterno y materno). Con tres palabras, uno de nombre y dos de
       apellido. Con dos, uno y uno.

    Devuelve `(None, None)` si no hay nada con qué trabajar: un nombre vacío no
    se inventa.
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
    if len(partes) == 3:
        return partes[0], " ".join(partes[1:])
    # Cuatro o más: los dos últimos son los apellidos.
    return " ".join(partes[:-2]), " ".join(partes[-2:])


def nombre_y_apellido(p: dict, tipo: str | None) -> tuple[str | None, str | None]:
    """`(name, lastName)` según el tipo de persona.

    En personas jurídicas, `name` es la **razón social** y `lastName` va en
    `null`. No es cosmético: hoy LENS deja los dos vacíos y el contrato pide
    explícitamente que la razón social viaje en `name`.
    """
    if tipo == "LEGAL":
        razon = str(p.get("shareholderName") or p.get("name") or "").strip()
        return (razon or None), None
    return partir_nombre(
        str(p.get("shareholderName") or ""),
        name=str(p.get("name") or ""),
        last_name=str(p.get("lastName") or ""),
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
    if tipo == "LEGAL":
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
            valor=crudo,
        )
    return None


# ══════════════════════════════════════════════════════════════════════════
# G · legalForm y activity:  máximo 30 caracteres
# ══════════════════════════════════════════════════════════════════════════

TOPE_FORMA_LEGAL = 30
TOPE_ACTIVIDAD = 30
TOPE_CARGO = 60   # el cargo se entrega completo; Onboarding guarda hasta 60


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
# La persona completa, con los siete ajustes aplicados
# ══════════════════════════════════════════════════════════════════════════

def persona(p: dict, avisos: Avisos | None = None, *, es_accionista: bool = True) -> dict | None:
    """Una persona en el formato de Onboarding, o `None` si hay que omitirla.

    Devuelve `None` cuando no se pudo determinar el tipo de persona. Es lo que
    pide el contrato — *«Si LENS no puede determinarlo, omite la entidad y lo
    informa como aviso»*— y es más seguro que mandarla: del otro lado, todo lo
    que no sea `NATURAL` se guarda como persona jurídica, así que una persona
    natural sin tipo entraría al registro como empresa.
    """
    tipo = tipo_persona(p.get("personType"))
    if tipo is None:
        if avisos is not None:
            avisos.agregar(
                AVISO_TIPO_PERSONA,
                "No se pudo determinar si es persona natural o jurídica; se omite la entidad.",
                valor=str(p.get("personType") or ""),
                nombre=str(p.get("shareholderName") or ""),
            )
        return None

    name, last_name = nombre_y_apellido(p, tipo)
    return {
        "personType": tipo,
        "name": name,
        "lastName": last_name,
        "shareholderId": id_accionista(p.get("shareholderId")) if es_accionista
                         else id_tal_cual(p.get("shareholderId")),
        "countryOfOrigin": pais_anexo_a(p.get("countryOfOrigin"), avisos),
        "ownershipPercentage": p.get("ownershipPercentage"),
        "isPEP": es_pep(p.get("isPEP"), tipo),
    }


def representante(p: dict, avisos: Avisos | None = None) -> dict | None:
    """Un representante legal. Su identificador va **tal cual**, no solo dígitos."""
    r = persona(p, avisos, es_accionista=False)
    if r is None:
        return None
    r["role"] = recortar(p.get("position") or p.get("role"), TOPE_CARGO, "role", avisos)
    return r


def empresa(datos: dict, avisos: Avisos | None = None) -> dict:
    """El bloque `company`: los campos directos más los tres con formato propio."""
    return {
        "legalName": str(datos.get("legalName") or "").strip() or None,
        "taxId": id_tal_cual(datos.get("taxId")),
        "constitutionDate": fecha_iso(datos.get("constitutionDate"), avisos),
        "legalForm": recortar(datos.get("legalForm"), TOPE_FORMA_LEGAL, "legalForm", avisos),
        "activity": recortar(datos.get("activity"), TOPE_ACTIVIDAD, "activity", avisos),
    }
