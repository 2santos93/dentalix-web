/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * DX-117 (FE-021): el informe de JS por ruta tras `next build`. Corre el
 * script de verdad (`node scripts/bundle-report.mjs`) sobre un `.next` de
 * juguete con la forma de los manifests de Next 16.
 */
const SCRIPT = path.join(__dirname, 'bundle-report.mjs');

/** Contenido pseudoaleatorio (no comprime a casi nada) de `n` bytes. */
function noise(n: number, seed: number) {
  let x = seed;
  return Buffer.from(Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return (x >> 16) & 0xff;
  }));
}

const CHUNKS: Record<string, Buffer> = {
  'static/chunks/framework.js': noise(4000, 1),
  'static/chunks/root-layout.js': noise(1000, 2),
  'static/chunks/app-shell.js': noise(2000, 3),
  'static/chunks/patient.js': noise(3000, 4),
  'static/chunks/agenda.js': noise(1500, 5),
  'static/chunks/login.js': noise(500, 6),
};
const gz = (f: string) => gzipSync(CHUNKS[f], { level: 9 }).length;

const PAGES: Record<string, Record<string, string[]>> = {
  '/(app)/patients/[id]/page': {
    '[project]/src/app/layout': ['static/chunks/root-layout.js'],
    '[project]/src/app/(app)/layout': ['static/chunks/app-shell.js'],
    '[project]/src/app/(app)/patients/[id]/page': ['static/chunks/patient.js', 'static/chunks/app-shell.js'],
  },
  '/(app)/agenda/page': {
    '[project]/src/app/layout': ['static/chunks/root-layout.js'],
    '[project]/src/app/(app)/layout': ['static/chunks/app-shell.js'],
    '[project]/src/app/(app)/agenda/page': ['static/chunks/agenda.js', 'static/styles.css'],
  },
  '/(auth)/login/page': {
    '[project]/src/app/layout': ['static/chunks/root-layout.js'],
    '[project]/src/app/(auth)/login/page': ['static/chunks/login.js'],
  },
};

function fixture({ withStats = false, manifestSource }: { withStats?: boolean; manifestSource?: string } = {}) {
  const project = mkdtempSync(path.join(tmpdir(), 'dx117-bundle-'));
  const dist = path.join(project, '.next');
  mkdirSync(path.join(dist, 'static', 'chunks'), { recursive: true });
  for (const [f, buf] of Object.entries(CHUNKS)) writeFileSync(path.join(dist, f), buf);
  writeFileSync(path.join(dist, 'static', 'styles.css'), 'body{}');
  const appPaths: Record<string, string> = { '/_not-found/page': 'app/_not-found/page.js', '/(app)/agenda/route': 'x.js' };
  for (const p of Object.keys(PAGES)) {
    appPaths[p] = `app${p}.js`;
    const file = path.join(dist, 'server', 'app', `${p}_client-reference-manifest.js`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      manifestSource ??
        `globalThis.__RSC_MANIFEST = (globalThis.__RSC_MANIFEST || {});\nglobalThis.__RSC_MANIFEST[${JSON.stringify(p)}] = ${JSON.stringify({ moduleLoading: {}, entryJSFiles: PAGES[p] })};\n`,
    );
  }
  writeFileSync(path.join(dist, 'server', 'app-paths-manifest.json'), JSON.stringify(appPaths));
  writeFileSync(path.join(dist, 'build-manifest.json'), JSON.stringify({ rootMainFiles: ['static/chunks/framework.js'] }));
  if (withStats) {
    mkdirSync(path.join(dist, 'diagnostics'));
    const stats = Object.entries(PAGES).map(([p, entries]) => ({
      route: p.replace(/\/\([^)]+\)/g, '').replace(/\/page$/, ''),
      firstLoadChunkPaths: [...new Set([...Object.values(entries).flat(), 'static/chunks/framework.js'])].map((f) => `.next/${f}`),
    }));
    writeFileSync(path.join(dist, 'diagnostics', 'route-bundle-stats.json'), JSON.stringify(stats));
  }
  return dist;
}

function run(dist: string, args: string[] = []) {
  const env: NodeJS.ProcessEnv = { ...process.env, GITHUB_STEP_SUMMARY: '' };
  try {
    const out = execFileSync('node', [SCRIPT, '--dist', dist, ...args], { env, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

type Row = {
  route: string;
  group: string;
  totalGzipBytes: number;
  sharedGzipBytes: number;
  groupGzipBytes: number;
  ownGzipBytes: number;
  totalRawBytes: number;
  ownRawBytes: number;
  chunks: number;
};
const readRows = (dist: string): Row[] => JSON.parse(readFileSync(path.join(dist, 'bundle-report.json'), 'utf8')).rows;

describe('scripts/bundle-report.mjs (DX-117)', () => {
  it.each([
    ['desde los client-reference-manifest', false],
    ['desde diagnostics/route-bundle-stats.json', true],
  ])('%s: suma gzip por ruta (cada chunk una vez), separa compartido/grupo/propio y ordena por total', (_name, withStats) => {
    const dist = fixture({ withStats });
    const res = run(dist);
    expect(res.code).toBe(0);
    const rows = readRows(dist);
    expect(rows.map((r) => r.route)).toEqual(['/patients/[id]', '/agenda', '/login']);
    const [patient, agenda, login] = rows;
    const common = gz('static/chunks/framework.js') + gz('static/chunks/root-layout.js');
    // app-shell.js sale en dos segmentos de la ficha pero cuenta una vez; el CSS no cuenta.
    expect(patient).toMatchObject({
      group: '(app)',
      chunks: 4,
      totalGzipBytes: common + gz('static/chunks/app-shell.js') + gz('static/chunks/patient.js'),
      sharedGzipBytes: common,
      groupGzipBytes: common + gz('static/chunks/app-shell.js'),
      ownGzipBytes: gz('static/chunks/patient.js'),
      totalRawBytes: 4000 + 1000 + 2000 + 3000,
      ownRawBytes: 3000,
      ownChunks: [{ file: 'static/chunks/patient.js', gzipBytes: gz('static/chunks/patient.js'), rawBytes: 3000 }],
    });
    expect(agenda.ownGzipBytes).toBe(gz('static/chunks/agenda.js'));
    expect(login).toMatchObject({ group: '(auth)', sharedGzipBytes: common, ownGzipBytes: 0 });
    expect(res.out).toContain('(app) /patients/[id]');
    expect(res.out).toContain((patient.totalGzipBytes / 1024).toFixed(1));
  });

  it('presupuesto: 0 si la ruta cabe, 1 y lo nombra si lo supera', () => {
    const dist = fixture();
    expect(run(dist, ['--budget', '/patients/[id]:total=100,own=100']).code).toBe(0);
    const res = run(dist, ['--budget', '/patients/[id]:own=1']);
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/\/patients\/\[id\]: own \d+\.\d KB gzip > presupuesto 1 KB/);
  });

  it('sin build: 2 con un mensaje claro, sin traza', () => {
    const res = run(path.join(mkdtempSync(path.join(tmpdir(), 'dx117-empty-')), '.next'));
    expect(res.code).toBe(2);
    expect(res.out).toContain('falta server/app-paths-manifest.json');
    expect(res.out).not.toContain('    at ');
  });

  it('un manifest con otra forma: 2 y dice qué falta', () => {
    const res = run(fixture({ manifestSource: 'globalThis.__RSC_MANIFEST = { "/x/page": { clientModules: {} } };' }));
    expect(res.code).toBe(2);
    expect(res.out).toContain('no tiene entryJSFiles');
  });
});
