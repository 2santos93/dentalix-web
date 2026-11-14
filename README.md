This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Variables de entorno

Copia `.env.example` a `.env.local`. La URL de la API y el origen de los
ficheros son variables de **servidor** que se leen en runtime (DX-083), así la
misma imagen sirve en staging y en producción:

| Variable | Para qué | Por defecto (fuera de producción) |
|---|---|---|
| `API_URL` | Destino del proxy `/api/v1` (`src/proxy.ts`), SSR y subida de la importación | `http://localhost:3000/api/v1` |
| `FILES_ORIGIN` | Origen del bucket en la CSP (`img-src`, `frame-src`, `connect-src`) | el origen de `API_URL` |
| `NEXT_PUBLIC_ROOT_DOMAIN` | Dominio raíz de las clínicas; se incrusta al compilar (build-arg de la imagen) | `dentalix.local` |

**Migración**: `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_FILES_ORIGIN` ya no se
leen. Si siguen en tu `.env.local`, renómbralas a `API_URL` y `FILES_ORIGIN`;
la web avisa al arrancar mientras no lo hagas. En producción (`next start` o
la imagen) la web no arranca sin una `API_URL` http(s) válida.

**El origen de la API es público (SEC-065).** La CSP lleva el origen de
`API_URL` en `img-src` (`src/lib/security/csp.ts`), así que cualquier visitante
lo ve en la cabecera `Content-Security-Policy`. Es a propósito: ese origen ya es
público por diseño. Los logos y avatares que devuelve la API son URL absolutas
sobre `FILES_PUBLIC_BASE_URL` de la API (en producción, obligatoria, https y no
local; ejemplo `https://api.dentalix.app/api/v1/files`). Esas mismas URL van
dentro de los emails a los pacientes, y su cliente de correo solo puede cargar
la imagen desde un origen público. Lo que oculta SEC-064 (sin
`x-middleware-rewrite`) es el destino del proxy cuando NO coincide con ese
origen público. Si algún día la API pasa a ser privada (solo detrás del
`/api/v1` de la web), habrá que servir los ficheros por el mismo origen de la
web, también en emails y PDF, y quitar `apiOrigin` de `img-src`.

Imagen de producción: `Dockerfile` (`output: 'standalone'`); runbook en
`dentalix-docs/docs/operacion/despliegue.md`. La imagen arranca con
`scripts/docker/server-entry.cjs` (DX-458), que envuelve el `server.js` de Next:

| Variable (ms) | Para qué | Por defecto |
|---|---|---|
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | Inactividad tras la que la web cierra una conexión keep-alive; MAYOR que la del balanceador (60 s típicos), o hay 502 esporádicos | `65000` |
| `HTTP_HEADERS_TIMEOUT_MS` | Plazo para recibir las cabeceras; mayor que el keep-alive | keep-alive + `1000` |
| `SHUTDOWN_DRAIN_MS` | Con SIGTERM, `/api/health` da 503 y la web sigue atendiendo este tiempo antes de cerrar | `15000` |
| `SHUTDOWN_TIMEOUT_MS` | Tope para terminar las peticiones en vuelo tras cerrar; vencido, las corta y sale con 1 | `25000` |

Con valores inválidos la imagen no arranca y dice por qué. Sonda:
`GET /api/health` → `200 {"status":"ok"}` (503 `{"status":"draining"}` al
apagar); no llama a la API ni pasa por `src/proxy.ts`. El periodo de gracia
del orquestador tiene que ser mayor que drenaje + tope (45 s con los valores
por defecto).

## Marca de la clínica en el servidor (DX-517-ter)

El layout raíz y las páginas de acceso piden la marca (nombre, logo, color y
textos de moneda) en el render de servidor con el `Host` de la petición:
`GET /public/tenant/branding/by-host?host=<host>` de la API, que resuelve
subdominios de la plataforma, `*.localhost` y dominios propios verificados sin
mirar ninguna cabecera. Así el primer HTML ya trae la marca: sin parpadeo y
sin volver a montar el árbol. Detalles (`src/lib/branding.ts`):

- Timeout de 1 s. Caché en memoria del proceso, por host (sin puerto): 30 s si
  hay clínica, 60 s si no la hay; los errores no se guardan.
- El servidor indica `clinic`, `none` o `unknown`; el navegador solo vuelve a
  pedir la marca con `unknown` (la API no contestó a tiempo).
- Al guardar la marca (Ajustes › Datos de la clínica: nombre, color, logo) o
  los textos de moneda, la pestaña llama a `POST /api/branding-cache` (ruta de
  la web, solo del mismo origen, sin parámetros ni respuesta): la réplica que
  la atiende olvida la marca de **ese** host y la siguiente página ya sale con
  la nueva. **Las demás réplicas de la web pueden seguir sirviendo la marca
  anterior hasta 30 s.** Desactivar un dominio propio corta el acceso al
  momento (la API no cachea); solo su marca cosmética puede seguir hasta 30 s.
- El HTML es dinámico (nonce de la CSP por petición): ninguna CDN debe
  cachearlo.

## Regenerar el esquema de la API

`src/lib/api/schema.d.ts` lo genera `openapi-typescript` a partir del OpenAPI de
`dentalix-api`; no se edita a mano. Tras un cambio de contrato en la API:

```bash
# En dentalix-api (rama o main que quieras reflejar): puerto 3002, nunca el 3000
PORT=3002 npm run start:dev        # o `npm run build && PORT=3002 npm run start:prod`

# En dentalix-web
npm run codegen                    # http://127.0.0.1:3002/docs-json -> src/lib/api/schema.d.ts
npx tsc --noEmit                   # lo que rompa se adapta en la web: manda el contrato
```

Para los tipos hay que usar `components['schemas'][...]`, no copias a mano.

La API debe correr con un `NODE_ENV` distinto de `production` o con
`SWAGGER_ENABLED=true`; si no, `/docs-json` no existe.

### Guarda en CI y orden de merge

La CI (`E2E`, paso «Esquema de la API al día», `scripts/e2e-ci.sh schema`)
levanta la API del `api_ref` y falla, con el diff, si el esquema commiteado
difiere. En `push` y `pull_request` el `api_ref` es siempre `main`: solo
`workflow_dispatch` permite elegir otra rama. Por eso:

- Orden de merge: primero la API, después la web. El PR web con un esquema
  generado desde una rama de la API sin mergear sale rojo hasta que esa API
  esté en `main`; para validarlo antes, lanza el workflow a mano con
  `api_ref` = la rama de la API.
- Un merge en la API que cambie el contrato pone en rojo `main` de la web (y
  los PR abiertos) aunque la web no cambie, hasta que alguien regenere el
  esquema con los pasos de arriba (API de `main` en :3002, `npm run codegen`) y
  lo commitee. El fallo llega unos 20 minutos después de arrancar, tras el build.

### La E2E en CI: shards y artefactos

La E2E (`.github/workflows/e2e.yml`) reparte la suite en 3 shards (DX-457). Cada
job `Playwright i/3 (web + API + Postgres 16)` levanta su propio Postgres, su API,
su demo, su esquema y su web y corre `--shard=i/3`; el paso «Playwright» tiene
35 min de tope y su duración (con aviso al 70 %) sale en el resumen del shard.
El check `Playwright (web + API + Postgres 16)` es el job de fusión: comprueba que
cada fichero de la suite corrió en un shard y solo en uno, que llegaron los
informes de todos, los fusiona y pasa la guardia de saltos y de flaky. Es rojo si
cualquier shard lo es.

Artefactos de cada run (entre paréntesis, cuánto duran):

- `playwright-<run_id>-<intento>` (14 días): el informe HTML y
  `playwright-results.json` fusionados (el HTML trae las trazas y capturas de
  los fallos).
- `playwright-<run_id>-<intento>-shard-<i>` (14 días): `test-results/` y los
  logs de la API y de la web (`.e2e/logs/`) de ese shard.
- `e2e-shard-<i>` (7 días): los ficheros que corrió el shard (`proyecto fichero`).
- `blob-<run_id>-<intento>-<i>` (7 días): el informe del shard para la fusión.
- `e2e-flaky` (30 días): solo en `main`, los flaky de la run para la tendencia.

La fusión también comprueba que el informe fusionado tiene tantos tests como la
lista completa (`Total: N tests` de `--list`).

«Re-run failed jobs» solo relanza los shards rojos y la fusión: se queda con el
blob del intento más alto de cada shard (y avisa en el resumen si mezcla
intentos). Pasados 7 días los blobs de los shards que no se relanzan ya no
existen y la fusión sale en rojo con «falta el informe (blob) del shard i/3»:
entonces hay que usar «Re-run all jobs». Si los shards se cancelan (un push
nuevo al PR), la fusión sale en rojo en el acto, sin fusionar nada.

Para reproducir un shard en local, con el mismo reparto que la CI (en local no
hay `CI`: sin el reintento de la CI y con los reporters `list` y `json`):

```bash
scripts/e2e-ci.sh all --shard=2/3
# qué ficheros le tocan, sin ejecutar nada
E2E_WEB_SERVER=none npx playwright test --list --shard=2/3
```

Con `grep` o `repeat_each` (lanzamiento manual, DX-413) la run va en un solo shard
(`Playwright 1/1`), sin reintentos y con los topes largos (50 min filtrada, 200
repetida): repartidas, las repeticiones de un mismo test caerían en runners
distintos. Para pasar a 4 shards hay que cambiar el `[1, 2, 3]` de
`matrix.shard`, el `[3]` de `matrix.total` y el `|| 3` del `SHARD_TOTAL` del
job de fusión; `scripts/workflows-e2e-shards.test.ts` exige que coincidan.

### Relanzar la E2E de un merge web bloqueado

Si el paso «API (build y start:prod)» de la E2E de `main` falla, el job termina
con el paso final «Bloqueado por la API (dentalix-api)» (en cada shard) y el resumen del job dice
`bloqueado por dentalix-api@<sha>`: la web no se probó (no hubo Playwright), pero
el fallo es de la API, no de la web. Los push a `main` no cancelan la CI ni la
E2E de otro (cada merge tiene la suya).

Cuando la API vuelva a verde, relanza la E2E de cada merge bloqueado con
`workflow_dispatch` y el sha de la web (input `web_sha`; `api_ref` por defecto es
`main`). No hace falta ningún secreto nuevo, solo `gh` con permiso sobre el repo:

```bash
# un merge
scripts/e2e-relaunch.sh <sha-de-la-web>
# varios, del más viejo al más nuevo
scripts/e2e-relaunch.sh <sha1> <sha2> <sha3>
# lo que hace por debajo
gh workflow run e2e.yml --repo 2santos93/dentalix-web --ref main -f web_sha=<sha> -f api_ref=main
```

El sha va completo (40 caracteres: `git rev-parse <sha>`); el workflow rechaza
cualquier otro valor. El YAML del workflow es el de `main`; solo los archivos
de la web (`scripts/e2e-ci.sh`, specs) son los del sha. Por eso solo vale para
shas que ya tengan las fases `skips` y `schema` (DX-252, DX-537): uno anterior
falla con «Fase desconocida». El run relanzado se llama `E2E web@<sha> api@<ref>`.

Para saber cuáles quedaron bloqueados: `gh run list --repo 2santos93/dentalix-web
--workflow e2e.yml --branch main --status failure` y abrir el resumen de cada una.
El run relanzado queda en la lista de `E2E` con el sha en su resumen.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Pruebas e2e y PDF

La suite e2e requiere `pdftotext` de Poppler para verificar el texto de los PDF. En macOS instala `brew install poppler`; en Debian o Ubuntu instala el paquete `poppler-utils`. Después ejecuta `scripts/e2e-ci.sh setup` antes de las demás fases de la suite.
