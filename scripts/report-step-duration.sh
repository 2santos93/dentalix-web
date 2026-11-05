#!/usr/bin/env bash
# DX-452 (TST-056): publica cuánto ha tardado un paso (desde STEP_STARTED_AT,
# epoch en segundos que fija un paso anterior) frente a su `timeout-minutes` y
# avisa con un `::warning::` al pasar del 70 %, antes de que GitHub lo corte.
# Es el patrón de dentalix-api (.github/scripts/report-job-duration.sh, DX-396).
#
# Uso: report-step-duration.sh <etiqueta> <tope-en-minutos>
# Escribe una tabla en $GITHUB_STEP_SUMMARY (o en stdout fuera de Actions).
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Uso: $0 <etiqueta> <tope-en-minutos>" >&2
  exit 2
fi

label="$1"
limit_min="$2"
if ! [[ "$limit_min" =~ ^[1-9][0-9]*$ ]]; then
  echo "El tope debe ser un entero positivo de minutos (es «${limit_min}»)." >&2
  exit 2
fi
started="${STEP_STARTED_AT:?Falta STEP_STARTED_AT (epoch del inicio del paso)}"
now="${STEP_FINISHED_AT:-$(date +%s)}"
warn_pct="${DURATION_WARN_PCT:-70}"

elapsed=$((now - started))
limit=$((limit_min * 60))
pct=$((elapsed * 100 / limit))
human="$((elapsed / 60)) min $((elapsed % 60)) s"

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
{
  echo "### Duración: ${label}"
  echo
  echo "| Duración | Tope | Uso | Aviso desde |"
  echo "|---|---|---|---|"
  echo "| ${human} (${elapsed} s) | ${limit_min} min | ${pct} % | ${warn_pct} % |"
} >>"$summary"

echo "${label}: ${human} de ${limit_min} min (${pct} %)."
if [ "$pct" -ge "$warn_pct" ]; then
  echo "::warning title=${label} cerca del tope::${human} son el ${pct} % de timeout-minutes (${limit_min} min). Acorta la suite o reparte los tests antes de que GitHub corte el paso."
fi
