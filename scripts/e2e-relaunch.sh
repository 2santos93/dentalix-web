#!/usr/bin/env bash
# Relanza la E2E (`.github/workflows/e2e.yml`) de uno o varios commits de la web
# que quedaron bloqueados porque la API de main estaba rota (DX-494, TST-061).
# Lanza un `workflow_dispatch` por sha con el input `web_sha`; la API es la de
# `API_REF` (por defecto main). No usa secretos: solo la sesión de `gh`.
#
#   scripts/e2e-relaunch.sh <sha-web> [<sha-web> ...]
#
# Variables: REPO (2santos93/dentalix-web), API_REF (main), WORKFLOW_REF (main:
# la rama de la que se toma el YAML del workflow).
set -euo pipefail

REPO="${REPO:-2santos93/dentalix-web}"
API_REF="${API_REF:-main}"
WORKFLOW_REF="${WORKFLOW_REF:-main}"

if [[ $# -eq 0 ]]; then
  echo "uso: scripts/e2e-relaunch.sh <sha-web> [<sha-web> ...]" >&2
  exit 2
fi

for sha in "$@"; do
  if ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "sha no válido (hacen falta los 40 caracteres, git rev-parse <sha>): ${sha}" >&2
    exit 2
  fi
done

for sha in "$@"; do
  echo "Relanzando la E2E de dentalix-web@${sha} contra dentalix-api@${API_REF}"
  gh workflow run e2e.yml --repo "$REPO" --ref "$WORKFLOW_REF" \
    -f "web_sha=${sha}" -f "api_ref=${API_REF}"
done
