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
// Sale con 2 si no puede leer el informe, si no tiene tests, si trae errores
// globales (config roto, fallo fuera de los tests) o si una entrada de la lista
// no cumple su contrato (file/title/annotation y requiresUnset ∈ las variables
// que define la CI). En GitHub Actions además anota cada test en el PR
// (`::error file=…`).
//
// DX-292 (TST-033): con `retries: 1` un test que solo pasa al reintentar sale
// «flaky» y la run queda verde sin que nadie lo cuente. La guardia los nombra
// siempre (`::warning` en Actions) y sale con 1 si hay más de MAX_FLAKY. Con
// GITHUB_STEP_SUMMARY deja en el resumen del job el recuento y, por nombre,
// los flaky, los fallidos y los saltados sin permiso.
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SEP = ' › ';
/** Más flaky que esto en una run es rojo: la suite no es de fiar. */
const MAX_FLAKY = 2;
/** Las únicas variables que justifican un salto: la CI siempre las define. */
const CI_DEFINED_VARS = ['E2E_DATABASE_URL', 'E2E_MAIL_DIR'];
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
const allowed = validAllowed(readJson(allowedPath, 'la lista de saltos permitidos'));

/**
 * El contrato de e2e/allowed-skips.json, comprobado al cargarla: cada entrada
 * con `file`, `title` y `annotation` no vacíos y `requiresUnset` igual a una de
 * las variables que la CI define (scripts/e2e-ci.sh, playwright_env). Una
 * entrada sin esa condición se permitiría siempre, también en la CI.
 */
function validAllowed(list) {
  if (!Array.isArray(list?.allowed)) fail(`e2e/allowed-skips.json (${allowedPath}) no tiene la lista \`allowed\`.`);
  const problems = [];
  list.allowed.forEach((entry, i) => {
    const name = `entrada ${i + 1}${entry?.title ? ` «${entry.title}»` : ''}`;
    for (const field of ['file', 'title', 'annotation']) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') problems.push(`${name}: falta \`${field}\``);
    }
    if (!CI_DEFINED_VARS.includes(entry?.requiresUnset)) {
      problems.push(
        `${name}: \`requiresUnset\` debe ser ${CI_DEFINED_VARS.join(' o ')} (es ${JSON.stringify(entry?.requiresUnset ?? null)})`,
      );
    }
  });
  if (problems.length > 0) {
    fail(`e2e/allowed-skips.json no cumple su contrato:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }
  return list.allowed;
}
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
  if (isSet(entry.requiresUnset)) {
    return `${note.description} (pero ${entry.requiresUnset} está definida: este salto no debería ocurrir)`;
  }
  return null;
}

const skipped = all.filter((t) => t.test.status === 'skipped');
const offenders = skipped.map((t) => ({ ...t, why: verdict(t) })).filter((t) => t.why !== null);
const flaky = all.filter((t) => t.test.status === 'flaky');
const failed = all.filter((t) => t.test.status === 'unexpected');
const passed = all.filter((t) => t.test.status === 'expected');
const tooFlaky = flaky.length > MAX_FLAKY;

const name = (t) => `${t.file}:${t.line} «${t.title}»`;

writeSummary();

console.log(
  `Playwright: ${all.length} tests, ${skipped.length} saltados (${skipped.length - offenders.length} permitidos por e2e/allowed-skips.json), ${flaky.length} flaky.`,
);

if (flaky.length > 0) {
  const log = tooFlaky ? console.error : console.log;
  log(`\n${flaky.length} flaky (pasaron solo al reintentar)${tooFlaky ? `: más de ${MAX_FLAKY}, la E2E sale en rojo` : ''}:`);
  for (const t of flaky) {
    log(`  - ${name(t)}`);
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::warning file=${t.file},line=${t.line},title=Test flaky::«${t.title}» pasó solo al reintentar.`);
    }
  }
}

if (offenders.length > 0) {
  console.error(`\n${offenders.length} test(s) saltados sin permiso:`);
  for (const t of offenders) {
    console.error(`  - ${name(t)} — ${t.why}`);
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error file=${t.file},line=${t.line},title=Test saltado::«${t.title}» se saltó: ${t.why}`);
    }
  }
  console.error(
    '\nUn test saltado no prueba nada: arregla la condición (p. ej. fija el reloj con e2e/support/clock.ts) o, si el salto es legítimo, añádelo a e2e/allowed-skips.json con su motivo exacto y la variable que lo justifica.',
  );
}
if (tooFlaky) {
  console.error(
    `\nMás de ${MAX_FLAKY} tests flaky en una run: busca la causa de cada uno (traza en el informe de Playwright) en vez de confiar en el reintento.`,
  );
}
process.exit(offenders.length > 0 || tooFlaky ? 1 : 0);

/**
 * Resumen del job en GitHub Actions (`$GITHUB_STEP_SUMMARY`, Markdown): que
 * un rojo, un flaky o un salto se lean en la página de la run sin abrir logs.
 */
function writeSummary() {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const item = (t, why) => `- \`${t.file}:${t.line}\` «${t.title}»${why ? ` — ${why}` : ''}`;
  const section = (title, list, empty, why) =>
    list.length === 0 ? [`**${empty}**`, ''] : [`**${title} (${list.length})**`, '', ...list.map((t) => item(t, why?.(t))), ''];
  const lines = [
    '### E2E (Playwright)',
    '',
    `${all.length} tests: ${passed.length} passed · ${failed.length} failed · ${flaky.length} flaky · ${skipped.length} skipped`,
    '',
    ...section('Fallidos', failed, 'Sin tests fallidos'),
    ...section(
      tooFlaky ? `Flaky: más de ${MAX_FLAKY}, la E2E sale en rojo` : 'Flaky (pasaron solo al reintentar)',
      flaky,
      'Sin tests flaky',
    ),
    ...(offenders.length > 0 ? section('Saltados sin permiso', offenders, '', (t) => t.why) : []),
  ];
  appendFileSync(file, `${lines.join('\n')}\n`);
}
