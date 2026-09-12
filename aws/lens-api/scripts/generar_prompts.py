#!/usr/bin/env python3
"""Genera `src/prompts_generado.py` leyendo el código de la SPA.

Por qué existe
--------------
La API tiene que usar EXACTAMENTE los mismos prompts que Lens, o devolvería
otra cosa que la herramienta y nadie podría comparar los resultados. Hay dos
formas de conseguirlo y las dos son malas por su cuenta:

  · Copiar los prompts a mano  → se desincronizan en silencio la primera vez
    que alguien toca `constants.ts`. Nadie se entera hasta que un campo deja de
    salir.
  · Compartir el archivo       → habría que tocar la SPA, y el requisito es no
    afectar la herramienta.

Este script es la tercera: **lee la SPA en modo solo lectura y genera el módulo
Python**. La fuente de verdad sigue siendo `constants.ts`. Si alguien cambia un
prompt allá, se corre esto de nuevo y el diff se ve.

`--check` corre lo mismo y falla si el archivo generado quedó viejo — es el
guardia que se pone antes de desplegar.

Uso
---
    python3 scripts/generar_prompts.py            # regenera
    python3 scripts/generar_prompts.py --check    # solo verifica, no escribe
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]          # .../lens---ai
CONSTANTS = RAIZ / "constants.ts"
ANALYZER = RAIZ / "components" / "DocumentAnalyzer.tsx"
KEYWORDS = RAIZ / "services" / "countryKeywords.ts"
SALIDA = Path(__file__).resolve().parents[1] / "src" / "prompts_generado.py"


def _fallar(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def leer(p: Path) -> str:
    if not p.exists():
        _fallar(f"no se encontró {p}. ¿Se movió el archivo en la SPA?")
    return p.read_text(encoding="utf8")


# ── PREDEFINED_FIELDS ───────────────────────────────────────────────────────
def campos(src: str) -> list[str]:
    m = re.search(r"export const PREDEFINED_FIELDS:\s*string\[\]\s*=\s*\[(.*?)\];", src, re.S)
    if not m:
        _fallar("no se pudo leer PREDEFINED_FIELDS de constants.ts")
    valores = re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))
    if len(valores) != 18:
        _fallar(f"se esperaban 18 campos y se encontraron {len(valores)}")
    return [v.encode().decode("unicode_escape") if "\\" in v else v for v in valores]


# ── Plantillas de prompt ────────────────────────────────────────────────────
# Los prompts son template literals de JS. Se extrae el cuerpo entre los
# backticks y se traducen los `${...}` a marcadores de formato de Python.
def cuerpo_template(src: str, nombre: str) -> str:
    m = re.search(
        r"export const " + re.escape(nombre) + r"\s*=\s*\([^)]*\)(?::\s*string)?\s*=>\s*`(.*?)`;\s*$",
        src,
        re.S | re.M,
    )
    if not m:
        _fallar(f"no se pudo leer {nombre} de constants.ts")
    return m.group(1)


def cuerpo_const(src: str, nombre: str) -> str:
    """Igual que `cuerpo_template` pero para un const plano, sin función flecha.

    `GEMINI_SHAREHOLDERS_PROMPT` no recibe parámetros: es un texto fijo."""
    m = re.search(
        r"export const " + re.escape(nombre) + r"\s*=\s*`(.*?)`;\s*$",
        src, re.S | re.M,
    )
    if not m:
        _fallar(f"no se pudo leer {nombre} de constants.ts")
    return m.group(1)


def a_python(cuerpo: str, sustituciones: dict[str, str]) -> str:
    """Convierte el cuerpo del template literal en un str de Python con placeholders."""
    txt = cuerpo
    for js, py in sustituciones.items():
        txt = txt.replace(js, py)
    # Backslashes que JS escapaba dentro del literal (p.ej. \\" en el ejemplo JSON).
    txt = txt.replace('\\\\"', '"').replace("\\`", "`")
    sobrantes = re.findall(r"\$\{[^}]*\}", txt)
    if sobrantes:
        _fallar(f"quedaron interpolaciones sin traducir: {sobrantes}")
    return txt


# ── Mapa de contexto por país ───────────────────────────────────────────────
def contextos(src: str) -> dict[str, str]:
    m = re.search(r"const countryContextMap:\s*\{[^}]*\}\s*=\s*\{(.*?)\n\s*\};", src, re.S)
    if not m:
        _fallar("no se pudo leer countryContextMap de DocumentAnalyzer.tsx")
    pares = re.findall(r"'([a-z_]+)':\s*'((?:[^'\\]|\\.)*)'", m.group(1))
    if len(pares) < 15:
        _fallar(f"countryContextMap parece incompleto: {len(pares)} entradas")
    return {k: v.replace("\\'", "'") for k, v in pares}


def paises(src: str) -> list[str]:
    s = src[src.index("KEYWORDS_BY_COUNTRY"):]
    ks = re.findall(r'^\s{4}"([a-z_]+)":\s*\{', s, re.M)
    if not ks:
        _fallar("no se pudieron leer las claves de KEYWORDS_BY_COUNTRY")
    return ks


# ── Emisión ─────────────────────────────────────────────────────────────────
CABECERA = '''"""Prompts de Lens — GENERADO, NO EDITAR A MANO.

Fuente de verdad: `constants.ts`, `components/DocumentAnalyzer.tsx` y
`services/countryKeywords.ts` de la SPA.

Para actualizar:  python3 scripts/generar_prompts.py
Para verificar:   python3 scripts/generar_prompts.py --check

Si editás este archivo a mano, el verificador va a fallar en el próximo deploy.
"""

# ruff: noqa: E501
'''


def emitir() -> str:
    src_const = leer(CONSTANTS)
    src_analyzer = leer(ANALYZER)
    src_keywords = leer(KEYWORDS)

    lista_campos = campos(src_const)

    extraccion = a_python(
        cuerpo_template(src_const, "GEMINI_PROMPT_TEMPLATE"),
        {
            "${countryContext || 'Estás analizando un documento de origen no especificado.'}": "{contexto_pais}",
            "${PREDEFINED_FIELDS[16]}": lista_campos[16],
            "${documentText}": "{texto_documento}",
        },
    )

    deteccion = a_python(
        cuerpo_template(src_const, "GEMINI_COUNTRY_DETECTION_PROMPT_TEMPLATE"),
        {
            "${countryList.join(', ')}": "{lista_paises}",
            "${documentText}": "{texto_documento}",
        },
    )

    partes = [CABECERA]

    partes.append("\nCAMPOS_PREDEFINIDOS: list[str] = [")
    partes.extend(f"    {c!r},\n" for c in lista_campos)
    partes.append("]\n")

    partes.append("\nPAISES: list[str] = [\n")
    partes.extend(f"    {p!r},\n" for p in paises(src_keywords))
    partes.append("]\n")

    partes.append("\nCONTEXTO_POR_PAIS: dict[str, str] = {\n")
    for k, v in contextos(src_analyzer).items():
        partes.append(f"    {k!r}: {v!r},\n")
    partes.append("}\n")

    partes.append("\nCONTEXTO_POR_DEFECTO = 'Estás analizando un documento de origen no especificado.'\n")

    partes.append("\nPROMPT_DETECCION_PAIS = '''\\\n")
    partes.append(deteccion.replace("\\", "\\\\").replace("'''", "\\'\\'\\'"))
    partes.append("'''\n")

    partes.append("\nPROMPT_EXTRACCION = '''\\\n")
    partes.append(extraccion.replace("\\", "\\\\").replace("'''", "\\'\\'\\'"))
    partes.append("'''\n")

    # ── Shareholders (Fase 3) ───────────────────────────────────────────────
    # Se extraen igual que los demás: la fuente de verdad es `constants.ts` y la
    # API no tiene prompts propios. Si alguien toca uno allá, el `--check`
    # falla el despliegue hasta que se regenere.
    #
    # El de la cadena recibe la empresa YA COMPUESTA. En la SPA armaba ese texto
    # con un ternario dentro del template literal, y los backticks anidados no se
    # pueden extraer: se movió la composición al llamador para que los dos lados
    # puedan compartir el mismo prompt.
    shareholders = a_python(cuerpo_const(src_const, "GEMINI_SHAREHOLDERS_PROMPT"), {})
    cadena = a_python(
        cuerpo_template(src_const, "GEMINI_SHAREHOLDERS_CADENA_PROMPT"),
        {"${empresa}": "{empresa}"},
    )

    partes.append("\nPROMPT_SHAREHOLDERS = '''\\\n")
    partes.append(shareholders.replace("\\", "\\\\").replace("'''", "\\'\\'\\'"))
    partes.append("'''\n")

    partes.append("\nPROMPT_SHAREHOLDERS_CADENA = '''\\\n")
    partes.append(cadena.replace("\\", "\\\\").replace("'''", "\\'\\'\\'"))
    partes.append("'''\n")

    return "".join(partes)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="no escribe; falla si está desactualizado")
    args = ap.parse_args()

    nuevo = emitir()

    if args.check:
        if not SALIDA.exists():
            _fallar(f"{SALIDA.name} no existe. Corré: python3 scripts/generar_prompts.py")
        actual = SALIDA.read_text(encoding="utf8")
        if actual != nuevo:
            _fallar(
                f"{SALIDA.name} está desactualizado respecto de la SPA.\n"
                "       Alguien cambió un prompt en constants.ts y la API quedó atrás.\n"
                "       Corré: python3 scripts/generar_prompts.py"
            )
        print(f"OK: {SALIDA.name} está sincronizado con la SPA.")
        return

    SALIDA.write_text(nuevo, encoding="utf8")
    print(f"OK: escrito {SALIDA} ({len(nuevo)} bytes)")


if __name__ == "__main__":
    main()
