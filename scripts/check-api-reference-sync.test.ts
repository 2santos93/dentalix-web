/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * DX-350 (G1-B §8): las tres listas que la API posee y la web copia byte a
 * byte. Corre el script de verdad contra árboles de ejemplo.
 */
const SCRIPT = path.join(__dirname, 'check-api-reference-sync.mjs');

const PAIRS = [
  ['prisma/reference/iso4217-zero-decimal.json', 'src/lib/money/iso4217-zero-decimal.json'],
  ['prisma/reference/iana-zone-names.json', 'src/lib/locations/iana-zone-names.json'],
  ['src/shared/format/regional-format.cases.json', 'src/lib/format/regional-format.cases.json'],
] as const;

function write(root: string, rel: string, content: string) {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function trees(apiOverride: Record<string, string | null> = {}) {
  const base = mkdtempSync(path.join(tmpdir(), 'api-sync-'));
  const web = path.join(base, 'web');
  const api = path.join(base, 'api');
  PAIRS.forEach(([apiRel, webRel], i) => {
    write(web, webRel, `{"n":${i}}\n`);
    const over = apiOverride[apiRel];
    if (over !== null) write(api, apiRel, over ?? `{"n":${i}}\n`);
  });
  return { web, api };
}

function run(api: string, web: string) {
  const r = spawnSync('node', [SCRIPT, api, web], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('check-api-reference-sync', () => {
  it('identical files pass', () => {
    const { web, api } = trees();
    expect(run(api, web).code).toBe(0);
  });

  it('check-api-reference-sync fails naming the drifted file', () => {
    const { web, api } = trees({ 'prisma/reference/iana-zone-names.json': '{"n":9}\n' });
    const r = run(api, web);
    expect(r.code).toBe(1);
    expect(r.out).toContain('src/lib/locations/iana-zone-names.json difiere de prisma/reference/iana-zone-names.json (primer byte distinto: 5)');
  });

  it('missing API file fails with its path', () => {
    const { web, api } = trees({ 'src/shared/format/regional-format.cases.json': null });
    const r = run(api, web);
    expect(r.code).toBe(1);
    // Ruta relativa, como en la deriva: el directorio temporal no dice nada.
    expect(r.out).toContain('falta src/shared/format/regional-format.cases.json en la API');
    expect(r.out).not.toContain(api);
  });

  it('missing web copy fails with its relative path', () => {
    const { web, api } = trees();
    rmSync(path.join(web, 'src/lib/money/iso4217-zero-decimal.json'));
    const r = run(api, web);
    expect(r.code).toBe(1);
    expect(r.out).toContain('falta src/lib/money/iso4217-zero-decimal.json en la web');
  });

  it('missing API_DIR fails with a clear message', () => {
    const { web } = trees();
    const r = run(path.join(tmpdir(), 'no-such-api-dir-dx350'), web);
    expect(r.code).toBe(2);
    expect(r.out).toContain('No encuentro dentalix-api');
  });
});
