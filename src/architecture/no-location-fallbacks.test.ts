import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * GLOBAL-G1 (spec §9 web, R2, R5): ningún código de la web deduce la moneda o
 * la zona de la sede del país ni usa una de reserva. Busca, con cualquier
 * comilla, las monedas y zonas de los dos países actuales (COP, USD, EUR,
 * America/Bogota, Europe/Madrid) y un `?? 'xx-XX'` o `?? 'UTC'` de reserva.
 * Recorre `src/` sin los tests, sin `src/lib/test/**` ni los ficheros
 * `*fixture*` (datos de prueba explícitos), sin `schema.d.ts` (generado), sin
 * líneas de comentario y sin las claves de `ZONE_CITY_LABELS`
 * (`lib/format/date.ts`), que pintan una zona elegida y no la sustituyen.
 */
const SRC = join(__dirname, '..');
const FORBIDDEN =
  /COUNTRY_CURRENCY|DEFAULT_SEDE_TIME_ZONE|['"`](?:America\/Bogota|Europe\/Madrid|COP|USD|EUR)['"`]|\?\?\s*['"`](?:[a-z]{2}-[A-Z]{2}|UTC)['"`]/;
const ZONE_LABEL_KEY = /^\s*'(?:America\/Bogota|Europe\/Madrid)':/;
/** Comentarios (JSDoc y `//`): describen datos, no los sustituyen. */
const COMMENT_LINE = /^\s*(?:\*|\/\/|\/\*)/;

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
  // Generado desde el OpenAPI de la API: sus `example` no son valores de reserva.
  if (rel === 'lib/api/schema.d.ts') return false;
  if (/fixture/.test(rel.split('/').pop() ?? '')) return false;
  return true;
}

function hits(path: string): string[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => FORBIDDEN.test(line) && !ZONE_LABEL_KEY.test(line) && !COMMENT_LINE.test(line))
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

  it('the pattern catches every quote style and the locale/UTC fallbacks', () => {
    for (const line of [`currency ?? "COP"`, 'x = `USD`', "c = 'EUR'", "zone ?? 'UTC'", 'locale ?? "es-CO"', "'Europe/Madrid'"]) {
      expect([line, FORBIDDEN.test(line)]).toEqual([line, true]);
    }
    expect(FORBIDDEN.test("formatCurrency(1, location.currency)")).toBe(false);
  });
});
