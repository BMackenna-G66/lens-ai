"""Genera el diccionario de datos para Onboarding B2B, DESDE el código.

    python3 scripts/generar_diccionario.py           # escribe el documento
    python3 scripts/generar_diccionario.py --check    # no escribe; falla si quedó viejo

── Por qué generado y no escrito a mano ────────────────────────────────────
Este documento sale del equipo: Onboarding lo usa para definir qué tablas se les
habilitan en el acceso de lectura (§14.2) y para programar contra los `reason`.
Un diccionario escrito a mano empieza correcto y se desincroniza en el primer
cambio, en silencio — y del otro lado nadie puede notarlo, porque para ellos el
documento ES la verdad.

Las tres cosas que de verdad derivan y por eso se leen de la fuente:

  · el catálogo de errores y avisos  → `src/errores.py`
  · los campos de cada endpoint      → `tests/test_contrato_completo.py`
  · las vistas y sus columnas        → `../colas-logger/sql/lens_vistas_en.sql`

La prosa vive acá. Los datos, no.

── Sobre los ejemplos ──────────────────────────────────────────────────────
Todos INVENTADOS, y con RUT deliberadamente inválidos en el dígito verificador.
El schema `lens` guarda RUT, socios, participaciones y domicilios; este
documento circula fuera de Compliance. Un ejemplo copiado de una corrida real
revelaría que una empresa concreta pasó por el sistema, que es un dato que no es
público aunque su RUT sí lo sea.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import NamedTuple

RAIZ = Path(__file__).resolve().parents[1]
SALIDA = RAIZ / "DICCIONARIO_ONBOARDING.md"
SQL = RAIZ.parent / "colas-logger" / "sql"
VISTAS_SQL = SQL / "lens_vistas_en.sql"
#: El modelo vive repartido en dos archivos: el schema original y la Fase 1, que
#: agregó personas, actividades, revisión y el pivote. Leer solo el primero deja
#: cuatro de las diez vistas sin tipos y sin que se note.
TABLAS_SQL = (SQL / "lens_schema.sql", SQL / "lens_fase1.sql")

sys.path.insert(0, str(RAIZ / "src"))
sys.path.insert(0, str(RAIZ / "tests"))


def _fallar(msg: str) -> None:
    print(f"✗ {msg}", file=sys.stderr)
    sys.exit(1)


# ── Que no se filtre un RUT válido ──────────────────────────────────────────
# Los comentarios del DDL traen ejemplos, y alguno es un RUT bien formado. Que
# sea inventado no alcanza: un RUT estructuralmente válido puede coincidir con
# una sociedad real, y este documento sale de Compliance. Se enmascaran acá y no
# en el SQL porque cambiar el ejemplo del DDL —y peor, el de `constants.ts`, que
# viaja dentro del prompt— es una decisión aparte, con su propio riesgo.

_RE_RUT = re.compile(r"\b(\d{1,2}(?:\.\d{3}){2})-([\dkK])\b")
_RE_RUT_PLANO = re.compile(r"\b\d{8,9}\b")


def dv_rut(cuerpo: str) -> str:
    """El dígito verificador que le corresponde a ese cuerpo."""
    digitos = cuerpo.replace(".", "")
    suma = sum(int(d) * f for d, f in zip(reversed(digitos), [2, 3, 4, 5, 6, 7] * 3))
    resto = 11 - (suma % 11)
    return {11: "0", 10: "K"}.get(resto, str(resto))


def enmascarar(texto: str) -> str:
    """Saca de un comentario cualquier cosa con forma de RUT."""
    texto = _RE_RUT.sub(lambda m: "…" if m.group(2).upper() == dv_rut(m.group(1)) else m.group(0), texto)
    return _RE_RUT_PLANO.sub(
        lambda m: "…" if m.group(0)[-1].upper() == dv_rut(m.group(0)[:-1]) else m.group(0), texto
    )


# ── Lo que se lee de la fuente ──────────────────────────────────────────────

class Col(NamedTuple):
    nombre: str      #: el nombre en inglés, el que consulta Onboarding
    tipo: str        #: del DDL de la tabla que la respalda
    origen: str      #: la columna en español, la fuente de verdad
    nota: str        #: el comentario `--` del DDL, si lo tiene


def columnas_de_tablas() -> dict[str, dict[str, tuple[str, str]]]:
    """`{tabla: {columna: (tipo, comentario)}}` leído del DDL versionado.

    El comentario `--` de cada columna es la descripción que pide §13.3. Está
    escrito al lado del dato por quien lo definió, así que es la descripción más
    fiel que existe; copiarla a mano a un documento aparte la condena a
    envejecer.
    """
    fuera: dict[str, dict[str, tuple[str, str]]] = {}
    for archivo in TABLAS_SQL:
        if not archivo.exists():
            _fallar(f"falta {archivo}")
        sql = archivo.read_text(encoding="utf-8")
        for m in re.finditer(
            r"CREATE TABLE IF NOT EXISTS\s+([\w.]+)\s*\((.*?)\n\)", sql, re.S | re.I
        ):
            cols: dict[str, tuple[str, str]] = {}
            for linea in m.group(2).splitlines():
                linea = linea.strip()
                if not linea or linea.startswith("--"):
                    continue
                cuerpo, _, nota = linea.partition("--")
                d = re.match(
                    r"(\w+)\s+(VARCHAR\(\d+\)|TIMESTAMP|SMALLINT|INTEGER|BIGINT|BOOLEAN|SUPER|DECIMAL\([\d,\s]+\)|REAL|DOUBLE PRECISION|DATE)",
                    cuerpo.strip(), re.I,
                )
                if d:
                    cols[d.group(1)] = (d.group(2).upper(), nota.strip())
            if cols:
                fuera[m.group(1)] = cols

        # Una columna agregada después vive en un ALTER, no en el CREATE. Saltearlos
        # dejaría quince columnas de la Fase 1 sin tipo y sin descripción — visibles
        # en la vista, ausentes del diccionario, que es la peor combinación.
        for a in re.finditer(
            r"ALTER TABLE\s+([\w.]+)\s+ADD COLUMN\s+(\w+)\s+([\w()\s,]+?)\s*;(?:[ \t]*--(.*))?",
            sql, re.I,
        ):
            fuera.setdefault(a.group(1), {})[a.group(2)] = (
                a.group(3).strip().upper(), (a.group(4) or "").strip()
            )

    # `analisis_pivote` es una vista materializada, no una tabla: sus columnas no
    # tienen DDL propio. Todas son `MAX(CASE WHEN campo = … THEN valor END)`, o
    # sea el mismo tipo que `valor`, más las tres de la cabecera.
    campo = fuera.get("lens.analisis_campo", {})
    if campo:
        pivote = {c: campo[c] for c in ("analisis_id", "origen", "ejecutado_en") if c in campo}
        valor = campo.get("valor", ("VARCHAR(65535)", ""))[0]
        for m in re.finditer(r"THEN valor END\)\s+AS\s+(\w+)", (SQL / "lens_fase1.sql").read_text(encoding="utf-8")):
            pivote[m.group(1)] = (valor, "uno de los 18 campos del catálogo, como columna")
        fuera["lens.analisis_pivote"] = pivote

    if not fuera:
        _fallar("no se pudo leer ninguna tabla del DDL")
    return fuera


def vistas() -> list[tuple[str, str, list[Col]]]:
    """`(vista, tabla_origen, columnas)` cruzando el SELECT con el DDL."""
    sql = VISTAS_SQL.read_text(encoding="utf-8")
    tablas = columnas_de_tablas()
    salida: list[tuple[str, str, list[Col]]] = []
    for m in re.finditer(
        r"CREATE OR REPLACE VIEW\s+([\w.]+)\s+AS\s+SELECT(.*?)\bFROM\b\s+([\w.]+)\s*;",
        sql, re.S | re.I,
    ):
        vista, cuerpo, tabla = m.group(1), m.group(2), m.group(3)
        cols: list[Col] = []
        for linea in cuerpo.split(","):
            linea = re.sub(r"--.*", "", linea).strip()
            if not linea:
                continue
            partes = re.split(r"\s+AS\s+", linea, flags=re.I)
            # `origen AS alias`; sin AS, la columna se llama igual en los dos lados
            origen = partes[0].strip().rsplit(".", 1)[-1]
            alias = partes[-1].strip().rsplit(".", 1)[-1].strip('"')
            tipo, nota = tablas.get(tabla, {}).get(origen, ("", ""))
            if alias:
                cols.append(Col(alias, tipo, origen, nota))
        salida.append((vista, tabla, cols))
    if not salida:
        _fallar(f"no se pudieron leer las vistas de {VISTAS_SQL}")
    return salida


# ── El documento ────────────────────────────────────────────────────────────

CABECERA = """# Diccionario de datos · LENS ⇄ Onboarding B2B

> **GENERADO.** No se edita a mano: sale de
> `aws/lens-api/scripts/generar_diccionario.py`, que lee el catálogo de errores,
> los campos de cada endpoint y las vistas directamente del código. Para
> regenerarlo, correr ese script; para verificar que está al día, con `--check`.

| | |
|---|---|
| **Responde a** | Especificación LENS ⇄ Onboarding B2B v1.2 (25-sep-2026), §13.3 |
| **Para qué** | Definir el acceso de lectura a la base (§14.2) y programar contra los `reason` |
| **Ejemplos** | Todos inventados. Ver la nota al final |

---

## 1. Estados de una corrida

Una corrida de análisis pasa por estos estados. `GET …/analysis/status` los
devuelve siempre con **HTTP 200**, incluido `NOT_STARTED`: nunca un `404`.

| Estado | Qué significa | ¿Hay resultado? |
|---|---|---|
| `NOT_STARTED` | Nunca se pidió un análisis para esa empresa en ese ambiente | No |
| `IN_PROGRESS` | Se aceptó el pedido y está procesando | No |
| `COMPLETED` | Terminó y leyó todo lo que se le mandó | Sí |
| `INCOMPLETE` | Terminó, pero algo quedó sin leer | Sí, parcial, con `warnings[]` |
| `FAILED` | No se pudo completar | No, con `error` |

### Transiciones

```
                   ┌──────────────┐
                   │ NOT_STARTED  │
                   └──────┬───────┘
                          │  POST …/analyses  →  202
                          ▼
                   ┌──────────────┐
                   │ IN_PROGRESS  │
                   └──┬────┬────┬─┘
                      │    │    │
        ┌─────────────┘    │    └──────────────┐
        ▼                  ▼                   ▼
  ┌───────────┐     ┌────────────┐      ┌──────────┐
  │ COMPLETED │     │ INCOMPLETE │      │  FAILED  │
  └───────────┘     └────────────┘      └──────────┘
```

**El registro ocurre ANTES de responder el `202`.** No es una preferencia de
diseño: si el `202` saliera primero, la primera consulta del front podría ver
`NOT_STARTED`, volver a mostrar la pantalla de carga y disparar un segundo
procesamiento del mismo lote.

Un estado **no vuelve atrás**. Una corrida nueva sobre la misma empresa crea un
registro nuevo; la anterior queda en el historial.

---
"""

CAMPOS_EP = """
## 2. Estructuras de respuesta

Los tipos son los de JSON. «Obligatorio» significa que **la clave viaja
siempre**, aunque su valor sea `null`: el consumidor no tiene que defenderse de
campos ausentes.

Donde dice *derivado*, el valor no sale tal cual de un campo extraído sino de
una regla; la regla está en la columna de origen.

### 2.1 Bloque `company` — EP-3 y EP-5

| Campo | Tipo | Oblig. | Origen | Ejemplo |
|---|---|---|---|---|
| `legalName` | string \\| null | Sí | *Razón Social*, directo | `"COMERCIAL TRIFOLIO SpA"` |
| `taxId` | string \\| null | Sí | *RUT de la sociedad*, tal como figura | `"77.111.222-1"` |
| `taxIdType` | string \\| null | Sí | Derivado del país declarado; el formato solo decide si el país no se sabe | `"RUT"` |
| `constitutionDate` | string \\| null | Sí | *Fecha de Constitución*, convertida a `YYYY-MM-DD` | `"2019-03-12"` |
| `legalForm` | string \\| null | Sí | Nombrada desde el sufijo de la razón social o, si falta, desde el texto del documento. Uno de cinco valores fijos, nunca recortado | `"Sociedad por Acciones"` |
| `address` | object | Sí | Derivado de *Domicilio Legal* (ver abajo) | |
| `activity` | string \\| null | Sí | Actividad principal RESUMIDA del objeto social, hasta 30 caracteres. `null` si no se puede resumir: nunca un fragmento | `"Inversiones"` |
| `jointAdministration` | boolean \\| null | Sí | Pasada propia sobre las cláusulas de administración (§11) | `true` |

> **Es un solo bloque, no dos.** La especificación lo dice literal en EP-3:
> «`company`: mismo contenido que EP-5». Dos implementaciones del mismo bloque se
> desincronizan en el primer cambio, y el consumidor vería una empresa distinta
> según por dónde preguntara.

> `taxIdType` va en `null` cuando `taxId` va en `null`. Un tipo de documento para
> un documento que no existe es ruido en el camino que decide `NOT_COMPARABLE`.

#### Las cuatro partes del domicilio

| Campo | Tipo | Oblig. | Origen | Ejemplo |
|---|---|---|---|---|
| `address.street` | string \\| null | Sí | Derivado de *Domicilio Legal* | `"Av. Providencia 1234"` |
| `address.apt` | string \\| null | Sí | Derivado; `null` si la dirección no lo trae | `"Of 302"` |
| `address.city` | string \\| null | Sí | Derivado | `"Santiago"` |
| `address.state` | string \\| null | Sí | Derivado | `"Región Metropolitana"` |

El domicilio viene escrito a mano en la escritura y no tiene formato, así que
cada parte se reconoce por lo que ES, no por dónde está: una **calle** tiene un
número o una palabra de calle (`Av.`, `Calle`, `Pasaje`…), una **región** dice
`Región` o `Departamento`, y el **país** se descarta — el contrato no tiene campo
país. Lo que queda es la comuna o ciudad, sin el «Comuna de» adelante.

Si el documento da solo la ciudad, `street` va en `null`. Lo que no se puede
clasificar **no se inventa**: una calle adivinada es peor que ninguna, porque
nadie la va a revisar.

#### Sobre `legalForm` y `activity`

Ninguna de las dos se recorta. Recortar dejaba «Sociedad de Responsabilidad»
—perdía justo la palabra que define a una limitada— y actividades como
«Comercialización,» con la coma colgando, que para quien las guarda parecen un
dato y no lo son.

`legalForm` toma uno de cinco valores fijos, todos de hasta 30 caracteres:

| Tipo | `legalForm` |
|---|---|
| Sociedad por acciones | `Sociedad por Acciones` |
| Sociedad anónima | `Sociedad Anónima` |
| Sociedad de responsabilidad limitada | `Sociedad Limitada` |
| Sociedad por acciones simplificada | `S.A.S.` |
| Empresa individual de responsabilidad limitada | `E.I.R.L.` |

`activity` la resume el modelo a partir del objeto social, y se ajusta siempre
por **palabras enteras**: si el resumen no entra en 30 se le sacan palabras del
final, y nunca queda colgando de un «y» o un «de». Si el modelo devolvió una
lista en vez de un resumen, o no queda nada, va `null` con aviso.

#### Sobre `jointAdministration`

Dice si la sociedad exige que **dos o más personas actúen en conjunto** para
obligarla. Va en `null` cuando el documento no lo declara o es ambiguo, y eso es
una respuesta, no un fallo — de este valor depende cuántas aprobaciones necesita
una empresa para operar, así que solo pasa un booleano explícito.

No se deriva interpretando el texto del campo *Facultades*: sale de una lectura
propia del documento. Interpretar texto libre es justamente lo que hoy hace la
revisión humana porque no es confiable, y el riesgo que se quiere cubrir —que
alguien se identifique como una persona que no puede obligar a la sociedad por sí
sola— no se resuelve con una heurística.

Varios apoderados que actúan **indistintamente** no son administración conjunta.
Un límite de monto por sobre el cual se exigen dos firmas, **sí**.

### 2.2 `legalRepresentatives[]` — EP-3 y EP-4

| Campo | Tipo | Oblig. | Origen | Ejemplo |
|---|---|---|---|---|
| `fullName` | string \\| null | Sí | *Representante Legal*, **texto original sin reordenar** | `"MARTINEZ SOTO CLAUDIA ANDREA"` |
| `name` | string \\| null | Sí | Partición del nombre (§7.4) | `"CLAUDIA ANDREA"` |
| `lastName` | string \\| null | Sí | Partición del nombre | `"MARTINEZ SOTO"` |
| `personType` | string | Sí | `NATURAL` o `LEGAL` | `"NATURAL"` |
| `identificationType` | string \\| null | Sí | Declarado, o derivado del país y del tipo de persona | `"CC"` |
| `identificationNumber` | string \\| null | Sí | **Tal como figura**, no solo dígitos | `"1.020.304-5"` |
| `role` | string \\| null | Sí | *Representante Legal* (cargo), hasta 60 caracteres | `"Gerente General"` |

### 2.3 `shareholders[]` — EP-3 y EP-6

| Campo | Tipo | Oblig. | Origen | Ejemplo |
|---|---|---|---|---|
| `personType` | string | Sí | `NATURAL` o `LEGAL` | `"LEGAL"` |
| `shareholderName` | string \\| null | Sí | **Texto original sin reordenar** | `"INVERSIONES AURORA LIMITADA"` |
| `shareholderId` | string \\| null | Sí | **Solo dígitos** | `"771112221"` |
| `countryOfOrigin` | string \\| null | Sí | Uno de los 238 nombres del Anexo A, con su grafía | `"Colombia"` |
| `identificationType` | string \\| null | Sí | Declarado, o derivado del país y del tipo de persona | `"NIT"` |
| `lastName` | string \\| null | Sí | Partición; `null` en personas jurídicas | `null` |
| `name` | string \\| null | Sí | Partición; razón social en personas jurídicas | `"INVERSIONES AURORA LIMITADA"` |
| `ownershipPercentage` | number \\| null | Sí | Porcentaje declarado; **no se estima** | `60` |
| `indirectShareholders` | array | Sí | Cadena societaria; `[]` si el documento no la revela | `[]` |
| `isPEP` | boolean \\| null | Sí | Solo si el documento lo declara; `false` en jurídicas | `false` |

> **`shareholderName` y `fullName` no son redundantes con `name` + `lastName`.**
> La partición **no es reversible**. Con el orden registral colombiano,
> concatenar da `"CLAUDIA ANDREA MARTINEZ SOTO"`, que no es lo que decía la
> escritura. Quien cruce contra el registro necesita el texto como está escrito.

> **Dos reglas distintas para el mismo dato.** El identificador del accionista va
> **solo con dígitos** y el de la empresa y el del representante **tal como
> figuran**. Lo pide así el contrato.

---
"""

NOTA_FINAL = """
## 5. Sobre el acceso a la base

El schema `lens` **arranca sin `GRANT` para nadie** salvo su dueño, y es
deliberado: guarda RUT, socios, participaciones, domicilios y verificación de
identidad del representante legal.

Las vistas viven en el **mismo schema** que las tablas, así que un solo `GRANT`
cubre las dos formas. Otorgarlo es una decisión, no un trámite: conviene que sea
sobre las vistas y no sobre las tablas, y acotado a lo que Onboarding consulta.

## 6. Sobre los ejemplos de este documento

**Todos inventados.** Los RUT tienen el dígito verificador deliberadamente mal,
para que no puedan coincidir con una sociedad real.

No es formalismo: un ejemplo copiado de una corrida revelaría que una empresa
concreta pasó por el sistema de compliance. El RUT y la razón social de una
sociedad chilena son públicos; **que haya sido analizada, no**.
"""


def emitir() -> str:
    import errores as er

    partes = [CABECERA, CAMPOS_EP]

    # ── 3 · Errores y avisos, leídos del catálogo ──
    partes.append("\n## 3. Errores y avisos\n\n")
    partes.append(
        "Tres canales, y **no son el mismo**. La diferencia que importa es si el\n"
        "análisis sirve:\n\n"
        "| Canal | Cuándo | ¿Sirve el análisis? |\n|---|---|---|\n"
        "| Error HTTP | La petición no se pudo atender | — |\n"
        "| Fallo de corrida | Arrancó y terminó en `FAILED` | **No** |\n"
        "| Aviso | Terminó, pero algo salió degradado | **Sí** |\n\n"
        "> `GATEWAY_TIMEOUT` y `SERVICE_UNAVAILABLE` llegan por separado a propósito.\n"
        "> Para Onboarding tienen la misma consecuencia —consumen intento— pero no el\n"
        "> mismo diagnóstico: uno se arregla subiendo un tiempo de espera y el otro\n"
        "> levantando un servicio.\n"
    )

    partes.append("\n### 3.1 Errores HTTP\n\n| `reason` | HTTP | Código corporativo | Qué pasó |\n|---|---|---|---|\n")
    for r in er.HTTP.values():
        partes.append(f"| `{r.nombre}` | {r.http} | `{r.code}` | {r.descripcion} |\n")

    partes.append("\n### 3.2 Fallos de corrida\n\n| `reason` | Código corporativo | Qué pasó |\n|---|---|---|\n")
    for r in er.FALLO.values():
        code = f"`{r.code}`" if r.code else "**pendiente de alta**"
        partes.append(f"| `{r.nombre}` | {code} | {r.descripcion} |\n")
    if er.PENDIENTES:
        partes.append(
            f"\n> Los marcados como pendientes ({len(er.PENDIENTES)}) están solicitados a\n"
            "> Arquitectura y todavía no tienen código asignado. Son propios de LENS: ningún\n"
            "> otro servicio del catálogo lee escrituras.\n"
        )

    partes.append("\n### 3.3 Avisos\n\nCatálogo propio de LENS. Viajan en `warnings[]` con "
                  "`reason`, `objectKey` y `message`.\n\n| `reason` | Qué pasó |\n|---|---|\n")
    for r in er.AVISO.values():
        partes.append(f"| `{r.nombre}` | {r.descripcion} |\n")

    # ── 4 · El modelo, leído del SQL ──
    partes.append(
        "\n---\n\n## 4. Modelo de datos\n\n"
        "El schema `lens` guarda cada corrida. Las **vistas en inglés** son la forma\n"
        "recomendada de consultarlo: las tablas están en español y son la fuente de\n"
        "verdad, pero renombrarlas rompería la app y el logger, así que las vistas\n"
        "exponen los nombres que tech pidió sin mover nada.\n\n"
    )
    for vista, tabla, cols in vistas():
        partes.append(f"\n### `{vista}`\n\n")
        if vista == "lens.analysis_pivot":
            partes.append(
                "> **Es una vista materializada.** No refleja una corrida nueva hasta que\n"
                "> alguien corre `REFRESH MATERIALIZED VIEW lens.analisis_pivote`. Para leer\n"
                "> el dato más reciente, `lens.analysis_field`, que es la fuente de verdad.\n\n"
            )
        partes.append(f"Sobre `{tabla}`.\n\n| Columna | Tipo | Columna original | Descripción |\n|---|---|---|---|\n")
        for c in cols:
            tipo = f"`{c.tipo}`" if c.tipo else "—"
            nota = enmascarar(c.nota).replace("|", "\\|") if c.nota else ""
            partes.append(f"| `{c.nombre}` | {tipo} | `{c.origen}` | {nota} |\n")

    partes.append(NOTA_FINAL)
    return "".join(partes)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="no escribe; falla si está desactualizado")
    args = ap.parse_args()

    nuevo = emitir()
    if args.check:
        if not SALIDA.exists():
            _fallar(f"{SALIDA.name} no existe. Correr el generador.")
        if SALIDA.read_text(encoding="utf-8") != nuevo:
            _fallar(f"{SALIDA.name} quedó viejo. Correr: python3 scripts/generar_diccionario.py")
        print(f"✓ {SALIDA.name} está al día")
        return

    SALIDA.write_text(nuevo, encoding="utf-8")
    print(f"✓ {SALIDA.relative_to(RAIZ.parent.parent)}  ({len(nuevo.splitlines())} líneas)")


if __name__ == "__main__":
    main()
