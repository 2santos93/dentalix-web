#!/usr/bin/env node
// DX-252 (TST-030): la E2E no puede salir verde con tests sin ejecutar.
//
//   node scripts/check-e2e-skips.mjs [informe.json] [lista.json]
//
// Lee el informe JSON de Playwright (por defecto playwright-results.json, el
// que escribe playwright.config.ts en la CI) y sale con 1, nombrando cada test
// (fichero:línea, título y motivo), si alguno salió «skipped» sin ser un salto
// permitido de e2e/allowed-skips.json. Un salto solo es permitido si:
//   - el test (fichero + título completo) está en la lista;
//   - lleva una anotación `skip`/`fixme` cuyo texto es EXACTAMENTE el de la
//     entrada (un test que no llegó a ejecutarse por un fallo previo en serie
//     no tiene anotación: nunca se permite);
//   - la variable de entorno de `requiresUnset` NO está definida al correr la
//     guardia (si la CI la define y aun así se salta, es una regresión).
// Sale con 2 si no puede leer el informe, si no tiene tests o si trae errores
// globales (config roto, fallo fuera de los tests). En GitHub Actions además
// anota cada test en el PR (`::error file=…`).
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SEP = ' › ';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const reportPath = process.argv[2] ?? path.join(root, 'playwright-results.json');
const allowedPath = process.argv[3] ?? path.join(root, 'e2e', 'allowed-skips.json');

function fail(message) {
  console.error(message);
  process.exit(2);
}

function readJson(file, what) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`No pude leer ${what} (${file}): ${err instanceof Error ? err.message : String(err)}`);
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

const all = (report.suites ?? []).flatMap((s) => [...tests(s)]);
if ((report.errors ?? []).length > 0) {
  fail(
    `El informe de Playwright trae ${report.errors.length} error(es) globales: la suite no corrió entera.\n` +
      report.errors.map((e) => `  - ${String(e.message ?? JSON.stringify(e)).split('\n')[0]}`).join('\n'),
  );
}
if (all.length === 0) fail('El informe de Playwright no tiene ningún test: la suite no corrió.');

const entries = new Map(allowed.map((a) => [`${a.file}${SEP}${a.title}`, a]));
const isSet = (name) => (process.env[name] ?? '') !== '';

/** `null` si el salto está permitido; si no, por qué no. */
function verdict(t) {
  const note = (t.test.annotations ?? []).find((a) => a.type === 'skip' || a.type === 'fixme');
  if (!note) return 'no llegó a ejecutarse (¿falló antes un test del mismo grupo en serie?)';
  if (!note.description) return 'test.skip/test.fixme sin motivo';
  const entry = entries.get(`${t.file}${SEP}${t.title}`);
  if (!entry) return note.description;
  if (entry.annotation !== note.description) {
    return `${note.description} (el motivo no es el de e2e/allowed-skips.json: «${entry.annotation}»)`;
  }
  if (entry.requiresUnset && isSet(entry.requiresUnset)) {
    return `${note.description} (pero ${entry.requiresUnset} está definida: este salto no debería ocurrir)`;
  }
  return null;
}

const skipped = all.filter((t) => t.test.status === 'skipped');
const offenders = skipped.map((t) => ({ ...t, why: verdict(t) })).filter((t) => t.why !== null);

console.log(
  `Playwright: ${all.length} tests, ${skipped.length} saltados (${skipped.length - offenders.length} permitidos por e2e/allowed-skips.json).`,
);
if (offenders.length === 0) process.exit(0);

console.error(`\n${offenders.length} test(s) saltados sin permiso:`);
for (const t of offenders) {
  console.error(`  - ${t.file}:${t.line} «${t.title}» — ${t.why}`);
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error file=${t.file},line=${t.line},title=Test saltado::«${t.title}» se saltó: ${t.why}`);
  }
}
console.error(
  '\nUn test saltado no prueba nada: arregla la condición (p. ej. fija el reloj con e2e/support/clock.ts) o, si el salto es legítimo, añádelo a e2e/allowed-skips.json con su motivo exacto y la variable que lo justifica.',
);
process.exit(1);
