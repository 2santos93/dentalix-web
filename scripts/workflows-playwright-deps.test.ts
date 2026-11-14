/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * OPS-057: en 3 de 6 runs de main el paso «Dependencias y Chromium» de la E2E
 * tardó 9 min 37 s – 9 min 45 s de sus 10 por el mirror de `apt`. Los dos
 * workflows de la web cachean los navegadores de Playwright por la versión
 * exacta del lockfile y el SO, instalan con reintentos de apt, cada paso con
 * apt tiene su tope y su duración va al resumen del job (DX-452).
 */
const WORKFLOWS_DIR = path.join(__dirname, '..', '.github', 'workflows');
const yaml = createRequire(__filename)('js-yaml') as { load(src: string): unknown };

interface Step {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  'timeout-minutes'?: number | string;
  'continue-on-error'?: boolean;
}
interface Job {
  'timeout-minutes': number | string;
  strategy?: { matrix?: Record<string, unknown> };
  steps: Step[];
}

function job(file: string, name: string): Job {
  const wf = yaml.load(readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')) as { jobs: Record<string, Job> };
  return wf.jobs[name];
}

function step(j: Job, id: string): Step {
  const found = j.steps.find((s) => s.id === id);
  if (!found) throw new Error(`no hay paso con id ${id}`);
  return found;
}

/** Las tres variantes de run de la E2E (DX-413, DX-457): repetida, filtrada y normal. */
const VARIANTS = ['repeat_each', 'grep', 'normal'] as const;

/**
 * El tope en cada variante, en el orden de VARIANTS. Un número vale para las
 * tres; una expresión es la cadena `repetida && A || filtrada && B || C`
 * (con valores sueltos o listas de un valor, `'[A]'`, como en la matriz) y
 * `${{ matrix.timeout }}` se lee de la matriz del job.
 */
function timeouts(value: number | string | undefined, j: Job): [number, number, number] | undefined {
  if (typeof value === 'number') return [value, value, value];
  if (value === undefined) return undefined;
  if (value.trim() === '${{ matrix.timeout }}') {
    const matrixTimeout = j.strategy?.matrix?.timeout;
    if (typeof matrixTimeout !== 'string') throw new Error('el tope es matrix.timeout y la matriz no lo define');
    return timeouts(matrixTimeout, j);
  }
  const m = /&&\s*'?\[?(\d+)\]?'?\s*\|\|\s*inputs\.grep != '' &&\s*'?\[?(\d+)\]?'?\s*\|\|\s*'?\[?(\d+)\]?'?\s*\)?\s*\}\}$/.exec(value);
  if (!m) throw new Error(`tope no reconocido: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const CACHE_KEY = 'playwright-${{ steps.playwright-version.outputs.os }}-${{ steps.playwright-version.outputs.version }}';
const LOCK_VERSION = "require('./package-lock.json').packages['node_modules/@playwright/test']?.version";

describe.each([
  ['e2e.yml', 'playwright', 'deps'],
  ['ci.yml', 'checks', 'chromium'],
])('%s: navegadores de Playwright (OPS-057)', (file, jobName, installId) => {
  const j = job(file, jobName);

  it('la clave de la caché es la versión exacta del lockfile y el SO, sin restore-keys', () => {
    expect(step(j, 'playwright-version').run).toContain(LOCK_VERSION);
    expect(step(j, 'playwright-version').run).toContain('/etc/os-release');
    const restore = step(j, 'playwright-cache');
    expect(restore.uses).toBe('actions/cache/restore@v4');
    expect(restore.with).toEqual({ path: '~/.cache/ms-playwright', key: CACHE_KEY });
  });

  it('con caché solo install-deps; sin ella, install --with-deps; con reintentos acotados', () => {
    const install = step(j, installId);
    expect(install.env?.BROWSERS_CACHED).toBe('${{ steps.playwright-cache.outputs.cache-hit }}');
    expect(install.run).toContain('install=(install-deps chromium)');
    expect(install.run).toContain('install=(install --with-deps chromium)');
    expect(install.run).toContain('for attempt in 1 2 3; do');
  });

  it('apt reintenta también dentro de playwright install-deps', () => {
    const apt = j.steps.filter((s) => s.run?.includes('/etc/apt/apt.conf.d/80-dentalix-retries'));
    expect(apt.length).toBe(1);
    expect(apt[0].run).toContain(`echo 'Acquire::Retries "3";'`);
    const order = j.steps.indexOf(apt[0]);
    expect(order).toBeLessThanOrEqual(j.steps.indexOf(step(j, installId)));
  });

  it('se guarda la caché solo sin acierto, tras instalar y sin poner la run en rojo', () => {
    const save = j.steps.find((s) => s.uses === 'actions/cache/save@v4');
    expect(save?.if).toBe("steps.playwright-cache.outputs.cache-hit != 'true'");
    expect(save?.with).toEqual({ path: '~/.cache/ms-playwright', key: '${{ steps.playwright-cache.outputs.cache-primary-key }}' });
    expect(save?.['continue-on-error']).toBe(true);
    expect(j.steps.indexOf(save!)).toBeGreaterThan(j.steps.indexOf(step(j, installId)));
  });
});

describe('e2e.yml: topes y duración de los pasos con apt (OPS-057)', () => {
  const j = job('e2e.yml', 'playwright');

  it('Poppler tiene tope propio (5) y no hace apt-get update de entrada', () => {
    const poppler = step(j, 'poppler');
    expect(poppler['timeout-minutes']).toBe(5);
    expect(poppler.run).toMatch(/^echo 'Acquire::Retries "3";'.*\nfor attempt in 1 2 3; do\n\s+if sudo apt-get install/);
    expect(j.steps.indexOf(poppler)).toBeLessThan(j.steps.indexOf(step(j, 'deps')));
  });

  it('Dependencias y Chromium sube a 15 min', () => {
    expect(step(j, 'deps')['timeout-minutes']).toBe(15);
  });

  it('la duración de Poppler y de las dependencias usa report-step-duration.sh con sus topes', () => {
    const report = j.steps.find((s) => s.name === 'Duración de Poppler y de las dependencias');
    expect(report?.if).toBe("always() && hashFiles('dentalix-web/scripts/report-step-duration.sh') != ''");
    expect(report?.run).toContain('scripts/report-step-duration.sh "Poppler" 5');
    expect(report?.run).toContain('scripts/report-step-duration.sh "Dependencias y Chromium" 15');
    expect(report?.env?.POPPLER_STARTED_AT).toBe('${{ steps.poppler-start.outputs.at }}');
    expect(report?.env?.DEPS_STARTED_AT).toBe('${{ steps.deps-start.outputs.at }}');
  });

  it.each(['playwright', 'playwright-merge'])(
    '%s: la suma de los topes de los pasos (~3 min sin tope: checkout y Node) cabe en el del job, en cada variante',
    (jobName) => {
      const jj = job('e2e.yml', jobName);
      const untimed = jj.steps.filter((s) => s['timeout-minutes'] === undefined);
      expect(untimed.map((s) => s.uses)).toEqual(['actions/checkout@v4', 'actions/checkout@v4', 'actions/setup-node@v4']);
      const jobLimit = timeouts(jj['timeout-minutes'], jj)!;
      VARIANTS.forEach((variant, i) => {
        const sum = 3 + jj.steps.reduce((acc, s) => acc + (timeouts(s['timeout-minutes'], jj)?.[i] ?? 0), 0);
        expect({ variant, sum: sum <= jobLimit[i] ? 'cabe' : `${sum} > ${jobLimit[i]}` }).toEqual({ variant, sum: 'cabe' });
      });
    },
  );

  it('DX-457: Playwright tiene 35 min por shard (50 filtrado y 200 repetido, DX-413)', () => {
    const playwright = step(j, 'playwright');
    expect(playwright['timeout-minutes']).toBe('${{ matrix.timeout }}');
    expect(timeouts(playwright['timeout-minutes'], j)).toEqual([200, 50, 35]);
  });
});

describe('ci.yml: tope y duración de Chromium (OPS-057)', () => {
  const j = job('ci.yml', 'checks');

  it('Chromium tiene tope propio y su duración va al resumen con ese tope', () => {
    expect(step(j, 'chromium')['timeout-minutes']).toBe(10);
    const report = j.steps.find((s) => s.name === 'Duración de Chromium');
    expect(report?.env?.STEP_STARTED_AT).toBe('${{ steps.chromium-start.outputs.at }}');
    expect(report?.run).toBe('scripts/report-step-duration.sh "Chromium (pruebas de contraste)" 10');
  });
});
