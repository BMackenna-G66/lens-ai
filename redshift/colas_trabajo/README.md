# `colas_trabajo` — logs de gestión de la Bandeja de Casos en Redshift

Schema para guardar la trazabilidad del trabajo sobre las colas (OFAC, Remesas, Otros)
en `compliance-redshift-cluster` → database `dev`.

**Firestore sigue siendo la fuente operacional** (la app lee de ahí en vivo). Redshift
es el histórico auditable y consultable. No se reemplaza ni se apaga nada.

## Archivos

| Archivo | Qué hace |
|---|---|
| `001_schema.sql` | Crea el schema y las 8 tablas |
| `002_seed_categorias.sql` | Carga las 5 categorías de delito que retienen el caso |
| `003_vistas.sql` | Vistas de consulta (gestión por analista, cierres automáticos, resumen por caso) |

## Las tablas

| Tabla | Grano | Para qué |
|---|---|---|
| `caso` | 1 fila por caso | Dimensión: cola, país, customerId, fecha de llegada |
| `analista` | 1 fila por usuario | Separar la gestión por persona; marca el actor `system` |
| `evento_auditoria` | 1 fila por evento | El log crudo (espejo de la subcolección de Firestore) |
| `screening` | 1 fila por consulta | Conclusión, delitos, PEP, y si quedó **retenido** por delito sensible |
| `cierre` | 1 fila por canal cerrado | SF / Admin: tipología, status, ofac_flag, ok/error, manual vs automático |
| `caso_historial` | 1 fila por cambio | Historial de status / estado / prioridad / asignación |
| `categoria_sensible` | catálogo | Las categorías que frenan el automático |
| `config_flujo_historial` | 1 fila por cambio de config | **Quién prendió o apagó el flujo automático** |

## Ejecutar

Desde el editor de consultas de Redshift (o `psql`), en la database `dev`, en orden:

```sql
\i 001_schema.sql
\i 002_seed_categorias.sql
\i 003_vistas.sql
```

Después dar permisos al rol/grupo que corresponda (ajustar el nombre real):

```sql
GRANT USAGE ON SCHEMA colas_trabajo TO GROUP compliance;
GRANT SELECT ON ALL TABLES IN SCHEMA colas_trabajo TO GROUP compliance;
ALTER DEFAULT PRIVILEGES IN SCHEMA colas_trabajo GRANT SELECT ON TABLES TO GROUP compliance;
```

## Carga de datos (PENDIENTE DE DEFINIR)

Hoy Lens **lee** Redshift por un endpoint HTTP del otro sistema (Data API); no tiene
camino de **escritura**. Opciones:

| Opción | Cómo | Pro | Contra |
|---|---|---|---|
| **A. Lambda writer** (recomendada) | App → Lambda Function URL → `redshift-data:ExecuteStatement` | Reusa el patrón del receptor de casos; casi en vivo; poco código | Inserts de a poco (ok con este volumen: cientos/día) |
| **B. Batch Firestore → S3 → COPY** | Job diario que exporta y hace `COPY` | Es la forma que le gusta a Redshift; barato a volumen alto | Más piezas; los datos llegan con retraso |
| **C. Escritura desde el Worker** | Cloudflare → Data API | Sin infra nueva | Obliga a poner credenciales AWS en Cloudflare — **no recomendado** |

Las tablas están diseñadas para que **A o B funcionen igual** (claves naturales +
`cargado_en`), así que se puede empezar con A y migrar a B sin cambiar el schema.

**Idempotencia:** todas las tablas tienen clave natural (`event_id`, `cierre_id`,
`screening_id`, …). La carga debe hacer `MERGE` (Redshift lo soporta) o
`DELETE` por clave + `INSERT`, para que reprocesar no duplique.

## Datos sensibles

A propósito **no** se guardan el payload completo ni el DNI: solo `numero_caso`,
`id_interno_usuario` (para poder unir con las tablas del cliente) y `nombre_cuenta`.
Si la política permite más detalle, se agrega; si permite menos, se saca
`nombre_cuenta`. Los eventos guardan `metadata` sin secretos ni documentos.
