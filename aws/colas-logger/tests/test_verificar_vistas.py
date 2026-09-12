"""Tests del guardia de deriva de las vistas en inglés.

Un verificador que solo sabe decir «OK» no sirve de nada: lo que hay que probar
es que **detecta** cada forma de quedarse viejo. Por eso casi todos los tests de
acá le dan un DDL o unas vistas rotas a propósito y exigen que las vea.

El primero es el que importa en el día a día: que el repo, tal como está, no
tenga deriva. Los demás son la prueba de que ese OK significa algo.

Correr:  python3 tests/test_verificar_vistas.py   (o pytest)
"""

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "scripts"))

import verificar_vistas as v  # noqa: E402


# ── El repo real ────────────────────────────────────────────────────────────

def test_el_repo_no_tiene_deriva():
    assert v.revisar() == []


def test_las_nueve_tablas_tienen_vista():
    tablas = v.columnas_de_tablas([v.leer(p) for p in v.DDL])
    vistas = v.vistas_en(v.leer(v.VISTAS))
    assert len(tablas) == 9
    assert {d["tabla"] for d in vistas.values()} == set(tablas)


def test_todo_lo_que_escribe_el_logger_esta_expuesto():
    """Es el caso que más duele: el logger llenando una tabla que tech no ve."""
    escribe = v.tablas_del_logger(v.leer(v.APP))
    cubiertas = {d["tabla"] for d in v.vistas_en(v.leer(v.VISTAS)).values()}
    assert escribe and escribe <= cubiertas


# ── El parser del DDL ───────────────────────────────────────────────────────

DDL_MINIMO = """
CREATE TABLE IF NOT EXISTS lens.cosa (
  cosa_id     VARCHAR(64) NOT NULL,   -- comentario que no es columna
  nombre      VARCHAR(128),
  PRIMARY KEY (cosa_id)
)
DISTSTYLE KEY DISTKEY (cosa_id);
"""


def test_lee_columnas_y_saltea_las_restricciones():
    t = v.columnas_de_tablas([DDL_MINIMO])
    assert t["cosa"] == ["cosa_id", "nombre"]      # PRIMARY KEY no es columna


def test_suma_las_columnas_agregadas_por_alter():
    t = v.columnas_de_tablas([DDL_MINIMO, "ALTER TABLE lens.cosa ADD COLUMN extra VARCHAR(8);"])
    assert t["cosa"] == ["cosa_id", "nombre", "extra"]


def test_las_columnas_de_la_materializada_son_sus_alias():
    t = v.columnas_de_tablas(["""
CREATE MATERIALIZED VIEW lens.pivote AS
SELECT
  c.analisis_id,
  MAX(CASE WHEN campo = 'Razón Social, S.A.' THEN valor END) AS razon_social
FROM lens.analisis_campo c
GROUP BY c.analisis_id;
"""])
    # La coma dentro del CASE no separa columnas: si el parser partiera por `,`
    # a secas, acá saldrían tres columnas y una se llamaría "S.A.' THEN valor END".
    assert t["pivote"] == ["analisis_id", "razon_social"]


def test_un_comentario_no_inventa_columnas():
    t = v.columnas_de_tablas(["""
CREATE TABLE IF NOT EXISTS lens.cosa (
  -- ALTER TABLE lens.cosa ADD COLUMN fantasma VARCHAR(8);
  cosa_id VARCHAR(64)
);
"""])
    assert t["cosa"] == ["cosa_id"]


# ── Cada forma de deriva, inyectada ─────────────────────────────────────────

def _revisar(monkeypatch, ddl: str, vistas: str, app: str = '"schema": "lens", "nombre": "cosa"'):
    """Corre `revisar()` contra fuentes de mentira."""
    fuentes = {v.DDL[0]: ddl, v.DDL[1]: "", v.VISTAS: vistas,
               v.APP: "TABLAS: dict = {\n" + app + "\n}"}
    monkeypatch.setattr(v, "leer", lambda p: fuentes[p])
    return v.revisar()


# Una vista sana lleva SIEMPRE su GRANT: es parte de estar completa, igual que
# exponer todas las columnas. El fixture sin GRANT vive aparte, abajo.
VISTA_SIN_GRANT = """
CREATE OR REPLACE VIEW lens.thing AS
SELECT
  cosa_id AS thing_id,
  nombre AS name
FROM lens.cosa;
"""

VISTA_OK = VISTA_SIN_GRANT + "\n-- GRANT SELECT ON lens.thing TO GROUP lens_lectura;\n"


def test_la_combinacion_sana_no_reporta_nada(monkeypatch):
    assert _revisar(monkeypatch, DDL_MINIMO, VISTA_OK) == []


def test_detecta_una_columna_nueva_sin_exponer(monkeypatch):
    """LA deriva del día a día: alguien agrega una columna y no regenera. La
    vista no falla, solo deja de mostrarla — y tech concluye que el dato no
    existe."""
    ddl = DDL_MINIMO + "\nALTER TABLE lens.cosa ADD COLUMN recien_llegada VARCHAR(8);"
    p = _revisar(monkeypatch, ddl, VISTA_OK)
    assert len(p) == 1
    assert "recien_llegada no está expuesta" in p[0]


def test_detecta_una_vista_que_apunta_a_algo_que_no_existe(monkeypatch):
    """Acá el CREATE OR REPLACE falla al desplegar. Mejor enterarse en CI."""
    vista = VISTA_OK.replace("nombre AS name", "columna_borrada AS name")
    p = _revisar(monkeypatch, DDL_MINIMO, vista)
    assert any("no existe en lens.cosa" in x for x in p)
    assert any("va a fallar en el próximo despliegue" in x for x in p)


def test_detecta_una_tabla_sin_vista(monkeypatch):
    ddl = DDL_MINIMO + "\nCREATE TABLE IF NOT EXISTS lens.huerfana (\n  id VARCHAR(8)\n);"
    p = _revisar(monkeypatch, ddl, VISTA_OK)
    assert any("lens.huerfana no tiene vista en inglés" in x for x in p)


def test_detecta_que_el_logger_escribe_donde_no_hay_vista(monkeypatch):
    """Peor que una tabla sin vista: una tabla sin vista que YA se está
    llenando."""
    ddl = DDL_MINIMO + "\nCREATE TABLE IF NOT EXISTS lens.nueva (\n  id VARCHAR(8)\n);"
    app = ('"schema": "lens", "nombre": "cosa",\n'
           '"schema": "lens", "nombre": "nueva"')
    p = _revisar(monkeypatch, ddl, VISTA_OK, app)
    assert any("recibe escrituras del logger y no tiene vista" in x for x in p)


def test_detecta_un_nombre_en_ingles_repetido(monkeypatch):
    """Dos columnas con el mismo alias: el SELECT queda ambiguo."""
    vista = VISTA_OK.replace("nombre AS name", "nombre AS thing_id")
    p = _revisar(monkeypatch, DDL_MINIMO, vista)
    assert any("nombre repetido en inglés" in x for x in p)


def test_detecta_una_vista_sobre_una_tabla_inexistente(monkeypatch):
    vista = VISTA_OK.replace("FROM lens.cosa", "FROM lens.no_existe")
    p = _revisar(monkeypatch, DDL_MINIMO, vista)
    assert any("no está en el DDL" in x for x in p)


def test_detecta_una_vista_sin_su_grant(monkeypatch):
    """El alcance es "solo las vistas", así que no se puede usar
    `ON ALL TABLES` y hay que enumerar. Una vista nueva sin su GRANT nace sin
    permiso EN SILENCIO: quien consulta ve ocho de nueve y no hay error."""
    p = _revisar(monkeypatch, DDL_MINIMO, VISTA_SIN_GRANT)
    assert any("no está en el bloque de GRANT" in x for x in p)


def test_detecta_un_grant_sobre_una_vista_que_ya_no_existe(monkeypatch):
    """Al revés: ejecutar ese bloque fallaría."""
    vista = VISTA_OK + "\n-- GRANT SELECT ON lens.borrada TO GROUP lens_lectura;\n"
    p = _revisar(monkeypatch, DDL_MINIMO, vista)
    assert any("ya no es una vista de este archivo" in x for x in p)


def test_el_repo_tiene_las_nueve_vistas_con_grant():
    """Hoy el bloque está comentado —se decidió no ejecutarlo todavía— pero la
    lista tiene que estar completa igual, para que el día que se ejecute no
    falte ninguna."""
    src = v.leer(v.VISTAS)
    assert v.vistas_con_grant(src) == set(v.vistas_en(src))
    assert len(v.vistas_con_grant(src)) == 9


def test_el_bloque_de_grant_sigue_comentado():
    """Se decidió el 12-09-2026 no habilitar lectura todavía. Si alguien lo
    descomenta sin querer, esto lo dice."""
    for linea in v.leer(v.VISTAS).splitlines():
        t = linea.strip()
        if t.upper().startswith(("GRANT ", "CREATE GROUP", "ALTER GROUP")):
            raise AssertionError(f"hay un permiso SIN comentar: {t}")


def test_no_se_cuela_un_grant_sobre_todo_el_schema():
    """`ON ALL TABLES` abarcaría también las tablas en español, que es
    justamente lo que el alcance decidido deja afuera.

    Se miran las SENTENCIAS, comentadas incluidas —alguien va a copiar y pegar
    de ahí— y no el texto suelto: el archivo explica en prosa por qué NO se usa
    `ALL TABLES`, y buscar la frase pelada marcaría esa explicación como si
    fuera el problema. (Pasó al escribir este test.)"""
    for linea in v.leer(v.VISTAS).splitlines():
        t = linea.strip().lstrip("-").strip().lstrip("`").upper()
        if t.startswith("GRANT ") and "ALL TABLES" in t:
            raise AssertionError(f"hay un GRANT sobre todo el schema: {linea.strip()}")


def test_una_columna_oculta_a_proposito_no_es_deriva(monkeypatch):
    """La escotilla existe para que ocultar algo sea una decisión escrita, no
    un chequeo relajado."""
    ddl = DDL_MINIMO + "\nALTER TABLE lens.cosa ADD COLUMN interna VARCHAR(8);"
    monkeypatch.setitem(v.OCULTAS_A_PROPOSITO, "cosa", {"interna"})
    assert _revisar(monkeypatch, ddl, VISTA_OK) == []


# ── Runner sin pytest ───────────────────────────────────────────────────────

class _Monkey:
    """Lo mínimo de monkeypatch para poder correr esto con `python3` a secas,
    que es como está documentado el otro archivo de tests."""

    def __init__(self):
        self._deshacer = []

    def setattr(self, obj, nombre, valor):
        self._deshacer.append((setattr, obj, nombre, getattr(obj, nombre)))
        setattr(obj, nombre, valor)

    def setitem(self, dic, clave, valor):
        self._deshacer.append((dict.pop, dic, clave, None))
        dic[clave] = valor

    def cerrar(self):
        for fn, obj, nombre, previo in reversed(self._deshacer):
            fn(obj, nombre) if fn is dict.pop else fn(obj, nombre, previo)
        self._deshacer.clear()


if __name__ == "__main__":
    fallos = 0
    for nombre, fn in sorted(globals().items()):
        if not nombre.startswith("test_"):
            continue
        mk = _Monkey()
        try:
            fn(mk) if fn.__code__.co_argcount else fn()
            print(f"  OK   {nombre}")
        except AssertionError as e:
            fallos += 1
            print(f"  FALLA {nombre}: {e}")
        finally:
            mk.cerrar()
    print(f"\n{'FALLARON ' + str(fallos) if fallos else 'Todo OK'}")
    sys.exit(1 if fallos else 0)
