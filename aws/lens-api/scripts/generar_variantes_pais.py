"""Genera `src/paises_variantes.py`: las formas en que un documento escribe un país.

    python3.12 aws/lens-api/scripts/generar_variantes_pais.py

AJ-08 (Onboarding, 14-10-2026): el país de un accionista sale del documento como
el documento lo escribe —«Mexico», «Brazil», «EE. UU.», «COL»— y hay que llevarlo
al catálogo del Anexo A, que es la única fuente de LENS y de Onboarding.

Las variantes salen de CLDR (vía Babel), que es la base de nombres de países de
Unicode: el nombre en español, inglés y portugués, el código ISO-2 y el ISO-3.
Babel se usa SOLO para generar: el módulo que sale es una tabla estática y la
Lambda no lleva ninguna dependencia nueva. A eso se suma una tabla a mano con
las abreviaturas y los nombres oficiales largos que CLDR no trae.

La clave es el texto sin tildes, sin signos ni espacios y en minúsculas, así
«EE. UU.», «EEUU» y «ee uu» son la misma. Si una clave llevara a dos países, se
descarta: ante la duda, el país queda sin mapear y se avisa.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "src"))

from babel import Locale  # noqa: E402
from babel.core import get_global  # noqa: E402

from paises_anexo_a import PAISES  # noqa: E402

#: Lo que CLDR no trae: abreviaturas de uso común y nombres oficiales largos.
A_MANO: dict[str, tuple[str, ...]] = {
    "US": ("USA", "U.S.A.", "U.S.", "EE. UU.", "EE.UU.", "EEUU", "E.U.A.", "EUA",
           "Estados Unidos de América", "Estados Unidos de Norteamérica",
           "United States of America", "Estados Unidos da América"),
    "GB": ("UK", "U.K.", "Gran Bretaña", "Great Britain", "Inglaterra", "England"),
    "MX": ("Estados Unidos Mexicanos", "Méjico"),
    "CO": ("República de Colombia",),
    "CL": ("República de Chile",),
    "PE": ("República del Perú",),
    "AR": ("República Argentina",),
    "BR": ("República Federativa del Brasil", "República Federativa do Brasil"),
    "EC": ("República del Ecuador",),
    "UY": ("República Oriental del Uruguay",),
    "PY": ("República del Paraguay",),
    "BO": ("Estado Plurinacional de Bolivia",),
    "VE": ("República Bolivariana de Venezuela",),
    "DO": ("República Dominicana", "Rep. Dominicana"),
    "ES": ("Reino de España",),
    "NL": ("Holanda", "Holland"),
    "KR": ("Corea del Sur", "South Korea", "República de Corea"),
    "KP": ("North Korea", "República Popular Democrática de Corea"),
    "CN": ("República Popular China",),
}

#: Lo que NO se mapea aunque parezca obvio: la nacionalidad que se adivina mal
#: puede ser una sancionada. «Corea» es Corea del Sur o Corea del Norte. Va al
#: aviso con las dos opciones, para que se decida mirando el documento.
AMBIGUAS_A_MANO: dict[str, tuple[str, ...]] = {
    "Corea": ("KR", "KP"), "Korea": ("KR", "KP"),
    "coreano": ("KR", "KP"), "coreana": ("KR", "KP"), "coreanos": ("KR", "KP"),
    "coreanas": ("KR", "KP"), "Korean": ("KR", "KP"),
    "congoleño": ("CG", "CD"), "congoleña": ("CG", "CD"), "congoleños": ("CG", "CD"),
    "congoleñas": ("CG", "CD"), "Congolese": ("CG", "CD"),
    "guineano": ("GN", "GW"), "guineana": ("GN", "GW"), "guineanos": ("GN", "GW"),
    "guineanas": ("GN", "GW"), "Guinean": ("GN", "GW"),
    "RD": ("DO", "CD"), "Dominican": ("DO", "DM"),
    "samoano": ("WS", "AS"), "samoana": ("WS", "AS"), "Samoan": ("WS", "AS"),
}

# ── Gentilicios ─────────────────────────────────────────────────────────────
# El modelo devuelve la nacionalidad como la escribe el documento: «Mexicana»,
# «chileno», «estadounidense». Sin esto, 6 de las 108 corridas guardadas al
# 14-10-2026 tenían un país que no se reconocía.
#
# Del español va el MASCULINO singular, y el femenino y los plurales salen de
# las reglas del idioma (`formas_es`). Lo que no se sabe con certeza no se
# pone: un gentilicio ausente deja el país sin mapear y se avisa, uno
# equivocado pone una nacionalidad falsa.

GENTILICIOS_ES: dict[str, str] = {
    "AR": "argentino", "BR": "brasileño", "CL": "chileno", "CO": "colombiano",
    "EC": "ecuatoriano", "MX": "mexicano", "PE": "peruano", "US": "estadounidense",
    "AF": "afgano", "AL": "albanés", "DZ": "argelino", "AD": "andorrano", "AO": "angoleño",
    "AG": "antiguano", "AM": "armenio", "AU": "australiano", "AZ": "azerbaiyano",
    "BS": "bahameño", "BH": "bareiní", "BD": "bangladesí", "BB": "barbadense",
    "BY": "bielorruso", "BE": "belga", "BZ": "beliceño", "BJ": "beninés", "BM": "bermudeño",
    "BT": "butanés", "BO": "boliviano", "BA": "bosnio", "BW": "botsuano", "BN": "bruneano",
    "BG": "búlgaro", "BF": "burkinés", "BI": "burundés", "KH": "camboyano",
    "CM": "camerunés", "CA": "canadiense", "CV": "caboverdiano", "KY": "caimanés",
    "CF": "centroafricano", "TD": "chadiano", "CN": "chino", "CR": "costarricense",
    "HR": "croata", "CU": "cubano", "CW": "curazoleño", "CY": "chipriota", "CZ": "checo",
    "DK": "danés", "DJ": "yibutiano", "DM": "dominiqués", "DO": "dominicano",
    "EG": "egipcio", "SV": "salvadoreño", "GQ": "ecuatoguineano", "ER": "eritreo",
    "EE": "estonio", "ET": "etíope", "FK": "malvinense", "FO": "feroés", "FJ": "fiyiano",
    "FI": "finlandés", "FR": "francés", "GA": "gabonés", "GM": "gambiano",
    "GE": "georgiano", "DE": "alemán", "GH": "ghanés", "GI": "gibraltareño",
    "GR": "griego", "GL": "groenlandés", "GD": "granadino", "GP": "guadalupeño",
    "GU": "guameño", "GT": "guatemalteco", "GW": "bisauguineano", "GY": "guyanés",
    "HT": "haitiano", "VA": "vaticano", "HN": "hondureño", "HK": "hongkonés",
    "HU": "húngaro", "IS": "islandés", "IN": "indio", "ID": "indonesio",
    "CI": "marfileño", "IR": "iraní", "IQ": "iraquí", "IE": "irlandés", "IL": "israelí",
    "IT": "italiano", "JM": "jamaicano", "JP": "japonés", "JO": "jordano",
    "KZ": "kazajo", "KE": "keniano", "KI": "kiribatiano", "KW": "kuwaití",
    "KG": "kirguís", "LA": "laosiano", "LV": "letón", "LB": "libanés", "LS": "lesotense",
    "LR": "liberiano", "LY": "libio", "LI": "liechtensteiniano", "LT": "lituano",
    "LU": "luxemburgués", "MO": "macaense", "MK": "macedonio", "MG": "malgache",
    "MW": "malauí", "MY": "malasio", "MV": "maldivo", "ML": "maliense", "MT": "maltés",
    "MH": "marshalés", "MQ": "martiniqués", "MR": "mauritano", "MU": "mauriciano",
    "FM": "micronesio", "MD": "moldavo", "MC": "monegasco", "MN": "mongol",
    "ME": "montenegrino", "MA": "marroquí", "MZ": "mozambiqueño", "MM": "birmano",
    "NA": "namibio", "NR": "nauruano", "NP": "nepalí", "NL": "neerlandés",
    "NC": "neocaledonio", "NZ": "neozelandés", "NI": "nicaragüense", "NE": "nigerino",
    "NG": "nigeriano", "KP": "norcoreano", "NO": "noruego", "OM": "omaní",
    "PK": "pakistaní", "PW": "palauano", "PS": "palestino", "PA": "panameño",
    "PG": "papú", "PY": "paraguayo", "PH": "filipino", "PL": "polaco", "PT": "portugués",
    "PR": "puertorriqueño", "QA": "catarí", "RE": "reunionés", "RO": "rumano",
    "RU": "ruso", "RW": "ruandés", "LC": "santalucense", "VC": "sanvicentino",
    "SM": "sanmarinense", "ST": "santotomense", "SA": "saudí", "SN": "senegalés",
    "RS": "serbio", "SC": "seychellense", "SL": "sierraleonés", "SG": "singapurense",
    "SK": "eslovaco", "SI": "esloveno", "SB": "salomonense", "SO": "somalí",
    "ZA": "sudafricano", "KR": "surcoreano", "SS": "sursudanés", "ES": "español",
    "LK": "esrilanqués", "SD": "sudanés", "SR": "surinamés", "SZ": "suazi", "SE": "sueco",
    "CH": "suizo", "SY": "sirio", "TW": "taiwanés", "TJ": "tayiko", "TZ": "tanzano",
    "TH": "tailandés", "TL": "timorense", "TG": "togolés", "TO": "tongano",
    "TT": "trinitense", "TN": "tunecino", "TR": "turco", "TM": "turkmeno",
    "TV": "tuvaluano", "UG": "ugandés", "UA": "ucraniano", "AE": "emiratí",
    "GB": "británico", "UY": "uruguayo", "UZ": "uzbeko", "VU": "vanuatuense",
    "VE": "venezolano", "VN": "vietnamita", "EH": "saharaui", "YE": "yemení",
    "ZM": "zambiano", "ZW": "zimbabuense",
}

#: Variantes en uso que no salen de la regla.
GENTILICIOS_ES_EXTRA: dict[str, tuple[str, ...]] = {
    "BR": ("brasilero",), "MX": ("mejicano",), "NL": ("holandés",), "GB": ("inglés",),
    "SA": ("saudita",), "LK": ("ceilanés",), "AZ": ("azerí",), "JM": ("jamaiquino",),
    "PG": ("papuano",), "QA": ("qatarí",), "BW": ("botswanés",),
}

#: Portugués: el masculino; el resto, por la regla (`formas_pt`).
GENTILICIOS_PT: dict[str, str] = {
    "AR": "argentino", "BR": "brasileiro", "CL": "chileno", "CO": "colombiano",
    "EC": "equatoriano", "MX": "mexicano", "PE": "peruano", "US": "estadunidense",
    "UY": "uruguaio", "PY": "paraguaio", "BO": "boliviano", "VE": "venezuelano",
    "ES": "espanhol", "PT": "português", "FR": "francês", "DE": "alemão",
    "IT": "italiano", "GB": "britânico", "CN": "chinês", "JP": "japonês",
    "CA": "canadense", "AU": "australiano", "NL": "holandês", "CH": "suíço",
    "SE": "sueco", "NO": "norueguês", "DK": "dinamarquês", "IE": "irlandês",
    "IL": "israelense", "IN": "indiano", "RU": "russo", "CU": "cubano",
    "PA": "panamenho", "CR": "costarriquenho", "GT": "guatemalteco",
    "HN": "hondurenho", "SV": "salvadorenho", "NI": "nicaraguense", "AO": "angolano",
    "MZ": "moçambicano", "CV": "cabo-verdiano", "PR": "porto-riquenho",
}

#: Inglés: los adjetivos de nacionalidad más comunes. «American» es Estados
#: Unidos: en inglés es el gentilicio, no el continente.
GENTILICIOS_EN: dict[str, tuple[str, ...]] = {
    "AR": ("Argentine", "Argentinian"), "BR": ("Brazilian",), "CL": ("Chilean",),
    "CO": ("Colombian",), "EC": ("Ecuadorian",), "MX": ("Mexican",), "PE": ("Peruvian",),
    "US": ("American",), "UY": ("Uruguayan",), "PY": ("Paraguayan",), "BO": ("Bolivian",),
    "VE": ("Venezuelan",), "ES": ("Spanish",), "PT": ("Portuguese",), "FR": ("French",),
    "DE": ("German",), "IT": ("Italian",), "GB": ("British", "English"), "CN": ("Chinese",),
    "JP": ("Japanese",), "CA": ("Canadian",), "AU": ("Australian",), "NL": ("Dutch",),
    "CH": ("Swiss",), "BE": ("Belgian",), "SE": ("Swedish",), "NO": ("Norwegian",),
    "DK": ("Danish",), "IE": ("Irish",), "IL": ("Israeli",), "IN": ("Indian",),
    "RU": ("Russian",), "CU": ("Cuban",), "PA": ("Panamanian",), "CR": ("Costa Rican",),
    "GT": ("Guatemalan",), "HN": ("Honduran",), "SV": ("Salvadoran", "Salvadorian"),
    "NI": ("Nicaraguan",), "PR": ("Puerto Rican",), "HT": ("Haitian",),
    "JM": ("Jamaican",), "TT": ("Trinidadian",), "PL": ("Polish",), "UA": ("Ukrainian",),
    "TR": ("Turkish",), "GR": ("Greek",), "ZA": ("South African",), "NZ": ("New Zealander",),
    "SG": ("Singaporean",), "HK": ("Hong Konger",), "TW": ("Taiwanese",),
    "PH": ("Filipino",), "VN": ("Vietnamese",), "TH": ("Thai",), "AE": ("Emirati",),
    "LB": ("Lebanese",), "KP": ("North Korean",), "KR": ("South Korean",),
}


def formas_es(m: str) -> tuple[str, ...]:
    """El masculino y sus formas: femenino, y los dos plurales."""
    if m.endswith("és"):
        b = m[:-2]
        return m, b + "esa", b + "eses", b + "esas"
    if m.endswith("án"):
        b = m[:-2]
        return m, b + "ana", b + "anes", b + "anas"
    if m.endswith(("ín", "ís", "ón")):       # kirguís → kirguisa, letón → letona
        b = m[:-2] + m[-2].replace("í", "i").replace("ó", "o") + m[-1]
        return m, b + "a", b + "es", b + "as"
    if m.endswith("ol"):                    # español → española, españoles
        return m, m + "a", m + "es", m + "as"
    if m.endswith("o"):
        b = m[:-1]
        return m, b + "a", b + "os", b + "as"
    if m.endswith(("í", "ú")):
        return m, m + "es", m + "s"
    return m, m + "s"                       # -a, -e, -i: no cambia en femenino


def formas_pt(m: str) -> tuple[str, ...]:
    if m == "alemão":
        return m, "alemã", "alemães", "alemãs"
    if m.endswith("ol"):                    # espanhol
        return m, m + "a", m[:-2] + "óis", m + "as"
    if m.endswith("ês"):
        b = m[:-2]
        return m, b + "esa", b + "eses", b + "esas"
    if m.endswith("o"):
        b = m[:-1]
        return m, b + "a", b + "os", b + "as"
    return m, m + "s"


def clave(texto: str) -> str:
    d = unicodedata.normalize("NFD", str(texto))
    sin = "".join(c for c in d if unicodedata.category(c) != "Mn").casefold()
    return re.sub(r"[^a-z0-9]", "", sin)


def main() -> None:
    catalogo = {iso for iso, _ in PAISES}
    candidatas: dict[str, set[str]] = {}

    # El catálogo MANDA: su nombre y su código son de ese país aunque CLDR use
    # el mismo nombre para otro (CLDR llama «San Martín» a MF, y el catálogo a
    # SX). Una variante que choca con el catálogo se descarta, no lo pisa.
    propias = {clave(n): iso for iso, n in PAISES} | {clave(iso): iso for iso, _ in PAISES}

    def sumar(texto: str, iso: str) -> None:
        k = clave(texto)
        if k and k not in propias:
            candidatas.setdefault(k, set()).add(iso)

    alias = get_global("territory_aliases")
    for iso, nombre in PAISES:
        for idioma in ("es", "en", "pt"):
            n = Locale(idioma).territories.get(iso)
            if n:
                sumar(n, iso)
    for tres, destino in alias.items():
        if len(tres) == 3 and tres.isalpha() and len(destino) == 1 and destino[0] in catalogo:
            sumar(tres, destino[0])
    for iso, variantes in A_MANO.items():
        assert iso in catalogo, iso
        for v in variantes:
            sumar(v, iso)
    for iso, m in GENTILICIOS_ES.items():
        assert iso in catalogo, iso
        for v in formas_es(m):
            sumar(v, iso)
    for iso, extras in GENTILICIOS_ES_EXTRA.items():
        for m in extras:
            for v in formas_es(m):
                sumar(v, iso)
    for iso, m in GENTILICIOS_PT.items():
        assert iso in catalogo, iso
        for v in formas_pt(m):
            sumar(v, iso)
    for iso, adjetivos in GENTILICIOS_EN.items():
        assert iso in catalogo, iso
        for v in adjetivos:
            sumar(v, iso)

    # Las ambiguas: las que llevaron a más de un país, y las declaradas a mano.
    # Ninguna se mapea; el aviso dice entre qué países se duda.
    ambiguas = {k: tuple(sorted(isos)) for k, isos in candidatas.items() if len(isos) > 1}
    for texto, isos in AMBIGUAS_A_MANO.items():
        assert all(i in catalogo for i in isos), texto
        ambiguas[clave(texto)] = isos
    tabla = {k: next(iter(isos)) for k, isos in candidatas.items()
             if len(isos) == 1 and k not in ambiguas} | propias

    lineas = [
        '"""Las formas en que un documento escribe un país → su código ISO-2 del Anexo A.',
        "",
        "GENERADO por `scripts/generar_variantes_pais.py` desde CLDR (nombres en",
        "español, inglés y portugués, ISO-2 e ISO-3) y una tabla a mano de abreviaturas.",
        "No se edita a mano. La clave es el texto sin tildes, signos ni espacios, en",
        "minúsculas (ver `onboarding.clave_pais`).",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        f"#: {len(tabla)} variantes de {len(catalogo)} países.",
        "VARIANTES: dict[str, str] = {",
    ]
    lineas += [f"    {k!r}: {v!r}," for k, v in sorted(tabla.items())]
    lineas += ["}", "",
               f"#: {len(ambiguas)} formas que llevan a más de un país: no se mapean, y el",
               "#: aviso dice entre cuáles se duda («Corea»: Corea del Sur o del Norte).",
               "AMBIGUAS: dict[str, tuple[str, ...]] = {"]
    lineas += [f"    {k!r}: {v!r}," for k, v in sorted(ambiguas.items())]
    lineas += ["}", ""]
    destino = RAIZ / "src" / "paises_variantes.py"
    destino.write_text("\n".join(lineas), encoding="utf-8")
    print(f"✓ {destino.relative_to(RAIZ.parents[1])}  ({len(tabla)} variantes, {len(ambiguas)} ambiguas)")


if __name__ == "__main__":
    main()
