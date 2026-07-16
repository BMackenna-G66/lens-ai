#!/usr/bin/env bash
#
# Setup turnkey del proxy EmpresaDocs.
# Despliega el Worker en Cloudflare, detecta la URL automáticamente y la cablea
# en .env.local (local) y en el secret de GitHub (producción). Sin placeholders.
#
# Uso:   bash setup.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GH_REPO="BMackenna-G66/lens-ai"

cd "$SCRIPT_DIR"

echo "▶ 1/6  Instalando wrangler..."
npm install

echo "▶ 2/6  Login en Cloudflare (se abrirá el navegador; da clic en Allow)..."
npx wrangler login

echo "▶ 3/6  Desplegando el Worker..."
# Nota: no usar 'set -e' aquí — si el deploy falla queremos ver la salida.
set +e
DEPLOY_OUT="$(npx wrangler deploy 2>&1)"
DEPLOY_RC=$?
set -e
echo "$DEPLOY_OUT"

if [ $DEPLOY_RC -ne 0 ]; then
  echo ""
  echo "✖ El deploy falló (código $DEPLOY_RC). Revisa el error de arriba."
  echo "  Causa típica en cuentas nuevas: falta registrar tu subdominio workers.dev"
  echo "  una vez en https://dash.cloudflare.com → Workers & Pages."
  exit 1
fi

URL="$(printf '%s\n' "$DEPLOY_OUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -n1)"
if [ -z "$URL" ]; then
  echo "✖ Deploy OK pero no detecté la URL. Mírala arriba y configúrala a mano."
  exit 1
fi
echo "✓ Worker desplegado: $URL"

echo "▶ 4/6  Escribiendo EMPRESADOCS_PROXY_URL en .env.local..."
touch "$REPO_ROOT/.env.local"
sed -i '' '/^EMPRESADOCS_PROXY_URL=/d' "$REPO_ROOT/.env.local" 2>/dev/null || true
printf 'EMPRESADOCS_PROXY_URL=%s\n' "$URL" >> "$REPO_ROOT/.env.local"
echo "  ✓ $REPO_ROOT/.env.local"

echo "▶ 5/6  Guardando el secret en GitHub y relanzando el deploy de producción..."
if command -v gh >/dev/null 2>&1; then
  gh secret set EMPRESADOCS_PROXY_URL --repo "$GH_REPO" --body "$URL"
  gh workflow run "Deploy to GitHub Pages" --repo "$GH_REPO" 2>/dev/null \
    && echo "  ✓ secret actualizado y deploy relanzado" \
    || echo "  ✓ secret actualizado (relanza el deploy con un push a main si hace falta)"
else
  echo "  ⚠ 'gh' no está instalado — configura el secret EMPRESADOCS_PROXY_URL a mano."
fi

echo "▶ 6/6  Credenciales de Regcheq (para situación tributaria / SII)..."
echo "  El Worker hace login en la API interna de Regcheq para disparar el SII."
echo "  Se te pedirá email y contraseña de la plataforma (se guardan como secret"
echo "  en Cloudflare, NO en el repo). Podés omitirlo con Ctrl+C si no lo necesitás."
read -r -p "  ¿Configurar credenciales de Regcheq ahora? [s/N] " REPLY_RQ || REPLY_RQ="n"
if [[ "$REPLY_RQ" =~ ^[sSyY]$ ]]; then
  npx wrangler secret put REGCHEQ_EMAIL
  npx wrangler secret put REGCHEQ_PASSWORD
  echo "  ✓ Credenciales guardadas como secrets del Worker."
else
  echo "  ⏭  Omitido. Podés hacerlo luego con:"
  echo "     npx wrangler secret put REGCHEQ_EMAIL"
  echo "     npx wrangler secret put REGCHEQ_PASSWORD"
fi

echo ""
echo "✅ LISTO. El proxy quedó activo en: $URL"
echo "   El Analizador Batch ya funcionará en cualquier PC, sin proxy local."
echo "   La situación tributaria (SII) se dispara sola si cargaste las credenciales."
