/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * DX-457 (OPS-053): la E2E de la web corre en N shards (`Playwright i/N`) y un
 * job de fusión conserva el check «Playwright (web + API + Postgres 16)». Las
 * comprobaciones del reparto y de los blobs van en línea en el YAML (por
 * `web_sha`): aquí se ejecuta ese mismo bash contra listas de ejemplo.
 */
const WORKFLOW = path.join(__dirname, '..', '.github', 'workflows', 'e2e.yml');
const yaml = createRequire(__filename)('js-yaml') as { load(src: string): unknown };

interface Step {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string | boolean | number>;
  env?: Record<string, string>;
}
interface Job {
  name: string;
  needs?: string | string[];
  if?: string;
  env?: Record<string, string>;
  strategy?: { 'fail-fast'?: boolean; matrix?: Record<string, string> };
  steps: Step[];
}

const wf = yaml.load(readFileSync(WORKFLOW, 'utf8')) as { jobs: Record<string, Job> };
const shardJob = wf.jobs.playwright;
const mergeJob = wf.jobs['playwright-merge'];

function step(j: Job, id: string): Step {
  const found = j.steps.find((s) => s.id === id);
  if (!found) throw new Error(`no hay paso con id ${id}`);
  return found;
}

/** Los literales `'[...]'` de una expresión `fromJSON(cond && '[a]' || '[b]')`, ya parseados. */
function jsonLists(expr: string): unknown[][] {
  return [...expr.matchAll(/'(\[[^\]]*\])'/g)].map((m) => JSON.parse(m[1]) as unknown[]);
}

describe('e2e.yml: la matriz de shards (DX-457)', () => {
  const matrix = shardJob.strategy!.matrix!;

  it('un shard rojo no cancela los otros', () => {
    expect(shardJob.strategy!['fail-fast']).toBe(false);
  });

  it('total y timeout son listas de un solo valor; shard va de 1 a total', () => {
    const totals = jsonLists(matrix.total);
    const shards = jsonLists(matrix.shard);
    const timeouts = jsonLists(matrix.timeout);
    expect(totals.length).toBe(2);
    totals.forEach((t) => expect(t).toHaveLength(1));
    timeouts.forEach((t) => expect(t).toHaveLength(1));
    // grep o repeat_each: un solo shard; si no, los N de siempre.
    expect(totals[0]).toEqual([1]);
    expect(shards[0]).toEqual([1]);
    const n = totals[1][0] as number;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(shards[1]).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    // 200 repetido, 50 filtrado y 35 en la suite repartida.
    expect(timeouts).toEqual([[200], [50], [35]]);
  });

  it('las cinco copias de la condición (un shard; repetido; filtrado) son la misma', () => {
    const repeat = "(inputs.repeat_each != '' && inputs.repeat_each != '1')";
    const single = `(inputs.grep != '' || ${repeat})`;
    const n = jsonLists(matrix.total)[1][0];
    expect(matrix.shard).toBe(`\${{ fromJSON(${single} && '[1]' || '${JSON.stringify(jsonLists(matrix.shard)[1]).replace(/,/g, ', ')}') }}`);
    expect(matrix.total).toBe(`\${{ fromJSON(${single} && '[1]' || '[${n}]') }}`);
    expect(mergeJob.env?.SHARD_TOTAL).toBe(`\${{ ${single} && 1 || ${n} }}`);
    expect(matrix.timeout).toBe(`\${{ fromJSON(${repeat} && '[200]' || inputs.grep != '' && '[50]' || '[35]') }}`);
    expect(shardJob['timeout-minutes' as keyof Job]).toMatch(
      new RegExp(`^\\$\\{\\{ ${repeat.replace(/[()|.']/g, '\\$&')} && \\d+ \\|\\| inputs\\.grep != '' && \\d+ \\|\\| \\d+ \\}\\}$`),
    );
  });

  it('cada shard lista y corre su parte con los mismos argumentos', () => {
    expect(shardJob.name).toBe('Playwright ${{ matrix.shard }}/${{ matrix.total }} (web + API + Postgres 16)');
    const list = step(shardJob, 'shard-specs').run!;
    expect(list).toContain('npx playwright test --list --reporter=null --shard="${SHARD}/${TOTAL}"');
    const run = step(shardJob, 'playwright');
    expect(run['timeout-minutes' as keyof Step]).toBe('${{ matrix.timeout }}');
    expect(run.run).toContain('scripts/e2e-ci.sh test --shard="${SHARD}/${TOTAL}" --reporter=list,blob');
    // Con --grep, Playwright mete un hash en el nombre del blob si no se fija.
    expect(run.env?.PLAYWRIGHT_BLOB_OUTPUT_FILE).toBe(
      '${{ github.workspace }}/dentalix-web/blob-report/report-${{ matrix.shard }}.zip',
    );
    for (const s of [list, run.run!]) expect(s).toContain(`mapfile -d '' -t args < "\${RUNNER_TEMP}/playwright-args"`);
    const duration = shardJob.steps.find((s) => s.name === 'Duración de Playwright')!;
    expect(duration.env?.SHARD_LABEL).toBe('Playwright ${{ matrix.shard }}/${{ matrix.total }}');
    expect(duration.env?.STEP_LIMIT_MIN).toBe('${{ matrix.timeout }}');
  });

  it('los argumentos (grep, repeat_each, --retries 0) y el formato de la lista son los mismos en los dos jobs', () => {
    expect(step(mergeJob, 'playwright-args').run).toBe(step(shardJob, 'playwright-args').run);
    const perl = (s: string) => /perl -ne '[^']+'/.exec(s)?.[0];
    expect(perl(step(mergeJob, 'all-specs').run!)).toBe(perl(step(shardJob, 'shard-specs').run!));
    expect(step(mergeJob, 'all-specs').run).not.toContain('--shard');
  });
});

describe('e2e.yml: de la salida de `--list` a la lista de ficheros', () => {
  const FIXTURE = path.join(__dirname, 'fixtures', 'playwright-list.txt');

  it('el perl y el `sort -u` del YAML dan `proyecto fichero`, sin repetidos (repeat_each) ni cabecera ni Total', () => {
    const run = step(shardJob, 'shard-specs').run!;
    const pipeline = /(perl -ne '[^']+') \.e2e\/list-raw\.txt \| sort -u/.exec(run);
    expect(pipeline).not.toBeNull();
    const res = runStep(`${pipeline![1]} "$0" | sort -u`.replace('"$0"', JSON.stringify(FIXTURE)), __dirname, {});
    expect(res.status).toBe(0);
    expect(res.out.trim().split('\n')).toEqual([
      'chromium account-statement.spec.ts',
      'chromium cartera-converted.spec.ts',
      'touch touch-targets.spec.ts',
    ]);
  });
});

describe('e2e.yml: el job de fusión (DX-457)', () => {
  it('conserva el nombre del check, espera a los shards y corre siempre', () => {
    expect(mergeJob.name).toBe('Playwright (web + API + Postgres 16)');
    expect(mergeJob.needs).toBe('playwright');
    expect(mergeJob.if).toBe('always()');
  });

  it('con los shards cancelados sale en el acto y no gasta el runner', () => {
    const first = mergeJob.steps[0];
    expect(first.if).toBe("needs.playwright.result == 'cancelled'");
    expect(first.run).toContain('exit 1');
    // Fuera del último, ningún paso corre con always(): todos llevan !cancelled()
    // y no corren si los shards se cancelaron.
    const rest = mergeJob.steps.slice(1, -1).filter((s) => s.if !== undefined);
    expect(rest.length).toBeGreaterThanOrEqual(8);
    for (const s of rest) expect({ step: s.name, if: s.if!.startsWith("${{ !cancelled() && needs.playwright.result != 'cancelled'") }).toEqual({ step: s.name, if: true });
  });

  it('es rojo si algún shard no terminó en verde', () => {
    const last = mergeJob.steps[mergeJob.steps.length - 1];
    expect(last.if).toBe("always() && needs.playwright.result != 'success'");
    expect(last.run).toContain('exit 1');
  });

  it('fusiona solo con todos los blobs y pasa la guardia sobre el informe fusionado', () => {
    expect(step(mergeJob, 'merge').if).toBe("${{ !cancelled() && needs.playwright.result != 'cancelled' && steps.blobs.outcome == 'success' }}");
    expect(step(mergeJob, 'merge').run).toBe('npx playwright merge-reports -c playwright.config.ts .e2e/blobs');
    const skips = mergeJob.steps.find((s) => s.run === 'scripts/e2e-ci.sh skips')!;
    expect(skips.if).toBe("${{ !cancelled() && needs.playwright.result != 'cancelled' && steps.merge.outcome == 'success' }}");
    expect(skips.env?.E2E_FLAKY_OUT).toBe('${{ github.workspace }}/dentalix-web/e2e-flaky.json');
    // `e2e-ci.sh skips` exige el checkout de la API (y define E2E_DATABASE_URL y E2E_MAIL_DIR).
    expect(mergeJob.steps.some((s) => s.with?.repository === '2santos93/dentalix-api')).toBe(true);
  });

  it('solo el job de fusión pasa las guardias de saltos y de tendencia y sube e2e-flaky', () => {
    const touchesFlaky = (s: Step) =>
      s.with?.name === 'e2e-flaky' || /check-e2e-(skips|flaky-trend)|e2e-ci\.sh skips/.test(s.run ?? '');
    expect(shardJob.steps.filter(touchesFlaky)).toEqual([]);
    const uploads = mergeJob.steps.filter((s) => s.with?.name === 'e2e-flaky');
    expect(uploads).toHaveLength(1);
    expect(uploads[0].if).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(mergeJob.steps.filter(touchesFlaky)).toHaveLength(3);
  });

  it('los blobs y las listas duran 7 días (Re-run failed jobs de una run de días)', () => {
    const retention = (name: string) => shardJob.steps.find((s) => s.with?.name === name)?.with?.['retention-days'];
    expect(retention('blob-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.shard }}')).toBe(7);
    expect(retention('e2e-shard-${{ matrix.shard }}')).toBe(7);
  });

  it('los nombres de los artefactos', () => {
    const names = (j: Job) => j.steps.filter((s) => s.uses?.startsWith('actions/upload-artifact@')).map((s) => s.with!.name);
    expect(names(shardJob)).toEqual([
      'e2e-shard-${{ matrix.shard }}',
      'blob-${{ github.run_id }}-${{ github.run_attempt }}-${{ matrix.shard }}',
      'playwright-${{ github.run_id }}-${{ github.run_attempt }}-shard-${{ matrix.shard }}',
    ]);
    expect(names(mergeJob)).toEqual(['e2e-flaky', 'playwright-${{ github.run_id }}-${{ github.run_attempt }}']);
    const downloads = mergeJob.steps.filter((s) => s.uses?.startsWith('actions/download-artifact@')).map((s) => s.with!.pattern);
    expect(downloads).toEqual(['e2e-shard-*', 'blob-${{ github.run_id }}-*']);
  });
});

/** Ejecuta el `run` de un paso como lo hace GitHub (`bash -e`), en `cwd` y con `env`. */
function runStep(script: string, cwd: string, env: Record<string, string>) {
  const res = spawnSync('bash', ['-e', '-c', script], {
    cwd,
    env: { PATH: process.env.PATH ?? '', ...env } as unknown as NodeJS.ProcessEnv,
    encoding: 'utf8',
  });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

describe('e2e.yml: «Reparto de specs entre shards» (bash en línea)', () => {
  const script = step(mergeJob, 'reparto').run!;
  const FULL = ['chromium a.spec.ts', 'chromium b.spec.ts', 'chromium c.spec.ts', 'touch touch-targets.spec.ts'];

  /** Lista completa y listas por shard (null = el shard no subió la suya). */
  function check(shards: Array<string[] | null>, opts: { total?: number; full?: string[] } = {}) {
    const dir = mkdtempSync(path.join(tmpdir(), 'dx457-reparto-'));
    mkdirSync(path.join(dir, 'shards'));
    writeFileSync(path.join(dir, 'all.txt'), (opts.full ?? FULL).map((l) => `${l}\n`).join(''));
    shards.forEach((lines, i) => {
      if (lines) writeFileSync(path.join(dir, 'shards', `e2e-shard-${i + 1}.txt`), lines.map((l) => `${l}\n`).join(''));
    });
    return runStep(script, dir, {
      SHARD_TOTAL: String(opts.total ?? shards.length),
      FULL_LIST: 'all.txt',
      SHARDS_DIR: 'shards',
      GITHUB_STEP_SUMMARY: path.join(dir, 'summary.md'),
    });
  }

  it('verde si cada fichero está en un shard y solo en uno', () => {
    const res = check([['chromium a.spec.ts'], ['chromium b.spec.ts', 'chromium c.spec.ts'], ['touch touch-targets.spec.ts']]);
    expect(res.out).toContain('4 ficheros en 3 shards, cada uno una sola vez');
    expect(res.status).toBe(0);
  });

  it('un solo shard (grep o repeat_each) con la lista completa', () => {
    expect(check([FULL]).status).toBe(0);
  });

  it('rojo si falta un fichero', () => {
    const res = check([['chromium a.spec.ts'], ['chromium b.spec.ts'], ['touch touch-targets.spec.ts']]);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/specs que no corre ningún shard[^\n]*\nchromium c\.spec\.ts/);
  });

  it('rojo si sobra un fichero', () => {
    const res = check([['chromium a.spec.ts', 'chromium z.spec.ts'], ['chromium b.spec.ts', 'chromium c.spec.ts'], ['touch touch-targets.spec.ts']]);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/no están en la lista completa[^\n]*\nchromium z\.spec\.ts/);
  });

  it('rojo si un fichero se repite, nombrando sus shards', () => {
    const res = check([['chromium a.spec.ts', 'chromium b.spec.ts'], ['chromium b.spec.ts', 'chromium c.spec.ts'], ['touch touch-targets.spec.ts']]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('specs en más de un shard');
    expect(res.out).toContain('chromium b.spec.ts: 1,2');
  });

  it('rojo si un shard llega vacío', () => {
    const res = check([FULL.slice(0, 2), [], FULL.slice(2)]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('el shard 2/3 no tiene specs');
  });

  it('rojo si falta la lista de un shard', () => {
    const res = check([FULL.slice(0, 2), null, FULL.slice(2)]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('falta la lista del shard 2/3 (artefacto e2e-shard-2)');
  });

  it('rojo si hay la lista de un shard de más', () => {
    const res = check([FULL.slice(0, 2), FULL.slice(2), []], { total: 2 });
    expect(res.status).toBe(1);
    expect(res.out).toContain('lista de un shard que no existe en esta run (2 shards): e2e-shard-3.txt');
  });

  it('rojo si la lista completa está vacía', () => {
    const res = check([[]], { full: [] });
    expect(res.status).toBe(1);
    expect(res.out).toContain('la lista completa de specs (all.txt) está vacía');
  });
});

describe('e2e.yml: «Informes de todos los shards» (bash en línea)', () => {
  const script = step(mergeJob, 'blobs').run!;
  const RUN = '4242';

  /** `artifacts`: nombre del artefacto → el zip (o los zips) que trae dentro. */
  function check(total: number, artifacts: Record<string, string | string[]>, attempt = 1) {
    const dir = mkdtempSync(path.join(tmpdir(), 'dx457-blobs-'));
    for (const [name, zips] of Object.entries(artifacts)) {
      mkdirSync(path.join(dir, 'raw', name), { recursive: true });
      for (const zip of [zips].flat()) writeFileSync(path.join(dir, 'raw', name, zip), `${name}\n`);
    }
    const summary = path.join(dir, 'summary.md');
    const res = runStep(script, dir, {
      SHARD_TOTAL: String(total),
      RUN_ID: RUN,
      RUN_ATTEMPT: String(attempt),
      BLOBS_RAW: 'raw',
      BLOBS_DIR: 'blobs',
      GITHUB_STEP_SUMMARY: summary,
    });
    const read = (file: string) => {
      try {
        return readFileSync(path.join(dir, file), 'utf8').trim();
      } catch {
        return null;
      }
    };
    return { ...res, blob: (zip: string) => read(path.join('blobs', zip)), summary: () => read('summary.md') };
  }

  it('verde con un blob por shard, sin aviso si todos son de este intento', () => {
    const res = check(3, {
      [`blob-${RUN}-1-1`]: 'report-1.zip',
      [`blob-${RUN}-1-2`]: 'report-2.zip',
      [`blob-${RUN}-1-3`]: 'report-3.zip',
    });
    expect(res.status).toBe(0);
    expect(res.blob('report-2.zip')).toBe(`blob-${RUN}-1-2`);
    expect(res.out).not.toContain('mezcla intentos');
    expect(res.summary()).toBeNull();
  });

  it('del intento más alto de cada shard (Re-run failed jobs), y avisa de que mezcla intentos', () => {
    const res = check(
      3,
      {
        [`blob-${RUN}-1-1`]: 'report-1.zip',
        // 10 va antes que 2 en el orden del glob: gana por número, no por orden.
        [`blob-${RUN}-2-2`]: 'report-2.zip',
        [`blob-${RUN}-10-2`]: 'report-2.zip',
        [`blob-${RUN}-1-3`]: 'report-3.zip',
      },
      10,
    );
    expect(res.status).toBe(0);
    expect(res.blob('report-1.zip')).toBe(`blob-${RUN}-1-1`);
    expect(res.blob('report-2.zip')).toBe(`blob-${RUN}-10-2`);
    expect(res.blob('report-3.zip')).toBe(`blob-${RUN}-1-3`);
    expect(res.out).toContain('::warning title=Informes de los shards::el informe fusionado mezcla intentos (esta run es el 10): shard 1/3: intento 1 shard 3/3: intento 1');
    expect(res.summary()).toContain('- shard 1/3: intento 1');
    expect(res.summary()).not.toContain('shard 2/3');
  });

  it('acepta el blob con el hash que pone Playwright con --grep (report-<hash>-<i>.zip)', () => {
    const res = check(1, { [`blob-${RUN}-1-1`]: 'report-086392f-1.zip' });
    expect(res.status).toBe(0);
    expect(res.out).toContain('Shard 1/1: report-086392f-1.zip (intento 1)');
    expect(res.blob('report-1.zip')).toBe(`blob-${RUN}-1-1`);
  });

  it('rojo si el artefacto de un shard trae dos informes', () => {
    const res = check(2, { [`blob-${RUN}-1-1`]: 'report-1.zip', [`blob-${RUN}-1-2`]: ['report-2.zip', 'report-abc1234-2.zip'] });
    expect(res.status).toBe(1);
    expect(res.out).toContain(`el artefacto blob-${RUN}-1-2 del shard 2/2 tiene 2 informes (.zip) y debe tener uno`);
  });

  it('rojo nombrando el shard al que le falta el blob', () => {
    const res = check(3, { [`blob-${RUN}-1-1`]: 'report-1.zip', [`blob-${RUN}-1-3`]: 'report-3.zip' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('falta el informe (blob) del shard 2/3');
    expect(res.out).not.toContain('del shard 1/3');
  });

  it('el nombre del zip va relleno a la anchura de N (report-01.zip con 10 shards)', () => {
    const artifacts = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`blob-${RUN}-1-${i + 1}`, `report-${String(i + 1).padStart(2, '0')}.zip`]),
    );
    const res = check(10, artifacts);
    expect(res.status).toBe(0);
    expect(res.blob('report-01.zip')).toBe(`blob-${RUN}-1-1`);
    expect(res.blob('report-10.zip')).toBe(`blob-${RUN}-1-10`);
  });

  it('un blob de otra run no cuenta', () => {
    const res = check(1, { 'blob-999-1-1': 'report-1.zip' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('falta el informe (blob) del shard 1/1');
  });
});

describe('e2e.yml: «Tests del informe fusionado frente a la lista completa» (bash en línea)', () => {
  const script = step(mergeJob, 'count').run!;

  function check(listTotal: string | null, stats: Record<string, number> | null) {
    const dir = mkdtempSync(path.join(tmpdir(), 'dx457-count-'));
    const lines = ['Listing tests:', '  [chromium] › a.spec.ts:1:1 › x'];
    if (listTotal !== null) lines.push(listTotal);
    writeFileSync(path.join(dir, 'list.txt'), `${lines.join('\n')}\n`);
    if (stats) writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ stats: { startTime: 'x', duration: 1, ...stats } }));
    return runStep(script, dir, { FULL_RAW: 'list.txt', RESULTS_JSON: 'results.json' });
  }

  it('verde si pasados + fallidos + flaky + saltados = el Total de la lista', () => {
    const res = check('Total: 609 tests in 164 files', { expected: 560, unexpected: 2, flaky: 7, skipped: 40 });
    expect(res.status).toBe(0);
    expect(res.out).toContain('609 tests, los mismos que la lista completa');
  });

  it('con un solo test («1 test in 1 file»)', () => {
    expect(check('Total: 1 test in 1 file', { expected: 1, unexpected: 0, flaky: 0, skipped: 0 }).status).toBe(0);
  });

  it('rojo con los dos números si difieren', () => {
    const res = check('Total: 609 tests in 164 files', { expected: 400, unexpected: 0, flaky: 1, skipped: 4 });
    expect(res.status).toBe(1);
    expect(res.out).toContain('el informe fusionado tiene 405 tests y la lista completa 609');
  });

  it('rojo si la lista no tiene la línea Total o no hay informe', () => {
    expect(check(null, { expected: 1 }).out).toContain('no tiene la línea «Total: N tests»');
    const res = check('Total: 3 tests in 1 file', null);
    expect(res.status).toBe(1);
    expect(res.out).toContain('la fusión no dejó results.json');
  });
});
