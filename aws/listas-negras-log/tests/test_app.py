"""lens-listas-negras-log: el registro durable y su espejo en Redshift.

Lo que se protege:
  · el actor sale del evento que arma el Worker, nunca del registro que manda el navegador;
  · un intento se guarda una vez, y el resultado lo cierra solo quien lo empezó;
  · el espejo es idempotente y no depende del orden: correrlo dos veces, o con
    los cambios en otro orden, deja las mismas tablas;
  · lo que no entró a Redshift sigue pendiente, también si cambió mientras se espejaba.

DynamoDB se simula con una tabla en memoria que interpreta las expresiones que
usa el Lambda. Redshift, con SQLite corriendo EL MISMO SQL que se genera
(`listas_negras` es una base adjunta y `JSON_PARSE` una función registrada).

Todos los datos son inventados.
"""

from __future__ import annotations

import copy
import json
import re
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import app  # noqa: E402

ACTOR = {"email": "analista@global66.com", "nombre": "Analista Prueba", "uid": "uid-1"}
OTRO = {"email": "otra@global66.com", "nombre": "Otra", "uid": "uid-2"}


# ── DynamoDB en memoria ─────────────────────────────────────────────────────

class CondicionFallida(Exception):
    def __str__(self):
        return "ConditionalCheckFailedException"


class TablaFalsa:
    def __init__(self):
        self.items: dict[str, dict] = {}
        self.al_actualizar = None   # gancho para simular escrituras concurrentes

    @staticmethod
    def _nombre(x, nombres):
        return nombres.get(x, x)

    def _cumple(self, item, cond, nombres, valores):
        if not cond:
            return True
        for parte in cond.split(" AND "):
            parte = parte.strip()
            m = re.fullmatch(r"attribute_(not_)?exists\((\S+)\)", parte)
            if m:
                existe = self._nombre(m.group(2), nombres) in item
                if existe == bool(m.group(1)):
                    return False
                continue
            a, v = [x.strip() for x in parte.split("=")]
            if item.get(self._nombre(a, nombres)) != valores[v]:
                return False
        return True

    def put_item(self, Item, ConditionExpression=None):
        actual = self.items.get(Item["cambio_id"], {})
        if ConditionExpression and not self._cumple(actual, ConditionExpression, {}, {}):
            raise CondicionFallida()
        self.items[Item["cambio_id"]] = copy.deepcopy(Item)

    def get_item(self, Key):
        it = self.items.get(Key["cambio_id"])
        return {"Item": copy.deepcopy(it)} if it else {}

    def update_item(self, Key, UpdateExpression, ExpressionAttributeValues=None,
                    ExpressionAttributeNames=None, ConditionExpression=None):
        nombres, valores = ExpressionAttributeNames or {}, ExpressionAttributeValues or {}
        item = self.items.get(Key["cambio_id"], {})
        if not self._cumple(item, ConditionExpression, nombres, valores):
            raise CondicionFallida()
        item = copy.deepcopy(item) or dict(Key)
        for clausula in re.split(r"\s(?=SET |ADD |REMOVE )", " " + UpdateExpression):
            clausula = clausula.strip()
            if not clausula:
                continue
            verbo, resto = clausula.split(" ", 1)
            for parte in resto.split(","):
                parte = parte.strip()
                if verbo == "SET":
                    a, v = [x.strip() for x in parte.split("=")]
                    item[self._nombre(a, nombres)] = valores[v]
                elif verbo == "ADD":
                    a, v = parte.split()
                    item[self._nombre(a, nombres)] = item.get(self._nombre(a, nombres), 0) + valores[v]
                elif verbo == "REMOVE":
                    item.pop(self._nombre(parte, nombres), None)
        self.items[Key["cambio_id"]] = item
        if self.al_actualizar:
            self.al_actualizar(Key["cambio_id"])

    def query(self, IndexName, KeyConditionExpression, ExpressionAttributeValues, ExclusiveStartKey=None):
        assert IndexName == "pendientes"
        return {"Items": [copy.deepcopy(i) for i in self.items.values() if i.get("pendiente") == "S"]}

    def batch_writer(self, overwrite_by_pkeys=None):
        tabla = self

        class _B:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def put_item(self, Item):
                tabla.items[Item["cambio_id"]] = copy.deepcopy(Item)
        return _B()


# ── Redshift en SQLite ──────────────────────────────────────────────────────

COLUMNAS_REGISTRO = ("registro_id", "lista", "valor", "country_code", "country_name", "account_type", "reason",
                     "admin_id", "activo", "flujo_alta", "ejecucion_id_alta", "creado_por", "creado_en",
                     "actualizado_por", "actualizado_en")


class RedshiftFalso:
    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("ATTACH DATABASE ':memory:' AS listas_negras")
        self.db.create_function("JSON_PARSE", 1, lambda s: s)
        self.db.execute(f"CREATE TABLE listas_negras.cambio ({', '.join(c for c, _ in app.COLUMNAS_CAMBIO)})")
        self.db.execute(f"CREATE TABLE listas_negras.registro ({', '.join(COLUMNAS_REGISTRO)})")
        self.pausado = False
        self.lotes: list[list[str]] = []
        self.durante = None

    def batch_execute_statement(self, ClusterIdentifier, Database, DbUser, Sqls):
        if self.pausado:
            raise RuntimeError("Cluster compliance-redshift-cluster is not available")
        self.lotes.append(Sqls)
        with self.db:   # una transacción, como BatchExecuteStatement
            for s in Sqls:
                self.db.execute(s)
        if self.durante:
            self.durante()
        return {"Id": "x"}

    def describe_statement(self, Id):
        return {"Status": "FINISHED"}

    def filas(self, tabla, orden):
        cur = self.db.execute(f"SELECT * FROM listas_negras.{tabla} ORDER BY {orden}")
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]

    def foto(self):
        cambio = [{k: v for k, v in f.items() if k != "cargado_en"} for f in self.filas("cambio", "cambio_id")]
        return cambio, self.filas("registro", "registro_id")


def http(tabla, cuerpo, secreto="secreto-prueba"):
    r = app.manejar_http({"headers": {"X-Api-Secret": secreto}, "body": json.dumps(cuerpo)}, tabla)
    return r["statusCode"], json.loads(r["body"])


def intento(tabla, cambio, lista="DNI", operacion="CREAR", registro=None, meta=None, actor=ACTOR,
            flujo="lens.regcheq.listas_negras.carga"):
    return http(tabla, {"accion": "intento", "cambioId": cambio, "ejecucionId": "ej-1", "lista": lista,
                        "operacion": operacion, "flujo": flujo, "servicio": f"/admin/listas-negras/{lista.lower()}",
                        "actor": actor, "registro": registro or {"dni": "99887766", "countryCode": "CO",
                                                                 "countryName": "Colombia", "reason": "Prueba"},
                        "meta": meta or {}})


def resultado(tabla, cambio, ok=True, status=200, respuesta=None, actor=ACTOR):
    return http(tabla, {"accion": "resultado", "cambioId": cambio, "ok": ok, "httpStatus": status,
                        "respuesta": respuesta, "actor": actor, **({} if ok else {"error": "HTTP 400"})})


# ════════════════════════════════════════════════════════════════════════════
# El registro durable
# ════════════════════════════════════════════════════════════════════════════

def test_sin_secreto_no_registra():
    t = TablaFalsa()
    assert http(t, {"accion": "intento"}, secreto="otro")[0] == 401
    assert not t.items


def test_el_intento_se_guarda_con_el_actor_del_worker_y_pendiente():
    t = TablaFalsa()
    assert intento(t, "c-1")[0] == 200
    it = t.items["c-1"]
    assert (it["actor_email"], it["actor_uid"], it["estado"], it["pendiente"]) == (
        ACTOR["email"], "uid-1", "INTENTO", "S")
    assert it["registro_id"] == app.registro_id("DNI", "99887766", "CO")
    assert it["estado_nuevo"] is True and it["clave"] == "99887766"


def test_el_actor_no_se_puede_inyectar_desde_el_registro():
    """El navegador no elige el actor: lo que venga en el registro queda en el
    cuerpo enviado y nada más."""
    t = TablaFalsa()
    intento(t, "c-1", registro={"dni": "1", "countryCode": "CO", "countryName": "Colombia", "reason": "x",
                                "actor_email": "falso@global66.com"},
            meta={"actor": {"email": "falso@global66.com"}})
    assert t.items["c-1"]["actor_email"] == ACTOR["email"]


def test_sin_actor_o_con_un_actor_de_otro_dominio_no_registra():
    t = TablaFalsa()
    assert intento(t, "c-1", actor={})[0] == 400
    assert intento(t, "c-2", actor={"email": "alguien@gmail.com"})[0] == 400
    assert not t.items


def test_repetir_el_intento_no_lo_pisa():
    t = TablaFalsa()
    intento(t, "c-1")
    resultado(t, "c-1")
    assert intento(t, "c-1")[0] == 200
    assert t.items["c-1"]["estado"] == "CERRADO"


@pytest.mark.parametrize("operacion,lista,registro,meta,ok,esperado", [
    ("CREAR", "DNI", None, {}, True, "CREADO"),
    ("EDITAR", "DNI", {"dni": "1", "countryCode": "CO", "status": False}, {"estadoAnterior": True}, True, "DESACTIVADO"),
    ("EDITAR", "DNI", {"dni": "1", "countryCode": "CO", "status": True}, {"estadoAnterior": False}, True, "ACTIVADO"),
    ("EDITAR", "DOMINIO", {"id": 7, "status": True, "reason": "Nueva"}, {"estadoAnterior": True, "valor": "x.prueba"},
     True, "EDITADO"),
    ("CREAR", "DNI", None, {}, False, "ERROR"),
])
def test_el_resultado_sale_de_la_operacion_y_de_los_estados(operacion, lista, registro, meta, ok, esperado):
    t = TablaFalsa()
    intento(t, "c-1", lista=lista, operacion=operacion, registro=registro, meta=meta)
    assert resultado(t, "c-1", ok=ok, status=200 if ok else 400)[1]["resultado"] == esperado


def test_el_resultado_solo_lo_cierra_quien_empezo():
    t = TablaFalsa()
    intento(t, "c-1")
    assert resultado(t, "c-1", actor=OTRO)[0] == 400
    assert t.items["c-1"]["estado"] == "INTENTO"


def test_el_id_que_devuelve_admin_al_crear_queda():
    t = TablaFalsa()
    intento(t, "c-1", lista="CUENTA", registro={"countryCode": "CO", "accountNumber": "30 0000 0001",
                                                "accountType": "Electronic", "enable": True, "reason": "x"})
    resultado(t, "c-1", respuesta={"data": {"id": 321}})
    assert t.items["c-1"]["admin_id"] == "321"
    assert t.items["c-1"]["clave"] == "3000000001"


def test_el_dominio_de_una_edicion_sale_de_meta():
    t = TablaFalsa()
    intento(t, "c-1", lista="DOMINIO", operacion="EDITAR", registro={"id": 7, "status": False, "reason": "x"},
            meta={"valor": "Usuario@Desechable.Prueba", "estadoAnterior": True})
    assert t.items["c-1"]["clave"] == "desechable.prueba"


def test_las_filas_sin_operacion_quedan_cerradas_y_pendientes():
    t = TablaFalsa()
    s, c = http(t, {"accion": "sin_operacion", "ejecucionId": "ej-1", "lista": "DNI", "actor": ACTOR,
                    "flujo": "lens.regcheq.listas_negras.carga", "servicio": "/admin/listas-negras/dni/sin-operacion",
                    "filas": [{"cambioId": "c-9", "valor": "99887766", "countryCode": "CO",
                               "resultado": "OMITIDO_YA_EXISTE_ACTIVO"}]})
    assert (s, c["registrados"]) == (200, 1)
    assert t.items["c-9"]["operacion"] == "CREAR" and t.items["c-9"]["estado"] == "CERRADO"


def test_una_fila_sin_operacion_no_puede_decir_que_creo_algo():
    t = TablaFalsa()
    s, _ = http(t, {"accion": "sin_operacion", "ejecucionId": "ej-1", "lista": "DNI", "actor": ACTOR,
                    "flujo": "lens.regcheq.listas_negras.carga",
                    "filas": [{"cambioId": "c-9", "valor": "1", "resultado": "CREADO"}]})
    assert s == 400 and not t.items


def test_si_dynamo_falla_responde_503_sin_el_contenido():
    class Rota(TablaFalsa):
        def put_item(self, **_):
            raise RuntimeError("ProvisionedThroughputExceeded 99887766")
    s, c = intento(Rota(), "c-1")
    assert s == 503
    assert "99887766" not in json.dumps(c)


# ════════════════════════════════════════════════════════════════════════════
# El espejo
# ════════════════════════════════════════════════════════════════════════════

AHORA = datetime(2026, 10, 23, 15, 0, tzinfo=timezone.utc)


def _alta_y_baja(t):
    intento(t, "c-1")
    resultado(t, "c-1")
    intento(t, "c-2", operacion="EDITAR", flujo="lens.regcheq.listas_negras.edicion",
            registro={"dni": "99887766", "countryCode": "CO", "status": False}, meta={"estadoAnterior": True})
    resultado(t, "c-2")


def test_el_espejo_escribe_cambio_y_recalcula_registro():
    t, r = TablaFalsa(), RedshiftFalso()
    _alta_y_baja(t)
    assert app.espejar(t, r, AHORA)["espejados"] == 2
    cambio, registro = r.foto()
    assert [c["resultado"] for c in cambio] == ["CREADO", "DESACTIVADO"]
    assert len(registro) == 1
    reg = registro[0]
    assert reg["activo"] == 0
    assert reg["flujo_alta"] == "lens.regcheq.listas_negras.carga"
    assert reg["creado_por"] == ACTOR["email"] and reg["actualizado_por"] == ACTOR["email"]
    assert reg["reason"] == "Prueba" and reg["country_name"] == "Colombia"
    assert not any(i.get("pendiente") for i in t.items.values())


def test_correr_el_espejo_dos_veces_deja_lo_mismo():
    t, r = TablaFalsa(), RedshiftFalso()
    _alta_y_baja(t)
    app.espejar(t, r, AHORA)
    antes = r.foto()
    for i in t.items.values():            # un reintento que vuelve a mandar todo
        i["pendiente"] = "S"
    app.espejar(t, r, AHORA)
    assert r.foto() == antes


def test_el_orden_en_que_llegan_los_cambios_no_importa():
    """Los mismos eventos: todos juntos, o primero la baja y después el alta."""
    base = TablaFalsa()
    _alta_y_baja(base)

    t1, r1 = TablaFalsa(), RedshiftFalso()
    t1.items = copy.deepcopy(base.items)
    app.espejar(t1, r1, AHORA)

    t2, r2 = TablaFalsa(), RedshiftFalso()
    t2.items = copy.deepcopy(base.items)
    t2.items["c-1"].pop("pendiente")       # primero solo la baja
    app.espejar(t2, r2, AHORA)
    assert r2.foto()[1][0]["flujo_alta"] is None     # todavía no se sabe quién lo agregó
    t2.items["c-1"]["pendiente"] = "S"     # después el alta
    app.espejar(t2, r2, AHORA)
    assert r2.foto() == r1.foto()


def test_un_registro_solo_editado_no_inventa_quien_lo_agrego():
    t, r = TablaFalsa(), RedshiftFalso()
    intento(t, "c-1", operacion="EDITAR", flujo="lens.regcheq.listas_negras.edicion",
            registro={"dni": "11", "countryCode": "CO", "status": False}, meta={"estadoAnterior": True})
    resultado(t, "c-1")
    app.espejar(t, r, AHORA)
    reg = r.foto()[1][0]
    assert reg["flujo_alta"] is None and reg["creado_por"] is None
    assert reg["activo"] == 0 and reg["actualizado_por"] == ACTOR["email"]


def test_las_omitidas_van_a_cambio_y_no_tocan_registro():
    t, r = TablaFalsa(), RedshiftFalso()
    http(t, {"accion": "sin_operacion", "ejecucionId": "ej-1", "lista": "DNI", "actor": ACTOR,
             "flujo": "lens.regcheq.listas_negras.carga",
             "filas": [{"cambioId": "c-9", "valor": "99887766", "countryCode": "CO",
                        "resultado": "OMITIDO_YA_EXISTE_INACTIVO"}]})
    app.espejar(t, r, AHORA)
    cambio, registro = r.foto()
    assert [c["resultado"] for c in cambio] == ["OMITIDO_YA_EXISTE_INACTIVO"]
    assert registro == []


def test_un_intento_reciente_sin_resultado_espera_y_uno_viejo_sale_sin_confirmar():
    t, r = TablaFalsa(), RedshiftFalso()
    intento(t, "c-1")
    ahora = app._parse_ts(t.items["c-1"]["ocurrido_en"])
    assert app.espejar(t, r, ahora + timedelta(minutes=5))["esperando"] == 1
    assert r.foto()[0] == []
    app.espejar(t, r, ahora + timedelta(minutes=31))
    c = r.foto()[0][0]
    assert c["resultado"] == "SIN_CONFIRMAR" and "no se sabe" in c["error"]
    assert r.foto()[1] == []          # sin confirmar no es un cambio efectivo


def test_con_el_cluster_pausado_todo_sigue_pendiente():
    t, r = TablaFalsa(), RedshiftFalso()
    _alta_y_baja(t)
    r.pausado = True
    with pytest.raises(app.ClusterNoDisponible):
        app.espejar(t, r, AHORA)
    assert all(i.get("pendiente") == "S" for i in t.items.values())


def test_lo_que_cambia_mientras_se_espeja_queda_pendiente():
    """Un id que llega en medio del espejo sube la versión: el ítem no se
    baja de pendientes y entra en la próxima corrida."""
    t, r = TablaFalsa(), RedshiftFalso()
    intento(t, "c-1", lista="CUENTA", registro={"countryCode": "CO", "accountNumber": "3000000001",
                                                "accountType": None, "enable": True, "reason": "x"})
    resultado(t, "c-1")
    r.durante = lambda: http(t, {"accion": "ids", "actor": ACTOR, "ids": [{"cambioId": "c-1", "adminId": "55"}]})
    app.espejar(t, r, AHORA)
    assert t.items["c-1"].get("pendiente") == "S"
    r.durante = None
    app.espejar(t, r, AHORA)
    assert r.foto()[0][0]["admin_id"] == "55"
    assert r.foto()[1][0]["admin_id"] == "55"


def test_un_id_no_se_completa_dos_veces_ni_por_otro_actor():
    t = TablaFalsa()
    intento(t, "c-1", lista="CUENTA", registro={"countryCode": "CO", "accountNumber": "1", "enable": True,
                                                "reason": "x"})
    assert http(t, {"accion": "ids", "actor": OTRO, "ids": [{"cambioId": "c-1", "adminId": "1"}]})[1]["completados"] == 0
    assert http(t, {"accion": "ids", "actor": ACTOR, "ids": [{"cambioId": "c-1", "adminId": "1"}]})[1]["completados"] == 1
    assert http(t, {"accion": "ids", "actor": ACTOR, "ids": [{"cambioId": "c-1", "adminId": "2"}]})[1]["completados"] == 0
    assert t.items["c-1"]["admin_id"] == "1"


def test_comillas_en_la_razon_no_rompen_el_sql():
    t, r = TablaFalsa(), RedshiftFalso()
    intento(t, "c-1", registro={"dni": "1", "countryCode": "CL", "countryName": "Chile", "reason": "O'Higgins"})
    resultado(t, "c-1")
    app.espejar(t, r, AHORA)
    assert r.foto()[1][0]["reason"] == "O'Higgins"


def test_las_barras_invertidas_se_duplican_para_redshift():
    assert app._lit("C:\\temp", "") == "'C:\\\\temp'"
    assert app._lit({"a": "x\"y"}, "json") == "JSON_PARSE('{\"a\": \"x\\\\\"y\"}')"


def test_muchas_filas_grandes_se_parten_en_sentencias_de_menos_de_100_kb():
    t, r = TablaFalsa(), RedshiftFalso()
    for n in range(60):
        intento(t, f"c-{n:03d}", registro={"dni": str(n), "countryCode": "CO", "countryName": "Colombia",
                                           "reason": "x" * 1000})
        resultado(t, f"c-{n:03d}", respuesta={"detalle": "y" * 3000})
    app.espejar(t, r, AHORA)
    assert len(r.lotes) > 1
    for lote in r.lotes:
        assert all(len(s.encode()) < 100_000 for s in lote)
    assert len(r.foto()[0]) == 60


def test_el_horario_no_falla_por_una_pausa_y_si_por_un_atraso_de_dias(monkeypatch):
    t, r = TablaFalsa(), RedshiftFalso()
    r.pausado = True
    import types
    monkeypatch.setitem(sys.modules, "boto3", types.SimpleNamespace(client=lambda _: r))
    _alta_y_baja(t)
    assert app.manejar_horario(t)["omitido"] == "cluster_no_disponible"
    for i in t.items.values():
        i["ocurrido_en"] = (datetime.now(timezone.utc) - timedelta(days=5)).strftime(app._TS)
    with pytest.raises(RuntimeError, match="sin espejar"):
        app.manejar_horario(t)


def test_el_ddl_tiene_las_columnas_que_escribe_el_lambda():
    """Si el DDL y el Lambda se separan, el espejo falla en Redshift y no acá."""
    ddl = (Path(__file__).resolve().parents[3] / "redshift" / "listas_negras" / "001_schema.sql").read_text()

    def columnas(tabla):
        cuerpo = ddl.split(f"CREATE TABLE IF NOT EXISTS listas_negras.{tabla} (")[1].split("PRIMARY KEY")[0]
        return [ln.strip().split()[0] for ln in cuerpo.splitlines() if ln.strip() and not ln.strip().startswith("--")]

    agregadas = re.findall(r"ALTER TABLE listas_negras\.cambio ADD COLUMN (\w+)",
                           (Path(__file__).resolve().parents[3] / "redshift" / "listas_negras" / "002_origen_caso.sql").read_text())
    assert columnas("cambio") + agregadas == [c for c, _ in app.COLUMNAS_CAMBIO]
    assert columnas("registro") == list(COLUMNAS_REGISTRO)
    insert = app.sentencias_registro(["x"])[1]
    cols = re.search(r"INSERT INTO listas_negras\.registro \(([^)]*)\)", insert).group(1)
    assert [c.strip() for c in cols.split(",")] == list(COLUMNAS_REGISTRO)



# ════════════════════════════════════════════════════════════════════════════
# OFAC Bloqueado → lista negra de DNI (el actor de sistema y el caso de origen)
# ════════════════════════════════════════════════════════════════════════════

SISTEMA = {"email": "sistema:lens-flujo-autonomo", "nombre": "Flujo automático OFAC", "uid": "lens-flujo-autonomo"}


def test_el_actor_de_sistema_se_acepta_y_uno_inventado_no():
    t = TablaFalsa()
    assert intento(t, "c-1", actor=SISTEMA, flujo="colas_trabajo.ofac.bloqueado.automatico")[0] == 200
    assert t.items["c-1"]["actor_email"] == "sistema:lens-flujo-autonomo"
    for malo in ({"email": "sistema:"}, {"email": "Sistema:X"}, {"email": "sistema:a b"}):
        assert intento(t, "c-2", actor=malo)[0] == 400


def test_el_caso_de_origen_queda_en_el_intento_y_en_redshift():
    t, r = TablaFalsa(), RedshiftFalso()
    http(t, {"accion": "intento", "cambioId": "c-1", "ejecucionId": "ej-1", "lista": "DNI", "operacion": "CREAR",
             "flujo": "colas_trabajo.ofac.bloqueado.manual", "servicio": "/admin/customer-status", "actor": ACTOR,
             "registro": {"dni": "11.111.111-1", "countryCode": "CL", "countryName": "Chile", "reason": "Matriz"},
             "meta": {"valor": "11.111.111-1"}, "origen": {"numeroCaso": "09000001", "casoId": "09000001"}})
    resultado(t, "c-1")
    assert (t.items["c-1"]["numero_caso"], t.items["c-1"]["caso_id"]) == ("09000001", "09000001")
    app.espejar(t, r, AHORA)
    c = r.foto()[0][0]
    assert (c["numero_caso"], c["caso_id"], c["flujo"]) == ("09000001", "09000001", "colas_trabajo.ofac.bloqueado.manual")
    assert r.foto()[1][0]["flujo_alta"] == "colas_trabajo.ofac.bloqueado.manual"


def test_una_fila_sin_operacion_lleva_su_operacion_y_su_caso():
    t = TablaFalsa()
    http(t, {"accion": "sin_operacion", "ejecucionId": "ej-1", "lista": "DNI", "actor": SISTEMA, "operacion": "CREAR",
             "flujo": "colas_trabajo.ofac.bloqueado.automatico",
             "filas": [{"cambioId": "c-9", "valor": "12.345.678-5", "countryCode": "CL",
                        "resultado": "OMITIDO_YA_EXISTE_ACTIVO", "numeroCaso": "09000002", "casoId": "09000002"}]})
    it = t.items["c-9"]
    assert (it["operacion"], it["numero_caso"], it["caso_id"]) == ("CREAR", "09000002", "09000002")
