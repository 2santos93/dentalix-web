import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * GLOBAL-G1 (spec §9 web, R2, R5): ningún código de la web deduce la moneda o
 * la zona de la sede del país ni usa una de reserva. Busca, con cualquier
 * comilla, las monedas y zonas de los dos países actuales (COP, USD, EUR,
 * America/Bogota, Europe/Madrid) y un `?? 'xx-XX'` o `|| 'UTC'` de reserva
 * (con `??` o `||`; región de letras o de cifras, `es-419`, y con escritura,
 * `zh-Hant`).
 * Recorre `src/` sin los tests, sin `src/lib/test/**` ni los ficheros
 * `*fixture*` (datos de prueba explícitos), sin `schema.d.ts` (generado), sin
 * líneas de comentario y sin las claves de `ZONE_CITY_LABELS`
 * (`lib/format/date.ts`), que pintan una zona elegida y no la sustituyen.
 */
const SRC = join(__dirname, '..');
/**
 * Una etiqueta regional: idioma con región (`es-CO`, `es-419`), con escritura
 * (`zh-Hant`, `sr-Latn`) o con las dos (`zh-Hant-TW`). Un idioma solo (`'es'`,
 * el idioma de la interfaz) no es un formato regional.
 */
const LOCALE_TAG = String.raw`[a-z]{2,3}(?:-[A-Z][a-z]{3}(?:-(?:[A-Z]{2}|\d{3}))?|-(?:[A-Z]{2}|\d{3}))`;
/** Un valor de reserva: `?? x` o `|| x`. */
const FALLBACK = String.raw`(?:\?\?|\|\|)\s*`;
const FORBIDDEN = new RegExp(
  String.raw`COUNTRY_CURRENCY|DEFAULT_SEDE_TIME_ZONE|['"\`](?:America\/Bogota|Europe\/Madrid|COP|USD|EUR)['"\`]|` +
    String.raw`${FALLBACK}['"\`](?:${LOCALE_TAG}|UTC)['"\`]`,
);
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
    for (const line of [
      `currency ?? "COP"`,
      'x = `USD`',
      "c = 'EUR'",
      "zone ?? 'UTC'",
      "zone || 'UTC'",
      'locale ?? "es-CO"',
      "locale || 'es-419'",
      "locale ?? 'zh-Hant-TW'",
      "'Europe/Madrid'",
    ]) {
      expect([line, FORBIDDEN.test(line)]).toEqual([line, true]);
    }
    expect(FORBIDDEN.test("formatCurrency(1, location.currency)")).toBe(false);
  });
});

/**
 * G1-B (spec §14, I5, R2, R4): ningún locale regional literal (`'xx-XX'`,
 * `'es-419'`, `'zh-Hant'`, con cualquier comilla) en el código de `src/`, ni un
 * reloj literal (`hourCycle: 'h23'`, `?? 'h12'`, `|| 'h23'`) fuera de
 * `lib/format/`: formato y reloj salen siempre de la sede. Mismo recorrido que arriba (sin tests, fixtures, `lib/test/**`,
 * `schema.d.ts` ni comentarios). Excepciones con nombre:
 * - `lib/format/date.ts`: su formatter neutro `'en-US'` con `hourCycle:
 *   'h23'` (X8) sigue hasta G1-C; no se toca para pasar esta prueba.
 * - `lib/format/regional-format.ts`: la línea del formatter neutro de
 *   `wallParts` (lógica, nunca presentación; spec §5, igual que la API).
 */
const REGIONAL_LOCALE = new RegExp(String.raw`['"\`]${LOCALE_TAG}['"\`]`);
const HOUR_CYCLE_LITERAL = new RegExp(
  String.raw`hourCycle\s*:\s*['"\`]h(?:11|12|23|24)['"\`]|${FALLBACK}['"\`]h(?:11|12|23|24)['"\`]`,
);
const LOCALE_EXEMPT: Record<string, RegExp> = {
  'lib/format/date.ts': /.*/,
  'lib/format/regional-format.ts': /^\s*dateFormatter\('en-US', \{$/,
};

function regionalHits(path: string): string[] {
  const rel = relative(SRC, path).split(sep).join('/');
  const exempt = LOCALE_EXEMPT[rel];
  const inFormat = rel.startsWith('lib/format/');
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !COMMENT_LINE.test(line))
    .filter(
      ({ line }) =>
        (REGIONAL_LOCALE.test(line) && !exempt?.test(line)) || (!inFormat && HOUR_CYCLE_LITERAL.test(line)),
    )
    .map(({ line, n }) => `${rel}:${n}: ${line.trim()}`);
}

describe('arquitectura: sin formato regional ni reloj fijos (G1-B)', () => {
  const files = sourceFiles(SRC).filter(scanned);

  it('architecture: no regional locale literal in src outside lib/format/date.ts', () => {
    expect(files.flatMap(regionalHits)).toEqual([]);
  });

  it('the patterns catch every quote style, Intl and toLocale calls and clock literals', () => {
    for (const line of [
      "value.toLocaleString('es-CO')",
      'new Intl.DateTimeFormat("ja-JP", {',
      'const locale = `de-DE`;',
      "    'fr-FR',",
      "new Intl.NumberFormat('es-419')",
      "locale = 'zh-Hant'",
      'toLocaleString("sr-Latn-RS")',
      "'zh-Hant-TW'",
    ]) {
      expect([line, REGIONAL_LOCALE.test(line)]).toEqual([line, true]);
    }
    for (const line of [
      "      hourCycle: 'h23',",
      'hourCycle ?? "h12"',
      'f({ hourCycle: `h11` })',
      "regionalFormat({ locale, hourCycle: hourCycle || 'h23' })",
      'cycle || `h12`',
    ]) {
      expect([line, HOUR_CYCLE_LITERAL.test(line)]).toEqual([line, true]);
    }
    expect(REGIONAL_LOCALE.test("toLocaleDateString('es', options)")).toBe(false);
    expect(REGIONAL_LOCALE.test("const UI_LANGUAGE = 'es';")).toBe(false);
    expect(REGIONAL_LOCALE.test("import x from '@/lib/format/date';")).toBe(false);
    expect(REGIONAL_LOCALE.test('regionalFormat({ locale: view.locale, hourCycle: view.hourCycle })')).toBe(false);
    expect(HOUR_CYCLE_LITERAL.test('regionalFormat({ locale, hourCycle })')).toBe(false);
  });

  it('the exemptions are only the neutral formatters of lib/format', () => {
    const date = files.find((f) => relative(SRC, f).split(sep).join('/') === 'lib/format/date.ts');
    expect(date).toBeDefined();
    expect(readFileSync(date!, 'utf8')).toMatch(/'en-US'/);
    const helper = readFileSync(join(SRC, 'lib/format/regional-format.ts'), 'utf8');
    expect(helper.split('\n').filter((l) => REGIONAL_LOCALE.test(l) && !COMMENT_LINE.test(l))).toEqual([
      "    dateFormatter('en-US', {",
    ]);
  });
});
