#!/usr/bin/env bash
# Despliega el CÓDIGO de lens-api a la Lambda `lens-analisis`.
#
#   scripts/desplegar_codigo.sh                 arma, verifica y sube
#   scripts/desplegar_codigo.sh --solo-armar    arma y verifica, NO sube
#
# ── Por qué existe ─────────────────────────────────────────────────────────
# Desde el 01-10-2026 la infraestructura de lens-api la maneja Terraform, en
# `iac-ai-lens`, y SAM ya no le despliega nada. Pero el código no lo maneja
# Terraform —tiene `ignore_changes` sobre el paquete, a propósito—, así que hace
# falta un camino para subirlo. Es este, mientras Arquitectura no defina uno en
# su pipeline. La configuración (variables, memoria, permisos) NO se cambia acá:
# va por un PR en iac-ai-lens.
#
# ── El cuidado que no se puede saltear ──────────────────────────────────────
# La Lambda es arm64, y `cryptography` trae una extensión nativa. El paquete se
# arma con `--platform manylinux2014_aarch64 --only-binary=:all:`, que baja los
# wheels de Linux arm64 sin importar dónde corra el script, y antes de subir se
# VERIFICA cada binario: si alguno no es ELF aarch64, se aborta. Un paquete con un
# `.so` de x86 no falla al desplegar: la Lambda revienta al importar, con la API
# entera caída.
set -euo pipefail

PERFIL="${AWS_PROFILE:-compliance-admin}"
REGION="us-east-1"
FUNCION="lens-analisis"
SALUD="https://7muyoqz3yiy7uprgondfexpyhe0jjopx.lambda-url.us-east-1.on.aws/salud"
PY="${PYTHON:-python3.12}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"

TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT
PAQUETE="$TRABAJO/paquete"
mkdir -p "$PAQUETE"

echo "▸ dependencias para Linux arm64"
"$PY" -m pip install -q -r "$RAIZ/src/requirements.txt" -t "$PAQUETE" \
  --platform manylinux2014_aarch64 --only-binary=:all: \
  --python-version 3.12 --implementation cp

echo "▸ código"
cp "$RAIZ"/src/*.py "$PAQUETE"/

echo "▸ verificando binarios nativos"
"$PY" "$RAIZ/scripts/verificar_binarios.py" "$PAQUETE"

(cd "$PAQUETE" && zip -qr "$TRABAJO/lens-api.zip" .)
echo "▸ paquete: $(du -h "$TRABAJO/lens-api.zip" | cut -f1)"

if [ "${1:-}" = "--solo-armar" ]; then
  echo "✓ armado y verificado. No se subió nada (--solo-armar)."
  exit 0
fi

echo "▸ subiendo a $FUNCION"
aws lambda update-function-code --profile "$PERFIL" --region "$REGION" \
  --function-name "$FUNCION" --zip-file "fileb://$TRABAJO/lens-api.zip" \
  --query 'CodeSha256' --output text
aws lambda wait function-updated-v2 --profile "$PERFIL" --region "$REGION" --function-name "$FUNCION"

echo "▸ /salud"
curl -fsS "$SALUD" | "$PY" -c "
import json, sys
d = json.load(sys.stdin)
claves = ['corridas_persistentes', 'disparo_asincrono', 'almacen_idempotencia',
          'secretos_por_ambiente', 'secretos_cargados']
for k in claves:
    print(f'  {k:24} {d.get(k)}')
"
echo "✓ desplegado"
