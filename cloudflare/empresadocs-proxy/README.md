# EmpresaDocs S3 Relay — Cloudflare Worker

Micro-proxy que resuelve el bloqueo CORS al descargar documentos de EmpresaDocs
desde S3. Reemplaza la dependencia del `empresa_docs_app.py` local: con esto el
Analizador Batch funciona en **cualquier PC sin instalar nada**.

## Por qué

El navegador ya obtiene la URL firmada (presigned) de S3 sin problema — la API de
Global66 permite CORS. Lo único que el navegador **no** puede hacer es descargar el
archivo directo de S3, porque ese bucket (de un tercero) no envía cabeceras CORS.

Este Worker descarga el archivo del lado servidor y lo reenvía con CORS permitido.
**No maneja credenciales** — solo reenvía URLs ya firmadas, y solo hacia hosts de S3.

## Deploy (una vez)

```bash
cd cloudflare/empresadocs-proxy
npm install          # instala wrangler
npx wrangler login   # abre el navegador para autenticar tu cuenta Cloudflare
npx wrangler deploy
```

Al terminar, wrangler imprime la URL pública, por ejemplo:

```
https://empresadocs-proxy.tu-subdominio.workers.dev
```

## Conectar con el frontend

Esa URL va en la variable `EMPRESADOCS_PROXY_URL`:

- **Local** (`.env.local` en la raíz del repo):
  ```
  EMPRESADOCS_PROXY_URL=https://empresadocs-proxy.tu-subdominio.workers.dev
  ```
- **Producción** (GitHub Pages): agregar el secret `EMPRESADOCS_PROXY_URL` en
  *Settings → Secrets and variables → Actions* del repo, y pasarlo en el step de
  build del workflow (junto a `GEMINI_API_KEY`).

El cliente prueba, en orden: (1) proxy Python local si está corriendo, (2) descarga
directa de S3, (3) este relay cloud. Si `EMPRESADOCS_PROXY_URL` está vacío, el paso 3
se omite y se mantiene el comportamiento anterior.

## Seguridad

- Solo reenvía a hosts `*.amazonaws.com` (anti-SSRF).
- `Access-Control-Allow-Origin` restringido a los orígenes en `ALLOWED_ORIGINS`
  (edita `src/index.ts` si cambia el dominio de despliegue).
