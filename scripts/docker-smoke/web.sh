#!/usr/bin/env bash
# DX-083 (OPS-024, OPS-041): prueba de humo de la imagen de la web. La MISMA
# imagen, construida una vez, se arranca contra dos APIs distintas cambiando
# solo API_URL (y FILES_ORIGIN), y se comprueba en cada una que:
#   - /api/v1/* llega a SU API (ruta, query y X-Forwarded-Host del host de la clínica);
#   - la URL `inline` de un documento que da esa API tiene su origen en el
#     `frame-src` y el `img-src` de la CSP que sirve la web (si no, el visor no la pinta);
#   - SEC-062: ninguna respuesta de la web lleva `x-middleware-rewrite` (la URL interna de la API);
#   - sin API_URL la imagen NO arranca en producción;
#   - DX-458 (OPS-054): /api/health da 200 `{"status":"ok"}` en cualquier host sin
#     llamar a la API; el keep-alive anuncia 65 s y una conexión ociosa 8 s se
#     reutiliza; con SIGTERM la salud da 503 mientras drena, luego rechaza
#     conexiones nuevas, termina la petición en vuelo y sale con 0; y si la
#     petición dura más que SHUTDOWN_TIMEOUT_MS la corta y sale con 1.
# Usa --network host (las APIs falsas escuchan en 127.0.0.1) y node del host.
#   scripts/docker-smoke/web.sh dentalix-web:ci
set -euo pipefail

IMAGE="${1:?Uso: $0 <imagen>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB_PORT="${SMOKE_WEB_PORT:-3301}"
PIDS=()
CONTAINERS=()
TMP="$(mktemp -d)"

cleanup() {
  for c in "${CONTAINERS[@]}"; do docker rm -f "$c" >/dev/null 2>&1 || true; done
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  rm -f "$TMP"/* && rmdir "$TMP" || true
}
trap cleanup EXIT

fail() { echo "FALLO: $*" >&2; exit 1; }

wait_http() {
  local url="$1" name="$2"
  for _ in $(seq 1 60); do
    if curl -fs -o /dev/null "$url"; then return 0; fi
    if ! docker ps -q --filter "name=^${name}$" | grep -q .; then
      docker logs "$name" >&2 || true
      fail "$name terminó antes de responder"
    fi
    sleep 1
  done
  docker logs "$name" >&2 || true
  fail "$name no respondió en $url"
}

check_api() {
  local label="$1" api_port="$2" files_origin="$3"
  local name="dx-web-smoke-$label"
  node "$HERE/fake-api.mjs" "$api_port" "$label" "$files_origin" &
  PIDS+=("$!")
  docker run -d --name "$name" --network host \
    -e PORT="$WEB_PORT" \
    -e API_URL="http://127.0.0.1:${api_port}/api/v1" \
    -e FILES_ORIGIN="$files_origin" \
    "$IMAGE" >/dev/null
  CONTAINERS+=("$name")
  wait_http "http://127.0.0.1:${WEB_PORT}/login" "$name"

  # 1) El proxy /api/v1 va a ESTA API, con ruta, query y host de la clínica.
  local reply
  reply="$(curl -fsS -H 'Host: demo.dentalix.app' "http://127.0.0.1:${WEB_PORT}/api/v1/health/ready?x=1")"
  echo "[$label] /api/v1 → $reply"
  node -e '
    const r = JSON.parse(process.argv[1]);
    const ok = r.api === process.argv[2] && r.path === "/api/v1/health/ready?x=1" && r.forwardedHost === "demo.dentalix.app";
    process.exit(ok ? 0 : 1);
  ' "$reply" "$label" || fail "[$label] /api/v1 no llegó a su API: $reply"

  # 1b) SEC-062: ni la respuesta del proxy /api/v1 ni la de una página dejan ver
  # la URL interna de la API en `x-middleware-rewrite`.
  local path_ headers
  for path_ in "/api/v1/health/ready?x=1" "/login"; do
    headers="$(curl -sS -o /dev/null -D - -H 'Host: demo.dentalix.app' "http://127.0.0.1:${WEB_PORT}${path_}" | tr -d '\r')"
    if grep -qi '^x-middleware-rewrite:' <<<"$headers"; then
      fail "[$label] ${path_} expone x-middleware-rewrite: $(grep -i '^x-middleware-rewrite:' <<<"$headers")"
    fi
    grep -qi '^HTTP/[0-9.]* 200' <<<"$headers" || fail "[$label] ${path_} no respondió 200"
    # Solo en la respuesta del proxy: la CSP de las páginas lleva el origen de la
    # API en `img-src` a propósito (csp.ts), así que /login no se mira aquí.
    if [[ "$path_" == /api/v1/* ]] && grep -q "127.0.0.1:${api_port}" <<<"$headers"; then
      fail "[$label] ${path_} deja ver la URL interna de la API en las cabeceras"
    fi
  done
  echo "[$label] sin x-middleware-rewrite en /api/v1 ni en /login"

  # 2) El origen de la URL inline del documento está en la CSP servida.
  local inline origin csp
  inline="$(curl -fsS -H 'Host: demo.dentalix.app' -H 'Authorization: Bearer humo' \
    "http://127.0.0.1:${WEB_PORT}/api/v1/patients/p1/documents/d1/url/inline")"
  origin="$(node -e 'console.log(new URL(JSON.parse(process.argv[1]).url).origin)' "$inline")"
  csp="$(curl -fsS -o /dev/null -D - -H 'Host: demo.dentalix.app' "http://127.0.0.1:${WEB_PORT}/login" \
    | tr -d '\r' | sed -n 's/^content-security-policy: //Ip')"
  echo "[$label] inline en $origin; CSP: $csp"
  [[ -n "$csp" ]] || fail "[$label] la página no trae CSP"
  for directive in frame-src img-src; do
    grep -Eq "(^|; *)${directive} [^;]*${origin}( |;|$)" <<<"$csp" \
      || fail "[$label] $origin no está en ${directive} de la CSP"
  done

  docker rm -f "$name" >/dev/null
}

check_api a 4311 "https://bucket-a.example.com"
check_api b 4312 "https://bucket-b.example.com"

# 4) DX-458 (OPS-054): salud, keep-alive y apagado ordenado.
LIFE_API_PORT=4313
LIFE_API_URL="http://127.0.0.1:${LIFE_API_PORT}/api/v1"
WEB="http://127.0.0.1:${WEB_PORT}"
node "$HERE/fake-api.mjs" "$LIFE_API_PORT" c "https://bucket-c.example.com" &
PIDS+=("$!")
api_stat() {
  node -e 'console.log(JSON.parse(process.argv[1])[process.argv[2]])' \
    "$(curl -fsS "http://127.0.0.1:${LIFE_API_PORT}/__stats")" "$1"
}
# Espera (sin dormir a ciegas) a que `cond` se cumpla; si no, falla.
poll() {
  local what="$1" seconds="$2"; shift 2
  local until=$((SECONDS + seconds))
  until "$@"; do
    (( SECONDS < until )) || fail "no se cumplió en ${seconds} s: $what"
    sleep 0.2
  done
}
api_up() { curl -fs -o /dev/null "http://127.0.0.1:${LIFE_API_PORT}/__stats"; }
poll "la API falsa c responde" 20 api_up
running() { docker ps -q --filter "name=^$1$" | grep -q .; }
stopped() { ! running "$1"; }
start_web() {
  local name="$1"; shift
  docker run -d --name "$name" --network host -e PORT="$WEB_PORT" \
    -e API_URL="$LIFE_API_URL" -e FILES_ORIGIN="https://bucket-c.example.com" "$@" "$IMAGE" >/dev/null
  CONTAINERS+=("$name")
  wait_http "${WEB}/api/health" "$name"
}
# Lanza una petición lenta por el proxy /api/v1 en segundo plano y espera a
# que llegue a la API (está en vuelo en la web). Deja su PID en SLOW_PID.
start_slow() {
  local ms="$1" before
  before="$(api_stat slowStarted)"
  curl -sS -o "$TMP/slow.body" -w '%{http_code}' -H 'Host: demo.dentalix.app' \
    "${WEB}/api/v1/slow?ms=${ms}" >"$TMP/slow.code" 2>"$TMP/slow.err" &
  SLOW_PID=$!
  slow_arrived() { (( $(api_stat slowStarted) > before )); }
  poll "la petición lenta llega a la API" 20 slow_arrived
}

name="dx-web-smoke-apagado"
start_web "$name" -e SHUTDOWN_DRAIN_MS=4000 -e SHUTDOWN_TIMEOUT_MS=30000

# 4a) /api/health: 200, cuerpo fijo sin datos, sin caché, en cualquier host, sin
# pasar por proxy.ts (sin CSP, sin redirección) y sin llamar a la API.
requests_before="$(api_stat requests)"
for host in demo.dentalix.app dentalix.app cualquier.example.com; do
  code="$(curl -sS -D "$TMP/health.h" -o "$TMP/health.b" -w '%{http_code}' -H "Host: ${host}" "${WEB}/api/health")"
  tr -d '\r' <"$TMP/health.h" >"$TMP/health.h2"
  [[ "$code" == 200 ]] || fail "[salud ${host}] respondió ${code}"
  [[ "$(cat "$TMP/health.b")" == '{"status":"ok"}' ]] || fail "[salud ${host}] cuerpo inesperado: $(cat "$TMP/health.b")"
  grep -qi '^cache-control: no-store' "$TMP/health.h2" || fail "[salud ${host}] sin Cache-Control: no-store"
  if grep -Eqi '^(location|content-security-policy|x-middleware-rewrite):' "$TMP/health.h2"; then
    fail "[salud ${host}] pasó por proxy.ts: $(cat "$TMP/health.h2")"
  fi
done
[[ "$(api_stat requests)" == "$requests_before" ]] || fail "/api/health llamó a la API"
echo "Salud: 200 {\"status\":\"ok\"} en cualquier host, sin caché y sin llamar a la API."

# 4b) Keep-alive por encima de los 60 s del balanceador.
grep -qi '^keep-alive: timeout=65$' "$TMP/health.h2" || fail "sin Keep-Alive: timeout=65: $(grep -i '^keep-alive' "$TMP/health.h2" || echo ninguno)"
node "$HERE/keep-alive.mjs" "${WEB}/api/health" 8000
docker logs "$name" 2>&1 | grep -q 'keep-alive 65000 ms, cabeceras 66000 ms, drenaje 4000 ms, tope de apagado 30000 ms' \
  || fail "el arranque no registró los plazos: $(docker logs "$name" 2>&1 | tail -5)"

# 4c) SIGTERM con una petición en vuelo (12 s): salud 503 mientras drena,
# después conexiones nuevas rechazadas con la lenta aún en vuelo, la lenta
# termina con 200 y el proceso sale con 0.
start_slow 12000
docker kill --signal SIGTERM "$name" >/dev/null
health_draining() {
  [[ "$(curl -s -o "$TMP/drain.b" -w '%{http_code}' "${WEB}/api/health" || true)" == 503 ]]
}
poll "la salud da 503 al drenar" 4 health_draining
[[ "$(cat "$TMP/drain.b")" == '{"status":"draining"}' ]] || fail "cuerpo de la salud al drenar: $(cat "$TMP/drain.b")"
echo "SIGTERM: la salud da 503 {\"status\":\"draining\"} mientras drena."
refused() {
  local rc=0
  curl -s -o /dev/null --max-time 2 "${WEB}/api/health" || rc=$?
  [[ "$rc" == 7 ]]
}
poll "conexiones nuevas rechazadas tras el drenaje" 15 refused
running "$name" || fail "el proceso salió antes de terminar la petición en vuelo"
kill -0 "$SLOW_PID" 2>/dev/null || fail "la petición lenta terminó antes de tiempo"
echo "Tras el drenaje: conexiones nuevas rechazadas, con la petición lenta aún en vuelo."
wait "$SLOW_PID" || fail "la petición en vuelo falló: $(cat "$TMP/slow.err")"
[[ "$(cat "$TMP/slow.code")" == 200 ]] || fail "la petición en vuelo respondió $(cat "$TMP/slow.code")"
grep -q '"slow":"done"' "$TMP/slow.body" || fail "la petición en vuelo no llegó entera: $(cat "$TMP/slow.body")"
poll "el proceso sale tras la petición en vuelo" 20 stopped "$name"
status="$(docker inspect -f '{{.State.ExitCode}}' "$name")"
[[ "$status" == 0 ]] || fail "apagado ordenado salió con ${status}: $(docker logs "$name" 2>&1 | tail -5)"
docker logs "$name" 2>&1 | grep -q 'sin peticiones en vuelo: sale con 0' || fail "el log no cuenta el apagado"
echo "La petición en vuelo terminó con 200 y el proceso salió con 0."
docker rm -f "$name" >/dev/null

# 4d) Tope: una petición más larga que SHUTDOWN_TIMEOUT_MS se corta y sale con 1.
name="dx-web-smoke-tope"
start_web "$name" -e SHUTDOWN_DRAIN_MS=0 -e SHUTDOWN_TIMEOUT_MS=2000
start_slow 30000
docker kill --signal SIGTERM "$name" >/dev/null
poll "el proceso sale al vencer el tope" 10 stopped "$name"
status="$(docker inspect -f '{{.State.ExitCode}}' "$name")"
[[ "$status" == 1 ]] || fail "con el tope vencido salió con ${status} (se esperaba 1)"
wait "$SLOW_PID" || true
[[ "$(cat "$TMP/slow.code")" != 200 ]] || fail "la petición cortada respondió 200"
docker logs "$name" 2>&1 | grep -q 'vencieron SHUTDOWN_TIMEOUT_MS (2000 ms)' || fail "el log no cuenta el corte"
echo "Tope de apagado: corta la petición en vuelo y sale con 1 a los 2 s."
docker rm -f "$name" >/dev/null

# 3) Sin API_URL, en producción, la imagen no arranca (OPS-024).
name="dx-web-smoke-sin-api"
CONTAINERS+=("$name")
docker run -d --name "$name" --network host -e PORT="$WEB_PORT" "$IMAGE" >/dev/null
for _ in $(seq 1 30); do
  if ! docker ps -q --filter "name=^${name}$" | grep -q .; then break; fi
  if curl -fs -o /dev/null "http://127.0.0.1:${WEB_PORT}/login"; then
    fail "la web arrancó sin API_URL"
  fi
  sleep 1
done
status="$(docker inspect -f '{{.State.ExitCode}}' "$name")"
[[ "$status" != 0 ]] || fail "sin API_URL la web salió con código 0"
docker logs "$name" 2>&1 | grep -q 'API_URL' || fail "sin API_URL no se explica el motivo en el log"
echo "Sin API_URL: no arranca (código $status) y el log dice por qué."
echo "Humo de la imagen de la web: OK"
