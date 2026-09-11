"""Ingesta de documentos desde S3 — Fase 4 del plan de absorción.

Resuelve un `folder_path` (prefijo o lista explícita), filtra lo que no sirve y
descarga lo que queda. Replica los tres filtros del bot que se elimina.

Lo que NO hace, a propósito
---------------------------
No decide qué hacer con lo rechazado más allá de contarlo: **nada de lo que se
descarta corta la ejecución**. Un archivo con el nombre equivocado, uno de 12 MB
o un `.docx` no pueden dejar sin analizar a los otros nueve. Todo eso se acumula
en `avisos` y el análisis sigue.

Eso es lo que hacía el bot y es lo que el consumidor espera: recibe la lista de
avisos junto con el resultado.

Dependencia de infra que NO está resuelta
-----------------------------------------
El bucket `g66-company` **es de otra cuenta**: `head_bucket` desde la cuenta
561521480266 devuelve 403, no 404. Y el rol de `lens-analisis` no tiene hoy
NINGÚN permiso de S3 — solo `AWSLambdaBasicExecutionRole` y la política de
Textract.

Para que esto funcione hacen falta dos cosas, y la primera no se puede hacer
desde nuestra cuenta:

  1. En la cuenta dueña del bucket: una bucket policy que permita
     `s3:GetObject` y `s3:ListBucket` al rol
     `arn:aws:iam::561521480266:role/lens-analisis-fnurl-LensApiFunctionRole-*`
  2. En la nuestra: la política IAM equivalente en ese rol.

Hasta entonces este módulo está completo y probado contra un cliente simulado,
pero cualquier llamada real va a devolver AccessDenied — que se reporta como
aviso, no como caída.
"""

from __future__ import annotations

import concurrent.futures
import os
from dataclasses import dataclass, field
from typing import Any, Iterable

# ── Los tres filtros del bot, en este orden ─────────────────────────────────
PREFIJO_NOMBRE = "company_shareholders_document_"
EXTENSIONES = (".pdf", ".jpg", ".jpeg", ".png")
MAX_BYTES_ARCHIVO = 10 * 1024 * 1024        # 10 MB por archivo
MAX_ARCHIVOS = 50                            # tope del lote
HILOS_DESCARGA = 10

BUCKET = os.environ.get("S3_BUCKET_DOCUMENTOS", "g66-company")


@dataclass
class ObjetoS3:
    """Un objeto del bucket, antes de decidir si se descarga."""
    clave: str
    tamano: int = 0

    @property
    def nombre(self) -> str:
        return self.clave.rsplit("/", 1)[-1]


@dataclass
class Descargado:
    clave: str
    nombre: str
    contenido: bytes


@dataclass
class ResultadoIngesta:
    archivos: list[Descargado] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)
    # Cuántos objetos vio el listado antes de filtrar. Sirve para distinguir
    # "la carpeta está vacía" de "había 40 y ninguno pasó el filtro".
    vistos: int = 0
    descartados: int = 0

    def a_dict(self) -> dict:
        return {
            "archivos": len(self.archivos),
            "vistos": self.vistos,
            "descartados": self.descartados,
            "avisos": self.avisos,
        }


def extension(nombre: str) -> str:
    return ("." + nombre.rsplit(".", 1)[-1].lower()) if "." in nombre else ""


def motivo_descarte(obj: ObjetoS3) -> str | None:
    """El motivo por el que NO se usa este archivo, o None si sirve.

    El orden es el del bot y se respeta: primero el nombre, después la
    extensión, después el tamaño. Importa porque el aviso que ve el consumidor
    tiene que decir la primera razón, no una cualquiera.
    """
    nombre = obj.nombre
    if not nombre.startswith(PREFIJO_NOMBRE):
        return f"{nombre}: el nombre no empieza con «{PREFIJO_NOMBRE}»"
    if extension(nombre) not in EXTENSIONES:
        return f"{nombre}: extensión no soportada ({extension(nombre) or 'sin extensión'})"
    if obj.tamano > MAX_BYTES_ARCHIVO:
        return f"{nombre}: pesa {obj.tamano / 1024 / 1024:.1f} MB y el máximo es {MAX_BYTES_ARCHIVO // 1024 // 1024} MB"
    return None


def filtrar(objetos: Iterable[ObjetoS3]) -> tuple[list[ObjetoS3], list[str]]:
    """Separa lo que sirve de lo que no. Devuelve (aceptados, avisos)."""
    aceptados: list[ObjetoS3] = []
    avisos: list[str] = []
    for o in objetos:
        motivo = motivo_descarte(o)
        if motivo:
            avisos.append(motivo)
        else:
            aceptados.append(o)

    if len(aceptados) > MAX_ARCHIVOS:
        # Se recorta pero SE AVISA. Un tope silencioso haría que el consumidor
        # crea que analizó una carpeta entera cuando analizó la mitad.
        avisos.append(
            f"la carpeta tiene {len(aceptados)} archivos válidos y el tope es {MAX_ARCHIVOS}: "
            f"se usan los primeros {MAX_ARCHIVOS}"
        )
        aceptados = aceptados[:MAX_ARCHIVOS]
    return aceptados, avisos


def listar_prefijo(cliente: Any, bucket: str, prefijo: str) -> list[ObjetoS3]:
    """Todos los objetos bajo un prefijo, CON PAGINACIÓN.

    `list_objects_v2` devuelve como máximo 1.000 por página. Sin paginar, una
    carpeta con 1.200 documentos se leería incompleta y en silencio — que es
    justo el tipo de error que nadie nota hasta que falta un socio.
    """
    objetos: list[ObjetoS3] = []
    token: str | None = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefijo}
        if token:
            kwargs["ContinuationToken"] = token
        resp = cliente.list_objects_v2(**kwargs)
        for it in resp.get("Contents", []) or []:
            # Las "carpetas" de S3 son claves que terminan en / con tamaño 0.
            if it["Key"].endswith("/"):
                continue
            objetos.append(ObjetoS3(clave=it["Key"], tamano=int(it.get("Size", 0))))
        if not resp.get("IsTruncated"):
            break
        token = resp.get("NextContinuationToken")
        if not token:
            break
    return objetos


def resolver_lista(cliente: Any, bucket: str, claves: list[str]) -> tuple[list[ObjetoS3], list[str]]:
    """Una lista explícita de claves. Cada una se confirma con `head_object`.

    Se consulta de a una porque S3 no tiene un "head múltiple", y hace falta el
    tamaño para el filtro de 10 MB antes de bajar nada.
    """
    objetos: list[ObjetoS3] = []
    avisos: list[str] = []
    for k in claves:
        try:
            h = cliente.head_object(Bucket=bucket, Key=k)
            objetos.append(ObjetoS3(clave=k, tamano=int(h.get("ContentLength", 0))))
        except Exception as e:  # noqa: BLE001
            avisos.append(f"{k}: no se pudo leer ({type(e).__name__})")
    return objetos, avisos


def descargar(cliente: Any, bucket: str, objetos: list[ObjetoS3]) -> tuple[list[Descargado], list[str]]:
    """Baja los objetos en paralelo. Lo que falla no corta el resto."""
    descargados: list[Descargado] = []
    avisos: list[str] = []
    if not objetos:
        return descargados, avisos

    def uno(o: ObjetoS3) -> tuple[ObjetoS3, bytes | None, str | None]:
        try:
            r = cliente.get_object(Bucket=bucket, Key=o.clave)
            return o, r["Body"].read(), None
        except Exception as e:  # noqa: BLE001
            return o, None, f"{o.nombre}: no se pudo descargar ({type(e).__name__})"

    hilos = min(HILOS_DESCARGA, len(objetos))
    with concurrent.futures.ThreadPoolExecutor(max_workers=hilos) as pool:
        for o, contenido, err in pool.map(uno, objetos):
            if err:
                avisos.append(err)
            else:
                descargados.append(Descargado(clave=o.clave, nombre=o.nombre, contenido=contenido or b""))

    # El orden del paralelo no es determinista y el consumidor compara
    # resultados entre corridas: se reordena por clave.
    descargados.sort(key=lambda d: d.clave)
    return descargados, avisos


def ingerir(
    cliente: Any,
    folder_path: str = "",
    archivos: list[str] | None = None,
    bucket: str = "",
) -> ResultadoIngesta:
    """Resuelve, filtra y descarga. Nunca lanza por un archivo malo.

    `folder_path` es un prefijo; `archivos` una lista explícita de claves. Si
    vienen los dos, se usan los dos.
    """
    bucket = bucket or BUCKET
    res = ResultadoIngesta()

    objetos: list[ObjetoS3] = []
    if folder_path:
        try:
            objetos += listar_prefijo(cliente, bucket, folder_path)
        except Exception as e:  # noqa: BLE001
            # AccessDenied entra por acá mientras el rol no tenga permisos.
            res.avisos.append(f"no se pudo listar «{folder_path}» ({type(e).__name__})")
    if archivos:
        objs, avs = resolver_lista(cliente, bucket, archivos)
        objetos += objs
        res.avisos += avs

    res.vistos = len(objetos)
    aceptados, avisos_filtro = filtrar(objetos)
    res.avisos += avisos_filtro
    res.descartados = res.vistos - len(aceptados)

    bajados, avisos_descarga = descargar(cliente, bucket, aceptados)
    res.archivos = bajados
    res.avisos += avisos_descarga
    return res
