/**
 * @jest-environment node
 */
import { execFile, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * DX-452 (TST-056): la guardia de tendencia de flaky contra historiales de
 * ejemplo. Corre el script de verdad (`node scripts/check-e2e-flaky-trend.mjs`)
 * con `--history-dir`: 3 de las 10 últimas runs de main con el mismo spec
 * flaky es rojo; 2 de 10, verde.
 */
const SCRIPT = path.join(__dirname, 'check-e2e-flaky-trend.mjs');
const SPEC = { file: 'e2e/audit-log-zones.spec.ts', title: 'cada hora dice su zona' };
const OTHER = { file: 'e2e/agenda.spec.ts', title: 'crea una cita' };

interface RunFile {
  runId: number;
  flaky: { file: string; title: string }[];
}
const run = (runId: number, ...flaky: RunFile['flaky']): RunFile => ({ runId, flaky });

/** Historial de `n` runs anteriores (ids 100, 99, …); `flakyAt` dice cuáles traen `SPEC`. */
function history(n: number, flakyAt: number[]): RunFile[] {
  return Array.from({ length: n }, (_, i) => run(100 - i, ...(flakyAt.includes(i) ? [SPEC] : [])));
}

function exec(current: RunFile, past: RunFile[], env: Record<string, string> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dx452-trend-'));
  const historyDir = path.join(dir, 'history');
  execFileSync('mkdir', [historyDir]);
  past.forEach((r) => writeFileSync(path.join(historyDir, `${r.runId}.json`), JSON.stringify(r)));
  const currentPath = path.join(dir, 'current.json');
  writeFileSync(currentPath, JSON.stringify(current));
  const summary = path.join(dir, 'summary.md');
  writeFileSync(summary, '');
  try {
    const out = execFileSync('node', [SCRIPT, currentPath, '--history-dir', historyDir], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, ...env },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { code: 0, out, summary: readFileSync(summary, 'utf8') };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}`, summary: readFileSync(summary, 'utf8') };
  }
}

describe('scripts/check-e2e-flaky-trend.mjs (DX-452)', () => {
  it('3 de las 10 últimas runs con el mismo spec flaky: 1, y lo nombra con las runs', () => {
    // La actual + 2 de las 9 anteriores.
    const res = exec(run(101, SPEC), history(9, [0, 4]));
    expect(res.code).toBe(1);
    expect(res.out).toContain('«e2e/audit-log-zones.spec.ts › cada hora dice su zona» salió flaky en 3 de las últimas 10 runs');
    expect(res.out).toContain('101, 100, 96');
    expect(res.summary).toContain('`e2e/audit-log-zones.spec.ts › cada hora dice su zona`: 3 de 10');
  });

  it('2 de las 10: 0', () => {
    const res = exec(run(101, SPEC), history(9, [3]));
    expect(res.code).toBe(0);
    expect(res.summary).toContain('Ningún spec salió flaky en 3 o más de las 10 runs');
  });

  it('la actual limpia y 3 en las anteriores: sigue siendo rojo (la tendencia es del spec, no de la run)', () => {
    const res = exec(run(101), history(9, [1, 2, 8]));
    expect(res.code).toBe(1);
  });

  it('solo cuenta la ventana de 10: una flaky en la 10.ª anterior queda fuera', () => {
    // La actual (limpia) + las 9 anteriores: 3 flaky dentro → rojo; la tercera en la 10.ª anterior (fuera) → verde.
    expect(exec(run(101), history(12, [0, 4, 8, 10])).code).toBe(1);
    expect(exec(run(101), history(12, [0, 4, 9, 10])).code).toBe(0);
  });

  it('un test cuenta una vez por run aunque el informe lo repita, y una run relanzada no cuenta dos veces', () => {
    const repeated = run(101, SPEC, SPEC, SPEC);
    expect(exec(repeated, history(9, [])).code).toBe(0);
    const relaunched = [run(101, SPEC), run(101, SPEC), ...history(8, [])];
    expect(exec(run(102, SPEC), relaunched).code).toBe(0);
  });

  it('con pocas runs de historial cuenta las que hay', () => {
    expect(exec(run(101, SPEC), [run(100, SPEC), run(99, SPEC)]).code).toBe(1);
    expect(exec(run(101, SPEC), [run(100, SPEC)]).code).toBe(0);
  });

  it('otro spec flaky en 2 y el primero en 3: nombra solo al primero', () => {
    const past = history(9, [0, 1]).map((r, i) => (i < 2 ? { ...r, flaky: [...r.flaky, OTHER] } : r));
    const res = exec(run(101, SPEC), past);
    expect(res.code).toBe(1);
    expect(res.out).not.toContain('agenda.spec.ts › crea una cita» salió');
  });

  it('sin historial legible (sin token en la CI): avisa y sale con 0', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'dx452-trend-'));
    const currentPath = path.join(dir, 'current.json');
    writeFileSync(currentPath, JSON.stringify(run(101, SPEC)));
    const env = { ...process.env, GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' };
    const out = execFileSync('node', [SCRIPT, currentPath], { env, encoding: 'utf8', stdio: 'pipe' });
    expect(out).toContain('::warning title=Tendencia de flaky sin historial::');
  });

  describe('historial desde la API de GitHub (servidor local que imita los artefactos)', () => {
    /** Un zip con un `e2e-flaky.json`, como lo sube actions/upload-artifact. */
    function zipOf(file: RunFile): Buffer {
      const dir = mkdtempSync(path.join(tmpdir(), 'dx452-zip-'));
      writeFileSync(path.join(dir, 'e2e-flaky.json'), JSON.stringify(file));
      execFileSync('zip', ['-q', '-j', path.join(dir, 'a.zip'), path.join(dir, 'e2e-flaky.json')]);
      return readFileSync(path.join(dir, 'a.zip'));
    }

    async function viaApi(
      current: RunFile,
      past: RunFile[],
      branchOf: (r: RunFile) => string = () => 'main',
      brokenZips: number[] = [],
    ) {
      const calls: string[] = [];
      const server = createServer((req, res) => {
        calls.push(req.url ?? '');
        expect(req.headers.authorization).toBe('Bearer tok');
        const zip = /^\/zip\/(\d+)$/.exec(req.url ?? '');
        if (zip && brokenZips.includes(Number(zip[1]))) {
          res.statusCode = 500;
          res.end('boom');
          return;
        }
        if (zip) {
          res.end(zipOf(past.find((r) => r.runId === Number(zip[1]))!));
          return;
        }
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            artifacts: past.map((r) => ({
              id: r.runId,
              name: 'e2e-flaky',
              expired: false,
              created_at: new Date(Date.UTC(2026, 10, 1) + r.runId * 60_000).toISOString(),
              archive_download_url: `${base}/zip/${r.runId}`,
              workflow_run: { id: r.runId, head_branch: branchOf(r) },
            })),
          }),
        );
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const dir = mkdtempSync(path.join(tmpdir(), 'dx452-api-'));
      const currentPath = path.join(dir, 'current.json');
      writeFileSync(currentPath, JSON.stringify(current));
      const env = {
        ...process.env,
        GITHUB_TOKEN: 'tok',
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_API_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        GITHUB_STEP_SUMMARY: '',
      };
      try {
        const out = await promisify(execFile)('node', [SCRIPT, currentPath], { env, encoding: 'utf8' });
        return { code: 0, out: out.stdout, calls };
      } catch (err) {
        const e = err as { code: number; stdout: string; stderr: string };
        return { code: e.code, out: `${e.stdout}${e.stderr}`, calls };
      } finally {
        server.close();
      }
    }

    // `created_at` crece con el id, como en las runs reales.
    const past = (flakyAt: number[]) => history(9, flakyAt);

    it('3 de 10 con el historial de la API: 1, tras una llamada de lista y una descarga por run anterior', async () => {
      const res = await viaApi(run(101, SPEC), past([2, 5]));
      expect(res.code).toBe(1);
      expect(res.out).toContain('salió flaky en 3 de las últimas 10 runs');
      expect(res.calls.filter((c) => c.startsWith('/repos/o/r/actions/artifacts?name=e2e-flaky'))).toHaveLength(1);
      expect(res.calls.filter((c) => c.startsWith('/zip/'))).toHaveLength(9);
    });

    it('con más de 9 runs en la lista descarga solo las 9 más recientes, una por run', async () => {
      const res = await viaApi(run(101, SPEC), [...history(14, [0, 1]), run(100, SPEC)]);
      expect(res.calls.filter((c) => c.startsWith('/zip/'))).toHaveLength(9);
      expect(res.code).toBe(1);
    });

    it('un artefacto que no se descarga se salta y avisa; los demás cuentan', async () => {
      const res = await viaApi(run(101, SPEC), past([0, 1]), () => 'main', [100]);
      expect(res.out).toContain('::warning title=Artefacto de flaky ilegible::');
      // 100 estaba roto: queda la actual + 1 flaky (99) = 2 de 9 runs leídas -> verde.
      expect(res.code).toBe(0);
      const still = await viaApi(run(101, SPEC), past([1, 2, 3]), () => 'main', [100]);
      expect(still.code).toBe(1);
    });

    it('si ningún artefacto se puede leer: avisa y sale con 0', async () => {
      const ids = past([0, 1, 2]).map((r) => r.runId);
      const res = await viaApi(run(101, SPEC), past([0, 1, 2]), () => 'main', ids);
      expect(res.code).toBe(0);
      expect(res.out).toContain('::warning title=Tendencia de flaky sin historial::');
    });

    it('2 de 10: 0; y los artefactos de otras ramas no cuentan', async () => {
      expect((await viaApi(run(101, SPEC), past([3]))).code).toBe(0);
      const onBranch = await viaApi(run(101, SPEC), past([2, 5]), () => 'loop/DX-1');
      expect(onBranch.code).toBe(0);
    });
  });
});
