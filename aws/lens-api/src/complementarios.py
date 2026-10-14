"""Los documentos complementarios: de qué empresa son, y qué número es de quién.

Dos pedidos de Onboarding (13-10-2026) que salen del mismo lugar, el texto de un
documento complementario —el RUT de la DIAN, el e-RUT, la constancia fiscal—:

  · **AJ-05.** Un certificado de una empresa con el RUT de OTRA se aceptaba
    entero: el representante de la otra empresa entraba a la lista, y sin NIT
    en el certificado se tomaba el de la otra. Datos ajenos precargados en un
    onboarding. Ahora el complementario se compara con el principal antes de
    leerlo, y si es de otra empresa no se mezcla.

  · **AJ-06.** En el RUT de la DIAN la casilla 100 es el código del tipo de
    documento (13 = cédula) y la 101 el número. El modelo las junta y la cédula
    de 8 dígitos sale con un 13 adelante.

La identidad del complementario sale de SU texto, con expresiones regulares, y
no del modelo: es un formulario con etiquetas fijas, y leerlo así es
determinista y no cuesta una llamada. La del principal sale de la pasada de
identidad, que lee el documento nativo (`gemini.leer_identidad`).

Ante la duda, nada. Si no se puede leer la identidad de alguno de los dos, el
complementario se usa como hasta ahora: excluirlo a ciegas también es perder
datos, y en el caso que sí funcionaba —el RUT de la misma empresa completa el
NIT que el certificado no trae— es justo el dato que se busca.

Funciones PURAS: sin red, sin estado. Se testean solas.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any


def _sin_tildes(s: str) -> str:
    d = unicodedata.normalize("NFD", s)
    return "".join(c for c in d if unicodedata.category(c) != "Mn")


# ══════════════════════════════════════════════════════════════════════════
# El identificador tributario
# ══════════════════════════════════════════════════════════════════════════

#: Las etiquetas detrás de las que un documento pone el identificador de la
#: EMPRESA, en DOS NIVELES. Primero las completas —en el RUT de la DIAN, la
#: casilla 5, «Número de Identificación Tributaria (NIT)»—; las siglas sueltas
#: solo si no hay ninguna completa con un número cerca.
#:
#: El orden importa: el encabezado del formulario puede decir «RUT» antes del
#: «4. Número de formulario 14…», y con las siglas en el mismo nivel el número
#: de formulario se leía como NIT. Eso excluía el RUT de la MISMA empresa, que
#: es justo el que completa el NIT que el certificado no trae.
_ETIQUETAS_COMPLETAS = re.compile(
    r"n[uú]mero\s+de\s+identificaci[oó]n\s+tributaria"
    r"|rol\s+[uú]nico\s+tributario"
    r"|registro\s+federal\s+de\s+contribuyentes",
    re.IGNORECASE,
)
_ETIQUETAS_SIGLA = re.compile(
    r"\bn\.?\s?i\.?\s?t\b\.?"
    r"|\br\.?\s?u\.?\s?t\b\.?"
    r"|\br\.?\s?f\.?\s?c\b\.?"
    r"|\br\.?\s?u\.?\s?c\b\.?",
    re.IGNORECASE,
)

#: Un número que es de OTRA casilla y no puede ser el identificador: el número
#: de formulario de la DIAN, que va arriba y tiene 11 dígitos.
_OTRA_CASILLA = re.compile(r"n[uú]mero\s+de\s+formulario[\s:.]*[\d ]+", re.IGNORECASE)

#: Un NIT con su verificador tiene 10 dígitos; un RUT chileno, 9. Más dígitos
#: sin separador no es un identificador tributario de la región.
_MAX_DIGITOS_ID = 10

#: Un identificador numérico: dígitos con puntos o UN espacio entre medio —el
#: RUT de la DIAN imprime cada dígito en su casilla— y el verificador al final,
#: un dígito o una K, a veces detrás de un guion.
_NUMERO_ID = re.compile(r"\d(?:[. ]?\d){5,11}(?: ?- ?[\dkK])?(?!\d)")

#: El RFC mexicano de una persona moral: tres letras, la fecha y la homoclave.
_RFC = re.compile(r"\b[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b")

#: Cuánto texto mirar después de la etiqueta. El valor de la casilla 5 viene
#: después de las etiquetas de las casillas 6, 12 y 14 de la misma fila.
_VENTANA = 240


def tax_id_desde_texto(texto: str) -> str | None:
    """El identificador tributario de la empresa, tal como figura, o `None`.

    Se toma el primer identificador que sigue a la primera etiqueta COMPLETA
    que tiene uno cerca; las siglas sueltas, solo si ninguna completa lo tiene.
    En un formulario tributario el de la empresa va arriba; los de las personas
    (la casilla 101 del representante) van después. El número de formulario no
    cuenta, y un número de más de diez dígitos sin separador tampoco.
    """
    t = _OTRA_CASILLA.sub(lambda m: " " * len(m.group(0)), str(texto or ""))
    for etiquetas in (_ETIQUETAS_COMPLETAS, _ETIQUETAS_SIGLA):
        for m in etiquetas.finditer(t):
            tramo = t[m.end():m.end() + _VENTANA]
            rfc = _RFC.search(tramo.upper())
            if rfc and re.search(r"r\.?\s?f\.?\s?c|contribuyentes", m.group(0), re.IGNORECASE):
                return rfc.group(0)
            for num in _NUMERO_ID.finditer(tramo):
                valor = num.group(0).strip()
                if not re.search(r"[.\-]", valor) and len(re.sub(r"\D", "", valor)) > _MAX_DIGITOS_ID:
                    continue
                # Las casillas de a un dígito se juntan: «9 0 1 …» → «901…».
                return re.sub(r"(?<=\d) (?=\d)", "", valor)
    return None


def nucleo(tax_id: Any) -> str:
    """La forma comparable de un identificador: solo dígitos y, cuando viene
    separado, SIN el dígito verificador. Vacío si no hay con qué comparar.

    Cuando el verificador no viene separado —`9999990017`— no se puede saber si
    está, así que se deja; `coinciden` lo tolera. Un RFC se compara entero: no
    tiene verificador aparte.
    """
    s = _sin_tildes(str(tax_id or "")).upper().strip()
    if not s:
        return ""
    compacto = re.sub(r"[\s.\-]", "", s)
    if _RFC.fullmatch(compacto):
        return compacto
    # Con separador antes del verificador: «999.999.001-7», «77111222 K».
    m = re.fullmatch(r"([\d. ]+?) ?- ?[\dK]", s)
    if m:
        cuerpo = re.sub(r"\D", "", m.group(1))
    elif compacto.endswith("K") and compacto[:-1].isdigit():
        cuerpo = compacto[:-1]
    else:
        cuerpo = re.sub(r"\D", "", s)
    return cuerpo if len(cuerpo) >= 6 else ""


def coinciden(a: str, b: str) -> bool:
    """¿Es el mismo identificador? Iguales, o uno es el otro con el verificador
    pegado al final (o una casilla de más leída a continuación)."""
    if not a or not b:
        return False
    if a == b:
        return True
    corto, largo = sorted((a, b), key=len)
    return len(corto) >= 8 and corto.isdigit() and largo.startswith(corto)


# ══════════════════════════════════════════════════════════════════════════
# La razón social
# ══════════════════════════════════════════════════════════════════════════

#: «35. Razón social» en el RUT de la DIAN; «Razón Social:» en el e-RUT;
#: «Denominación o razón social» en la constancia del SAT.
#:
#: Solo como ETIQUETA: seguida de dos puntos o de un fin de línea. En prosa
#: —«cuya razón social es…»— lo que sigue no es el valor, y tomarlo daría una
#: razón social distinta y excluiría un documento bueno.
_ETIQUETA_RAZON = re.compile(
    r"(?:nombre\s+o\s+|denominaci[oó]n\s+o\s+)?raz[oó]n\s+social[ \t]*(?::|(?=\r?\n))",
    re.IGNORECASE)

#: Lo que, pegado detrás del valor, ya es la etiqueta de otra casilla.
_CORTE_RAZON = re.compile(
    r"\s+\d{1,3}\.\s|\s{2,}|\s+(?:nombre\s+comercial|sigla|nit\b|rut\b|r\.u\.t|rfc\b)",
    re.IGNORECASE)


def razon_social_desde_texto(texto: str) -> str | None:
    """La razón social que el documento pone detrás de su etiqueta, o `None`.

    El valor va en la misma línea —«Razón Social: X»— o en la siguiente, que es
    como sale la casilla 35 del RUT de la DIAN.
    """
    t = str(texto or "")
    for m in _ETIQUETA_RAZON.finditer(t):
        resto = t[m.end():]
        lineas = resto.split("\n")
        candidatas = [lineas[0]] + lineas[1:3]
        for linea in candidatas:
            # El punto final se queda: es de la sigla («S.A.S.»).
            valor = _CORTE_RAZON.split(linea.strip(), maxsplit=1)[0].strip(" :-\t")
            if _parece_razon(valor):
                return valor
    return None


def _parece_razon(valor: str) -> bool:
    letras = sum(c.isalpha() for c in valor)
    if letras < 3:
        return False
    # Otra etiqueta, no un valor.
    return not re.match(r"^(?:\d{1,3}\.\s*)?(?:nombre|sigla|apellidos?|direcci[oó]n|tipo)\b",
                        valor, re.IGNORECASE)


#: Las siglas societarias que NO cuentan para comparar: la misma empresa sale
#: «S.A.S.» en un documento y «SAS» en el otro, o sin sigla.
_SIGLAS = [
    "SOCIEDAD POR ACCIONES SIMPLIFICADA", "SOCIEDAD POR ACCIONES", "SOCIEDAD ANONIMA",
    "SOCIEDAD LIMITADA", "S A S", "SAS", "S A DE C V", "SA DE CV", "S DE R L DE C V",
    "S DE R L", "SPA", "S P A", "LTDA", "LIMITADA", "EIRL", "E I R L", "S A", "SA", "BIC",
]


def razon_normalizada(razon: Any) -> str:
    """Sin tildes, sin signos, en mayúsculas y sin la sigla societaria."""
    s = re.sub(r"[^A-Z0-9Ñ ]+", " ", _sin_tildes(str(razon or "")).upper())
    s = " ".join(s.split())
    cambio = True
    while cambio and s:
        cambio = False
        for sigla in _SIGLAS:
            if s == sigla:
                break
            if s.endswith(" " + sigla):
                s = s[: -len(sigla) - 1].rstrip()
                cambio = True
                break
    return s


# ══════════════════════════════════════════════════════════════════════════
# ¿Es de la misma empresa?
# ══════════════════════════════════════════════════════════════════════════

def identidad_desde_texto(texto: str) -> dict:
    """`{"taxId", "legalName"}` del documento según su propio texto."""
    return {"taxId": tax_id_desde_texto(texto), "legalName": razon_social_desde_texto(texto)}


def misma_empresa(principal: dict, complementario: dict) -> tuple[bool | None, str]:
    """`(veredicto, motivo)`. `None` = no hay con qué comparar.

    Manda el identificador tributario: dos empresas pueden llamarse parecido, y
    el NIT no. Si alguno de los dos no lo trae, se compara la razón social.

    Se excluye solo con evidencia CONSISTENTE. Si el NIT discrepa pero las dos
    razones sociales se leyeron y son la misma, gana «misma empresa»: lo más
    probable es que el lector haya tomado otro número de la página, y excluir
    el RUT de la misma empresa pierde justo el NIT que se buscaba. La
    discrepancia va en el motivo, para el log.
    """
    p, c = principal or {}, complementario or {}
    np_, nc = nucleo(p.get("taxId")), nucleo(c.get("taxId"))
    rp, rc = razon_normalizada(p.get("legalName")), razon_normalizada(c.get("legalName"))
    if np_ and nc:
        if coinciden(np_, nc):
            return True, ""
        if rp and rc and rp == rc:
            return True, "el identificador tributario discrepa pero la razón social es la misma"
        return False, (f"su identificador tributario ({c.get('taxId')}) no coincide con el del "
                       f"documento principal ({p.get('taxId')})")
    if rp and rc:
        if rp == rc:
            return True, ""
        return False, (f"su razón social («{c.get('legalName')}») no coincide con la del "
                       f"documento principal («{p.get('legalName')}»)")
    return None, ""


def enmascarar(valor: Any) -> str:
    """Para el log: los dos primeros y los dos últimos caracteres. En Colombia
    el NIT de una persona natural es su cédula."""
    s = re.sub(r"[\s.\-]", "", str(valor or ""))
    if not s:
        return "—"
    return s[:2] + "…" + s[-2:] if len(s) > 4 else "…"


# ══════════════════════════════════════════════════════════════════════════
# AJ-06 · El código del tipo de documento pegado a la cédula
# ══════════════════════════════════════════════════════════════════════════

#: Casilla 100 del RUT de la DIAN: el código del tipo de documento. A la
#: derecha, cómo lo nombra `onboarding.tipo_identificacion` (o `None`).
CODIGOS_DIAN: dict[str, str | None] = {
    "11": None,           # registro civil de nacimiento
    "12": None,           # tarjeta de identidad
    "13": "CC",           # cédula de ciudadanía
    "21": None,           # tarjeta de extranjería
    "22": "CE",           # cédula de extranjería
    "31": "NIT",
    "41": "PASAPORTE",
    "42": None,           # documento de identificación extranjero
    "47": None,           # permiso especial de permanencia
    "48": "PPT",          # permiso por protección temporal
    "50": None,           # NIT de otro país
    "91": None,           # NUIP
}


def _sin_miles(texto: str) -> str:
    """`10.203.040` → `10203040`, para buscar el número como figura."""
    return re.sub(r"(?<=\d)\.(?=\d{3}(?!\d))", "", texto)


def sin_codigo_dian(numero: Any, textos: list[str]) -> tuple[str, str | None] | None:
    """`(número, tipo)` si `numero` es un código DIAN pegado al número real.

    Solo cuando se puede CONFIRMAR en el texto del documento: el resto aparece
    suelto, y el número pegado no aparece. Si el número pegado sí figura, es el
    número de verdad —una cédula de 10 dígitos puede empezar con 13— y no se
    toca. `None` = no se toca.
    """
    digitos = re.sub(r"\D", "", str(numero or ""))
    codigo, resto = digitos[:2], digitos[2:]
    if codigo not in CODIGOS_DIAN or not 6 <= len(resto) <= 10:
        return None
    limpios = [_sin_miles(str(t or "")) for t in textos]
    suelto = re.compile(rf"(?<!\d){re.escape(resto)}(?!\d)")
    pegado = re.compile(rf"(?<!\d){re.escape(digitos)}(?!\d)")
    if any(pegado.search(t) for t in limpios):
        return None
    if not any(suelto.search(t) for t in limpios):
        return None
    return resto, CODIGOS_DIAN[codigo]
