"""
Tests del respaldo diario. No necesitan AWS ni Firestore: se reemplazan las
funciones de I/O del módulo y se captura el SQL que se habría ejecutado.

Correr:  python3.12 -m pytest aws/colas-sync/tests -q

Todos los datos son inventados.
"""

import json
import sys
import types
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

# boto3 viene en el runtime de Lambda; acá basta con un módulo vacío.
sys.modules.setdefault("boto3", types.SimpleNamespace(client=lambda *_a, **_k: None))

import app  # noqa: E402


# ── Helpers ───────────────────────────────────────────────────────────────────
def _s(v):
    return {"stringValue": v}


def _doc_caso(numero, cierres=None, **extra):
    campos = {"numeroCaso": _s(numero), "asunto": _s("Coincidencia OFAC"), "pais": _s("Chile")}
    if cierres:
        campos["cierres"] = {"mapValue": {"fields": {
            canal: {"mapValue": {"fields": {k: ({"booleanValue": v} if isinstance(v, bool) else _s(v))
                                            for k, v in c.items()}}}
            for canal, c in cierres.items()}}}
    campos.update(extra)
    return {"name": f"projects/p/databases/(default)/documents/casos_sf/{numero}", "fields": campos}


def _evento(numero, eid, tipo, ts, metadata=None, creado=None):
    campos = {"eventId": _s(eid), "tipo": _s(tipo), "timestamp": _s(ts)}
    if metadata:
        campos["metadata"] = {"mapValue": {"fields": {k: _s(v) for k, v in metadata.items()}}}
    return {"name": f"projects/p/databases/(default)/documents/casos_sf/{numero}/auditoria/{eid}",
            "createTime": creado or ts, "fields": campos}


class FakeRedshift:
    def __init__(self, no_disponible=False):
        self.sql = []
        self.no_disponible = no_disponible

    def execute_statement(self, **kw):
        if self.no_disponible:
            raise RuntimeError("ValidationException: Redshift endpoint is not available.")
        self.sql.append(kw["Sql"])
        return {"Id": str(len(self.sql))}

    def describe_statement(self, Id):
        return {"Status": "FINISHED"}


class Ctx:
    def __init__(self, segundos):
        self.fin = segundos

    def get_remaining_time_in_millis(self):
        return self.fin * 1000


def _preparar(monkeypatch, *, estado=None, casos=(), eventos=(), redshift=None):
    guardados = []
    estado = dict(estado or {})
    monkeypatch.setattr(app, "_access_token", lambda: "tok")
    monkeypatch.setattr(app, "_leer_estado", lambda tok: dict(estado))
    monkeypatch.setattr(app, "_guardar_estado", lambda tok, e: guardados.append(dict(e)))
    monkeypatch.setattr(app, "_eventos", lambda tok: iter(eventos))
    por_nombre = {d["name"]: d for d, _ in casos}
    monkeypatch.setattr(app, "_cabeceras_casos", lambda tok: [(d["name"], u) for d, u in casos])
    monkeypatch.setattr(app, "_traer_casos", lambda tok, nombres: [por_nombre[n] for n in nombres])
    rs = redshift or FakeRedshift()
    monkeypatch.setitem(sys.modules, "boto3", types.SimpleNamespace(client=lambda *_a, **_k: rs))
    return guardados, rs


# ── Filas ─────────────────────────────────────────────────────────────────────
def test_cierre_del_flujo_autonomo_sale_automatico_por_el_campo_por():
    doc = _doc_caso("00000001", {"admin": {"ok": True, "en": "2026-10-01T10:00:00.000Z",
                                           "tipologia": "liberar_normal", "por": "flujo-autonomo"}})
    f = app._filas_de_caso(doc)
    (c,) = f["cierre"]
    assert c["automatico"] is True and c["actor_id"] == "system" and c["actor_tipo"] == "SYSTEM"
    assert c["cierre_id"] == "00000001|ADMIN|2026-10-01 10:00:00.000"


def test_cierre_manual_queda_sin_actor_inventado():
    doc = _doc_caso("00000002", {"sf": {"ok": True, "en": "2026-10-01T10:00:00Z"}})
    (c,) = app._filas_de_caso(doc)["cierre"]
    assert c["automatico"] is None and c["actor_id"] is None


def test_evento_cierre_automatico_marca_solo_el_canal_que_cerro():
    # El flujo cerró Salesforce; Admin lo cerró después un analista a mano.
    doc = _doc_caso("00000003", {"sf": {"ok": True, "en": "2026-10-01T10:00:00Z"},
                                 "admin": {"ok": True, "en": "2026-10-02T10:00:00Z"}})
    filas = {c["canal"]: c for c in app._filas_de_caso(doc, frozenset({"sf"}))["cierre"]}
    assert filas["SF"]["automatico"] is True
    assert filas["ADMIN"]["automatico"] is None and filas["ADMIN"]["actor_id"] is None


def test_cierre_fallido_no_se_espeja():
    doc = _doc_caso("00000004", {"admin": {"ok": False, "en": "2026-10-01T10:00:00Z"}})
    assert app._filas_de_caso(doc)["cierre"] == []


def test_documento_huerfano_no_es_un_caso():
    huerfano = {"name": "projects/p/databases/(default)/documents/casos_sf/00000005",
                "fields": {"screeningBeneficiario": {"mapValue": {"fields": {"estado": _s("ok")}}}}}
    assert app._filas_de_caso(huerfano) == {"caso": [], "screening": [], "cierre": []}


# ── SQL ───────────────────────────────────────────────────────────────────────
def test_las_barras_invertidas_se_duplican():
    # Redshift interpreta la barra dentro de un literal: 'C:\temp' llega con un
    # TAB. Tumbó el backfill del 20-10-2026 con un JSON que traía comillas.
    assert app._lit("C:\\temp", "") == "'C:\\\\temp'"
    assert app._lit("o'brien\\x", "", tipado=True) == "'o''brien\\\\x'::VARCHAR"
    j = app._lit({"detalle": 'dijo "hola"\nchau'}, "json")
    # json.dumps escribe \" y \n; tienen que llegar a Redshift como \\" y \\n.
    assert j == 'JSON_PARSE(\'{"detalle": "dijo \\\\"hola\\\\"\\\\nchau"}\')'


def test_lit_tipado_castea_los_null():
    assert app._lit(None, "bool", tipado=True) == "NULL::BOOLEAN"
    assert app._lit(None, "ts", tipado=True) == "NULL::TIMESTAMP"
    assert app._lit("a'b", "", tipado=True) == "'a''b'::VARCHAR"
    assert app._lit(None, "bool") == "NULL"


def test_cierres_nunca_se_borran_ni_se_pisan():
    # BLOQUEANTE de la auditoría: el Lambda manda en vivo la fila con
    # status_enviado, ofac_flag, last_step… y la MISMA clave que arma el job. Un
    # DELETE + INSERT por clave las perdía todas las mañanas.
    doc = _doc_caso("00000011", {"admin": {"ok": True, "en": "2026-10-15T16:16:00.123Z", "por": "flujo-autonomo"}})
    lote = app._filas_de_caso(doc)["cierre"]
    sqls = app._sentencias("cierre", lote)
    assert not any(x.lstrip().upper().startswith("DELETE") for x in sqls)
    insert, update = sqls
    assert "WHERE NOT EXISTS" in insert
    # El UPDATE solo completa la autoría donde no se sabía, y no toca otra columna.
    assert update.endswith("AND automatico IS NULL")
    assert "status_enviado" not in update and "ofac_flag" not in update


def test_las_otras_tablas_siguen_siendo_delete_mas_insert():
    sqls = app._sentencias("caso", [{"numero_caso": "00000012"}])
    assert sqls[0].startswith("DELETE FROM colas_trabajo.caso") and sqls[1].startswith("INSERT INTO colas_trabajo.caso")


def test_insert_de_cierres_no_duplica_los_que_entraron_en_vivo():
    doc = _doc_caso("00000006", {"admin": {"ok": True, "en": "2026-10-01T10:00:00Z", "por": "flujo-autonomo"}})
    sql = app._sql_insertar_cierres(app._filas_de_caso(doc)["cierre"])
    assert "WHERE NOT EXISTS" in sql
    assert "c.numero_caso = v.numero_caso AND c.canal = v.canal AND c.resultado_ok = TRUE" in sql
    assert "NULL::VARCHAR AS tipologia" in sql


def test_trozos_respeta_el_tamano_maximo(monkeypatch):
    monkeypatch.setattr(app, "MAX_SQL_BYTES", 4000)
    filas = [{"event_id": f"e{i}", "numero_caso": "00000007", "tipo": "NOTA",
              "metadata": {"texto": "x" * 300}} for i in range(30)]
    lotes = app._trozos("evento_auditoria", filas)
    assert len(lotes) > 1 and sum(len(x) for x in lotes) == 30
    for lote in lotes:
        assert len(app._sql_de("evento_auditoria", lote).encode()) <= 4000


def test_trozos_mide_los_cierres_con_su_propio_armador(monkeypatch):
    # El INSERT de cierres (SELECT … UNION ALL) pesa el doble por fila que un
    # VALUES: medido con el otro armador salían statements de 118 KB.
    monkeypatch.setattr(app, "MAX_SQL_BYTES", 5000)
    filas = app._filas_de_caso(_doc_caso("00000008", {
        "sf": {"ok": True, "en": "2026-10-01T10:00:00Z", "por": "flujo-autonomo"},
        "admin": {"ok": True, "en": "2026-10-01T10:00:01Z", "por": "flujo-autonomo"}}))["cierre"] * 40
    for lote in app._trozos("cierre", filas):
        assert len(app._sql_insertar_cierres(lote).encode()) <= 5000


def test_fila_que_no_entra_sola_se_recorta_y_no_tumba_la_corrida(monkeypatch):
    monkeypatch.setattr(app, "MAX_SQL_BYTES", 3000)
    grande = {"event_id": "e-grande", "numero_caso": "00000009", "tipo": "NOTA", "metadata": {"texto": "x" * 5000}}
    (lote,) = app._trozos("evento_auditoria", [grande])
    assert lote[0]["metadata"]["truncado"] is True
    assert len(app._sql_de("evento_auditoria", lote).encode()) <= 3000


def test_nunca_dos_escrituras_a_la_vez_sobre_la_misma_tabla(monkeypatch):
    # Con 4 lotes de cierres en paralelo, Redshift los serializaba con bloqueos:
    # 78 s por INSERT, todo espera. Un escritor por tabla; en paralelo, solo tablas distintas.
    import threading
    import time as _t
    monkeypatch.setattr(app, "MAX_SQL_BYTES", 3000)
    activos, maximo, por_id, candado = {}, {}, {}, threading.Lock()

    class Lento:
        def execute_statement(self, **kw):
            tabla = kw["Sql"].split("colas_trabajo.")[1].split()[0]
            with candado:
                activos[tabla] = activos.get(tabla, 0) + 1
                maximo[tabla] = max(maximo.get(tabla, 0), activos[tabla])
                por_id[str(len(por_id))] = tabla
                return {"Id": str(len(por_id) - 1)}

        def describe_statement(self, Id):
            _t.sleep(0.01)
            with candado:
                activos[por_id[Id]] -= 1
            return {"Status": "FINISHED"}

    docs = [_doc_caso(f"000003{i:02d}", {"sf": {"ok": True, "en": "2026-10-01T10:00:00Z", "por": "flujo-autonomo"},
                                         "admin": {"ok": True, "en": "2026-10-01T10:00:01Z", "por": "flujo-autonomo"}})
            for i in range(40)]
    filas = {"caso": [], "screening": [], "cierre": []}
    for d in docs:
        for t, rows in app._filas_de_caso(d).items():
            filas[t].extend(rows)
    r = app._escribir(Lento(), filas)
    assert r == {"caso": 40, "cierre": 80}
    assert maximo["cierre"] == 1 and maximo["caso"] == 1


def test_el_freno_deja_lugar_para_una_tanda_entera(monkeypatch):
    # Con 60 s fijos de margen, una tanda de 3,5 min arrancó con margen y terminó
    # en el timeout duro de Lambda. Ahora el margen suma 1,5 veces la tanda más lenta.
    monkeypatch.setattr(app, "CASOS_POR_TANDA", 1)
    reloj = {"t": 0.0}
    casos = [(_doc_caso(f"0000040{i}"), _hace(hours=9 - i)) for i in range(6)]
    guardados, _ = _preparar(monkeypatch, estado={"marcaCasos": _hace(days=1), "marcaEventos": _hace(days=1)},
                             casos=casos)

    def escribir_lento(client, filas):
        reloj["t"] += 200          # cada tanda tarda 200 s
        return {}
    monkeypatch.setattr(app, "_escribir", escribir_lento)
    monkeypatch.setattr(app.time, "time", lambda: reloj["t"])
    ctx = types.SimpleNamespace(get_remaining_time_in_millis=lambda: (900 - reloj["t"]) * 1000)
    try:
        app.lambda_handler({}, ctx)
    except RuntimeError as e:
        assert "sin tiempo" in str(e)
    # 900 s: tandas en t=0, 200 y 400; la cuarta (t=600, quedan 300 < 60 + 1,5×200) ya no arranca.
    assert reloj["t"] == 600
    assert guardados[-1]["ultimoResultado"] == "incompleta"


# ── Corrida ───────────────────────────────────────────────────────────────────
AHORA = datetime.now(timezone.utc)


def _hace(**kw):
    return app._iso(AHORA - timedelta(**kw))


def test_corrida_incremental_solo_procesa_lo_que_cambio_y_mueve_la_marca(monkeypatch):
    viejo = _doc_caso("00000010", {"admin": {"ok": True, "en": _hace(days=9), "por": "flujo-autonomo"}})
    nuevo = _doc_caso("00000011", {"admin": {"ok": True, "en": _hace(hours=2), "por": "flujo-autonomo"}})
    guardados, rs = _preparar(
        monkeypatch,
        estado={"marcaCasos": _hace(days=1), "marcaEventos": _hace(days=1), "ultimaOkEn": _hace(days=1)},
        casos=[(viejo, _hace(days=9)), (nuevo, _hace(hours=2))],
        eventos=[_evento("00000010", "ev-viejo", "NOTA", _hace(days=9)),
                 _evento("00000011", "ev-nuevo", "CIERRE_AUTOMATICO", _hace(hours=2), {"admin": "ok"}),
                 # Reloj del navegador atrasado 3 días, pero escrito hace 1 hora:
                 # entra por `createTime`.
                 _evento("00000010", "ev-tarde", "NOTA", _hace(days=3), creado=_hace(hours=1))])
    r = app.lambda_handler({}, Ctx(800))
    assert r["ok"] and r["escritas"]["caso"] == 1 and r["escritas"]["evento_auditoria"] == 2
    todo = "\n".join(rs.sql)
    assert "INSERT INTO colas_trabajo.caso" in todo and "'00000010', '00000010'" not in todo
    assert "ev-nuevo" in todo and "ev-tarde" in todo and "ev-viejo" not in todo
    assert not any(x.startswith("DELETE FROM colas_trabajo.cierre") for x in rs.sql)
    final = guardados[-1]
    assert final["ultimoResultado"] == "ok" and final["marcaCasos"] == final["ultimaOkEn"]


def test_cluster_pausado_no_es_error_y_no_mueve_la_marca(monkeypatch):
    estado = {"marcaCasos": _hace(days=1), "marcaEventos": _hace(days=1), "ultimaOkEn": _hace(days=1)}
    guardados, _ = _preparar(monkeypatch, estado=estado, redshift=FakeRedshift(no_disponible=True))
    r = app.lambda_handler({}, Ctx(800))
    assert r == {"ok": True, "omitido": "cluster_no_disponible"}
    assert guardados[-1]["marcaCasos"] == estado["marcaCasos"]
    assert guardados[-1]["ultimoResultado"] == "cluster_no_disponible"


def test_cluster_pausado_mas_de_cuatro_dias_si_es_error(monkeypatch):
    _preparar(monkeypatch, estado={"ultimaOkEn": _hace(days=5)}, redshift=FakeRedshift(no_disponible=True))
    try:
        app.lambda_handler({}, Ctx(800))
    except RuntimeError as e:
        assert "atrasado 5 días" in str(e)
    else:
        raise AssertionError("tenía que lanzar para que suene la alarma")


def test_sin_tiempo_guarda_el_avance_y_lanza(monkeypatch):
    monkeypatch.setattr(app, "CASOS_POR_TANDA", 1)
    casos = [(_doc_caso(f"0000002{i}"), _hace(hours=5 - i)) for i in range(3)]
    guardados, _ = _preparar(monkeypatch, estado={"marcaCasos": _hace(days=1), "marcaEventos": _hace(days=1)},
                             casos=casos)
    llamadas = iter([800])   # alcanza para el primer caso, no para el resto
    ctx = types.SimpleNamespace(get_remaining_time_in_millis=lambda: next(llamadas, 10) * 1000)
    try:
        app.lambda_handler({}, ctx)
    except RuntimeError as e:
        assert "sin tiempo" in str(e)
    else:
        raise AssertionError("tenía que lanzar")
    final = guardados[-1]
    assert final["ultimoResultado"] == "incompleta"
    # La marca avanzó hasta el caso escrito, no hasta el arranque.
    assert final["marcaCasos"] == casos[0][1]
    assert "ultimaOkEn" not in final


def test_reiniciar_marca_no_procesa_nada(monkeypatch):
    guardados, rs = _preparar(monkeypatch, estado={"marcaCasos": _hace(hours=1)})
    r = app.lambda_handler({"reiniciarMarca": "2026-09-01T00:00:00Z"}, Ctx(800))
    assert r["marcaReiniciada"] == "2026-09-01T00:00:00.000Z"
    assert guardados[-1]["marcaCasos"] == "2026-09-01T00:00:00.000Z" and rs.sql == []


def test_estado_se_guarda_aunque_falle(monkeypatch):
    guardados, _ = _preparar(monkeypatch, estado={"marcaCasos": _hace(days=1), "marcaEventos": _hace(days=1)})

    def explota(tok):
        raise ValueError("Firestore devolvió basura")
        yield  # noqa: unreachable — hace de esto un generador
    monkeypatch.setattr(app, "_eventos", explota)
    try:
        app.lambda_handler({}, Ctx(800))
    except ValueError:
        pass
    assert guardados[-1]["ultimoResultado"] == "error"
    assert "Firestore devolvió basura" in guardados[-1]["ultimoError"]


if __name__ == "__main__":   # permite correrlo sin pytest instalado
    import pytest
    sys.exit(pytest.main([__file__, "-q"]))
