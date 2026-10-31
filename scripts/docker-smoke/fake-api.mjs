// DX-083: API falsa para la prueba de humo de la imagen de la web
// (scripts/docker-smoke/web.sh). Responde a cualquier ruta con su nombre, la
// ruta recibida y el X-Forwarded-Host, y a `/url/inline` de un documento con
// una URL firmada falsa en FILES_ORIGIN, como la API real con S3.
//   node fake-api.mjs <puerto> <nombre> <origen-de-ficheros>
import { createServer } from 'node:http';

const [port, name, filesOrigin] = process.argv.slice(2);

createServer((req, res) => {
  const url = req.url ?? '/';
  const body = /\/documents\/[^/]+\/url\/inline$/.test(url.split('?')[0])
    ? { url: `${filesOrigin}/dentalix/doc.pdf?X-Amz-Signature=humo`, expiresAt: new Date(Date.now() + 60_000).toISOString() }
    : { api: name, path: url, forwardedHost: req.headers['x-forwarded-host'] ?? null };
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}).listen(Number(port), '127.0.0.1', () => console.log(`fake-api ${name} en :${port}`));
