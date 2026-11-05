#!/usr/bin/env node
// DX-452 (TST-056): un spec que sale flaky en muchas runs de main es un fallo
// que `retries: 1` esconde. La guardia de cada run (check-e2e-skips.mjs) solo
// cuenta los flaky de ESA run; esta mira la tendencia: si un spec salió flaky
// en MIN_RUNS o más de las últimas WINDOW runs de main (la actual y las
// WINDOW - 1 anteriores), sale con 1 y lo nombra.
//
//   node scripts/check-e2e-flaky-trend.mjs <flaky-actual.json> [--history-dir <dir>]
//
// <flaky-actual.json> es el que escribe la guardia con E2E_FLAKY_OUT:
//   { runId, sha, total, flaky: [{ file, title }] }
// Historial, de dos maneras:
//   - Con --history-dir: los *.json de ese directorio, con la misma forma
//     (pruebas y ejecución local con datos de ejemplo).
//   - Sin él (la CI): los artefactos pequeños `e2e-flaky` que sube cada run de
//     main, con GITHUB_TOKEN y GITHUB_REPOSITORY. Cuesta una llamada para
//     listarlos (GET /actions/artifacts?name=e2e-flaky) y la descarga de
//     hasta WINDOW - 1 zips de unos cientos de bytes; nada de recorrer runs ni
//     de bajar el informe de Playwright (decenas de MB con trazas).
//     Las runs sin artefacto (canceladas, caídas antes de la guardia, o
//     anteriores a este ticket) no cuentan: la ventana se llena con las que lo
//     tienen. Si el historial no se puede leer (API caída, sin permiso
//     `actions: read`) avisa con ::warning y sale con 0: una caída de GitHub no
//     debe poner en rojo el merge de nadie, y la guardia por run sigue activa.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ARTIFACT_NAME = 'e2e-flaky';
/** Runs de main que se miran, la actual incluida. */
export const WINDOW = 10;
/** Un spec flaky en tantas runs de la ventana es rojo. */
export const MIN_RUNS = 3;
const SEP = ' › ';

/**
 * Pura. `current` y cada entrada de `history` (de la más reciente a la más
 * antigua) traen `runId` y `flaky: [{ file, title }]`. Devuelve los specs en
 * rojo: `{ spec, runs, window, runIds }`, de más a menos repetidos.
 */
export function evaluateTrend(current, history, { window = WINDOW, minRuns = MIN_RUNS } = {}) {
  const seen = new Set([String(current.runId)]);
  const previous = [];
  for (const entry of history) {
    const id = String(entry.runId);
    if (seen.has(id)) continue; // la misma run (relanzada) no cuenta dos veces
    seen.add(id);
    previous.push(entry);
    if (previous.length === window - 1) break;
  }
  const runs = [current, ...previous];
  const byTest = new Map();
  for (const run of runs) {
    // Un test cuenta una vez por run aunque salga repetido en el informe.
    for (const key of new Set((run.flaky ?? []).map((t) => `${t.file}${SEP}${t.title}`))) {
      byTest.set(key, [...(byTest.get(key) ?? []), String(run.runId)]);
    }
  }
  const offenders = [...byTest]
    .filter(([, ids]) => ids.length >= minRuns)
    .map(([spec, runIds]) => ({ spec, runs: runIds.length, window: runs.length, runIds }))
    .sort((a, b) => b.runs - a.runs || a.spec.localeCompare(b.spec));
  return { offenders, window: runs.length };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function historyFromDir(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(dir, f)))
    .sort((a, b) => Number(b.runId) - Number(a.runId));
}

async function historyFromGitHub(currentRunId) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) throw new Error('faltan GITHUB_TOKEN o GITHUB_REPOSITORY');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const list = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${repo}/actions/artifacts?name=${ARTIFACT_NAME}&per_page=100`, { headers });
  if (!list.ok) throw new Error(`listar artefactos: HTTP ${list.status}`);
  const { artifacts } = await list.json();
  const mine = (artifacts ?? [])
    .filter((a) => !a.expired && a.workflow_run?.head_branch === 'main' && String(a.workflow_run?.id) !== String(currentRunId))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, WINDOW * 2); // margen para los relanzados de una misma run
  const scratch = mkdtempSync(path.join(tmpdir(), 'e2e-flaky-'));
  try {
    const history = [];
    for (const a of mine) {
      // El zip redirige a una URL firmada de otro host: fetch no reenvía allí el token.
      const res = await fetch(a.archive_download_url, { headers });
      if (!res.ok) throw new Error(`descargar ${a.name} (${a.id}): HTTP ${res.status}`);
      const zip = path.join(scratch, `${a.id}.zip`);
      writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
      const text = execFileSync('unzip', ['-p', zip, '*.json'], { encoding: 'utf8' });
      history.push({ ...JSON.parse(text), runId: a.workflow_run.id });
    }
    return history;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function report({ offenders, window }) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  const lines = [`### Tendencia de flaky (últimas ${window} runs de main)`, ''];
  if (offenders.length === 0) {
    lines.push(`Ningún spec salió flaky en ${MIN_RUNS} o más de las ${window} runs.`, '');
  } else {
    lines.push(`Specs flaky en ${MIN_RUNS} o más de las ${window} runs (la run sale en rojo):`, '');
    for (const o of offenders) lines.push(`- \`${o.spec}\`: ${o.runs} de ${o.window} (runs ${o.runIds.join(', ')})`);
    lines.push('');
  }
  if (summary) appendFileSync(summary, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  for (const o of offenders) {
    const [file] = o.spec.split(SEP);
    const msg = `«${o.spec}» salió flaky en ${o.runs} de las últimas ${o.window} runs de main (${o.runIds.join(', ')}): el reintento lo esconde. Busca la causa (traza en el informe de Playwright).`;
    console.error(`::error file=${file},title=Spec flaky en tendencia::${msg}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dirAt = args.indexOf('--history-dir');
  const historyDir = dirAt >= 0 ? args[dirAt + 1] : null;
  const currentPath = args.find((a, i) => !a.startsWith('--') && (dirAt < 0 || i !== dirAt + 1));
  if (!currentPath) {
    console.error('Uso: check-e2e-flaky-trend.mjs <flaky-actual.json> [--history-dir <dir>]');
    process.exit(2);
  }
  const current = readJson(currentPath);
  let history;
  try {
    history = historyDir ? historyFromDir(historyDir) : await historyFromGitHub(current.runId);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.log(`::warning title=Tendencia de flaky sin historial::No pude leer el historial de runs de main (${why}); solo cuenta la guardia de esta run.`);
    process.exit(0);
  }
  const result = evaluateTrend(current, history);
  report(result);
  process.exit(result.offenders.length > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
