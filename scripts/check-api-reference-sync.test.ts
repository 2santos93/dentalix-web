/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * DX-350 (G1-B §8), DX-312 (§6.5), DX-329 (§3.2) y DX-340: las seis listas que la API
 * posee y la web copia byte a byte. Corre el script de verdad contra árboles de ejemplo.
 */
const SCRIPT = path.join(__dirname, 'check-api-reference-sync.mjs');

const PAIRS = [
  ['prisma/reference/cldr-format-digits-zero.json', 'src/lib/money/cldr-format-digits-zero.json'],
  ['prisma/reference/iana-zone-names.json', 'src/lib/locations/iana-zone-names.json'],
  ['src/shared/format/regional-format.cases.json', 'src/lib/format/regional-format.cases.json'],
  ['prisma/reference/iso3166-countries.json', 'src/lib/locations/iso3166-countries.json'],
  ['prisma/reference/phone-regions-list.json', 'src/lib/locations/phone-regions-list.json'],
  ['src/shared/money/rounding-vectors.json', 'src/lib/money/rounding-vectors.json'],
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

  it('the six shared files are compared byte by byte', () => {
    const { web, api } = trees({ 'prisma/reference/iso3166-countries.json': '{"n":3} \n' });
    const r = run(api, web);
    expect(r.code).toBe(1);
    expect(r.out).toContain(
      'src/lib/locations/iso3166-countries.json difiere de prisma/reference/iso3166-countries.json (primer byte distinto: 7)',
    );
    const phone = trees({ 'prisma/reference/phone-regions-list.json': '{"n":4} \n' });
    const p = run(phone.api, phone.web);
    expect(p.code).toBe(1);
    expect(p.out).toContain(
      'src/lib/locations/phone-regions-list.json difiere de prisma/reference/phone-regions-list.json (primer byte distinto: 7)',
    );
    const ok = trees();
    expect(run(ok.api, ok.web).out).toContain('6 ficheros idénticos');
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
    rmSync(path.join(web, 'src/lib/money/cldr-format-digits-zero.json'));
    const r = run(api, web);
    expect(r.code).toBe(1);
    expect(r.out).toContain('falta src/lib/money/cldr-format-digits-zero.json en la web');
  });

  it('missing API_DIR fails with a clear message', () => {
    const { web } = trees();
    const r = run(path.join(tmpdir(), 'no-such-api-dir-dx350'), web);
    expect(r.code).toBe(2);
    expect(r.out).toContain('No encuentro dentalix-api');
  });
});
