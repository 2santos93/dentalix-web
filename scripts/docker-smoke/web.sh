#!/usr/bin/env bash
# DX-083 (OPS-024, OPS-041): prueba de humo de la imagen de la web. La MISMA
# imagen, construida una vez, se arranca contra dos APIs distintas cambiando
# solo API_URL (y FILES_ORIGIN), y se comprueba en cada una que:
#   - /api/v1/* llega a SU API (ruta, query y X-Forwarded-Host del host de la clínica);
#   - la URL `inline` de un documento que da esa API tiene su origen en el
#     `frame-src` y el `img-src` de la CSP que sirve la web (si no, el visor no la pinta);
#   - sin API_URL la imagen NO arranca en producción.
# Usa --network host (las APIs falsas escuchan en 127.0.0.1) y node del host.
#   scripts/docker-smoke/web.sh dentalix-web:ci
set -euo pipefail

IMAGE="${1:?Uso: $0 <imagen>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB_PORT="${SMOKE_WEB_PORT:-3301}"
PIDS=()
CONTAINERS=()

cleanup() {
  for c in "${CONTAINERS[@]}"; do docker rm -f "$c" >/dev/null 2>&1 || true; done
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
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
