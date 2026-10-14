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
    "DO": ("República Dominicana", "Rep. Dominicana", "RD"),
    "ES": ("Reino de España",),
    "NL": ("Holanda", "Holland"),
    "KR": ("Corea", "Corea del Sur", "South Korea"),
    "CN": ("República Popular China",),
}


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

    ambiguas = sorted(k for k, isos in candidatas.items() if len(isos) > 1)
    tabla = {k: next(iter(isos)) for k, isos in candidatas.items() if len(isos) == 1} | propias

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
    lineas += ["}", "", f"#: Descartadas por llevar a más de un país: {len(ambiguas)}.",
               f"AMBIGUAS: tuple[str, ...] = {tuple(ambiguas)!r}", ""]
    destino = RAIZ / "src" / "paises_variantes.py"
    destino.write_text("\n".join(lineas), encoding="utf-8")
    print(f"✓ {destino.relative_to(RAIZ.parents[1])}  ({len(tabla)} variantes, {len(ambiguas)} ambiguas)")


if __name__ == "__main__":
    main()
