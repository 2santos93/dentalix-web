/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * DX-252 (TST-030): la guardia de la E2E contra informes de Playwright de
 * ejemplo. Corre el script de verdad (`node scripts/check-e2e-skips.mjs`).
 * DX-292 (TST-033): además nombra los tests flaky (pasaron solo al
 * reintentar), pone rojo si hay más de 2 y deja el recuento en el resumen
 * del job (`$GITHUB_STEP_SUMMARY`).
 */
const SCRIPT = path.join(__dirname, 'check-e2e-skips.mjs');
const ROOT_DIR = path.join(__dirname, '..', 'e2e');
const MAIL_SKIP = 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)';

type Annotation = { type: string; description?: string };
interface FakeTest {
  file: string;
  title: string;
  describe?: string;
  status: 'expected' | 'skipped' | 'unexpected' | 'flaky';
  annotations?: Annotation[];
}

function report(tests: FakeTest[], errors: object[] = []) {
  return {
    config: { rootDir: ROOT_DIR },
    errors,
    suites: tests.map((t) => {
      const spec = {
        title: t.title,
        file: t.file,
        line: 7,
        tests: [{ status: t.status, annotations: t.annotations ?? [] }],
      };
      const fileSuite = { title: t.file, file: t.file, specs: [] as object[], suites: [] as object[] };
      if (t.describe) fileSuite.suites.push({ title: t.describe, file: t.file, specs: [spec] });
      else fileSuite.specs.push(spec);
      return fileSuite;
    }),
  };
}

const allowed = {
  allowed: [
    {
      file: 'e2e/password-reset.spec.ts',
      title: 'Recuperar la contraseña › pide el enlace',
      annotation: MAIL_SKIP,
      requiresUnset: 'E2E_MAIL_DIR',
      reason: 'Sin E2E_MAIL_DIR no se lee el email.',
    },
  ],
};

const passwordReset = (annotations: Annotation[]): FakeTest => ({
  file: 'password-reset.spec.ts',
  describe: 'Recuperar la contraseña',
  title: 'pide el enlace',
  status: 'skipped',
  annotations,
});

function run(rep: object, env: Record<string, string> = {}, list: object = allowed) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dx252-skips-'));
  const reportPath = path.join(dir, 'report.json');
  const listPath = path.join(dir, 'allowed.json');
  writeFileSync(reportPath, JSON.stringify(rep));
  writeFileSync(listPath, JSON.stringify(list));
  // Sin las variables del entorno del que corre jest: solo las del caso.
  const childEnv: NodeJS.ProcessEnv = { ...process.env, GITHUB_ACTIONS: '', E2E_MAIL_DIR: '', ...env };
  try {
    const out = execFileSync('node', [SCRIPT, reportPath, listPath], { env: childEnv, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

const ok = (title: string): FakeTest => ({ file: 'agenda.spec.ts', title, status: 'expected' });
const flaky = (title: string): FakeTest => ({ file: 'rda-codes.spec.ts', title, status: 'flaky' });

/** Corre la guardia con `GITHUB_STEP_SUMMARY` apuntando a un fichero y lo devuelve. */
function runWithSummary(rep: object, env: Record<string, string> = {}) {
  const summary = path.join(mkdtempSync(path.join(tmpdir(), 'dx292-summary-')), 'summary.md');
  writeFileSync(summary, '');
  const res = run(rep, { GITHUB_STEP_SUMMARY: summary, ...env });
  return { ...res, summary: readFileSync(summary, 'utf8') };
}

describe('scripts/check-e2e-skips.mjs (DX-252)', () => {
  it('sin saltos: 0', () => {
    expect(run(report([ok('crea una cita')])).code).toBe(0);
  });

  it('un test.skip nuevo fuera de la lista: 1 y nombra fichero, título y motivo', () => {
    const res = run(
      report([
        ok('crea una cita'),
        { file: 'patient-flow.spec.ts', title: 'llegó', status: 'skipped', annotations: [{ type: 'skip', description: 'A menos de 1 h de la medianoche' }] },
      ]),
    );
    expect(res.code).toBe(1);
    expect(res.out).toContain('e2e/patient-flow.spec.ts:7 «llegó» — A menos de 1 h de la medianoche');
  });

  it('el salto permitido pasa solo si su variable falta y el motivo coincide', () => {
    expect(run(report([passwordReset([{ type: 'skip', description: MAIL_SKIP }])])).code).toBe(0);
  });

  it('el salto permitido es rojo si la variable que lo justifica SÍ está definida (regresión de entorno)', () => {
    const res = run(report([passwordReset([{ type: 'skip', description: MAIL_SKIP }])]), { E2E_MAIL_DIR: '/tmp/mail' });
    expect(res.code).toBe(1);
    expect(res.out).toContain('E2E_MAIL_DIR está definida');
  });

  it('un test de la lista saltado por OTRO motivo es rojo', () => {
    const res = run(report([passwordReset([{ type: 'skip', description: 'Otra cosa' }])]));
    expect(res.code).toBe(1);
    expect(res.out).toContain('el motivo no es el de e2e/allowed-skips.json');
  });

  it('un test de la lista que no llegó a ejecutarse (fallo previo en serie, sin anotación) es rojo', () => {
    const res = run(report([passwordReset([])]));
    expect(res.code).toBe(1);
    expect(res.out).toContain('no llegó a ejecutarse');
  });

  it('test.skip/test.fixme sin texto: lo dice', () => {
    const res = run(report([{ file: 'agenda.spec.ts', title: 'x', status: 'skipped', annotations: [{ type: 'fixme' }] }]));
    expect(res.code).toBe(1);
    expect(res.out).toContain('test.skip/test.fixme sin motivo');
  });

  it('un informe sin tests o con errores globales no vale: 2', () => {
    expect(run(report([])).code).toBe(2);
    expect(run(report([ok('a')], [{ message: 'Error: no encuentro el config' }])).code).toBe(2);
  });

  describe('la lista e2e/allowed-skips.json se valida al cargarla: 2 si una entrada no cumple el contrato', () => {
    const entry = allowed.allowed[0];
    const rep = report([passwordReset([{ type: 'skip', description: MAIL_SKIP }])]);
    it.each([
      ['sin requiresUnset (se permitiría siempre, también en la CI)', { ...entry, requiresUnset: undefined }, 'requiresUnset'],
      ['con requiresUnset que la CI no define', { ...entry, requiresUnset: 'TZ' }, 'requiresUnset'],
      ['sin annotation', { ...entry, annotation: undefined }, 'annotation'],
      ['sin title', { ...entry, title: '' }, 'title'],
      ['sin file', { ...entry, file: undefined }, 'file'],
    ])('%s', (_case, bad, field) => {
      const res = run(rep, {}, { allowed: [bad] });
      expect(res.code).toBe(2);
      expect(res.out).toContain('e2e/allowed-skips.json');
      expect(res.out).toContain(field);
    });
    it('sin la lista `allowed`: 2', () => {
      expect(run(rep, {}, { nada: [] }).code).toBe(2);
    });
  });

  describe('flaky (DX-292, TST-033): pasaron solo al reintentar', () => {
    it('uno o dos se nombran (fichero:línea y título) y no ponen rojo', () => {
      const res = run(report([ok('crea una cita'), flaky('guarda el REPS'), flaky('valida el código')]));
      expect(res.code).toBe(0);
      expect(res.out).toContain('2 flaky');
      expect(res.out).toContain('e2e/rda-codes.spec.ts:7 «guarda el REPS»');
      expect(res.out).toContain('e2e/rda-codes.spec.ts:7 «valida el código»');
    });

    it('más de 2: 1, y los nombra todos', () => {
      const res = run(report([flaky('a'), flaky('b'), flaky('c')]));
      expect(res.code).toBe(1);
      expect(res.out).toContain('3 flaky');
      expect(res.out).toContain('más de 2');
      for (const t of ['a', 'b', 'c']) expect(res.out).toContain(`e2e/rda-codes.spec.ts:7 «${t}»`);
    });

    it('en GitHub Actions cada flaky es un aviso anotado en el fichero', () => {
      const res = run(report([flaky('guarda el REPS')]), { GITHUB_ACTIONS: 'true' });
      expect(res.code).toBe(0);
      expect(res.out).toContain('::warning file=e2e/rda-codes.spec.ts,line=7,title=Test flaky::');
    });
  });

  describe('resumen del job ($GITHUB_STEP_SUMMARY)', () => {
    it('recuento y, por nombre, los flaky, los fallidos y los saltados sin permiso', () => {
      const res = runWithSummary(
        report([
          ok('crea una cita'),
          flaky('guarda el REPS'),
          { file: 'settings-index.spec.ts', title: 'Mi perfil mide 44 px', status: 'unexpected' },
          { file: 'patient-flow.spec.ts', title: 'llegó', status: 'skipped', annotations: [{ type: 'skip', description: 'Motivo' }] },
        ]),
      );
      expect(res.code).toBe(1);
      expect(res.summary).toContain('4 tests');
      expect(res.summary).toMatch(/1 passed · 1 failed · 1 flaky · 1 skipped/);
      expect(res.summary).toContain('`e2e/rda-codes.spec.ts:7` «guarda el REPS»');
      expect(res.summary).toContain('`e2e/settings-index.spec.ts:7` «Mi perfil mide 44 px»');
      expect(res.summary).toContain('`e2e/patient-flow.spec.ts:7` «llegó» — Motivo');
    });

    it('sin flaky ni fallos lo dice también', () => {
      const res = runWithSummary(report([ok('crea una cita')]));
      expect(res.code).toBe(0);
      expect(res.summary).toMatch(/1 passed · 0 failed · 0 flaky · 0 skipped/);
      expect(res.summary).toContain('Sin tests flaky');
    });
  });
});
