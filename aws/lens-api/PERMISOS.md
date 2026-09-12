# Permisos que le faltan a `compliance-admin`

Censo medido el **12-09-2026** intentando desplegar `lens-analisis-fnurl`. No es
una lista teórica: cada línea salió de un `AccessDenied` real, con el mensaje que
devolvió AWS.

## El resultado corto

**`compliance-admin` no puede hacer ningún cambio de IAM, y no puede crear
tablas de DynamoDB.** Eso alcanza para bloquear el despliegue entero, porque
CloudFormation actualiza el rol de la Lambda en el mismo cambio que el código.

| Acción | Estado | Qué bloquea |
|---|---|---|
| `iam:CreateRole` | ✗ denegado | Cualquier rol nuevo |
| `iam:PutRolePolicy` | ✗ denegado | Agregarle el permiso de S3 al rol actual |
| `iam:DeleteRolePolicy` | ✗ denegado | Que el rollback limpie lo que intentó |
| `dynamodb:CreateTable` | ✗ denegado | La tabla de idempotencia |
| `cloudformation:ContinueUpdateRollback` | ✗ denegado | **Destrabar el stack** |
| `cloudformation:DeleteStack` | ✗ denegado | Borrar los stacks viejos |
| `apigateway:POST` | ✗ denegado | Por eso se usa Function URL y no API Gateway |
| `s3:ListBucket` en `g66-company` | ✗ denegado | Es de otra cuenta: falta la bucket policy |

Lo que **sí** puede: `lambda:UpdateFunctionCode`,
`lambda:UpdateFunctionConfiguration`, crear el changeset, y todo lo de lectura.

## Estado actual del stack

    lens-analisis-fnurl   UPDATE_ROLLBACK_FAILED   ← hay que destrabarlo
    lens-api-fnurl        ROLLBACK_COMPLETE        (intento viejo)
    lens-api              ROLLBACK_FAILED          (intento viejo)

**La Lambda está sana y sirviendo.** Verificado después del rollback: `/salud`
responde 200, `LastModified` sigue en `2026-08-31T22:02:40`, el `CodeSha256` no
cambió y las 8 variables de entorno son las mismas. El rollback revirtió limpio
del lado del servicio; lo que quedó mal es el registro de CloudFormation.

Mientras el stack esté en `UPDATE_ROLLBACK_FAILED`, **`sam deploy` no corre**.

## Lo que hay que pedir

Alguien con permisos de IAM y CloudFormation en la cuenta 561521480266:

```bash
# 1. Destrabar el stack. Sin esto no se puede desplegar nada más.
aws cloudformation continue-update-rollback \
  --stack-name lens-analisis-fnurl \
  --resources-to-skip LensApiFunctionRole \
  --region us-east-1
```

Y después, para que el despliegue completo funcione, sumarle a
`compliance-admin` —o a quien haga el deploy— estos permisos:

```
iam:PutRolePolicy, iam:DeleteRolePolicy   sobre el rol del stack
dynamodb:CreateTable                      sobre lens-analisis-*
cloudformation:ContinueUpdateRollback     sobre los stacks de lens
```

Y en la cuenta dueña de `g66-company`, la bucket policy de
`bucket-policy-g66-company.json`.

## Se puede desplegar sin nada de eso

El código nuevo (Fases 4-6) **no necesita permisos nuevos** si se deja de lado
lo que sí los necesita:

* `CrearTablaIdempotencia=false` (el default) → sin tabla DynamoDB. `almacen.py`
  cae a memoria y `/salud` lo dice en `almacen_idempotencia`. La idempotencia no
  sobrevive entre invocaciones, pero nada finge que sí.
* Sin la política de S3 en el rol → `POST /v1/analyses` responde el aviso «no se
  pudo listar» en `warnings` en vez de romper. Ya hay test de eso.

Lo que sí queda disponible: la ruta nueva, la extracción de composición
societaria, la elección correcta del documento y los 18 campos de siempre.

**Pero primero hay que destrabar el stack**, o el `sam deploy` ni arranca.

## Cómo se llegó a esto

Se intentó desplegar con el rol de la Lambda nombrado a mano
(`lens-analisis-rol`), para conocer su ARN antes de desplegar y poder pedir la
bucket policy en paralelo. Dos cosas salieron mal:

1. `iam:CreateRole` está denegado, así que el rol nunca se pudo crear.
2. **No hacía falta.** El stack ya estaba desplegado desde el 31-08-2026 y el
   rol ya existía: su ARN se lee del stack con `describe-stack-resources`. La
   suposición de que era un primer despliegue era falsa y no se verificó antes.

El template volvió al rol que maneja SAM. El ARN real quedó en
`bucket-policy-g66-company.json`.
