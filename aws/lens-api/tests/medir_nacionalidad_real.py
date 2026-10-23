"""Medición CONTRA GEMINI DE VERDAD del campo `nationalityDeclared` (contrato v3.2).

    python3 tests/medir_nacionalidad_real.py [corridas]     # 8 por defecto

No corre en pytest: gasta tokens. La key sale del entorno o de `.env.local` del
proyecto, y nunca se imprime.

── Qué se mide y por qué ───────────────────────────────────────────────────
`_PERSONA_PLANA` es el esquema de la composición societaria, y ya se rompió una
vez: con el esquema anidado, 1 de cada 5 corridas se desbocaba hasta 45.358
tokens y devolvía JSON cortado. Agregarle un campo exige repetir aquella
medición —mismo documento, 8 corridas— ANTES y DESPUÉS:

  1. JSON roto o cortado: tiene que ser cero en las dos.
  2. Tokens de salida: estables, y lejos del tope.
  3. Que los campos que ya existían no cambien por el campo nuevo
     (`countryOfOrigin`, tipo, número, porcentaje): EP-4 y EP-6 salen de ahí.
  4. Que la nacionalidad salga SOLO cuando el documento la escribe. Si se
     infiere —una cédula colombiana → «colombiana»—, el campo no sirve y
     `nationalityCode` tiene que ir siempre en null.

Este script tumbó dos intentos antes del que quedó (23-10-2026):

  · un campo de texto `nationality`: el modelo movía ahí la nacionalidad
    declarada y dejaba `countryOfOrigin` vacío —Colombia y Venezuela pasaron
    de 8/8 a 1/8 y 0/8—, lo que cambiaba EP-6;
  · el booleano con «false si countryOfOrigin se dedujo del domicilio…»: el
    modelo dejó de deducir, y el domiciliado en Perú perdió su país en 8/8.

Lo que quedó —el booleano que «solo informa»— dio 0 JSON roto, el mismo EP-6
serializado en 8/8, la nacionalidad declarada en 8/8 y ninguna inferida, con
~890 tokens de salida contra ~834 sin el campo.

Los documentos son SINTÉTICOS: un lote colombiano —la escritura y la
composición accionaria— con seis dueños. Dos declaran su nacionalidad, tres no
—uno de ellos domiciliado en Perú y con DNI, cuyo país se puede deducir—, y uno
es una sociedad. No usar documentos de clientes acá.
"""

from __future__ import annotations

import copy
import io
import json
import os
import statistics
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PROYECTO = RAIZ.parents[1]
sys.path.insert(0, str(RAIZ / "src"))

if not os.environ.get("GEMINI_API_KEY"):
    env = PROYECTO / ".env.local"
    if env.exists():
        for linea in env.read_text(encoding="utf8").splitlines():
            if linea.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = linea.split("=", 1)[1].strip()
                break
if not os.environ.get("GEMINI_API_KEY"):
    sys.exit("Falta GEMINI_API_KEY (en el entorno o en .env.local).")
os.environ.setdefault("MOTOR_OCR", "ninguno")

import companies  # noqa: E402
import gemini  # noqa: E402
import onboarding  # noqa: E402

ESCRITURA = """
NOTARIA CUARENTA Y DOS DEL CIRCULO DE BOGOTA D.C.
ESCRITURA PUBLICA NUMERO 9.901 DE 2026

CONSTITUCION DE SOCIEDAD POR ACCIONES SIMPLIFICADA
"COMERCIAL DE PRUEBA S.A.S."

En Bogota D.C., a los quince dias del mes de mayo de dos mil veintiseis, ante mi
NOTARIO CUARENTA Y DOS DEL CIRCULO DE BOGOTA, comparecieron:

JUAN CARLOS RAMOS PRUEBA, mayor de edad, de nacionalidad colombiana, domiciliado
en Bogota, identificado con cedula de ciudadania numero 99.100.001;

THOMAS EDWARD TESTFIELD, mayor de edad, domiciliado en Medellin, identificado con
pasaporte numero X9876543;

LUISA FERNANDA VARGAS PRUEBA, mayor de edad, de nacionalidad venezolana,
domiciliada en Cali, identificada con cedula de extranjeria numero 991.234;

ANDRES FELIPE QUISPE PRUEBA, mayor de edad, domiciliado en Lima, Republica del
Peru, identificado con documento nacional de identidad numero 99887766;

e INVERSIONES AURORA DE PRUEBA S.A.S., sociedad con NIT 999.999.003-5,
debidamente representada;

quienes manifestaron que constituyen una sociedad por acciones simplificada que
se regira por los siguientes estatutos:

ARTICULO 1. Nombre. La sociedad se denominara COMERCIAL DE PRUEBA S.A.S.
ARTICULO 2. Domicilio. El domicilio principal sera la ciudad de Bogota D.C.
ARTICULO 3. Objeto. La comercializacion de bienes y la prestacion de servicios
de consultoria empresarial.
ARTICULO 4. Capital. El capital suscrito es de $100.000.000, dividido en 1.000
acciones. La distribucion vigente de las acciones consta en el documento de
composicion accionaria que se protocoliza con este instrumento.
ARTICULO 5. Representacion legal. La representacion legal estara a cargo de un
Gerente. Se designa como Gerente a JUAN CARLOS RAMOS PRUEBA, identificado con
cedula de ciudadania numero 99.100.001.
"""

COMPOSICION = """
COMPOSICION ACCIONARIA
COMERCIAL DE PRUEBA S.A.S.  -  NIT 999.000.001-1
Fecha de corte: 30 de septiembre de 2026

ACCIONISTA                               TIPO DOC   NUMERO          ACCIONES   PARTICIPACION
RAMOS PRUEBA JUAN CARLOS                 CC         99.100.001          400          40%
TESTFIELD THOMAS EDWARD                  PASAPORTE  X9876543            200          20%
VARGAS PRUEBA LUISA FERNANDA             CE         991.234             100          10%
MORA INVENTADA SOFIA                     CC         99.100.004           50           5%
QUISPE PRUEBA ANDRES FELIPE              DNI        99887766             50           5%
INVERSIONES AURORA DE PRUEBA S.A.S.      NIT        999.999.003-5       200          20%

TOTAL                                                                 1.000         100%

Certifica el revisor fiscal.
"""

#: Lo que el documento dice de cada uno. `None` = no declara la nacionalidad.
VERDAD = {
    "99100001": "CO",
    "X9876543": None,
    "991234": "VE",
    "99100004": None,
    # Domiciliado en Perú y con DNI: el país se puede DEDUCIR, pero no está
    # escrito como nacionalidad. Es el caso que prueba que no se infiere.
    "99887766": None,
    "9999990035": None,
}


def _pdf(texto: str) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    _, alto = letter
    y = alto - 60
    c.setFont("Courier", 8.5)
    for linea in texto.splitlines():
        if y < 60:
            c.showPage()
            c.setFont("Courier", 8.5)
            y = alto - 60
        c.drawString(50, y, linea[:110])
        y -= 11
    c.save()
    return buf.getvalue()


def _sin_nacionalidad(esquema: dict) -> dict:
    """El esquema de antes: el mismo, sin `nationality`."""
    e = copy.deepcopy(esquema)

    def quitar(nodo):
        if isinstance(nodo, dict):
            nodo.get("properties", {}).pop("nationalityDeclared", None)
            for v in nodo.values():
                quitar(v)
        elif isinstance(nodo, list):
            for v in nodo:
                quitar(v)
    quitar(e)
    return e


ESQUEMAS = {
    "antes": (_sin_nacionalidad(gemini.ESQUEMA_SHAREHOLDERS), _sin_nacionalidad(gemini.ESQUEMA_CADENA)),
    "ahora": (gemini.ESQUEMA_SHAREHOLDERS, gemini.ESQUEMA_CADENA),
}


def _clave(p: dict) -> str:
    return "".join(ch for ch in str(p.get("shareholderId") or "").upper() if ch.isalnum())


def correr(variante: str, docs) -> dict:
    """Una corrida de `extraer_shareholders`. El esquema de la variante lo pone
    `main`, que corre las dos variantes una después de la otra."""
    t = time.monotonic()
    try:
        socios, senales = gemini.extraer_shareholders(docs)
    except Exception as e:  # noqa: BLE001
        return {"variante": variante, "error": f"{type(e).__name__}: {e}"[:200],
                "segundos": round(time.monotonic() - t, 1)}
    duenos = socios["directOwnership"] + socios["indirectShareholders"]
    ficha = {"documents": [{"objectKey": "escritura", "documentType": "company_deeds_document", "ok": True},
                           {"objectKey": "composicion", "documentType": "company_shareholders_document",
                            "ok": True}], **socios}
    companies._clasificar_personas(ficha)
    av = onboarding.Avisos()
    nodo = companies.accionistas_ep3(ficha, av)
    return {
        "variante": variante, "error": None, "segundos": round(time.monotonic() - t, 1),
        "tokens_salida": senales["tokens_salida"], "llamadas": senales["llamadas"],
        "suma": senales["suma_participacion"],
        "representantes": len(socios["legalRepresentatives"]),
        "duenos": {_clave(p): {k: p.get(k) for k in ("personType", "identificationType", "countryOfOrigin",
                                                     "ownershipPercentage", "nationalityDeclared")}
                   for p in duenos},
        "nodo": {"".join(ch for ch in str(a["identificationNumber"]).upper() if ch.isalnum()):
                 a["nationalityCode"] for a in nodo},
        "avisos_nodo": [a["reason"] + ":" + str(a.get("field")) for a in av.items],
    }


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    docs = [("company_deeds_document_1.pdf", _pdf(ESCRITURA)),
            ("company_shareholders_document_2.pdf", _pdf(COMPOSICION))]
    original = gemini._config_multimodal
    resultados = []
    for variante in ("antes", "ahora"):
        # El esquema de la variante, en la config que arma `extraer_shareholders`.
        esquema1, esquema2 = ESQUEMAS[variante]
        reemplazo = {id(gemini.ESQUEMA_SHAREHOLDERS): esquema1, id(gemini.ESQUEMA_CADENA): esquema2}
        gemini._config_multimodal = lambda e, r=reemplazo: original(r.get(id(e), e))
        try:
            with ThreadPoolExecutor(max_workers=4) as ex:
                resultados += list(ex.map(lambda _: correr(variante, docs), range(n)))
        finally:
            gemini._config_multimodal = original

    salida = {}
    for v in ("antes", "ahora"):
        rs = [r for r in resultados if r["variante"] == v]
        buenas = [r for r in rs if not r["error"]]
        tokens = [r["tokens_salida"] for r in buenas]
        print(f"\n=== {v.upper()} · {len(rs)} corridas ===")
        print(f"  con error / JSON roto : {len(rs) - len(buenas)}"
              + "".join(f"\n      {r['error']}" for r in rs if r["error"]))
        if tokens:
            print(f"  tokens de salida      : min {min(tokens)} · mediana {statistics.median(tokens)} · "
                  f"max {max(tokens)} (tope {gemini.TOPE_SALIDA_MULTIMODAL})")
        print(f"  dueños por corrida    : {dict(Counter(len(r['duenos']) for r in buenas))}")
        print(f"  representantes        : {dict(Counter(r['representantes'] for r in buenas))}")
        print(f"  suma de participación : {dict(Counter(r['suma'] for r in buenas))}")
        for clave in VERDAD:
            vistos = [r["duenos"].get(clave) for r in buenas]
            presentes = [x for x in vistos if x]
            print(f"  {clave:<11} presente {len(presentes)}/{len(buenas)}"
                  f" · tipo {dict(Counter(x['identificationType'] for x in presentes))}"
                  f" · origen {dict(Counter(x['countryOfOrigin'] for x in presentes))}"
                  f" · pct {dict(Counter(x['ownershipPercentage'] for x in presentes))}"
                  + (f" · declarada {dict(Counter(x.get('nationalityDeclared') for x in presentes))}"
                     f" · nodo {dict(Counter(r['nodo'].get(clave, 'fuera') for r in buenas))}"
                     f" · esperado {VERDAD[clave]}" if v == "ahora" else ""))
        salida[v] = rs

    ahora = [r for r in resultados if r["variante"] == "ahora" and not r["error"]]
    inferidas = sum(1 for r in ahora for c, esperado in VERDAD.items()
                    if esperado is None and r["nodo"].get(c) not in (None, "fuera"))
    erradas = sum(1 for r in ahora for c, esperado in VERDAD.items()
                  if esperado is not None and r["nodo"].get(c) not in (esperado, None))
    perdidas = sum(1 for r in ahora for c, esperado in VERDAD.items()
                   if esperado is not None and r["nodo"].get(c) is None)
    print(f"\nnacionalidad inferida (no declarada y con valor): {inferidas}")
    print(f"nacionalidad equivocada (declarada y distinta)   : {erradas}")
    print(f"nacionalidad declarada que no vino               : {perdidas}")

    destino = Path(os.environ.get("MEDICION_SALIDA", "/dev/null"))
    if str(destino) != "/dev/null":
        destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
