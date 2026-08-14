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

## Dos modos de escritura

| | `MODO=tcp` (recomendado) | `MODO=dataapi` |
|---|---|---|
| Cómo conecta | Usuario/contraseña de Redshift, igual que tu editor SQL | Redshift Data API |
| Usuario | **El mismo que ya tenés habilitado** | Un usuario mapeado por IAM |
| Permisos IAM en la cuenta del cluster | **Ninguno** | `redshift-data:*` + `GetClusterCredentials` |
| Requisito | Que el endpoint sea alcanzable desde la Lambda | Permisos IAM |

Como el usuario de Redshift tiene que ser **el mismo** que ya carga información, el
modo correcto es **tcp**: así no depende de permisos IAM que hoy no existen.

## Deploy (modo tcp)

```bash
sam build --use-container && sam deploy --parameter-overrides \
  "ApiSecretValue=<secreto-nuevo> Modo=tcp \
   RedshiftHost=<endpoint-del-cluster> RedshiftUser=<usuario> RedshiftPassword=<clave>"
```

`--use-container` es porque el driver oficial (`redshift-connector`) trae
dependencias nativas. Si el build da problemas, en `src/requirements.txt` se puede
cambiar a `pg8000` (100% Python): el código ya tiene el fallback y no hay que tocar
nada más.

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

Ese rol solo sirve para consultar por el editor SQL (JDBC), no por API. Con
**MODO=tcp** eso deja de importar para escribir (se usa usuario/contraseña), pero
igual hay dos cosas por resolver:

1. **Dónde se despliega la Lambda.** En 235997980558 no se puede (sin
   CloudFormation/Lambda). Sí en **561521480266**, donde el perfil
   `compliance-admin` tiene CloudFormation. En modo tcp la cuenta da lo mismo:
   solo tiene que alcanzar el endpoint.
2. **Que el endpoint sea alcanzable.** Si el cluster es público y su security group
   permite la salida de la Lambda, funciona directo. Si el SG solo permite IPs de
   oficina/VPN, hay que agregar la regla (o poner la Lambda en una VPC con NAT de
   IP fija). **Esto lo tiene que confirmar alguien con acceso al SG.**

El DDL, mientras tanto, se ejecuta a mano desde el editor SQL (2 minutos).

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
