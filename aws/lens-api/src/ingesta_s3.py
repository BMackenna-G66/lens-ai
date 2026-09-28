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
El bucket `g66-company` **es de otra cuenta**. S3 entre cuentas necesita las dos
puntas y con una sola no alcanza:

  1. En la cuenta dueña: una bucket policy que permita `s3:GetObject` y
     `s3:ListBucket` al rol `arn:aws:iam::561521480266:role/lens-analisis-rol`.
     **FALTA.** Está escrita y lista para reenviar en
     `bucket-policy-g66-company.json`.
  2. En la nuestra: la política IAM equivalente. **Ya está** en `template.yaml`
     (pendiente de que se despliegue el stack).

Verificado el 12-09-2026 desde la cuenta 561521480266:

    AccessDenied … is not authorized to perform: s3:ListBucket on
    "arn:aws:s3:::g66-company" because no resource-based policy allows
    the s3:ListBucket action

El motivo que devuelve AWS es explícito —«no resource-based policy»— y confirma
que lo que falta es (1), del lado del dueño.

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
#
# OJO: esto filtra el NOMBRE DEL ARCHIVO, no el prefijo de claves del bucket.
# Se parecen y no son lo mismo. La ruta dentro del bucket la manda el llamador
# en `folder_path` y se usa tal cual como `Prefix` (ver `listar_prefijo`); este
# servicio no la conoce ni la impone.
#
# Confundir las dos ya pasó: la bucket policy se escribió pidiendo
# `g66-company/company_shareholders_document/*` como si fuera una carpeta, y con
# eso no habría alcanzado ningún objeto real.
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
    #: De qué bucket sale. Vacío = el de `BUCKET`, que es como funcionaba antes
    #: de que existieran los `s3Uri` por documento. Onboarding tiene TRES
    #: ambientes y el bucket casi seguro difiere en cada uno, así que un único
    #: bucket global no alcanza: viaja por objeto.
    bucket: str = ""
    #: El `documentType` que declaró el llamador. Opaco para LENS: no se
    #: interpreta, se guarda y se devuelve en los avisos para que quien integra
    #: pueda correlacionar el aviso con el documento que mandó.
    tipo: str = ""

    @property
    def nombre(self) -> str:
        return self.clave.rsplit("/", 1)[-1]


@dataclass
class Descargado:
    clave: str
    nombre: str
    contenido: bytes
    bucket: str = ""
    tipo: str = ""


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


# ── Documentos nombrados por el llamador ────────────────────────────────────

@dataclass
class DocumentoPedido:
    """Un documento que el llamador nombró: `s3Uri` + `fileName` + `documentType`.

    Es la forma que pide el contrato de Onboarding B2B. La alternativa —barrer
    la carpeta de la empresa— lee versiones reemplazadas que siguen en S3 y
    exige además permiso para LISTAR el bucket, no solo para leer objetos.
    """
    s3_uri: str = ""
    #: Alternativa a `s3_uri`: solo la clave, con el bucket por defecto.
    clave: str = ""
    nombre_archivo: str = ""
    tipo: str = ""


def parsear_s3_uri(uri: str) -> tuple[str, str] | None:
    """`s3://bucket/una/clave.pdf` → `("bucket", "una/clave.pdf")`.

    `None` si no es un URI de S3 utilizable. No se intenta arreglar lo que
    viene mal: un bucket adivinado lee del lugar equivocado, y eso en tres
    ambientes significa leer los documentos de producción desde una prueba.
    """
    t = str(uri or "").strip()
    if not t.lower().startswith("s3://"):
        return None
    resto = t[5:]
    bucket, _, clave = resto.partition("/")
    if not bucket or not clave:
        return None
    return bucket, clave


def resolver_documentos(
    cliente: Any, documentos: list[DocumentoPedido], bucket_defecto: str = "",
) -> tuple[list[ObjetoS3], list[str]]:
    """Confirma con `head_object` cada documento nombrado y le pega su tamaño.

    Cada uno puede traer su propio bucket en el `s3Uri`. El de por defecto solo
    se usa para los que vienen con `clave` suelta.
    """
    objetos: list[ObjetoS3] = []
    avisos: list[str] = []
    for d in documentos:
        if d.s3_uri:
            partes = parsear_s3_uri(d.s3_uri)
            if partes is None:
                avisos.append(f"{d.s3_uri or '(vacío)'}: no es un s3Uri utilizable (se espera s3://bucket/clave)")
                continue
            bucket, clave = partes
        elif d.clave:
            bucket, clave = (bucket_defecto or BUCKET), d.clave
        else:
            avisos.append("un documento vino sin s3Uri ni clave")
            continue
        try:
            h = cliente.head_object(Bucket=bucket, Key=clave)
            objetos.append(ObjetoS3(
                clave=clave, tamano=int(h.get("ContentLength", 0)),
                bucket=bucket, tipo=d.tipo,
            ))
        except Exception as e:  # noqa: BLE001
            avisos.append(f"{clave}: no se pudo leer ({type(e).__name__})")
    return objetos, avisos


def extension(nombre: str) -> str:
    return ("." + nombre.rsplit(".", 1)[-1].lower()) if "." in nombre else ""


def motivo_descarte(obj: ObjetoS3, *, exigir_prefijo: bool = True) -> str | None:
    """El motivo por el que NO se usa este archivo, o None si sirve.

    El orden es el del bot y se respeta: primero el nombre, después la
    extensión, después el tamaño. Importa porque el aviso que ve el consumidor
    tiene que decir la primera razón, no una cualquiera.

    ── `exigir_prefijo` ────────────────────────────────────────────────────
    El filtro por nombre existe porque el camino original **barre una carpeta**
    de la empresa que tiene de todo, y solo sirven los documentos societarios.
    Ahí el nombre es la única señal disponible.

    Cuando el llamador **nombra los documentos uno por uno** —y encima declara
    su `documentType`— esa señal sobra, y aplicarla igual rompe: Onboarding
    nombra sus propios archivos, así que `escritura_constitucion.pdf` se
    descartaría entero. Y no con un error: con un aviso. La corrida terminaría
    «bien» sin haber leído nada.

    Por eso es un parámetro y no un cambio de comportamiento: quien barre una
    carpeta lo sigue exigiendo (default `True`, el camino vivo no se mueve) y
    quien nombra los archivos no.
    """
    nombre = obj.nombre
    if exigir_prefijo and not nombre.startswith(PREFIJO_NOMBRE):
        return f"{nombre}: el nombre no empieza con «{PREFIJO_NOMBRE}»"
    if extension(nombre) not in EXTENSIONES:
        return f"{nombre}: extensión no soportada ({extension(nombre) or 'sin extensión'})"
    if obj.tamano > MAX_BYTES_ARCHIVO:
        return f"{nombre}: pesa {obj.tamano / 1024 / 1024:.1f} MB y el máximo es {MAX_BYTES_ARCHIVO // 1024 // 1024} MB"
    return None


def filtrar(objetos: Iterable[ObjetoS3], *, exigir_prefijo: bool = True) -> tuple[list[ObjetoS3], list[str]]:
    """Separa lo que sirve de lo que no. Devuelve (aceptados, avisos)."""
    aceptados: list[ObjetoS3] = []
    avisos: list[str] = []
    for o in objetos:
        motivo = motivo_descarte(o, exigir_prefijo=exigir_prefijo)
        if motivo:
            avisos.append(motivo)
        else:
            aceptados.append(o)

    return aceptados, avisos


def aplicar_tope(aceptados: list[ObjetoS3]) -> tuple[list[ObjetoS3], list[str]]:
    """Recorta al tope del lote, avisando.

    Va aparte de `filtrar` porque el tope es del LOTE y el filtro es por
    archivo. Cuando hay dos orígenes —una carpeta barrida y documentos
    nombrados— cada uno se filtra con su regla pero el tope se aplica UNA vez
    sobre el total; si se aplicara dentro de `filtrar`, dos orígenes darían
    hasta el doble del tope.

    Un tope silencioso haría que el consumidor crea que analizó una carpeta
    entera cuando analizó la mitad.
    """
    if len(aceptados) <= MAX_ARCHIVOS:
        return aceptados, []
    aviso = (
        f"hay {len(aceptados)} archivos válidos y el tope es {MAX_ARCHIVOS}: "
        f"se usan los primeros {MAX_ARCHIVOS}"
    )
    return aceptados[:MAX_ARCHIVOS], [aviso]


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
            # El bucket del objeto manda sobre el del lote: con `s3Uri` por
            # documento, cada uno puede venir de un bucket distinto.
            r = cliente.get_object(Bucket=(o.bucket or bucket), Key=o.clave)
            return o, r["Body"].read(), None
        except Exception as e:  # noqa: BLE001
            return o, None, f"{o.nombre}: no se pudo descargar ({type(e).__name__})"

    hilos = min(HILOS_DESCARGA, len(objetos))
    with concurrent.futures.ThreadPoolExecutor(max_workers=hilos) as pool:
        for o, contenido, err in pool.map(uno, objetos):
            if err:
                avisos.append(err)
            else:
                descargados.append(Descargado(
                    clave=o.clave, nombre=o.nombre, contenido=contenido or b"",
                    bucket=o.bucket or bucket, tipo=o.tipo))

    # El orden del paralelo no es determinista y el consumidor compara
    # resultados entre corridas: se reordena por clave.
    descargados.sort(key=lambda d: d.clave)
    return descargados, avisos


def ingerir(
    cliente: Any,
    folder_path: str = "",
    archivos: list[str] | None = None,
    bucket: str = "",
    documentos: list[DocumentoPedido] | None = None,
) -> ResultadoIngesta:
    """Resuelve, filtra y descarga. Nunca lanza por un archivo malo.

    Tres formas de decir qué leer, y se pueden combinar:

      · `folder_path`  un prefijo del bucket. Barre la carpeta.
      · `archivos`     lista explícita de claves, con el bucket por defecto.
      · `documentos`   lista de `DocumentoPedido` con `s3Uri` propio y
                       `documentType`. Es la forma del contrato de Onboarding.

    **El filtro por nombre de archivo solo se aplica al barrido de carpeta.**
    Los documentos nombrados de a uno no lo pasan: si el llamador dijo cuál es
    el archivo, no hay nada que adivinar por el nombre. Ver `motivo_descarte`.
    """
    bucket = bucket or BUCKET
    res = ResultadoIngesta()

    # Se filtran por separado porque la regla NO es la misma: lo que se barre
    # pasa el filtro de nombre, lo que se nombra no. Juntarlos antes de filtrar
    # obligaría a un filtro solo, y sería el equivocado para una de las dos.
    nombrados: list[ObjetoS3] = []
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
    if documentos:
        objs, avs = resolver_documentos(cliente, documentos, bucket)
        nombrados += objs
        res.avisos += avs

    res.vistos = len(objetos) + len(nombrados)
    aceptados, avisos_filtro = filtrar(objetos)
    res.avisos += avisos_filtro
    ac_nom, av_nom = filtrar(nombrados, exigir_prefijo=False)
    res.avisos += av_nom
    # El tope es del LOTE: se aplica una sola vez sobre los dos orígenes juntos.
    aceptados, avisos_tope = aplicar_tope(aceptados + ac_nom)
    res.avisos += avisos_tope
    res.descartados = res.vistos - len(aceptados)

    bajados, avisos_descarga = descargar(cliente, bucket, aceptados)
    res.archivos = bajados
    res.avisos += avisos_descarga
    return res
