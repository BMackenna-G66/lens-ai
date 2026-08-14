# Logger de gestión de colas → Redshift

Lambda que recibe los eventos de gestión de la Bandeja de Casos y los escribe en el
schema `colas_trabajo` de `compliance-redshift-cluster` (ver `redshift/colas_trabajo/`).

## Es un proyecto INDEPENDIENTE

No comparte **nada** con `aws/casos-receptor`: stack propio, función propia, secreto
propio, rol propio y código propio. Está *inspirado* en él (Function URL + header
`x-api-secret`) pero no lo importa ni lo modifica, así un cambio acá no puede
romper la ingesta de casos desde Salesforce.

| | casos-receptor (existente) | colas-logger (nuevo) |
|---|---|---|
| Stack | `casos-receptor-fnurl` | `colas-logger-fnurl` |
| Función | `ofac-pep-trx-bot-receptor` | `colas-trabajo-logger` |
| Escribe en | Firestore | Redshift (Data API) |
| Secreto | el suyo | **otro distinto** |

## Contrato

`POST` a la Function URL con header `x-api-secret`:

```json
{
  "eventos": [
    { "tabla": "evento_auditoria", "datos": { "event_id": "ev-1", "numero_caso": "02648810", "tipo": "CIERRE_AUTOMATICO", "ocurrido_en": "2026-08-14T10:00:00" } },
    { "tabla": "cierre", "datos": { "cierre_id": "…", "numero_caso": "02648810", "canal": "SF", "resultado_ok": true } }
  ]
}
```

- `tabla` solo puede ser una de las 7 del schema (whitelist en `TABLAS`).
- Las columnas desconocidas **se ignoran**; el SQL se arma solo desde la whitelist
  y los valores viajan como **parámetros** de la Data API (no hay concatenación,
  así que no hay inyección SQL).
- **Idempotente**: cada fila hace `DELETE` por clave natural + `INSERT`. Reprocesar
  el mismo evento no duplica.
- Respuesta `200` si todo entró, `207` con el detalle si alguna fila falló (una fila
  mala no corta el lote).

## Tests

Sin AWS ni dependencias (stubea boto3):

```bash
python3 tests/test_app.py
```

## Cómo escribe (verificado contra el cluster)

El cluster **no es público**: vive en `vpc-0c505d3b18a721212` (SG `sg-044db66f536ae0db1`),
así que una Lambda fuera de esa VPC **no lo alcanza por TCP**. Por eso el modo que
corresponde es **Data API**, igual que el otro proyecto que ya carga este cluster:
va por la API de AWS con auth IAM, **sin password y sin VPC**.

| | `MODO=dataapi` (default) | `MODO=tcp` |
|---|---|---|
| Auth | IAM + `DbUser=awsuser` | usuario/contraseña |
| VPC | No hace falta | Obligatoria (cluster privado) |
| Password | **Ninguno** | Sí |

Datos del cluster (cuenta **561521480266**, la misma donde se despliega):

| | |
|---|---|
| Cluster | `compliance-redshift-cluster` |
| Endpoint | `compliance-redshift-cluster.cszw4nrem7jk.us-east-1.redshift.amazonaws.com` |
| Database | `dev` · Schema `colas_trabajo` |
| DbUser | `awsuser` |

## Deploy

```bash
sam build
sam deploy --parameter-overrides "ApiSecretValue=$(openssl rand -hex 32)"
```

No hace falta `--use-container` (se empaqueta `pg8000`, 100% Python) ni Docker, y
**no se pasa ninguna contraseña de Redshift**. El resto de los parámetros ya tienen
el default correcto (`Modo=dataapi`, cluster, `awsuser`, database `dev`).

Para no dejar el secreto en el historial de la shell ni en los parámetros del
stack, se puede guardar en Secrets Manager y referenciarlo:

```bash
aws secretsmanager create-secret --name colas-logger/api-secret --secret-string "$(openssl rand -hex 32)"
sam deploy --parameter-overrides "ApiSecretValue={{resolve:secretsmanager:colas-logger/api-secret}}"
```

## Estado del schema en Redshift

Ya creado y verificado en `dev`: 8 tablas + 3 vistas + las 5 categorías del
catálogo. Se probaron los INSERT reales (SUPER navegable, booleanos, timestamps,
`cargado_en` por defecto) y se borraron las filas de prueba.

## Pendiente de decisión: dónde vive el secreto

La app corre en el **navegador** (GitHub Pages), así que si llamara a esta Lambda
directo, el `x-api-secret` quedaría **visible en el bundle** y cualquiera podría
escribir filas falsas de auditoría. Opciones:

- **Recomendada:** que el navegador le pegue al **Worker de Cloudflare** (que ya
  guarda secretos) y el Worker reenvíe al logger con el header. El secreto no sale
  nunca al cliente. Es una ruta nueva en el Worker, aditiva.
- Alternativa: que escriba solo el backend (ej. un job batch que lea Firestore),
  y el navegador no llame nunca al logger.

Por eso el cliente en el frontend **todavía no está cableado**: primero hay que
elegir esto.
