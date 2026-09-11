"""Tests de `ingesta_s3` contra un S3 simulado. Sin red y sin credenciales.

Se escribe con funciones `test_*` y `assert` —no con un `main()` que hace
`sys.exit`— porque pytest IMPORTA el módulo para descubrir los tests: un
`sys.exit` a nivel de módulo aborta la corrida entera con INTERNALERROR y los
demás archivos de test no llegan a ejecutarse. Pasó, y por eso está escrito así.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import ingesta_s3 as ing  # noqa: E402

P = ing.PREFIJO_NOMBRE


class _Cuerpo:
    def __init__(self, b):
        self.b = b

    def read(self):
        return self.b


class S3Falso:
    """Simula `list_objects_v2` con paginación real, `head_object` y `get_object`."""

    def __init__(self, objetos, falla_al_bajar=(), falla_head=()):
        self.objetos = objetos                      # [(clave, tamaño)]
        self.falla_al_bajar = set(falla_al_bajar)
        self.falla_head = set(falla_head)
        self.paginas_pedidas = 0

    def list_objects_v2(self, Bucket, Prefix, ContinuationToken=None):
        self.paginas_pedidas += 1
        filtrados = [o for o in self.objetos if o[0].startswith(Prefix)]
        ini = int(ContinuationToken or 0)
        trozo = filtrados[ini:ini + 1000]           # S3 devuelve máx 1.000 por página
        fin = ini + len(trozo)
        r = {"Contents": [{"Key": k, "Size": s} for k, s in trozo]}
        if fin < len(filtrados):
            r["IsTruncated"] = True
            r["NextContinuationToken"] = str(fin)
        return r

    def head_object(self, Bucket, Key):
        if Key in self.falla_head:
            raise RuntimeError("NoSuchKey")
        for k, s in self.objetos:
            if k == Key:
                return {"ContentLength": s}
        raise RuntimeError("NoSuchKey")

    def get_object(self, Bucket, Key):
        if Key in self.falla_al_bajar:
            raise RuntimeError("AccessDenied")
        return {"Body": _Cuerpo(b"x" * 10)}


# ── Los tres filtros del bot ────────────────────────────────────────────────

def test_acepta_el_archivo_valido():
    assert ing.motivo_descarte(ing.ObjetoS3(clave=f"c/{P}a.pdf", tamano=1000)) is None


def test_rechaza_por_nombre():
    m = ing.motivo_descarte(ing.ObjetoS3(clave="c/otra_cosa.pdf", tamano=1000))
    assert m and "el nombre no empieza" in m


def test_rechaza_por_extension():
    m = ing.motivo_descarte(ing.ObjetoS3(clave=f"c/{P}b.docx", tamano=1000))
    assert m and "extensión no soportada" in m


def test_rechaza_sin_extension():
    m = ing.motivo_descarte(ing.ObjetoS3(clave=f"c/{P}d", tamano=1000))
    assert m and "sin extensión" in m


def test_rechaza_por_tamano():
    m = ing.motivo_descarte(ing.ObjetoS3(clave=f"c/{P}c.pdf", tamano=11 * 1024 * 1024))
    assert m and "pesa 11.0 MB" in m


def test_el_orden_del_filtro_es_nombre_primero():
    """Con nombre Y extensión malos, el aviso tiene que decir el nombre.

    El orden lo hereda del bot y es parte del contrato con el consumidor: el
    aviso dice la PRIMERA razón, no una cualquiera."""
    m = ing.motivo_descarte(ing.ObjetoS3(clave="c/malo.docx", tamano=99 * 1024 * 1024))
    assert m and "el nombre no empieza" in m


# ── Paginación ──────────────────────────────────────────────────────────────

def test_pagina_mas_de_mil_objetos():
    """Sin paginar, una carpeta de 1.200 se leería incompleta EN SILENCIO."""
    objs = [(f"c/{P}{i:04d}.pdf", 100) for i in range(1200)]
    s3 = S3Falso(objs)
    listado = ing.listar_prefijo(s3, "b", "c/")
    assert len(listado) == 1200
    assert s3.paginas_pedidas >= 2


def test_ignora_las_carpetas_de_s3():
    s3 = S3Falso([("c/", 0), (f"c/{P}a.pdf", 10)])
    assert len(ing.listar_prefijo(s3, "b", "c/")) == 1


# ── Tope de 50 ──────────────────────────────────────────────────────────────

def test_recorta_a_cincuenta_y_avisa():
    """Un recorte silencioso haría creer que se analizó la carpeta entera."""
    ac, av = ing.filtrar([ing.ObjetoS3(clave=f"c/{P}{i}.pdf", tamano=10) for i in range(80)])
    assert len(ac) == ing.MAX_ARCHIVOS
    assert any("tope es 50" in a for a in av)


# ── Lo rechazado no corta ───────────────────────────────────────────────────

def test_lo_rechazado_no_corta_la_ejecucion():
    objs = [
        (f"c/{P}bueno1.pdf", 10),
        ("c/malo.txt", 10),
        (f"c/{P}gigante.pdf", 20 * 1024 * 1024),
        (f"c/{P}bueno2.pdf", 10),
    ]
    s3 = S3Falso(objs, falla_al_bajar={f"c/{P}bueno2.pdf"})
    r = ing.ingerir(s3, folder_path="c/")
    assert len(r.archivos) == 1
    assert r.vistos == 4
    assert r.descartados == 2
    assert len(r.avisos) == 3
    assert any("no se pudo descargar" in a for a in r.avisos)


def test_sin_permisos_avisa_y_no_lanza():
    """Es lo que pasa HOY: el rol de lens-analisis no tiene permisos de S3."""
    class SinPermiso:
        def list_objects_v2(self, **k):
            raise RuntimeError("AccessDenied")

    r = ing.ingerir(SinPermiso(), folder_path="c/")
    assert r.archivos == []
    assert any("no se pudo listar" in a for a in r.avisos)


# ── Lista explícita ─────────────────────────────────────────────────────────

def test_lista_explicita_con_head_object():
    s3 = S3Falso([(f"c/{P}x.pdf", 10)], falla_head={"c/no_existe.pdf"})
    r = ing.ingerir(s3, archivos=[f"c/{P}x.pdf", "c/no_existe.pdf"])
    assert len(r.archivos) == 1
    assert any("no se pudo leer" in a for a in r.avisos)


# ── Determinismo ────────────────────────────────────────────────────────────

def test_el_orden_no_depende_del_paralelismo():
    """El consumidor compara resultados entre corridas: el orden tiene que ser
    el mismo aunque la descarga vaya en 10 hilos."""
    objs = [(f"c/{P}{c}.pdf", 10) for c in "zyxwv"]
    r1 = ing.ingerir(S3Falso(objs), folder_path="c/")
    r2 = ing.ingerir(S3Falso(objs), folder_path="c/")
    assert [a.clave for a in r1.archivos] == [a.clave for a in r2.archivos]
    assert [a.clave for a in r1.archivos] == sorted(a.clave for a in r1.archivos)
