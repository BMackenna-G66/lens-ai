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

## Deploy

```bash
sam build && sam deploy \
  --parameter-overrides "ApiSecretValue=<secreto-nuevo> RedshiftDbUser=<usuario-redshift>"
```

Si el cluster está en **otra cuenta** que la Lambda, agregar
`AssumeRoleArn=arn:aws:iam::235997980558:role/<rol-con-redshift-data>` y el handler
asume ese rol antes de escribir.

## ⚠️ Bloqueos actuales (necesitan a alguien con permisos)

Verificado en esta sesión con el SSO activo, cuenta **235997980558** (donde vive el
cluster), rol `compliance_analyst`:

| Acción | Resultado |
|---|---|
| `redshift:DescribeClusters` | ❌ AccessDenied |
| `redshift-data:ExecuteStatement` | ❌ AccessDenied |
| `lambda:ListFunctions` | ❌ AccessDenied |
| `cloudformation:ListStacks` | ❌ AccessDenied |
| `secretsmanager:ListSecrets` | ❌ AccessDenied |

Es decir: ese rol solo sirve para consultar por el editor SQL (JDBC), no por API.
Para poner esto en marcha hace falta **una** de estas dos:

1. **Desplegar en la cuenta 561521480266** (donde el perfil `compliance-admin` sí
   tiene CloudFormation) y darle a la Lambda acceso cross-account a Redshift
   (`AssumeRoleArn` + un rol en 235997980558 con `redshift-data:ExecuteStatement`
   y `redshift:GetClusterCredentials`).
2. **Pedir permisos** de `redshift-data` + Lambda/CloudFormation en 235997980558.

Mientras eso no exista, el DDL se ejecuta a mano desde el editor SQL (2 minutos) y
esta Lambda queda lista pero sin desplegar.

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
