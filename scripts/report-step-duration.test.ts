/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * DX-452 (TST-056): el aviso de duración del paso de Playwright, como el de la
 * API (DX-396): tabla en el resumen del job y `::warning::` desde el 70 % del
 * `timeout-minutes` del paso.
 */
const SCRIPT = path.join(__dirname, 'report-step-duration.sh');

function run(args: string[], env: Record<string, string>) {
  const summary = path.join(mkdtempSync(path.join(tmpdir(), 'dx452-dur-')), 'summary.md');
  writeFileSync(summary, '');
  try {
    const out = execFileSync('bash', [SCRIPT, ...args], {
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

// 50 min de tope: el 70 % son 35 min = 2100 s.
const at = (seconds: number) => ({ STEP_STARTED_AT: '1000', STEP_FINISHED_AT: String(1000 + seconds) });

describe('scripts/report-step-duration.sh (DX-452)', () => {
  it('por debajo del 70 %: publica la duración y no avisa', () => {
    const res = run(['Playwright', '50'], at(2099));
    expect(res.code).toBe(0);
    expect(res.out).not.toContain('::warning');
    expect(res.summary).toContain('### Duración: Playwright');
    expect(res.summary).toContain('| 34 min 59 s (2099 s) | 50 min | 69 % | 70 % |');
  });

  it('desde el 70 % (35 de 50 min): ::warning:: con la duración y el tope', () => {
    const res = run(['Playwright', '50'], at(2100));
    expect(res.code).toBe(0);
    expect(res.out).toContain('::warning title=Playwright cerca del tope::35 min 0 s son el 70 % de timeout-minutes (50 min).');
    expect(res.summary).toContain('| 35 min 0 s (2100 s) | 50 min | 70 % | 70 % |');
  });

  it('sin hora de inicio o con un tope que no es un entero: 2', () => {
    expect(run(['Playwright', '50'], { STEP_STARTED_AT: '' }).code).not.toBe(0);
    expect(run(['Playwright', '0'], at(10)).code).toBe(2);
    expect(run(['Playwright'], at(10)).code).toBe(2);
  });
});
