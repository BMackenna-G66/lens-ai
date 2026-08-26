#!/usr/bin/env bash
# Empaqueta el handler junto con el código del repo que reusa.
#
# El bundle es el que garantiza que las reglas no se dupliquen: `screenCaso`,
# `evaluarCasoAuto` y `camposDeCierre` entran acá desde services/, no copiados.
# Si alguien cambia una regla en la app, el próximo build la trae.
#
# `firebase-admin` queda EXTERNO: trae binarios nativos y bundlearlo rompe.
#
# `import.meta.env` es de Vite y en Node no existe: al cargar el módulo tira
# "Cannot read properties of undefined". Se redefine a `process.env`, así los
# tres archivos que leen las claves del proveedor (lens360Service,
# regcheqEnrichment, remesaScreeningService) las toman de las variables de entorno
# del Lambda. La app en el navegador no cambia: ahí Vite las sustituye en su
# propio build.
set -euo pipefail
cd "$(dirname "$0")"
raiz="../.."

rm -rf dist && mkdir -p dist

npx esbuild src/index.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --external:firebase-admin \
  --external:@aws-sdk/client-eventbridge \
  --define:import.meta.env=process.env \
  --outfile=dist/index.mjs \
  --log-level=warning

# SAM instala esto dentro del paquete de la función.
cat > dist/package.json <<'JSON'
{
  "name": "lens-flujo-autonomo-dist",
  "version": "1.0.0",
  "type": "module",
  "dependencies": { "firebase-admin": "^12.7.0", "@aws-sdk/client-eventbridge": "^3.1118.0" }
}
JSON

# Las dependencias van DENTRO del paquete. `sam deploy` zipea `dist/` tal cual y
# no instala nada, así que sin esto la función arranca y muere con
# "Cannot find package 'firebase-admin'".
( cd dist && npm install --omit=dev --no-audit --no-fund --silent )

echo "dist/index.mjs  $(wc -c < dist/index.mjs) bytes"
echo "dist/node_modules  $(du -sh dist/node_modules 2>/dev/null | cut -f1)"
