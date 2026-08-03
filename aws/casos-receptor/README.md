# Receptor de casos OFAC/PEP + Transacciones Bot (AWS)

Endpoint HTTP en AWS (API Gateway HTTP API + Lambda) para que **Salesforce** haga
`POST /casos` con casos de compliance. La Lambda autentica por header
`x-api-secret` y **persiste cada caso en Firestore** (proyecto `lens-ai-9da63`,
colección `casos_sf`). El módulo **"Bandeja de Casos"** de Lens lee esa colección
en vivo.

```
Salesforce  ──POST /casos (x-api-secret)──▶  API Gateway HTTP API
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

## Estructura
```
aws/casos-receptor/
├── template.yaml        # SAM: HTTP API + Lambda + permisos SSM/KMS
├── samconfig.toml       # config de deploy (stack, región, perfil)
├── src/
│   ├── app.py           # handler + persistencia Firestore (REST)
│   └── requirements.txt # google-auth, requests (wheels puros)
└── tests/test_app.py    # 11 tests unitarios (no tocan red)
```

## Requisitos
- AWS SAM CLI (`brew install aws-sam-cli`)
- Sesión AWS SSO activa: `aws sso login --profile compliance-admin`
- Un JSON de service account de Firebase del proyecto `lens-ai-9da63`

## 1) Cargar los secretos en SSM Parameter Store (SecureString)
Se hace **una sola vez** (no van en el código ni en git):

```bash
# API secret (header x-api-secret). Generar uno nuevo con:
#   python3 -c "import secrets; print(secrets.token_urlsafe(40))"
aws ssm put-parameter --profile compliance-admin --region us-east-1 \
  --name /casos-receptor/api-secret --type SecureString \
  --value "PEGAR_EL_API_SECRET"

# Service account de Firebase (el JSON completo)
aws ssm put-parameter --profile compliance-admin --region us-east-1 \
  --name /casos-receptor/firebase-sa --type SecureString \
  --value "file://firebase_sa.json"
```

## 2) Build + deploy
```bash
cd aws/casos-receptor
sam build
sam deploy            # usa samconfig.toml; pide confirmación del changeset
```
Al terminar, `sam deploy` imprime el output **`EndpointUrl`** — esa es la URL final
(`https://xxxx.execute-api.us-east-1.amazonaws.com/casos`).

## 3) Probar
```bash
curl -s -X POST "$ENDPOINT_URL" \
  -H "x-api-secret: EL_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '[{"Número del caso":"00123456","Asunto":"Prueba","Nombre":"Juan","País":"Chile"}]'
# → {"ok": true, "recibidos": 1, "guardados": 1}
```
El caso aparece en Lens → **Bandeja de Casos** en vivo.

## Contrato del endpoint
- **Auth**: header `x-api-secret` == parámetro SSM. Falta/incorrecto → `401`.
- **Body**: JSON, objeto único o array. Inválido → `400`; array vacío → `400`;
  elemento no-objeto → `422`.
- **Campos**: todos opcionales; se aceptan campos extra. Se promueven a nivel
  superior `Número del caso`, `Asunto`, `Nombre de la cuenta`, `País`; el payload
  completo se guarda bajo `datos`.
- **OK**: `200 {"ok": true, "recibidos": N, "guardados": K}`.
- **Privacidad**: nunca se loguea el body (trae DNI); solo número y asunto.

## Configuración (parámetros del template)
| Parámetro | Default | Qué es |
|---|---|---|
| `ApiSecretParam` | `/casos-receptor/api-secret` | nombre del param SSM del secreto |
| `FirebaseSaParam` | `/casos-receptor/firebase-sa` | nombre del param SSM del SA |
| `FirestoreProject` | `lens-ai-9da63` | proyecto Firestore destino |
| `FirestoreCollection` | `casos_sf` | colección destino |

## Tests
```bash
cd aws/casos-receptor && python3 -m pytest -q
```

## Rotar el API secret
```bash
aws ssm put-parameter --profile compliance-admin --region us-east-1 \
  --name /casos-receptor/api-secret --type SecureString --overwrite \
  --value "NUEVO_SECRETO"
```
La Lambda lo toma en el próximo cold start (o forzar con un redeploy).
