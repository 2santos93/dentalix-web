# syntax=docker/dockerfile:1
# DX-083: imagen de producción de la web (Next 16, `output: 'standalone'`).
# La URL de la API (`API_URL`) y el origen de ficheros (`FILES_ORIGIN`) se
# leen en RUNTIME: la misma imagen sirve en staging y en producción.
#   docker build -t dentalix-web .
#   docker run -p 3001:3001 -e API_URL=https://api.dentalix.app/api/v1 dentalix-web
# Salud: GET /api/health. Keep-alive y apagado: ver `server-entry.cjs` (DX-458).

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# Secretos OPCIONALES de build (no quedan en ninguna capa): un `.npmrc`
# (registro privado) y la CA de un proxy con inspección TLS, p. ej.
#   docker build --secret id=npmrc,src=$HOME/.npmrc --secret id=ca,src=ca.crt .
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    --mount=type=secret,id=ca,target=/run/secrets/ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca npm_config_cafile=/run/secrets/ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
# NEXT_PUBLIC_ROOT_DOMAIN sí se incrusta (lo usa el navegador para los enlaces
# entre la raíz y los subdominios de clínica); se fija por build-arg.
ARG NEXT_PUBLIC_ROOT_DOMAIN=dentalix.app
ENV NEXT_PUBLIC_ROOT_DOMAIN=${NEXT_PUBLIC_ROOT_DOMAIN}
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0 \
    NODE_OPTIONS="--require /app/strip-middleware-rewrite.cjs"
# `server.js` mínimo + las dependencias que traza Next; los estáticos y
# public/ no van en standalone y se copian aparte. Todo es del root y de solo
# lectura para el usuario `node` (sin root) que corre el proceso.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# SEC-062: quita `x-middleware-rewrite` (la URL interna de la API) de las respuestas.
COPY scripts/docker/strip-middleware-rewrite.cjs ./strip-middleware-rewrite.cjs
# DX-458 (OPS-054): arranque que envuelve `server.js`: keep-alive y cabeceras
# por encima del balanceador y apagado ordenado con SIGTERM (detalle en el
# fichero). Todo por entorno, en ms; por defecto:
#   HTTP_KEEP_ALIVE_TIMEOUT_MS=65000  (> 60 s de inactividad del balanceador)
#   HTTP_HEADERS_TIMEOUT_MS=66000     (keep-alive + 1 s)
#   SHUTDOWN_DRAIN_MS=15000           (salud en 503 atendiendo, antes de cerrar)
#   SHUTDOWN_TIMEOUT_MS=25000         (tope para las peticiones en vuelo)
# Sonda: GET /api/health. El periodo de gracia del orquestador tiene que ser
# mayor que drenaje + tope (40 s): `docker stop -t 45`, o
# `terminationGracePeriodSeconds: 45` en Kubernetes.
COPY scripts/docker/server-entry.cjs ./server-entry.cjs
USER node
EXPOSE 3001
CMD ["node", "server-entry.cjs"]
