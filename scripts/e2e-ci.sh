#!/usr/bin/env bash
# Suite Playwright de la web contra una API y una base reales, en modo
# producción (`next build` + `next start`). Es la MISMA secuencia que corre
# `.github/workflows/e2e.yml` (DX-070): el workflow llama a cada fase en su
# propio paso y en local se corren todas con `all`.
#
#   scripts/e2e-ci.sh all                # todo, y para los servidores al final
#   scripts/e2e-ci.sh setup|sync|db|api|web|test|skips|stop   # una fase
#
# `sync` (DX-350) falla si una lista que la API posee y la web copia byte a
# byte (moneda sin decimales, zonas IANA, vectores de formato, países) diverge de la
# de $API_DIR (scripts/check-api-reference-sync.mjs).
#
# `skips` (DX-252) falla si el informe de `test` tiene tests saltados fuera de
# e2e/allowed-skips.json, y los nombra (scripts/check-e2e-skips.mjs).
#
# Variables (todas con default para la CI; en local se cambian puertos y BD):
#   API_DIR          checkout de dentalix-api            (../dentalix-api)
#   PG_HOST/PG_PORT  Postgres                            (localhost/5432)
#   PG_SUPERUSER/PG_SUPERPASS  dueño de la base (migra)  (dentalix/dentalix)
#   E2E_DB_NAME      base desechable de la suite         (dentalix_test)
#   E2E_API_PORT     puerto de la API                    (3000)
#   E2E_WEB_PORT     puerto de la web                    (3001)
#   E2E_NPM_CI       1 = `npm ci` en los dos repos       (1)
#   E2E_INSTALL_BROWSERS  1 = `playwright install --with-deps chromium` (0)
#   E2E_STATE_DIR    pids, logs y env generado           (.e2e)
#   PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium del sistema (opcional)
#   Argumentos extra de `test`/`all` van a `playwright test`.
#
# Sin secretos: la base es efímera y los JWT se generan con openssl en cada
# ejecución (se guardan en $E2E_STATE_DIR/env, 0600, que no se commitea).
set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${API_DIR:-$WEB_DIR/../dentalix-api}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_SUPERUSER="${PG_SUPERUSER:-dentalix}"
PG_SUPERPASS="${PG_SUPERPASS:-dentalix}"
E2E_DB_NAME="${E2E_DB_NAME:-dentalix_test}"
E2E_API_PORT="${E2E_API_PORT:-3000}"
E2E_WEB_PORT="${E2E_WEB_PORT:-3001}"
E2E_NPM_CI="${E2E_NPM_CI:-1}"
E2E_INSTALL_BROWSERS="${E2E_INSTALL_BROWSERS:-0}"
STATE_DIR="${E2E_STATE_DIR:-$WEB_DIR/.e2e}"
LOG_DIR="$STATE_DIR/logs"

API_URL="http://localhost:${E2E_API_PORT}/api/v1"
WEB_URL="http://localhost:${E2E_WEB_PORT}"
# El dueño migra y siembra; la app corre con el rol sin privilegios (RLS),
# igual que en el CI de la API y en docker-compose.
DIRECT_URL="postgresql://${PG_SUPERUSER}:${PG_SUPERPASS}@${PG_HOST}:${PG_PORT}/${E2E_DB_NAME}?schema=public"
DATABASE_URL="postgresql://dentalix_app:dentalix_app@${PG_HOST}:${PG_PORT}/${E2E_DB_NAME}?schema=public"

mkdir -p "$LOG_DIR"

group() { if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::group::$*"; else echo "==> $*"; fi; }
endgroup() { if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::endgroup::"; fi; }

psql_owner() {
  PGPASSWORD="$PG_SUPERPASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_SUPERUSER" -v ON_ERROR_STOP=1 -qtA "$@"
}

# Env de la API: se genera UNA vez por ejecución y lo leen todas las fases.
load_env() {
  local file="$STATE_DIR/env"
  if [[ ! -f "$file" ]]; then
    (
      umask 077
      echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)"
      echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
    ) > "$file"
  fi
  set -a
  # shellcheck source=/dev/null
  source "$file"
  set +a
  # No NODE_ENV=production: la API lo reserva para despliegues reales (exige
  # https, dominios no locales y contraseñas de BD no de ejemplo, y marca la
  # cookie como Secure). `start:prod` sí es el binario compilado de producción.
  export PORT="$E2E_API_PORT"
  # DX-284: la API corre también el worker de la cola (DX-085) en el mismo
  # proceso. Sin él, la importación de pacientes (DX-107) y sus saldos
  # migrados (DX-262) se quedan «En cola» para siempre, y ese lote sin
  # terminar bloquea cualquier otra importación de la clínica demo.
  export APP_ROLE=all
  export DATABASE_URL
  export DIRECT_URL
  export JWT_ACCESS_TTL=900s
  export JWT_REFRESH_TTL=30d
  export EXCHANGE_APP_ID=''
  export EXCHANGE_BASE_URL=https://openexchangerates.org/api
  export TENANT_BASE_DOMAINS=dentalix.app,localhost
  export CORS_ORIGINS="$WEB_URL"
  export CORS_ROOT_DOMAIN=localhost
  export TRUST_PROXY=false
  export STORAGE_DIR="$STATE_DIR/storage"
  export FILES_PUBLIC_BASE_URL="${API_URL}/files"
  export LOG_FORMAT=json
  # La suite entera sale de una sola IP y registra/inicia sesión decenas de
  # veces: con los límites reales acabaría en 429.
  export RATE_LIMIT_GLOBAL_LIMIT=100000
  export RATE_LIMIT_AUTH_LIMIT=100000
  export RATE_LIMIT_REFRESH_LIMIT=100000
  export RATE_LIMIT_LOGIN_BURST_LIMIT=100000
  # DX-048: el bloqueo por fallos de la CUENTA se deja con sus valores reales
  # (e2e/login-lockout.spec.ts lo prueba con emails propios); el de la IP se
  # sube porque toda la suite sale de una IP y varios specs fallan a propósito.
  export LOGIN_IP_FAILURE_LIMIT=100000
  export RATE_LIMIT_INVITATION_LIMIT=100000
  export RATE_LIMIT_PASSWORD_LIMIT=100000
  export RATE_LIMIT_CONFIRMATION_LIMIT=100000
  export RATE_LIMIT_INVITATION_EMAIL_LIMIT=100000
  # DX-099: el cuestionario público de anamnesis (por IP y por token).
  export RATE_LIMIT_ANAMNESIS_LIMIT=100000
  export RATE_LIMIT_ANAMNESIS_TOKEN_LIMIT=100000
  # SEC-046: lecturas de un fichero de importación (inspect, dry-run y hoja de
  # saldos), 10 por minuto por clínica + usuario en un balde común. Los specs
  # de importación y de saldos migrados leen con el mismo ADMIN de la demo
  # una docena de ficheros seguidos y el abono en móvil se quedaba en 429
  # (DX-292, TST-033).
  export RATE_LIMIT_PATIENT_IMPORT_LIMIT=100000
  # Topes de email en BD (DX-088): la suite reenvía una invitación al momento
  # de crearla; sin esto el enfriamiento de 60 s respondería 429.
  export MAIL_RECIPIENT_COOLDOWN_SECONDS=0
  export RATE_LIMIT_PASSWORD_RESET_LIMIT=100000
  # DX-010: los emails se dejan como JSON en $STATE_DIR/mail (FileMailer, solo
  # dev/e2e) para que Playwright abra el enlace de «Restablecer contraseña».
  export MAIL_TRANSPORT=file
  export MAIL_FILE_DIR="$STATE_DIR/mail"
  # La web: las NEXT_PUBLIC_* se incrustan en el build y el rewrite /api/v1.
  export NEXT_PUBLIC_API_URL="$API_URL"
  # Igual que el build de ci.yml y que `next dev` sin .env (default del código).
  export NEXT_PUBLIC_ROOT_DOMAIN=dentalix.local
  export NEXT_TELEMETRY_DISABLED=1
}

wait_for() {
  local url="$1" name="$2" log="$3" pidfile="$4" tries="${5:-120}"
  for ((i = 0; i < tries; i++)); do
    if curl -fs -o /dev/null "$url"; then
      echo "$name listo en $url"
      return 0
    fi
    if ! kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      echo "$name terminó antes de estar listo. Últimas líneas de $log:" >&2
      tail -n 50 "$log" >&2
      return 1
    fi
    sleep 1
  done
  echo "$name no respondió en ${tries}s. Últimas líneas de $log:" >&2
  tail -n 50 "$log" >&2
  return 1
}

start_bg() {
  local name="$1" dir="$2"
  shift 2
  local log="$LOG_DIR/$name.log" pidfile="$STATE_DIR/$name.pid"
  if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name ya está corriendo (pid $(cat "$pidfile"))" >&2
    return 1
  fi
  (cd "$dir" && exec "$@") > "$log" 2>&1 &
  echo $! > "$pidfile"
}

phase_setup() {
  if ! command -v pdftotext >/dev/null 2>&1; then
    echo "Falta pdftotext: instala poppler-utils (Debian/Ubuntu) o ejecuta 'brew install poppler' (macOS) antes de la suite e2e." >&2
    return 1
  fi
  if [[ "$E2E_NPM_CI" == "1" ]]; then
    group "npm ci (API)"
    (cd "$API_DIR" && npm ci --no-audit --no-fund)
    endgroup
    group "npm ci (web)"
    (cd "$WEB_DIR" && npm ci --no-audit --no-fund)
    endgroup
  fi
  if [[ "$E2E_INSTALL_BROWSERS" == "1" ]]; then
    group "Chromium de Playwright"
    (cd "$WEB_DIR" && npx playwright install --with-deps chromium)
    endgroup
  fi
}

phase_sync() {
  group "Referencias compartidas con la API"
  local status=0
  node "$WEB_DIR/scripts/check-api-reference-sync.mjs" "$API_DIR" "$WEB_DIR" || status=$?
  endgroup
  return "$status"
}

phase_db() {
  load_env
  group "Base $E2E_DB_NAME: rol de la app, migraciones y siembra"
  if [[ -z "$(psql_owner -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$E2E_DB_NAME'")" ]]; then
    psql_owner -d postgres -c "CREATE DATABASE \"$E2E_DB_NAME\""
  fi
  # Los services de Actions no montan /docker-entrypoint-initdb.d: se aplica a
  # mano el script de docker-compose. El rol es global al servidor, así que si
  # ya existe (Postgres local compartido) solo se aplican los GRANT.
  if [[ -z "$(psql_owner -d "$E2E_DB_NAME" -c "SELECT 1 FROM pg_roles WHERE rolname = 'dentalix_app'")" ]]; then
    psql_owner -d "$E2E_DB_NAME" -f "$API_DIR/docker/db-init/01-app-role.sql"
  else
    grep -v '^CREATE ROLE' "$API_DIR/docker/db-init/01-app-role.sql" | psql_owner -d "$E2E_DB_NAME"
  fi
  (
    cd "$API_DIR"
    npx prisma generate
    npx prisma migrate deploy
    npx prisma db seed
    # Clínica demo (idempotente): la usan los specs de recepción y presupuesto.
    npm run seed:demo
  )
  endgroup
}

phase_api() {
  load_env
  group "API: build y start:prod en :$E2E_API_PORT"
  (cd "$API_DIR" && npm run build)
  mkdir -p "$STORAGE_DIR"
  start_bg api "$API_DIR" npm run start:prod
  wait_for "${API_URL}/health/ready" API "$LOG_DIR/api.log" "$STATE_DIR/api.pid"
  wait_for_worker
  endgroup
}

# DX-284: /health/ready no dice si hay worker. Su latido en job_workers sí:
# sin él la suite no empieza (si no, los specs de importación fallan a los
# 30 s con «En cola» y sin pista de por qué).
wait_for_worker() {
  local pidfile="$STATE_DIR/api.pid" tries=60
  for ((i = 0; i < tries; i++)); do
    if [[ -n "$(psql_owner -d "$E2E_DB_NAME" -c "SELECT 1 FROM job_workers WHERE \"lastBeatAt\" > timezone('utc', now()) - interval '1 minute' LIMIT 1")" ]]; then
      echo "Worker de la cola activo (APP_ROLE=$APP_ROLE)"
      return 0
    fi
    if ! kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      echo "La API terminó antes de que latiera el worker. Últimas líneas de $LOG_DIR/api.log:" >&2
      tail -n 50 "$LOG_DIR/api.log" >&2
      return 1
    fi
    sleep 1
  done
  echo "El worker de la cola no latió en ${tries}s (¿APP_ROLE=all?): la importación de pacientes no se procesaría." >&2
  return 1
}

phase_web() {
  load_env
  group "Web: next build y next start en :$E2E_WEB_PORT"
  (cd "$WEB_DIR" && ./node_modules/.bin/next build)
  start_bg web "$WEB_DIR" ./node_modules/.bin/next start -p "$E2E_WEB_PORT"
  wait_for "${WEB_URL}/login" Web "$LOG_DIR/web.log" "$STATE_DIR/web.pid"
  endgroup
}

# Lo que ven los specs. La guardia de saltos (phase_skips) lo necesita también:
# un salto permitido por la ausencia de una de estas variables es rojo si está.
playwright_env() {
  export E2E_WEB_SERVER=none
  export E2E_WEB_PORT
  export E2E_API_URL="$API_URL"
  export E2E_DATABASE_URL="postgresql://${PG_SUPERUSER}:${PG_SUPERPASS}@${PG_HOST}:${PG_PORT}/${E2E_DB_NAME}"
  export E2E_EXPECT_PROD_CSP=1
  export E2E_MAIL_DIR="$MAIL_FILE_DIR"
  export E2E_REPORT_JSON=1
}

phase_test() {
  load_env
  group "Playwright"
  local start=$SECONDS status=0
  # Sin el informe de una ejecución anterior: si esta no lo escribe, la
  # guardia falla en vez de leer uno viejo.
  rm -f "$WEB_DIR/playwright-results.json"
  (
    cd "$WEB_DIR"
    playwright_env
    npx playwright test "$@"
  ) || status=$?
  echo "Playwright terminó con código $status en $((SECONDS - start)) s"
  endgroup
  return "$status"
}

phase_skips() {
  load_env
  group "Tests saltados fuera de e2e/allowed-skips.json"
  local status=0
  (
    playwright_env
    node "$WEB_DIR/scripts/check-e2e-skips.mjs" "$WEB_DIR/playwright-results.json"
  ) || status=$?
  endgroup
  return "$status"
}

# El pid guardado es el de `npm`/`next`: se para con todos sus descendientes.
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill -TERM "$pid" 2>/dev/null || true
}

phase_stop() {
  local name pidfile
  for name in web api; do
    pidfile="$STATE_DIR/$name.pid"
    if [[ -f "$pidfile" ]]; then
      kill_tree "$(cat "$pidfile")"
      rm -f "$pidfile"
    fi
  done
  rm -f "$STATE_DIR/env"
}

cmd="${1:-all}"
shift || true
if [[ "$cmd" != stop && ! -f "$API_DIR/package.json" ]]; then
  echo "No encuentro dentalix-api en $API_DIR: define API_DIR." >&2
  exit 2
fi
case "$cmd" in
  setup) phase_setup ;;
  sync) phase_sync ;;
  db) phase_db ;;
  api) phase_api ;;
  web) phase_web ;;
  test) phase_test "$@" ;;
  skips) phase_skips ;;
  stop) phase_stop ;;
  all)
    trap phase_stop EXIT
    phase_setup
    phase_sync
    phase_db
    phase_api
    phase_web
    # La guardia corre aunque Playwright falle (dice qué no se ejecutó). Si la
    # guardia falla sale con su código (set -e); si no, con el de Playwright.
    st=0
    phase_test "$@" || st=$?
    phase_skips
    exit "$st"
    ;;
  *)
    echo "uso: $0 [all|setup|sync|db|api|web|test|skips|stop] [args de playwright]" >&2
    exit 2
    ;;
esac
