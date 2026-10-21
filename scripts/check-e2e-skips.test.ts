/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * DX-252 (TST-030): la guardia de la E2E contra informes de Playwright de
 * ejemplo. Corre el script de verdad (`node scripts/check-e2e-skips.mjs`).
 */
const SCRIPT = path.join(__dirname, 'check-e2e-skips.mjs');
const ROOT_DIR = path.join(__dirname, '..', 'e2e');
const MAIL_SKIP = 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)';

type Annotation = { type: string; description?: string };
interface FakeTest {
  file: string;
  title: string;
  describe?: string;
  status: 'expected' | 'skipped' | 'unexpected';
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

function run(rep: object, env: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dx252-skips-'));
  const reportPath = path.join(dir, 'report.json');
  const listPath = path.join(dir, 'allowed.json');
  writeFileSync(reportPath, JSON.stringify(rep));
  writeFileSync(listPath, JSON.stringify(allowed));
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
});
