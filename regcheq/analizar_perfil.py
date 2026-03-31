#!/usr/bin/env python3
"""
HERRAMIENTA: ANÁLISIS DE PERFIL CRIMINAL — Regcheq API
=======================================================
Analiza personas naturales y empresas contra listas de sanción,
PEP, GAFI, PDI, RTP, OFAC, ONU, UE y lista interna.

Uso rápido:
  python analizar_perfil.py --dni 12345678 --nombre "PEDRO" --apellido "PEREZ"
  python analizar_perfil.py --rut 76123456-7 --razon-social "Empresa SA" --tipo legal
  python analizar_perfil.py --dni 12345678 --solo-consultar
"""

import argparse
import json
import sys
from datetime import date

import regcheq_client as api

# ─── COLORES PARA TERMINAL ────────────────────────────────────────────────────
R = "\033[91m"   # rojo
Y = "\033[93m"   # amarillo
G = "\033[92m"   # verde
B = "\033[94m"   # azul
BOLD = "\033[1m"
RESET = "\033[0m"

RIESGO_COLOR = {"high": R, "medium": Y, "low": G}
RIESGO_LABEL = {"high": "ALTO", "medium": "MEDIO", "low": "BAJO"}


def color_riesgo(risk: str) -> str:
    c = RIESGO_COLOR.get(risk, "")
    label = RIESGO_LABEL.get(risk, risk.upper() if risk else "—")
    return f"{c}{BOLD}{label}{RESET}"


# ─── IMPRESIÓN DE RESULTADOS DE LISTAS ───────────────────────────────────────

NOMBRE_LISTA = {
    "keywordsResult":     "Keywords (cargo/posición)",
    "gafiResult":         "GAFI",
    "pepChile":           "PEP Chile",
    "funcPublicChile":    "Funcionario Público Chile",
    "pdiResult":          "PDI",
    "rtpResult":          "RTP (alto riesgo nacionalidad)",
    "internList":         "Lista Interna Empresa",
    "regcheqList":        "Lista Regcheq",
    "internationalOrgs":  "Org. Internacionales (OFAC/ONU/UE/PEP extranjero)",
}


def imprimir_listas(listas: dict):
    if not listas:
        print("  (sin datos de listas)")
        return
    alertas = []
    for clave, nombre in NOMBRE_LISTA.items():
        resultado = listas.get(clave)
        if resultado is None:
            continue
        coincide = resultado.get("coincidence", False)
        riesgo = resultado.get("risk", "")
        if coincide:
            label = color_riesgo(riesgo)
            data_str = ""
            if resultado.get("data"):
                data_str = f"  → {resultado['data']}"
            alertas.append((nombre, label, data_str))
            print(f"  {R}✗{RESET} {BOLD}{nombre}{RESET}: {label}{data_str}")
        else:
            print(f"  {G}✓{RESET} {nombre}: sin coincidencia")
    return alertas


def imprimir_separador(titulo=""):
    linea = "─" * 60
    if titulo:
        print(f"\n{BOLD}{B}{linea}{RESET}")
        print(f"{BOLD}{B}  {titulo}{RESET}")
        print(f"{BOLD}{B}{linea}{RESET}")
    else:
        print(f"{B}{linea}{RESET}")


def imprimir_ficha_resumen(ficha: dict):
    campos = [
        ("DNI/RUT",        ficha.get("dni") or ficha.get("rut")),
        ("Nombre",         " ".join(filter(None, [
                               ficha.get("name"), ficha.get("fatherName"),
                               ficha.get("motherName"), ficha.get("socialReason"),
                           ]))),
        ("Tipo",           ficha.get("personType")),
        ("Nacionalidad",   ficha.get("nationality")),
        ("País",           ficha.get("country")),
        ("Email",          ficha.get("email")),
        ("Cargo",          ficha.get("position")),
        ("Empleador",      ficha.get("employer")),
        ("Fecha nacim.",   ficha.get("birthDate")),
    ]
    for label, valor in campos:
        if valor:
            print(f"  {label:<16}: {valor}")


# ─── FLUJO PRINCIPAL ─────────────────────────────────────────────────────────

def analizar_persona_natural(args):
    imprimir_separador("ANÁLISIS PERSONA NATURAL")

    # PASO 1 — Crear/actualizar ficha (solo si no se pide solo consultar)
    if not args.solo_consultar:
        datos_ficha = {"dni": args.dni, "personType": "natural"}
        if args.nombre:
            datos_ficha["name"] = args.nombre.upper()
        if args.apellido:
            datos_ficha["fatherName"] = args.apellido.upper()
        if args.apellido_materno:
            datos_ficha["motherName"] = args.apellido_materno.upper()
        if args.email:
            datos_ficha["email"] = args.email
        if args.telefono:
            datos_ficha["phone"] = args.telefono
        if args.nacionalidad:
            datos_ficha["nationality"] = args.nacionalidad
        if args.pais:
            datos_ficha["country"] = args.pais
        if args.cargo:
            datos_ficha["position"] = args.cargo
        if args.empleador:
            datos_ficha["employer"] = args.empleador
        if args.fecha_nacimiento:
            datos_ficha["birthDate"] = args.fecha_nacimiento

        print(f"\n{BOLD}Paso 1 — Registrando ficha...{RESET}")
        try:
            resp_ficha = api.crear_ficha(datos_ficha)
            print(f"  {G}OK{RESET} Ficha registrada/actualizada")
            if args.verbose:
                print(json.dumps(resp_ficha, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"  {R}ERROR{RESET} al crear ficha: {e}")
            sys.exit(1)

    # PASO 2 — Consultar perfil completo
    print(f"\n{BOLD}Paso 2 — Consultando perfil y listas...{RESET}")
    try:
        perfil = api.obtener_ficha(args.dni)
    except Exception as e:
        print(f"  {R}ERROR{RESET} al consultar ficha: {e}")
        sys.exit(1)

    imprimir_separador("DATOS DE LA FICHA")
    imprimir_ficha_resumen(perfil)

    riesgo_efectivo = perfil.get("effectiveRisk", perfil.get("calculatedRisk", "—"))
    pep_level = perfil.get("pepLevel")
    print(f"\n  {'Riesgo efectivo':<16}: {color_riesgo(riesgo_efectivo)}")
    if pep_level:
        print(f"  {'Nivel PEP':<16}: {Y}{BOLD}{pep_level}{RESET}")

    imprimir_separador("RESULTADOS DE LISTAS")
    listas = perfil.get("listas", {})
    imprimir_listas(listas)

    # PASO 3 — Verificar lista interna
    print(f"\n{BOLD}Paso 3 — Verificando lista interna de interés...{RESET}")
    en_lista_interna = False
    try:
        lista_interna = api.obtener_lista_interes()
        coincidencias = [r for r in lista_interna if str(r.get("dni")) == str(args.dni)]
        if coincidencias:
            en_lista_interna = True
            for r in coincidencias:
                estado = r.get("status", "")
                razon = r.get("reason", "")
                print(f"  {R}ALERTA{RESET} Ya registrado en lista interna")
                print(f"  Estado: {estado} | Razón: {razon}")
        else:
            print(f"  {G}OK{RESET} No está en lista interna")
    except Exception as e:
        print(f"  {Y}AVISO{RESET} No se pudo consultar lista interna: {e}")

    # PASO 4 — Crear operación si se especificó monto
    id_operacion = None
    if args.monto:
        print(f"\n{BOLD}Paso 4 — Registrando operación (monto: {args.monto})...{RESET}")
        nombre_completo = " ".join(filter(None, [
            args.nombre, args.apellido, args.apellido_materno
        ])) or perfil.get("name", "")
        payload_op = {
            "operations": [{
                "dni": args.dni,
                "type": "natural",
                "monto": float(args.monto),
                "efective": float(args.efectivo or 0),
                "currency": args.moneda or "$",
                "ficha": {
                    "name": args.nombre or perfil.get("name", ""),
                    "fatherName": args.apellido or perfil.get("fatherName", ""),
                    "nationality": args.nacionalidad or perfil.get("nationality", ""),
                    "country": args.pais or perfil.get("country", ""),
                }
            }],
            "transactions": {
                "referenceNumber": args.referencia or f"REF-{args.dni}-{date.today().isoformat()}",
                "transactionType": args.tipo_transaccion or "Operación",
                "transactionDate": date.today().isoformat(),
            }
        }
        try:
            resp_op = api.crear_operacion(payload_op)
            id_operacion = resp_op.get("id") or resp_op.get("_id")
            print(f"  {G}OK{RESET} Operación creada | ID: {id_operacion}")
            if args.verbose:
                print(json.dumps(resp_op, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"  {R}ERROR{RESET} al crear operación: {e}")

    # PASO 5 — Consultar operación si existe
    if id_operacion:
        print(f"\n{BOLD}Paso 5 — Consultando estado de operación {id_operacion}...{RESET}")
        try:
            op_detalle = api.obtener_operacion(id_operacion)
            estado = op_detalle.get("status", "—")
            print(f"  Estado: {estado}")
            if args.verbose:
                print(json.dumps(op_detalle, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"  {Y}AVISO{RESET} No se pudo consultar operación: {e}")

    # PASO 6 (CONDICIONAL) — Agregar a lista interna si hay alertas
    imprimir_separador("EVALUACIÓN FINAL")
    hay_alertas = (
        riesgo_efectivo in ("high", "medium") or
        any(v.get("coincidence") for v in listas.values() if isinstance(v, dict)) or
        en_lista_interna
    )

    if hay_alertas:
        print(f"  {R}{BOLD}⚠ ALERTAS DETECTADAS{RESET}")
        print(f"  Riesgo: {color_riesgo(riesgo_efectivo)}")
        if pep_level:
            print(f"  PEP nivel: {pep_level}")

        if not en_lista_interna and args.agregar_lista:
            razon = args.razon_lista or f"Riesgo {riesgo_efectivo} detectado automáticamente"
            nombre_completo = " ".join(filter(None, [
                args.nombre, args.apellido
            ])) or perfil.get("name", args.dni)
            print(f"\n  Registrando en lista interna de interés...")
            try:
                api.agregar_lista_interes(args.dni, nombre_completo, "natural", razon)
                print(f"  {G}OK{RESET} Registrado en lista interna")
            except Exception as e:
                print(f"  {R}ERROR{RESET}: {e}")
        elif hay_alertas and not en_lista_interna:
            print(f"\n  {Y}SUGERENCIA:{RESET} Considera agregar a lista interna con --agregar-lista")
    else:
        print(f"  {G}{BOLD}SIN ALERTAS — Perfil limpio{RESET}")

    print()


def analizar_empresa(args):
    imprimir_separador("ANÁLISIS EMPRESA (PERSONA JURÍDICA)")

    dni_empresa = args.rut or args.dni

    # PASO 1 — Crear/actualizar ficha empresa
    if not args.solo_consultar:
        datos_empresa = {
            "dni": dni_empresa,
            "personType": "legal",
            "dniType": "RUT",
        }
        if args.razon_social:
            datos_empresa["socialReason"] = args.razon_social
        if args.nombre_fantasia:
            datos_empresa["fantasyName"] = args.nombre_fantasia
        if args.email:
            datos_empresa["email"] = args.email
        if args.telefono:
            datos_empresa["phone"] = args.telefono
        if args.nacionalidad:
            datos_empresa["nationality"] = args.nacionalidad
        if args.pais:
            datos_empresa["country"] = args.pais
        if args.tipo_empresa:
            datos_empresa["businessType"] = args.tipo_empresa

        # Personas relacionadas (representante mínimo)
        relacionados = []
        if args.rep_dni:
            rel = {
                "dni": args.rep_dni,
                "personType": "natural",
                "type": "representant",
            }
            if args.rep_nombre:
                rel["name"] = args.rep_nombre.upper()
            if args.rep_apellido:
                rel["fatherName"] = args.rep_apellido.upper()
            relacionados.append(rel)
        if args.ben_dni:
            rel = {
                "dni": args.ben_dni,
                "personType": "natural",
                "type": "beneficiary",
            }
            if args.ben_nombre:
                rel["name"] = args.ben_nombre.upper()
            if args.ben_apellido:
                rel["fatherName"] = args.ben_apellido.upper()
            relacionados.append(rel)
        if relacionados:
            datos_empresa["personsRelations"] = relacionados

        print(f"\n{BOLD}Paso 1 — Registrando ficha empresa...{RESET}")
        try:
            resp = api.crear_ficha(datos_empresa)
            print(f"  {G}OK{RESET} Ficha empresa registrada/actualizada")
            if args.verbose:
                print(json.dumps(resp, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"  {R}ERROR{RESET}: {e}")
            sys.exit(1)

    # PASO 2 — Consultar ficha empresa
    print(f"\n{BOLD}Paso 2 — Consultando perfil empresa...{RESET}")
    try:
        perfil_empresa = api.obtener_ficha(dni_empresa)
    except Exception as e:
        print(f"  {R}ERROR{RESET}: {e}")
        sys.exit(1)

    imprimir_separador("DATOS EMPRESA")
    imprimir_ficha_resumen(perfil_empresa)
    riesgo_empresa = perfil_empresa.get("effectiveRisk", perfil_empresa.get("calculatedRisk", "—"))
    print(f"\n  {'Riesgo efectivo':<16}: {color_riesgo(riesgo_empresa)}")

    imprimir_separador("LISTAS — EMPRESA")
    listas_empresa = perfil_empresa.get("listas", {})
    imprimir_listas(listas_empresa)

    # PASO 3 — Consultar cada persona relacionada
    personas_relacionadas = perfil_empresa.get("personsRelations", [])
    if personas_relacionadas:
        imprimir_separador("PERSONAS RELACIONADAS")
        for persona in personas_relacionadas:
            p_dni = persona.get("dni")
            p_tipo = persona.get("type", "relacionado")
            p_nombre = " ".join(filter(None, [
                persona.get("name"), persona.get("fatherName")
            ]))
            print(f"\n  {BOLD}[{p_tipo.upper()}]{RESET} {p_nombre} — DNI: {p_dni}")
            if p_dni:
                try:
                    perfil_p = api.obtener_ficha(p_dni)
                    riesgo_p = perfil_p.get("effectiveRisk", perfil_p.get("calculatedRisk", "—"))
                    pep_p = perfil_p.get("pepLevel")
                    print(f"  Riesgo: {color_riesgo(riesgo_p)}", end="")
                    if pep_p:
                        print(f" | PEP nivel: {Y}{BOLD}{pep_p}{RESET}", end="")
                    print()
                    listas_p = perfil_p.get("listas", {})
                    imprimir_listas(listas_p)
                except Exception as e:
                    print(f"  {Y}No se pudo consultar: {e}{RESET}")

    # PASO 4 — Crear operación si hay monto
    id_operacion = None
    if args.monto:
        print(f"\n{BOLD}Paso 4 — Registrando operación empresa...{RESET}")
        op_ficha = {"socialReason": args.razon_social or perfil_empresa.get("socialReason", "")}
        if args.email:
            op_ficha["email"] = args.email
        if args.nacionalidad:
            op_ficha["nationality"] = args.nacionalidad

        op_entry = {
            "dni": dni_empresa,
            "type": "legal",
            "monto": float(args.monto),
            "efective": float(args.efectivo or 0),
            "currency": args.moneda or "$",
            "ficha": op_ficha,
        }
        if personas_relacionadas:
            op_entry["personsRelations"] = personas_relacionadas[:1]  # al menos 1

        payload_op = {
            "operations": [op_entry],
            "transactions": {
                "referenceNumber": args.referencia or f"EMP-{dni_empresa}-{date.today().isoformat()}",
                "transactionType": args.tipo_transaccion or "Operación Empresa",
                "transactionDate": date.today().isoformat(),
            }
        }
        try:
            resp_op = api.crear_operacion(payload_op)
            id_operacion = resp_op.get("id") or resp_op.get("_id")
            print(f"  {G}OK{RESET} Operación creada | ID: {id_operacion}")
        except Exception as e:
            print(f"  {R}ERROR{RESET}: {e}")

    # Evaluación final
    imprimir_separador("EVALUACIÓN FINAL — EMPRESA")
    hay_alertas = (
        riesgo_empresa in ("high", "medium") or
        any(v.get("coincidence") for v in listas_empresa.values() if isinstance(v, dict))
    )
    if hay_alertas:
        print(f"  {R}{BOLD}⚠ ALERTAS DETECTADAS EN EMPRESA{RESET}")
        print(f"  Riesgo empresa: {color_riesgo(riesgo_empresa)}")
        if args.agregar_lista:
            nombre = args.razon_social or perfil_empresa.get("socialReason", dni_empresa)
            razon = args.razon_lista or f"Riesgo {riesgo_empresa} detectado automáticamente"
            try:
                api.agregar_lista_interes(dni_empresa, nombre, "legal", razon)
                print(f"  {G}OK{RESET} Empresa registrada en lista interna")
            except Exception as e:
                print(f"  {R}ERROR{RESET}: {e}")
        else:
            print(f"  {Y}SUGERENCIA:{RESET} Usa --agregar-lista para registrar en lista interna")
    else:
        print(f"  {G}{BOLD}SIN ALERTAS — Empresa sin coincidencias{RESET}")

    print()


# ─── ARGPARSE ─────────────────────────────────────────────────────────────────

def build_parser():
    p = argparse.ArgumentParser(
        description="Análisis de perfil criminal via Regcheq API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Persona natural — solo consultar por DNI
  python analizar_perfil.py --dni 12345678 --solo-consultar

  # Persona natural — registrar y analizar
  python analizar_perfil.py --dni 12345678 --nombre PEDRO --apellido PEREZ \\
    --nacionalidad Chile --cargo Gerente

  # Persona natural — con operación y agregar a lista si hay alertas
  python analizar_perfil.py --dni 12345678 --nombre PEDRO --apellido PEREZ \\
    --monto 5000000 --agregar-lista

  # Empresa
  python analizar_perfil.py --tipo legal --rut 76123456-7 \\
    --razon-social "Empresa SA" --rep-dni 12345678 --rep-nombre PEDRO

  # Ver respuesta completa JSON
  python analizar_perfil.py --dni 12345678 --solo-consultar --verbose
        """
    )

    # Identificadores
    id_g = p.add_argument_group("Identificador")
    id_g.add_argument("--dni",  help="RUN/DNI persona natural")
    id_g.add_argument("--rut",  help="RUT empresa (alias de --dni para personas legales)")
    id_g.add_argument("--tipo", choices=["natural", "legal"], default="natural",
                      help="Tipo de persona (default: natural)")

    # Persona natural
    nat_g = p.add_argument_group("Datos persona natural")
    nat_g.add_argument("--nombre",            help="Nombre (sin apellidos)")
    nat_g.add_argument("--apellido",          help="Apellido paterno")
    nat_g.add_argument("--apellido-materno",  help="Apellido materno")
    nat_g.add_argument("--fecha-nacimiento",  help="Fecha nacimiento YYYY-MM-DD")
    nat_g.add_argument("--cargo",             help="Cargo o posición")
    nat_g.add_argument("--empleador",         help="Empleador")

    # Empresa
    emp_g = p.add_argument_group("Datos empresa")
    emp_g.add_argument("--razon-social",    help="Razón social de la empresa")
    emp_g.add_argument("--nombre-fantasia", help="Nombre de fantasía")
    emp_g.add_argument("--tipo-empresa",    help="Tipo de empresa (SA, SpA, etc.)")
    emp_g.add_argument("--rep-dni",         help="DNI del representante legal")
    emp_g.add_argument("--rep-nombre",      help="Nombre del representante")
    emp_g.add_argument("--rep-apellido",    help="Apellido del representante")
    emp_g.add_argument("--ben-dni",         help="DNI del beneficiario final")
    emp_g.add_argument("--ben-nombre",      help="Nombre del beneficiario")
    emp_g.add_argument("--ben-apellido",    help="Apellido del beneficiario")

    # Campos comunes
    com_g = p.add_argument_group("Datos comunes")
    com_g.add_argument("--email",         help="Email de contacto")
    com_g.add_argument("--telefono",      help="Teléfono")
    com_g.add_argument("--nacionalidad",  help="Nacionalidad")
    com_g.add_argument("--pais",          help="País de residencia")

    # Operación
    op_g = p.add_argument_group("Operación / transacción")
    op_g.add_argument("--monto",             type=float, help="Monto de la operación en pesos")
    op_g.add_argument("--efectivo",          type=float, default=0, help="Monto en efectivo")
    op_g.add_argument("--moneda",            default="$", help="Moneda (default: $)")
    op_g.add_argument("--referencia",        help="Número de referencia de la operación")
    op_g.add_argument("--tipo-transaccion",  help="Tipo de transacción (ej: Compraventa)")

    # Comportamiento
    ctrl_g = p.add_argument_group("Control")
    ctrl_g.add_argument("--solo-consultar",  action="store_true",
                        help="No crea/actualiza ficha, solo consulta")
    ctrl_g.add_argument("--agregar-lista",   action="store_true",
                        help="Agrega a lista interna si se detectan alertas")
    ctrl_g.add_argument("--razon-lista",     help="Razón para agregar a lista interna")
    ctrl_g.add_argument("--verbose", "-v",   action="store_true",
                        help="Imprime respuestas JSON completas")

    return p


def main():
    parser = build_parser()
    args = parser.parse_args()

    # Validaciones básicas
    dni = args.dni or args.rut
    if not dni:
        parser.error("Se requiere --dni o --rut")

    if args.tipo == "legal" or args.rut:
        args.tipo = "legal"
        if not args.rut:
            args.rut = args.dni
        analizar_empresa(args)
    else:
        analizar_persona_natural(args)


if __name__ == "__main__":
    main()
