import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * GLOBAL-G1 (spec §9 web, R2, R5): ningún código de la web deduce la moneda o
 * la zona de la sede del país ni usa una de reserva. Recorre `src/` sin los
 * tests, sin `src/lib/test/**` ni los ficheros `*fixture*` (datos de prueba
 * explícitos), y sin la clave `'America/Bogota':` del rótulo de ciudad de
 * `ZONE_CITY_LABELS` (`lib/format/date.ts`), que pinta una zona elegida y no
 * la sustituye.
 */
const SRC = join(__dirname, '..');
const FORBIDDEN = /COUNTRY_CURRENCY|DEFAULT_SEDE_TIME_ZONE|'America\/Bogota'|'COP'|'USD'/;
const ZONE_LABEL_KEY = /^\s*'America\/Bogota':/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function scanned(path: string): boolean {
  const rel = relative(SRC, path).split(sep).join('/');
  if (/\.test\./.test(rel)) return false;
  if (rel.startsWith('lib/test/')) return false;
  if (/fixture/.test(rel.split('/').pop() ?? '')) return false;
  return true;
}

function hits(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => FORBIDDEN.test(line) && !ZONE_LABEL_KEY.test(line))
    .map(({ line, n }) => `${relative(SRC, path)}:${n}: ${line.trim()}`);
}

describe('arquitectura: sin moneda ni zona de reserva (GLOBAL-G1)', () => {
  const files = sourceFiles(SRC).filter(scanned);

  it('src/ has no COUNTRY_CURRENCY, DEFAULT_SEDE_TIME_ZONE, Bogotá, COP or USD fallbacks', () => {
    expect(files.flatMap(hits)).toEqual([]);
  });

  it('the scan covers the screens of this unit and skips fixtures', () => {
    const rels = files.map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rels).toEqual(expect.arrayContaining(['components/dashboard/dashboard-view.tsx', 'lib/format/date.ts']));
    expect(rels.some((r) => r.startsWith('lib/test/') || r.includes('.test.') || r.includes('fixture'))).toBe(false);
  });
});
