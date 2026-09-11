"""Prueba de humo CONTRA GEMINI DE VERDAD. No corre en pytest: gasta tokens.

    export GEMINI_API_KEY=...            # o se lee de .env.local
    python3 tests/smoke_real.py

Hace dos cosas que los tests con mocks no pueden hacer:

  1. Lee un PDF real por capa de texto y confirma que sale sin tocar el OCR.
  2. Manda una escritura sintética al modelo y verifica que vuelven los 18
     campos y que las personas salen en el formato `NOMBRE | DOCUMENTO | DATO`.

La escritura es inventada. No usar documentos de clientes acá.
"""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
PROYECTO = RAIZ.parents[1]
sys.path.insert(0, str(RAIZ / "src"))

# La key sale del entorno o de .env.local del proyecto. Nunca se imprime.
if not os.environ.get("GEMINI_API_KEY"):
    env = PROYECTO / ".env.local"
    if env.exists():
        for linea in env.read_text(encoding="utf8").splitlines():
            if linea.startswith("GEMINI_API_KEY="):
                os.environ["GEMINI_API_KEY"] = linea.split("=", 1)[1].strip()
                break
if not os.environ.get("GEMINI_API_KEY"):
    sys.exit("Falta GEMINI_API_KEY (en el entorno o en .env.local).")

os.environ.setdefault("API_SECRET", "smoke")
os.environ.setdefault("MOTOR_OCR", "ninguno")

import app          # noqa: E402
import extraccion   # noqa: E402

SECRETO = os.environ["API_SECRET"]

ESCRITURA = """
REPERTORIO N° 4.512-2024

CONSTITUCION DE SOCIEDAD POR ACCIONES
"AD ASTRA TECNOLOGIA SpA"

En Santiago de Chile, a doce de marzo de dos mil veinticuatro, ante mi, MARIA
ELENA ROJAS CONTRERAS, Notario Publico Titular de la Trigesima Notaria de
Santiago, comparecen: don JUAN ANDRES PEREZ SOTO, chileno, casado, ingeniero
civil, cedula nacional de identidad numero 12.345.678-9, domiciliado en calle
Los Militares 5620, oficina 704, comuna de Las Condes; y dona MARIA JOSE
GONZALEZ RUIZ, chilena, soltera, diseniadora, cedula nacional de identidad
numero 9.876.543-2, domiciliada en Avenida Apoquindo 4501, comuna de Las
Condes; ambos mayores de edad, quienes acreditan su identidad con las cedulas
citadas y exponen:

PRIMERO: Constituyese una sociedad por acciones que girara bajo la razon social
"AD ASTRA TECNOLOGIA SpA", pudiendo usar el nombre de fantasia "AD ASTRA".
El Rol Unico Tributario de la sociedad es 78.451.792-6.

SEGUNDO: El domicilio de la sociedad sera la comuna de Las Condes, Region
Metropolitana, Republica de Chile, sin perjuicio de las agencias que establezca.

TERCERO: El objeto social sera la prestacion de servicios de publicidad
prestados por empresas, el marketing digital, la consultoria de gestion
empresarial y el comercio electronico de productos por internet.

CUARTO: El capital social asciende a la suma de $32.500.000 (treinta y dos
millones quinientos mil pesos), dividido en 1.000 acciones nominativas, sin
valor nominal, suscritas y pagadas de la siguiente forma: don JUAN ANDRES PEREZ
SOTO suscribe y paga 650 acciones, equivalentes al 65% del capital; y dona
MARIA JOSE GONZALEZ RUIZ suscribe y paga 350 acciones, equivalentes al 35% del
capital.

QUINTO: La administracion correspondera a don JUAN ANDRES PEREZ SOTO, en
calidad de Gerente General, quien tendra la representacion judicial y
extrajudicial de la sociedad. Se le confieren las facultades de comprar y
vender toda clase de bienes muebles e inmuebles; abrir y cerrar cuentas
corrientes bancarias, girar y depositar cheques, y representar a la sociedad
ante bancos e instituciones financieras; y otorgar mandatos y delegar sus
facultades en todo o parte.

SEXTO: La duracion de la sociedad sera indefinida.

SEPTIMO: Las juntas de accionistas se celebraran en el domicilio social durante
el mes de abril de cada anio.

OCTAVO: Cualquier dificultad o controversia sera resuelta por un arbitro
arbitrador designado por el Centro de Arbitraje de la Camara de Comercio de
Santiago.

NOVENO: Las utilidades se distribuiran a prorrata de las acciones suscritas y
pagadas por cada accionista.

DECIMO: Las comunicaciones entre la sociedad y los accionistas se haran por
carta certificada al domicilio registrado.
"""


def _evento(documentos, **extra):
    return {
        "requestContext": {"http": {"method": "POST", "path": "/v1/analisis"}},
        "rawPath": "/v1/analisis",
        "headers": {"x-api-secret": SECRETO},
        "body": json.dumps({"documentos": documentos, **extra}),
        "isBase64Encoded": False,
        "queryStringParameters": None,
    }


def prueba_pdf_real() -> None:
    print("\n=== 1. PDF real por capa de texto (sin OCR) ===")
    pdf = PROYECTO / "public" / "manual_laft.pdf"
    if not pdf.exists():
        print("   omitida: no está public/manual_laft.pdf")
        return

    r = extraccion.extraer_texto(pdf.name, pdf.read_bytes(), extraccion.Presupuesto(limite_s=120))
    print(f"   método          : {r.metodo}")
    print(f"   páginas totales : {r.paginas_totales}")
    print(f"   por capa / ocr  : {r.paginas_por_capa} / {r.paginas_por_ocr}")
    print(f"   caracteres      : {len(r.texto):,}")
    assert r.ok, "no se pudo leer el PDF"
    assert r.metodo == "capa_texto", f"se esperaba capa_texto y fue {r.metodo}"
    assert r.paginas_por_ocr == 0, "no debería haber tocado el OCR"
    print("   OK: el PDF digital se leyó entero sin una sola llamada a OCR.")


def prueba_extraccion_real() -> None:
    print("\n=== 2. Escritura sintética contra Gemini ===")
    contenido = base64.b64encode(ESCRITURA.encode("utf8")).decode()
    resp = app.lambda_handler(_evento(
        [{"nombre": "escritura_ad_astra.txt", "contenido_base64": contenido}],
        incluir_texto=False,
    ))
    cuerpo = json.loads(resp["body"])

    print(f"   HTTP {resp['statusCode']} · estado {cuerpo.get('estado')} · "
          f"país {cuerpo.get('pais_detectado')} · {cuerpo.get('duracion_ms')} ms")
    if cuerpo.get("avisos"):
        for a in cuerpo["avisos"]:
            print(f"   aviso: {a}")
    if not cuerpo.get("ok"):
        sys.exit(f"   FALLÓ: {cuerpo.get('error')}")

    campos = {c["field"]: c["value"] for c in cuerpo["campos"]}
    print(f"\n   campos devueltos: {len(cuerpo['campos'])}")
    for c in cuerpo["campos"]:
        v = c["value"].replace("\n", " ⏎ ")
        print(f"     {c['field']:<38} {v[:88]}")

    print("\n   --- verificaciones ---")
    fallos = []

    def chequear(nombre: str, ok: bool, detalle: str = "") -> None:
        print(f"   {'OK  ' if ok else 'FALLA'} {nombre}{f' — {detalle}' if detalle and not ok else ''}")
        if not ok:
            fallos.append(nombre)

    chequear("son 18 campos", len(cuerpo["campos"]) == 18)
    chequear("país = chile", cuerpo["pais_detectado"] == "chile", cuerpo["pais_detectado"])
    chequear("RUT de la sociedad", "78.451.792-6" in campos["RUT de la sociedad"], campos["RUT de la sociedad"])
    chequear("razón social", "AD ASTRA" in campos["Razón Social"].upper(), campos["Razón Social"])
    chequear("capital social", "32.500.000" in campos["Capital Social"], campos["Capital Social"])

    accionistas = campos["Accionistas y aportes"]
    lineas = [l for l in accionistas.splitlines() if l.strip()]
    chequear("2 accionistas, uno por línea", len(lineas) == 2, f"{len(lineas)} líneas")
    chequear("formato con pipes", all("|" in l for l in lineas), accionistas[:80])
    chequear("documento de cada accionista",
             "12.345.678-9" in accionistas and "9.876.543-2" in accionistas, accionistas[:80])
    chequear("porcentajes 65 y 35", "65" in accionistas and "35" in accionistas, accionistas[:80])

    rep = campos["Representante Legal"]
    chequear("representante con pipes", "|" in rep, rep[:80])
    chequear("representante con documento", "12.345.678-9" in rep, rep[:80])

    try:
        fac = json.loads(campos["Análisis de Facultades Específicas"])
        chequear("facultades es JSON con 3 claves",
                 {"compraVentaBienes", "operacionesBancarias", "mandatos"} <= set(fac))
        chequear("las 3 facultades en true", all(fac.get(k) for k in
                 ("compraVentaBienes", "operacionesBancarias", "mandatos")), str(fac))
    except (json.JSONDecodeError, TypeError):
        chequear("facultades es JSON válido", False, campos["Análisis de Facultades Específicas"][:80])

    if fallos:
        sys.exit(f"\n   {len(fallos)} verificación(es) fallaron: {', '.join(fallos)}")
    print("\n   OK: la ficha salió completa y con el formato que espera la comparación automática.")


if __name__ == "__main__":
    prueba_pdf_real()
    prueba_extraccion_real()
    print("\nTodo OK.\n")
