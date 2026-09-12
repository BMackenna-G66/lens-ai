#!/usr/bin/env python3
"""Verifica que las vistas en inglés sigan cubriendo las tablas en español.

Por qué existe
--------------
Las vistas de la Fase 6 se generaron DESDE las columnas reales del cluster. Eso
las dejó correctas el día que se crearon y con un agujero para el día siguiente:

  · Si alguien agrega una columna a una tabla y no regenera la vista, la vista
    **simplemente no la expone**. No falla, no avisa. Tech consulta
    `lens.analysis`, no ve el campo nuevo, y concluye que el dato no existe.
  · Si alguien RENOMBRA o borra una columna, la vista queda apuntando a algo que
    no está y el `CREATE OR REPLACE` falla recién en el próximo despliegue.

Los dos son silenciosos hasta que duelen. Este script los convierte en un error
de CI, que es el mismo trato que `generar_prompts.py --check` le da a los
prompts: la fuente de verdad vive en un lado y hay un guardia que falla si el
derivado quedó viejo.

Qué compara
-----------
Trabaja contra el **DDL versionado** (`sql/*.sql`), no contra el cluster. A
propósito:

  · corre en CI, sin credenciales y sin red,
  · corre con el cluster pausado —que lo está de 18:30 a 04:00—,
  · y atrapa la deriva en el commit que la introduce, que es cuando sale barata.

El cluster es la verdad en ejecución, pero el DDL es la verdad en revisión. Un
cambio hecho a mano en el cluster y no escrito en el DDL es un problema aparte
—y peor— que este script no puede ver.

Uso
---
    python3 scripts/verificar_vistas.py           # informe completo
    python3 scripts/verificar_vistas.py --check   # solo falla o pasa (CI)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SQL = RAIZ / "sql"
DDL = [SQL / "lens_schema.sql", SQL / "lens_fase1.sql"]
VISTAS = SQL / "lens_vistas_en.sql"
APP = RAIZ / "src" / "app.py"

# Columnas que una vista puede NO exponer sin que sea un error. Hoy ninguna:
# la lista existe para que, si algún día se decide ocultar una columna interna,
# quede escrito cuál y por qué en vez de relajar el chequeo entero.
OCULTAS_A_PROPOSITO: dict[str, set[str]] = {}


def leer(p: Path) -> str:
    if not p.exists():
        sys.exit(f"ERROR: no se encontró {p}")
    return p.read_text(encoding="utf8")


def _sin_comentarios(sql: str) -> str:
    return re.sub(r"--[^\n]*", "", sql)


# ── El DDL: qué columnas tiene cada tabla ───────────────────────────────────
def columnas_de_tablas(fuentes: list[str]) -> dict[str, list[str]]:
    """{tabla: [columnas]} leyendo CREATE TABLE, ALTER ... ADD COLUMN y la
    materializada (cuyas columnas son los alias del SELECT)."""
    tablas: dict[str, list[str]] = {}

    for src in fuentes:
        limpio = _sin_comentarios(src)

        for m in re.finditer(
            r"CREATE TABLE(?:\s+IF NOT EXISTS)?\s+lens\.(\w+)\s*\((.*?)\n\)", limpio, re.S | re.I
        ):
            tabla, cuerpo = m.group(1), m.group(2)
            cols = []
            for linea in cuerpo.splitlines():
                linea = linea.strip().rstrip(",")
                if not linea:
                    continue
                # PRIMARY KEY, UNIQUE, FOREIGN KEY… no son columnas.
                if re.match(r"(PRIMARY|UNIQUE|FOREIGN|CONSTRAINT|CHECK)\b", linea, re.I):
                    continue
                c = re.match(r"(\w+)\s+\w", linea)
                if c:
                    cols.append(c.group(1))
            tablas.setdefault(tabla, []).extend(cols)

        for m in re.finditer(r"ALTER TABLE\s+lens\.(\w+)\s+ADD COLUMN\s+(\w+)", limpio, re.I):
            tablas.setdefault(m.group(1), []).append(m.group(2))

        # La materializada: sus columnas son los alias, o el nombre pelado
        # cuando no hay alias (`c.analisis_id`).
        for m in re.finditer(
            r"CREATE MATERIALIZED VIEW\s+lens\.(\w+)\s+AS\s+SELECT\s+(.*?)\nFROM\s", limpio, re.S | re.I
        ):
            nombre, cuerpo = m.group(1), m.group(2)
            cols = []
            for trozo in _separar_select(cuerpo):
                alias = re.search(r"\bAS\s+(\w+)\s*$", trozo, re.I)
                if alias:
                    cols.append(alias.group(1))
                else:
                    cols.append(trozo.strip().split(".")[-1])
            tablas.setdefault(nombre, []).extend(cols)

    return tablas


def _separar_select(cuerpo: str) -> list[str]:
    """Parte la lista del SELECT por comas de NIVEL CERO.

    Una coma adentro de `MAX(CASE WHEN ... END)` no separa columnas; partir por
    `,` a secas rompería la materializada.
    """
    partes, actual, nivel = [], [], 0
    for ch in cuerpo:
        if ch == "(":
            nivel += 1
        elif ch == ")":
            nivel -= 1
        if ch == "," and nivel == 0:
            partes.append("".join(actual))
            actual = []
        else:
            actual.append(ch)
    if "".join(actual).strip():
        partes.append("".join(actual))
    return [p.strip() for p in partes if p.strip()]


# ── Las vistas: qué columna de qué tabla expone cada una ────────────────────
def vistas_en(src: str) -> dict[str, dict]:
    """{vista: {"tabla": str, "mapa": [(columna_es, nombre_en)]}}"""
    salida: dict[str, dict] = {}
    limpio = _sin_comentarios(src)
    for m in re.finditer(
        r"CREATE OR REPLACE VIEW\s+lens\.(\w+)\s+AS\s+SELECT\s+(.*?)\nFROM\s+lens\.(\w+)\s*;",
        limpio, re.S | re.I,
    ):
        vista, cuerpo, tabla = m.group(1), m.group(2), m.group(3)
        mapa = []
        for trozo in _separar_select(cuerpo):
            par = re.match(r"^(\w+)\s+AS\s+(\w+)$", trozo, re.I)
            if not par:
                sys.exit(f"ERROR: en la vista {vista} no se pudo leer «{trozo}». "
                         "Este verificador solo entiende `columna AS nombre`.")
            mapa.append((par.group(1), par.group(2)))
        salida[vista] = {"tabla": tabla, "mapa": mapa}
    return salida


def vistas_con_grant(src: str) -> set[str]:
    """Las vistas que aparecen en el bloque de permisos del final.

    El alcance decidido es "solo las vistas en inglés", así que NO se puede usar
    `GRANT SELECT ON ALL TABLES IN SCHEMA lens` —abarcaría las tablas en
    español— y hay que enumerar una por una. El costo de enumerar es que una
    vista nueva nace sin permiso, en silencio: tech ve ocho de nueve y no hay
    ningún error que lo explique.

    Se leen también las líneas COMENTADAS: hoy el bloque está escrito y sin
    ejecutar, y la lista tiene que quedar completa igual para que el día que se
    ejecute no falte ninguna.
    """
    return set(re.findall(r"GRANT SELECT ON\s+lens\.(\w+)\s+TO", src, re.I))


def tablas_del_logger(src: str) -> set[str]:
    """Las tablas de `lens` en las que el logger escribe de verdad.

    Se leen del `TABLAS` real y no de una lista a mano: una tabla nueva que el
    logger empieza a llenar y que nadie expone en inglés es exactamente la
    deriva que este script tiene que ver.
    """
    bloque = re.search(r"TABLAS[^=]*=\s*\{(.*)\n\}", src, re.S)
    if not bloque:
        sys.exit("ERROR: no se pudo leer el dict TABLAS de src/app.py")
    return set(re.findall(r'"schema":\s*"lens",\s*"nombre":\s*"(\w+)"', bloque.group(1)))


# ── El informe ──────────────────────────────────────────────────────────────
def revisar() -> list[str]:
    tablas = columnas_de_tablas([leer(p) for p in DDL])
    src_vistas = leer(VISTAS)
    vistas = vistas_en(src_vistas)
    con_grant = vistas_con_grant(src_vistas)
    del_logger = tablas_del_logger(leer(APP))

    problemas: list[str] = []
    cubiertas = {v["tabla"] for v in vistas.values()}

    for vista, d in sorted(vistas.items()):
        tabla, mapa = d["tabla"], d["mapa"]
        if tabla not in tablas:
            problemas.append(f"{vista}: lee de lens.{tabla}, que no está en el DDL.")
            continue

        reales = tablas[tabla]
        expuestas = [es for es, _ in mapa]

        # 1. La vista apunta a algo que no existe → el CREATE falla al desplegar.
        for es, _ in mapa:
            if es not in reales:
                problemas.append(f"{vista}: expone «{es}», que no existe en lens.{tabla}. "
                                 "El CREATE OR REPLACE va a fallar en el próximo despliegue.")

        # 2. La tabla tiene algo que la vista no muestra → invisible para tech.
        ocultas = OCULTAS_A_PROPOSITO.get(tabla, set())
        for col in reales:
            if col not in expuestas and col not in ocultas:
                problemas.append(f"{vista}: lens.{tabla}.{col} no está expuesta. "
                                 "Quien consulte en inglés no va a ver ese dato.")

        # 3. Nombres repetidos: uno pisaría al otro y el SELECT sería ambiguo.
        for lado, nombres in (("origen", expuestas), ("inglés", [en for _, en in mapa])):
            repetidos = {n for n in nombres if nombres.count(n) > 1}
            if repetidos:
                problemas.append(f"{vista}: nombre repetido en {lado}: {', '.join(sorted(repetidos))}.")

    # 4. Una tabla sin vista: el estándar en inglés queda incompleto y nadie se
    #    entera hasta que tech pregunta por qué le falta una.
    for tabla in sorted(tablas):
        if tabla not in cubiertas:
            problemas.append(f"lens.{tabla} no tiene vista en inglés.")

    # 5. Y el caso que más importa: el logger ya está ESCRIBIENDO ahí.
    for tabla in sorted(del_logger - cubiertas):
        problemas.append(f"lens.{tabla} recibe escrituras del logger y no tiene vista en inglés.")

    # 6. Una vista sin su GRANT nace sin permiso, en silencio: quien consulta ve
    #    ocho de nueve y no hay ningún error que lo explique.
    for vista in sorted(set(vistas) - con_grant):
        problemas.append(f"lens.{vista} no está en el bloque de GRANT del final. "
                         "Nacería sin permiso y nadie la vería.")

    # Y al revés: un GRANT sobre una vista que ya no existe falla al ejecutarlo.
    for sobrante in sorted(con_grant - set(vistas)):
        problemas.append(f"hay un GRANT sobre lens.{sobrante}, que ya no es una vista de este archivo.")

    return problemas


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="sin informe; solo el veredicto")
    args = ap.parse_args()

    tablas = columnas_de_tablas([leer(p) for p in DDL])
    vistas = vistas_en(leer(VISTAS))
    problemas = revisar()

    if not args.check:
        print(f"Tablas en el DDL : {len(tablas)}")
        print(f"Vistas en inglés : {len(vistas)}\n")
        for vista, d in sorted(vistas.items()):
            faltan = len(tablas.get(d["tabla"], [])) - len(d["mapa"])
            print(f"  lens.{vista:<22} ← lens.{d['tabla']:<22} "
                  f"{len(d['mapa']):>2} col{'' if faltan == 0 else f'  ({faltan:+d})'}")
        print()

    if problemas:
        print(f"DERIVA: {len(problemas)} problema(s)\n", file=sys.stderr)
        for p in problemas:
            print(f"  · {p}", file=sys.stderr)
        print("\nRegenerá lens_vistas_en.sql desde las columnas reales.", file=sys.stderr)
        sys.exit(1)

    print("OK: las vistas en inglés cubren todas las tablas, columna por columna.")


if __name__ == "__main__":
    main()
