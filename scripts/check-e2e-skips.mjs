#!/usr/bin/env node
// DX-252 (TST-030): la E2E no puede salir verde con tests sin ejecutar.
//
//   node scripts/check-e2e-skips.mjs [informe.json] [lista.json]
//
// Lee el informe JSON de Playwright (por defecto playwright-results.json, el
// que escribe playwright.config.ts en la CI) y falla (código 1) si algún test
// salió «skipped» y no está en la lista versionada e2e/allowed-skips.json,
// con un mensaje que nombra cada test (fichero:línea y título). En GitHub
// Actions además anota el test en el PR (`::error file=…`).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SEP = ' › ';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const reportPath = process.argv[2] ?? path.join(root, 'playwright-results.json');
const allowedPath = process.argv[3] ?? path.join(root, 'e2e', 'allowed-skips.json');

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`No pude leer ${what} (${file}): ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}

const report = readJson(reportPath, 'el informe JSON de Playwright');
const { allowed } = readJson(allowedPath, 'la lista de saltos permitidos');
const testDir = report.config?.rootDir ?? path.join(root, 'e2e');

/** `e2e/x.spec.ts`, relativo al repo de la web, venga como venga en el informe. */
function repoPath(file) {
  const abs = path.isAbsolute(file) ? file : path.join(testDir, file);
  return path.relative(root, abs).split(path.sep).join('/');
}

/** Todos los tests del informe con su título completo (describe › test). */
function* tests(suite, titles = []) {
  // La suite de primer nivel es el fichero: su título no forma parte del nombre.
  const here = suite.file && suite.title === suite.file ? titles : [...titles, suite.title];
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      yield { file: repoPath(spec.file ?? suite.file), line: spec.line, title: [...here, spec.title].join(SEP), test };
    }
  }
  for (const child of suite.suites ?? []) yield* tests(child, here);
}

const key = (file, title) => `${file}${SEP}${title}`;
const allowedKeys = new Set(allowed.map((a) => key(a.file, a.title)));
const all = (report.suites ?? []).flatMap((s) => [...tests(s)]);
const skipped = all.filter((t) => t.test.status === 'skipped');
const offenders = skipped.filter((t) => !allowedKeys.has(key(t.file, t.title)));

/** El motivo del `test.skip`/`test.fixme`; sin anotación, no llegó a ejecutarse. */
const reasonOf = (t) =>
  (t.test.annotations ?? []).find((a) => a.type === 'skip' || a.type === 'fixme')?.description ??
  'sin motivo: no llegó a ejecutarse (¿falló antes un test del mismo grupo en serie?) o un test.skip() sin texto';

console.log(
  `Playwright: ${all.length} tests, ${skipped.length} saltados (${skipped.length - offenders.length} en la lista permitida).`,
);
if (offenders.length === 0) process.exit(0);

console.error(`\n${offenders.length} test(s) saltados fuera de e2e/allowed-skips.json:`);
for (const t of offenders) {
  const where = `${t.file}:${t.line}`;
  console.error(`  - ${where} «${t.title}» — ${reasonOf(t)}`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error file=${t.file},line=${t.line},title=Test saltado::«${t.title}» se saltó (${reasonOf(t)}) y no está en e2e/allowed-skips.json`);
  }
}
console.error(
  '\nUn test saltado no prueba nada: arregla la condición (p. ej. fija el reloj con e2e/support/clock.ts) o, si el salto es legítimo, añádelo a e2e/allowed-skips.json con su motivo.',
);
process.exit(1);
