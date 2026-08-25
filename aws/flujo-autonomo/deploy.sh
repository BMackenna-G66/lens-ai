#!/usr/bin/env bash
# Despliega el flujo autónomo sin que los secretos pasen por la línea de comandos.
#
# Los dos secretos se leen de archivos: nunca aparecen en el comando, ni en el
# historial de la shell, ni en un mensaje. Si algún día hay que rotarlos, se
# cambia el archivo y se vuelve a correr esto.
#
#   ./deploy.sh              → despliega y deja el cron ACTIVO
#   ./deploy.sh DISABLED     → despliega con el cron apagado
set -euo pipefail
cd "$(dirname "$0")"

SA="${LENS_FIREBASE_SA:-$HOME/Downloads/lens-ai-9da63-firebase-adminsdk-fbsvc-1f18bdf27d.json}"
KEY_FILE="${LENS_REGCHEQ_KEY_FILE:-$HOME/.lens-regcheq-key}"
PROXY="${LENS_PROXY_URL:-https://empresadocs-proxy.bmackenna.workers.dev}"
ESTADO="${1:-ENABLED}"

[ -f "$SA" ]       || { echo "❌ No encuentro el service account en: $SA"; exit 1; }
[ -f "$KEY_FILE" ] || { echo "❌ No encuentro la key de Regcheq en: $KEY_FILE
   Guardala una sola vez con:
     printf '%s' 'LA-KEY' > $KEY_FILE && chmod 600 $KEY_FILE"; exit 1; }

KEY="$(tr -d '[:space:]' < "$KEY_FILE")"
# Guarda contra el error más fácil de cometer: dejar el placeholder.
case "$KEY" in
  ''|TU_KEY|PENDIENTE|LA-KEY|LA_KEY)
    echo "❌ El archivo $KEY_FILE tiene un placeholder ('$KEY'), no la key real."; exit 1;;
esac

./build.sh

# El horario NO se pasa por acá: está fijo en el template. Un valor con espacios
# en --parameter-overrides llega partido y EventBridge lo rechaza.
sam deploy --parameter-overrides \
  "FirebaseSaB64=$(base64 -i "$SA" | tr -d '\n')" \
  "ProxyUrl=$PROXY" \
  "RegcheqApiKey=$KEY" \
  "Habilitada=$ESTADO"

echo
echo "✅ Desplegado con el cron en $ESTADO (horario fijo en template.yaml)"
echo "   Para ver qué haría ahora mismo:"
echo "     aws lambda invoke --profile compliance-admin --region us-east-1 \\"
echo "       --function-name lens-flujo-autonomo --cli-read-timeout 900 /tmp/lens-run.json"
