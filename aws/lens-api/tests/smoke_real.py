"""Prueba de humo CONTRA GEMINI DE VERDAD. No corre en pytest: gasta tokens.

    export GEMINI_API_KEY=...            # o se lee de .env.local
    python3 tests/smoke_real.py

Hace tres cosas que los tests con mocks no pueden hacer:

  1. Lee un PDF real por capa de texto y confirma que sale sin tocar el OCR.
  2. Manda una escritura sintética al modelo y verifica que vuelven los 18
     campos y que las personas salen en el formato `NOMBRE | DOCUMENTO | DATO`.
  3. Corre la composición societaria sobre un PDF sintético con una sociedad
     entre los dueños, que es lo único que ejercita las DOS pasadas: la tabla
     de propiedad y, por cada jurídica, su propia cadena.

Las escrituras son inventadas. No usar documentos de clientes acá.
"""

from __future__ import annotations

import base64
import io
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


# Segunda escritura: la de arriba solo tiene personas naturales, así que nunca
# dispara la pasada 2. Esta tiene una SOCIEDAD entre los dueños y, en una
# cláusula aparte con su propia tabla, quiénes son los socios de ESA sociedad.
# Es exactamente la trampa que el prompt advierte: los socios de la otra empresa
# NO son dueños de la principal, y si el modelo los mezcla la suma da 160.
ESCRITURA_CADENA = """
REPERTORIO N° 8.877-2024

CONSTITUCION DE SOCIEDAD POR ACCIONES
"NORTE ANDINO LOGISTICA SpA"

En Santiago de Chile, a cinco de julio de dos mil veinticuatro, ante mi, PEDRO
IGNACIO VALDES MUNOZ, Notario Publico Titular de la Quinta Notaria de Santiago,
comparecen: dona CLAUDIA ANDREA SILVA MORALES, chilena, casada, contadora
auditora, cedula nacional de identidad numero 15.223.981-4, domiciliada en
Avenida Vitacura 2939, oficina 1201, comuna de Las Condes; y en representacion
de "INVERSIONES CORDILLERA LIMITADA", sociedad del giro de su denominacion, Rol
Unico Tributario numero 76.554.221-8, don RODRIGO ESTEBAN TAPIA FUENTES, cedula
nacional de identidad numero 13.887.004-1; ambos mayores de edad y exponen:

PRIMERO: Constituyese una sociedad por acciones que girara bajo la razon social
"NORTE ANDINO LOGISTICA SpA". El Rol Unico Tributario de la sociedad es
77.902.331-5.

SEGUNDO: El domicilio de la sociedad sera la comuna de Las Condes, Region
Metropolitana, Republica de Chile.

TERCERO: El objeto social sera el transporte de carga por carretera, el
almacenamiento y deposito de mercaderias, y los servicios de logistica.

CUARTO: El capital social asciende a la suma de $80.000.000 (ochenta millones de
pesos), dividido en 2.000 acciones nominativas, sin valor nominal, suscritas y
pagadas de la siguiente forma:

  ACCIONISTA                              DOCUMENTO        ACCIONES   PARTICIPACION
  CLAUDIA ANDREA SILVA MORALES            15.223.981-4          600            30%
  INVERSIONES CORDILLERA LIMITADA         76.554.221-8        1.400            70%

QUINTO: La administracion correspondera a dona CLAUDIA ANDREA SILVA MORALES, en
calidad de Gerente General, quien tendra la representacion judicial y
extrajudicial de la sociedad.

SEXTO: Se deja constancia, para los efectos de lo dispuesto en la normativa
sobre conocimiento del cliente, de la composicion accionaria de la socia
INVERSIONES CORDILLERA LIMITADA, Rol Unico Tributario 76.554.221-8, la que a la
fecha de este instrumento es la siguiente:

  SOCIO DE INVERSIONES CORDILLERA LIMITADA   DOCUMENTO        PARTICIPACION
  RODRIGO ESTEBAN TAPIA FUENTES              13.887.004-1              55%
  PAOLA FERNANDA CASTRO LEIVA                16.440.772-K              45%

SEPTIMO: La duracion de la sociedad sera indefinida.
"""


def _pdf(texto: str) -> bytes:
    """La escritura como PDF con capa de texto.

    El modelo lee el ARCHIVO NATIVO en la ruta de composición societaria, así
    que un .txt no sirve para probarla: hay que mandarle un PDF de verdad.
    """
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    ancho, alto = letter
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


def prueba_shareholders_real() -> None:
    print("\n=== 3. Composición societaria (dos pasadas) contra Gemini ===")
    import gemini

    pdf = _pdf(ESCRITURA_CADENA)
    print(f"   PDF sintético: {len(pdf):,} bytes")

    socios, senales = gemini.extraer_shareholders("escritura_norte_andino.pdf", pdf)

    print(f"\n   llamadas al modelo : {senales['llamadas']}")
    print(f"   tokens in/out      : {senales['tokens_entrada']:,} / {senales['tokens_salida']:,}")
    print(f"   suma participación : {senales['suma_participacion']}"
          f"{'  ← SOSPECHOSA' if senales['participacion_sospechosa'] else ''}")

    def _linea(p, sangria=5):
        pct = p.get("ownershipPercentage")
        print(f"{' ' * sangria}{p.get('personType', '?'):<9} {str(p.get('shareholderName'))[:42]:<42} "
              f"{str(p.get('shareholderId') or '-'):<14} {pct if pct is not None else '-'}"
              f"{'  · ' + p['position'] if p.get('position') else ''}")

    print("\n   legalRepresentatives:")
    for p in socios["legalRepresentatives"]:
        _linea(p)
    print("   directOwnership:")
    for p in socios["directOwnership"]:
        _linea(p)
    print("   indirectShareholders:")
    for p in socios["indirectShareholders"]:
        _linea(p)
        for h in p.get("indirectShareholders") or []:
            _linea(h, sangria=9)

    print("\n   --- verificaciones ---")
    fallos = []

    def chequear(nombre: str, ok: bool, detalle: str = "") -> None:
        print(f"   {'OK  ' if ok else 'FALLA'} {nombre}{f' — {detalle}' if detalle and not ok else ''}")
        if not ok:
            fallos.append(nombre)

    directos = " ".join(str(p.get("shareholderName", "")).upper() for p in socios["directOwnership"])
    indirectos = socios["indirectShareholders"]
    nombres_ind = " ".join(str(p.get("shareholderName", "")).upper() for p in indirectos)

    chequear("la natural va a directOwnership", "SILVA" in directos, directos[:60])
    chequear("solo una dueña directa natural", len(socios["directOwnership"]) == 1,
             f"{len(socios['directOwnership'])}")
    chequear("la sociedad va a indirectShareholders", "CORDILLERA" in nombres_ind, nombres_ind[:60])
    chequear("una sola jurídica en la raíz", len(indirectos) == 1, f"{len(indirectos)}")

    # La pasada 2: los socios de la sociedad socia. Es lo que la SPA consiguió
    # 8 de 8 veces con el esquema plano y 6 de 8 con el anidado.
    hijos = indirectos[0].get("indirectShareholders") if indirectos else []
    nombres_hijos = " ".join(str(h.get("shareholderName", "")).upper() for h in (hijos or []))
    chequear("la cadena de la sociedad se resolvió", bool(hijos), "quedó vacía")
    chequear("los dos socios de la cadena", len(hijos or []) == 2, f"{len(hijos or [])}")
    chequear("TAPIA y CASTRO en la cadena",
             "TAPIA" in nombres_hijos and "CASTRO" in nombres_hijos, nombres_hijos[:70])

    # El chequeo que importa: los socios de la OTRA empresa no se colaron en la
    # tabla principal. Si se cuelan, la suma da 160 en vez de 100.
    chequear("la participación directa cierra en ~100",
             senales["suma_participacion"] is not None
             and abs(senales["suma_participacion"] - 100) <= 0.5,
             str(senales["suma_participacion"]))
    chequear("no se mezcló la tabla de la otra empresa",
             "TAPIA" not in directos and "CASTRO" not in directos, directos[:70])
    chequear("el representante legal salió con su cargo",
             any("SILVA" in str(p.get("shareholderName", "")).upper() and p.get("position")
                 for p in socios["legalRepresentatives"]),
             str(socios["legalRepresentatives"])[:70])
    chequear("dos llamadas: la tabla y una cadena", senales["llamadas"] == 2, str(senales["llamadas"]))

    if fallos:
        sys.exit(f"\n   {len(fallos)} verificación(es) fallaron: {', '.join(fallos)}")
    print("\n   OK: las dos pasadas devolvieron el contrato completo y la suma cierra.")


def prueba_varios_documentos_real() -> None:
    """El caso que se perdía: la tabla de propiedad NO está en la escritura.

    Es lo normal en un consolidado — la escritura constituye y un anexo trae la
    composición vigente. Medido en producción: mandando un solo archivo, la
    extracción perdía los accionistas en el 63 % de los consolidados de varios.
    """
    print("\n=== 4. La tabla de propiedad en OTRO archivo ===")
    import gemini

    i, j = ESCRITURA_CADENA.index("CUARTO:"), ESCRITURA_CADENA.index("QUINTO:")
    escritura_sin_tabla = ESCRITURA_CADENA[:i] + ESCRITURA_CADENA[j:]
    anexo_con_tabla = ("ANEXO DE COMPOSICION ACCIONARIA\n"
                       "NORTE ANDINO LOGISTICA SpA\n\n" + ESCRITURA_CADENA[i:j])

    a = ("company_deeds_document_1.pdf", _pdf(escritura_sin_tabla))
    b = ("company_complementary_document_2.pdf", _pdf(anexo_con_tabla))

    def correr(docs, etiqueta):
        r, s = gemini.extraer_shareholders(docs)
        gente = r["directOwnership"] + r["indirectShareholders"]
        print(f"\n   {etiqueta}")
        print(f"     dueños={len(gente)}  suma={s['suma_participacion']}  "
              f"sospechosa={s['participacion_sospechosa']}")
        for p in gente:
            print(f"       {p.get('personType'):<9} {str(p.get('shareholderName'))[:38]:<38} "
                  f"{p.get('ownershipPercentage')}")
        return gente

    solo = correr([a], "ANTES — solo la escritura (sin la tabla)")
    ambos = correr([a, b], "AHORA — escritura + anexo, en la misma llamada")

    print("\n   --- verificaciones ---")
    fallos = []

    def chequear(nombre, ok, detalle=""):
        print(f"   {'OK  ' if ok else 'FALLA'} {nombre}{f' — {detalle}' if detalle and not ok else ''}")
        if not ok:
            fallos.append(nombre)

    nom = lambda xs: " ".join(str(p.get("shareholderName", "")).upper() for p in xs)

    chequear("con los dos archivos salen los 2 dueños", len(ambos) == 2, f"{len(ambos)}")
    chequear("aparece la socia natural", "SILVA" in nom(ambos), nom(ambos)[:60])
    chequear("y la sociedad", "CORDILLERA" in nom(ambos), nom(ambos)[:60])
    pct = {str(p.get("shareholderName", "")).split()[0].upper(): p.get("ownershipPercentage")
           for p in ambos}
    chequear("los porcentajes son los de la tabla (30/70)",
             any(abs((v or 0) - 30) < 0.5 for v in pct.values())
             and any(abs((v or 0) - 70) < 0.5 for v in pct.values()), str(pct))

    # Lo que hacía el camino viejo, y por qué era peor que "faltar": con un solo
    # archivo el modelo no dice «no sé», INVENTA un reparto coherente. Da 100 y
    # pasa el chequeo de participación, así que nada lo delata.
    chequear("con un solo archivo la respuesta era incompleta",
             len(solo) < len(ambos), f"solo={len(solo)} ambos={len(ambos)}")
    if solo and len(solo) == 1 and (solo[0].get("ownershipPercentage") or 0) > 99:
        print("   NOTA  con un archivo le adjudicó el 100 % a un solo dueño: no faltaba")
        print("         un dato, había un dato INVENTADO que pasaba el chequeo de suma.")

    if fallos:
        sys.exit(f"\n   {len(fallos)} verificación(es) fallaron: {', '.join(fallos)}")
    print("\n   OK: lo que un solo archivo perdía, los dos lo recuperan.")


if __name__ == "__main__":
    prueba_pdf_real()
    prueba_extraccion_real()
    prueba_shareholders_real()
    prueba_varios_documentos_real()
    print("\nTodo OK.\n")
