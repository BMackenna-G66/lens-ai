# Receptor de casos OFAC/PEP + Transacciones Bot (AWS)

Endpoint HTTP en AWS (API Gateway HTTP API + Lambda) para que **Salesforce** haga
`POST /casos` con casos de compliance. La Lambda autentica por header
`x-api-secret` y **persiste cada caso en Firestore** (proyecto `lens-ai-9da63`,
colección `casos_sf`). El módulo **"Bandeja de Casos"** de Lens lee esa colección
en vivo.

```
Salesforce  ──POST (x-api-secret)──▶  Lambda Function URL (HTTPS nativo)
                                             │
                                             ▼
                                       Lambda (python3.12)
                                             │  (PATCH REST, upsert por Nº de caso)
                                             ▼
                               Firestore  lens-ai-9da63 / casos_sf
                                             │  (onSnapshot, auth-gated)
                                             ▼
                                 Lens · módulo "Bandeja de Casos"
```

## Estado del despliegue (us-east-1, cuenta 561521480266)
- **Stack**: `casos-receptor-fnurl` (CloudFormation/SAM) — **desplegado**.
- **Endpoint**: `https://tppahdkhw5w4u5r5fbze2ebpn40hhwoz.lambda-url.us-east-1.on.aws/`
- **Exposición**: **Lambda Function URL** (NO API Gateway; el rol `compliance-admin`
  no tiene `apigateway:POST`). Auth de infra `NONE`; la protección real es el header
  `x-api-secret` que valida el handler.
- **Secretos**: variables de entorno de la Lambda (`API_SECRET`, `FIREBASE_SA_JSON`
  en base64). SSM quedó descartado porque el rol no tiene `ssm:PutParameter`.
  `app.py` ya soporta SSM para migrar cuando se habiliten permisos.
- **Nota de limpieza**: existe un stack vacío `casos-receptor` en `ROLLBACK_COMPLETE`
  (primer intento con API Gateway). Borrarlo requiere `cloudformation:DeleteStack`,
  que `compliance-admin` no tiene → lo limpia alguien con más permisos. No molesta.

## Estructura
```
aws/casos-receptor/
├── template.yaml        # SAM: HTTP API + Lambda + permisos SSM/KMS
├── samconfig.toml       # config de deploy (stack, región, perfil)
├── src/
│   ├── app.py           # handler + persistencia Firestore (REST)
│   └── requirements.txt # google-auth, requests (wheels puros)
└── tests/test_app.py    # tests unitarios (no tocan red)
```

## Requisitos
- AWS SAM CLI (`brew install aws-sam-cli`)
- Sesión AWS SSO activa: `aws sso login --profile compliance-admin`
- Un JSON de service account de Firebase del proyecto `lens-ai-9da63`

## Deploy (modo env-var, como está desplegado hoy)
Los secretos van como variables de entorno de la Lambda vía parámetros `NoEcho`
(no van en el código ni en git). El service account se pasa en **base64** para
evitar problemas de escapado.

```bash
cd aws/casos-receptor
sam build

SA_B64=$(base64 < /ruta/a/firebase_sa.json | tr -d '\n')
sam deploy \
  --profile compliance-admin --region us-east-1 \
  --stack-name casos-receptor-fnurl \
  --resolve-s3 --capabilities CAPABILITY_IAM \
  --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides "ApiSecretValue=EL_API_SECRET" "FirebaseSaB64=$SA_B64"
```
Al terminar imprime el output **`EndpointUrl`** (la Function URL). Esa es la URL que
se configura en Salesforce.

> Generar un API secret nuevo: `python3 -c "import secrets; print(secrets.token_urlsafe(40))"`
> y rotar con un redeploy cambiando `ApiSecretValue`.

## Probar
```bash
curl -s -X POST "https://tppahdkhw5w4u5r5fbze2ebpn40hhwoz.lambda-url.us-east-1.on.aws/" \
  -H "x-api-secret: EL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '[{"Número del caso":"00123456","Asunto":"Prueba","Nombre":"Juan","País":"Chile"}]'
# → {"ok": true, "recibidos": 1, "guardados": 1}
```
El caso aparece en Lens → **Bandeja de Casos** en vivo.

## Migrar a SSM (cuando se habiliten permisos)
`app.py` ya lo soporta: cargar `/casos-receptor/api-secret` y `/casos-receptor/firebase-sa`
como SecureString, y desplegar seteando las env `SSM_API_SECRET_PARAM` /
`SSM_FIREBASE_SA_PARAM` con esos nombres (y quitando `API_SECRET`/`FIREBASE_SA_JSON`).
Requiere `ssm:PutParameter` + `ssm:GetParameter` + `kms:Decrypt`.

## Contrato del endpoint
- **Auth**: header `x-api-secret` == valor configurado. Falta/incorrecto → `401`.
- **Body**: JSON, objeto único o array. Inválido → `400`; array vacío → `400`;
  elemento no-objeto → `422`.
- **Campos**: todos opcionales; se aceptan campos extra. Se promueven a nivel
  superior `Número del caso`, `Asunto`, `Nombre de la cuenta`, `País`; el payload
  completo se guarda bajo `datos`.
- **OK**: `200 {"ok": true, "recibidos": N, "guardados": K}`.
- **Privacidad**: nunca se loguea el body (trae DNI); solo número y asunto.

## Configuración (parámetros del template)
| Parámetro | Tipo | Qué es |
|---|---|---|
| `ApiSecretValue` | NoEcho | secreto del header `x-api-secret` |
| `FirebaseSaB64` | NoEcho | service account de Firebase (JSON) en base64 |
| `FirestoreProject` | String (`lens-ai-9da63`) | proyecto Firestore destino |
| `FirestoreCollection` | String (`casos_sf`) | colección destino |

## Tests
```bash
cd aws/casos-receptor && python3 -m pytest -q
```

## Rotar el API secret
Redeploy cambiando el parámetro (la Lambda toma el nuevo valor al actualizarse):
```bash
sam deploy --profile compliance-admin --region us-east-1 \
  --stack-name casos-receptor-fnurl --resolve-s3 --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --parameter-overrides "ApiSecretValue=NUEVO_SECRETO" "FirebaseSaB64=$(base64 < /ruta/firebase_sa.json | tr -d '\n')"
```
