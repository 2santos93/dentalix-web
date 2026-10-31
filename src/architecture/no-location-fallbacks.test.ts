import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { COUNTRIES } from '@/lib/locations/countries';

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

/**
 * DX-316 (I4, R1): el calendario de la sede no se razona por país. Ni el
 * cliente y la lógica (`lib/locations/location-calendar*.ts`) ni sus pantallas
 * (`components/location-calendar/**`) nombran un país, sin contar los tests.
 */
const COUNTRY_WORD = /countr(?:y|ies)/i;

function locationCalendarFiles(): string[] {
  const lib = readdirSync(join(SRC, 'lib/locations'))
    .filter((name) => /^location-calendar.*\.ts$/.test(name))
    .map((name) => join(SRC, 'lib/locations', name));
  const screens = join(SRC, 'components/location-calendar');
  const components = existsSync(screens) ? sourceFiles(screens) : [];
  return [...lib, ...components].filter(scanned);
}

describe('arquitectura: calendario de la sede sin país (DX-316)', () => {
  it('location calendar files never mention a country', () => {
    const files = locationCalendarFiles();
    const rels = files.map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rels).toEqual(
      expect.arrayContaining(['lib/locations/location-calendar.ts', 'lib/locations/location-calendar-api.ts']),
    );
    expect(rels.some((r) => r.includes('.test.'))).toBe(false);
    const mentions = files.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => COUNTRY_WORD.test(line))
        .map(({ line, n }) => `${relative(SRC, path)}:${n}: ${line.trim()}`),
    );
    expect(mentions).toEqual([]);
  });

  it('the country pattern catches singular, plural and any case, not the Spanish copy', () => {
    for (const line of ['countryCode', '// Country', 'const COUNTRIES = []', 'byCountries(x)']) {
      expect([line, COUNTRY_WORD.test(line)]).toEqual([line, true]);
    }
    expect(COUNTRY_WORD.test('Dentalix no trae los festivos de ningún país.')).toBe(false);
  });
});

/**
 * DX-324 (spec R1, R12, R14, §6.10): la receta es una sola para todas las
 * clínicas. Ningún fichero de `components/prescriptions/**` ni de
 * `lib/prescriptions/**` (sin tests) nombra un país, un código de país, una
 * norma o una autoridad nacional, salvo la excepción con nombre de R12:
 * `lib/prescriptions/legacy-prescription-layout.ts`, que congela los textos de
 * las recetas emitidas antes de DX-324. Mira también los comentarios. Cubre
 * además las otras pantallas que tocó DX-324: Ajustes › Recetas, la ruta de
 * impresión y el perfil del personal (antes «en Colombia, RETHUS…; en España,
 * nº de colegiado»).
 */
const PRESCRIPTION_LEGACY_LAYOUT = 'lib/prescriptions/legacy-prescription-layout.ts';
const PRESCRIPTION_SCREENS = [
  'app/(app)/settings/recetas/page.tsx',
  'app/print/patients/[id]/prescriptions/[prescriptionId]/page.tsx',
  'components/staff/staff-member-profile.tsx',
];
/** Códigos de país en mayúsculas (`'CO'`, `ES:`) y normas o autoridades nacionales. */
const NATIONAL_TERM = /\b(?:CO|ES)\b|colegiado|DNI\/NIE|AEMPS|CIMA|Decreto|Dec\. 780|RD 1718|España|Colombia/;

function nationalTermHit(line: string): boolean {
  return COUNTRY_WORD.test(line) || NATIONAL_TERM.test(line);
}

function prescriptionFiles(): string[] {
  return [join(SRC, 'components/prescriptions'), join(SRC, 'lib/prescriptions')]
    .flatMap(sourceFiles)
    .concat(PRESCRIPTION_SCREENS.map((rel) => join(SRC, rel)))
    .filter(scanned)
    .filter((path) => relative(SRC, path).split(sep).join('/') !== PRESCRIPTION_LEGACY_LAYOUT);
}

describe('arquitectura: receta sin país (DX-324)', () => {
  it('prescription files never mention a country outside the legacy layout', () => {
    const mentions = prescriptionFiles().flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => nationalTermHit(line))
        .map(({ line, n }) => `${relative(SRC, path)}:${n}: ${line.trim()}`),
    );
    expect(mentions).toEqual([]);
  });

  it('the prescription scan covers the document, the modal, the client and the other DX-324 screens, skips the legacy layout and catches national terms', () => {
    const rels = prescriptionFiles().map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rels).toEqual(
      expect.arrayContaining([
        'components/prescriptions/prescription-document.tsx',
        'components/prescriptions/new-prescription-modal.tsx',
        'lib/prescriptions/prescriptions-api.ts',
        'lib/prescriptions/prescription-layout.ts',
        'lib/prescriptions/prescription-format.ts',
        ...PRESCRIPTION_SCREENS,
      ]),
    );
    for (const rel of PRESCRIPTION_SCREENS) expect([rel, existsSync(join(SRC, rel))]).toEqual([rel, true]);
    expect(rels).not.toContain(PRESCRIPTION_LEGACY_LAYOUT);
    expect(rels.some((r) => r.includes('.test.'))).toBe(false);
    for (const line of [
      "const country = rx.country ?? 'CO';",
      "{ CO: 'Documento', ES: 'DNI/NIE' }",
      "'Nº de colegiado'",
      'Real Decreto 1718/2010, art. 3',
      'Ficha técnica en la CIMA de la AEMPS',
      'En España cada receta lleva un solo medicamento',
      '(Colombia)',
      'type ClinicCountry',
    ]) {
      expect([line, nationalTermHit(line)]).toEqual([line, true]);
    }
    for (const line of ["title: 'Receta'", "documentLabel: 'Documento'", 'MUTUA_ES', 'VALUES', 'Nº de registro profesional']) {
      expect([line, nationalTermHit(line)]).toEqual([line, false]);
    }
  });
});

/**
 * DX-324, fase 1: la API vuelve a enviar `PrescriptionIssuerDto.country`
 * (deprecated) solo para la web anterior. La web nueva no lo lee en ningún
 * sitio; la fase 2 lo retira.
 */
const ISSUER_COUNTRY_READ = /issuer\w*\??\.country\b|\{[^}]*\bcountry\b[^}]*\}\s*=\s*\w*issuer/i;

describe('arquitectura: la web no lee el país deprecated del emisor (DX-324)', () => {
  it('no source file reads issuer.country', () => {
    const mentions = sourceFiles(SRC)
      .filter(scanned)
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => ISSUER_COUNTRY_READ.test(line))
          .map(({ line, n }) => `${relative(SRC, path)}:${n}: ${line.trim()}`),
      );
    expect(mentions).toEqual([]);
  });

  it('the issuer pattern catches property reads and destructuring, not the prescription country', () => {
    for (const line of ['issuer.country', 'issuer?.country', 'data.issuer.country', 'const { country } = issuer;']) {
      expect([line, ISSUER_COUNTRY_READ.test(line)]).toEqual([line, true]);
    }
    for (const line of ['rx.country', 'issuer.locationName', 'issuer.countryless']) {
      expect([line, ISSUER_COUNTRY_READ.test(line)]).toEqual([line, false]);
    }
  });
});

/**
 * DX-326: el pagador no tiene país y sus tipos son genéricos. Ni las pantallas
 * de pagadores ni quienes leen su tipo nombran un país ni un código o rótulo
 * antiguo (`EPS_CO`, «Mutua (…)», «Aseguradoras, EPS»); el único que conoce los
 * códigos antiguos es el normalizador legado. Solo producción: los tests
 * `legacy …` los usan a propósito.
 */
const PAYER_LEGACY_NORMALIZER = 'lib/payers/legacy-payer-type.ts';
const PAYER_SCREENS = [
  'lib/patients/member-number.ts',
  'lib/patients/agreement-eligibility.ts',
  'components/agreements/agreements-manager.tsx',
  'components/patients/coverage-dialog.tsx',
  'components/patients/patient-coverage-section.tsx',
  'app/(app)/settings/pagadores/page.tsx',
  'components/settings/settings-sections.ts',
];
const LEGACY_PAYER_TERM = /\b(?:MUTUA_ES|PREPAGADA_CO|EPS_CO|EMPRESA|OTRO)\b|\bEPS\b|[Mm]utua|[Pp]repagada/;

function payerTermHit(line: string): boolean {
  return nationalTermHit(line) || LEGACY_PAYER_TERM.test(line);
}

function payerFiles(): string[] {
  return [join(SRC, 'components/payers'), join(SRC, 'lib/payers')]
    .flatMap(sourceFiles)
    .concat(PAYER_SCREENS.map((rel) => join(SRC, rel)))
    .filter(scanned)
    .filter((path) => relative(SRC, path).split(sep).join('/') !== PAYER_LEGACY_NORMALIZER);
}

/**
 * En todo `src` (producción, `schema.d.ts` incluido): ningún código de pagador
 * antiguo ni rótulo de pagador con país. Única excepción: el normalizador
 * legado. El contrato ya no trae nombres de pagadores reales de ejemplo
 * (DX-323): un nombre de aseguradora con «EPS» también cuenta.
 */
const LEGACY_PAYER_CODE =
  /\b(?:MUTUA_ES|PREPAGADA_CO|EPS_CO)\b|['"`](?:EMPRESA|OTRO)['"`]|PAYER_COUNTRY_LABELS|PAYER_NO_COUNTRY_LABEL|PayerCountry|\((?:Colombia|España)\)|\bEPS\b|\b[Mm]utuas?\b|\b[Pp]repagadas?\b/;
function legacyPayerCodeHit(line: string): boolean {
  return LEGACY_PAYER_CODE.test(line);
}

/**
 * Fuera de `lib/payers` nadie compara un tipo de pagador con un literal: la
 * regla de externo/interno es `isExternalPayer`, que también normaliza los
 * códigos antiguos. `OTHER` lo comparten otros enums (motivos, documentos), así
 * que solo cuenta comparado con un `type`/`payerType`; los demás códigos son
 * solo de pagador y cuentan en cualquier comparación o `case`.
 */
const PAYER_ONLY_CODE = String.raw`(?:INSURER|PREPAID_PLAN|PUBLIC_SYSTEM|EMPLOYER|MUTUA_ES|PREPAGADA_CO|EPS_CO|EMPRESA|OTRO)`;
const PAYER_TYPE_SUBJECT = String.raw`(?:^|[^\w])(?:type|payerType)`;
const QUOTED = (code: string) => String.raw`['"\`]${code}['"\`]`;
const PAYER_TYPE_COMPARISON = new RegExp(
  [
    String.raw`[!=]==?\s*${QUOTED(PAYER_ONLY_CODE)}`,
    String.raw`${QUOTED(PAYER_ONLY_CODE)}\s*[!=]==?`,
    String.raw`\bcase\s+${QUOTED(PAYER_ONLY_CODE)}`,
    String.raw`${PAYER_TYPE_SUBJECT}\s*[!=]==?\s*${QUOTED('OTHER')}`,
    String.raw`${QUOTED('OTHER')}\s*[!=]==?\s*[\w.?]*\b(?:type|payerType)\b`,
  ].join('|'),
);

/** Producción de todo `src`, con el contrato, sin `lib/payers` si se pide. */
function allPayerScanFiles({ withPayersLib }: { withPayersLib: boolean }): string[] {
  return sourceFiles(SRC).filter((path) => {
    const rel = relative(SRC, path).split(sep).join('/');
    if (rel === PAYER_LEGACY_NORMALIZER) return false;
    if (!withPayersLib && rel.startsWith('lib/payers/')) return false;
    return scanned(path) || rel === 'lib/api/schema.d.ts';
  });
}

function lineHits(paths: string[], hit: (line: string) => boolean): string[] {
  return paths.flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => hit(line))
      .map(({ line, n }) => `${relative(SRC, path)}:${n}: ${line.trim()}`),
  );
}

describe('arquitectura: pagadores sin país (DX-326)', () => {
  it('payer files never mention a country or a legacy payer type outside the legacy normalizer', () => {
    const mentions = payerFiles().flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => payerTermHit(line))
        .map(({ line, n }) => `${relative(SRC, path)}:${n}: ${line.trim()}`),
    );
    expect(mentions).toEqual([]);
  });

  it('the payer scan covers the payer screens and skips the legacy normalizer', () => {
    const rels = payerFiles().map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rels).toEqual(
      expect.arrayContaining([
        'components/payers/payer-form-modal.tsx',
        'components/payers/payers-manager.tsx',
        'lib/payers/payer-type.ts',
        'lib/payers/payers-api.ts',
        ...PAYER_SCREENS,
      ]),
    );
    for (const rel of PAYER_SCREENS) expect([rel, existsSync(join(SRC, rel))]).toEqual([rel, true]);
    expect(rels).not.toContain(PAYER_LEGACY_NORMALIZER);
    expect(rels.some((r) => r.includes('.test.'))).toBe(false);
    for (const line of [
      "type: 'EPS_CO',",
      "label: 'Mutua (España)',",
      'PAYER_COUNTRY_LABELS[type]',
      'country: payer.country,',
      'Aseguradoras, EPS y demás entidades',
    ]) {
      expect([line, payerTermHit(line)]).toEqual([line, true]);
    }
    for (const line of ["label: 'Aseguradora',", "type: 'OTHER',", 'PUBLIC_SYSTEM']) {
      expect([line, payerTermHit(line)]).toEqual([line, false]);
    }
  });

  it('no production file in src names a legacy payer code or a payer country label', () => {
    expect(lineHits(allPayerScanFiles({ withPayersLib: true }), legacyPayerCodeHit)).toEqual([]);
  });

  it('no production file outside lib/payers compares a payer type with a literal', () => {
    expect(
      lineHits(allPayerScanFiles({ withPayersLib: false }), (line) => PAYER_TYPE_COMPARISON.test(line)),
    ).toEqual([]);
  });

  it('the src-wide payer scans cover all production, the contract, and skip the normalizer and tests', () => {
    const all = allPayerScanFiles({ withPayersLib: true }).map((f) => relative(SRC, f).split(sep).join('/'));
    expect(all).toEqual(
      expect.arrayContaining([
        'lib/api/schema.d.ts',
        'lib/payers/payer-type.ts',
        'components/patients/agreement-dialog.tsx',
        'components/patients/patients-view.tsx',
        'components/payers/payer-form-modal.tsx',
      ]),
    );
    expect(all).not.toContain(PAYER_LEGACY_NORMALIZER);
    expect(all.some((r) => r.includes('.test.'))).toBe(false);
    const outside = allPayerScanFiles({ withPayersLib: false }).map((f) => relative(SRC, f).split(sep).join('/'));
    expect(outside.some((r) => r.startsWith('lib/payers/'))).toBe(false);
    expect(outside).toContain('components/payers/payer-form-modal.tsx');

    for (const line of [
      "if (payer.type === 'EPS_CO') {",
      "label: 'Prepagada (Colombia)',",
      "'OTRO': 'OTHER',",
      'const labels = PAYER_COUNTRY_LABELS;',
      'country: PayerCountry;',
      'Aseguradora (España)',
      'Aseguradoras, EPS y demás',
      'Mutua',
      'prepagadas',
      '/** @example Convenio Sura EPS */',
    ]) {
      expect([line, legacyPayerCodeHit(line)]).toEqual([line, true]);
    }
    for (const line of [
      '/** @example Convenio Empresa Alfa */',
      "type: 'OTHER',",
      'mutuamente',
      "country: 'CO'",
    ]) {
      expect([line, legacyPayerCodeHit(line)]).toEqual([line, false]);
    }

    for (const line of [
      "if (payer.type !== 'OTHER') return;",
      "hint={type === 'OTHER' ? hint : undefined}",
      "const internal = payer?.type == 'OTHER';",
      "'OTHER' === coverage.payer.type",
      "payerType !== 'OTHER'",
      "if (p.type === 'INSURER') {",
      "'PUBLIC_SYSTEM' !== kind",
      "case 'EMPLOYER':",
      "x === 'OTRO'",
    ]) {
      expect([line, PAYER_TYPE_COMPARISON.test(line)]).toEqual([line, true]);
    }
    for (const line of [
      "if (value.reason === 'OTHER' && !note)",
      "const noteRequired = reason === 'OTHER';",
      "docType === 'OTHER'",
      "{ value: 'OTHER', label: 'Otro' },",
      "type: 'INSURER',",
      'return normalized === null || EXTERNAL[normalized];',
    ]) {
      expect([line, PAYER_TYPE_COMPARISON.test(line)]).toEqual([line, false]);
    }
  });
});

/**
 * DX-327 (spec R1, R13, §6.8, pre-flight M9): ningún texto de la web nombra un
 * documento de un país («Cédula», «Tarjeta de identidad», «Extranjería», los
 * códigos `CC`, `TI` y `CE`, y las siglas NIT, NIF, RIF, DNI, NIE, RUT, CURP,
 * CPF, RUC, CUIL, CUIT y NUIP en cualquier caja, como en la API) ni una autoridad sanitaria («INVIMA», «marcado CE»).
 * Recorrido propio, no `scanned()`/`hits()`: mira también comentarios y JSDoc,
 * `lib/api/schema.d.ts` y los `*fixture*` de producción. Se salta solo los
 * tests de `src`, `lib/test/**`, el normalizador legado de R13
 * (`lib/patients/legacy-doc-type.ts`), el formato de receta anterior de DX-324
 * la lista de países copiada de la API (DX-312 R8: datos generados, donde
 * `CC` es un código de país, no un documento) y las líneas con nombre de
 * `COUNTRY_DOCUMENT_LINE_EXCEPTIONS`. En `e2e/`
 * solo valen dentro de un `test('legacy …')`, de una función `legacy…` o de
 * un fichero `legacy-*`.
 */
const DOC_TYPE_LEGACY_NORMALIZER = 'lib/patients/legacy-doc-type.ts';
// DX-324 (R12): `PRESCRIPTION_LEGACY_LAYOUT` congela los rótulos de las recetas anteriores.
const LEGACY_FILES = [DOC_TYPE_LEGACY_NORMALIZER, PRESCRIPTION_LEGACY_LAYOUT];
// DX-312 (R8, R10): copia byte a byte de la lista generada en la API; `scripts/check-api-reference-sync.mjs` la vigila.
const COUNTRY_LIST_COPY = 'lib/locations/iso3166-countries.json';
// DX-329 (§3.2): igual, la lista de regiones de numeración; también la vigila el script de sincronía.
const PHONE_REGION_LIST_COPY = 'lib/locations/phone-regions-list.json';
const GENERATED_LIST_COPIES = [COUNTRY_LIST_COPY, PHONE_REGION_LIST_COPY];
/**
 * R1 (decisión del dueño, 2026-10-31): la moneda, las zonas y el formato que
 * un país PROPONE al dar de alta una sede. Solo sugieren valores visibles y
 * editables en el formulario (`useRegionalDraft`); nunca rellenan ni
 * sustituyen lo guardado. Sus datos (generados) usan códigos de país como
 * claves («CC» es Islas Cocos, no un documento) y su módulo es el único que
 * busca por país.
 */
const COUNTRY_REGIONAL_DATA = 'lib/locations/country-regional.json';
const COUNTRY_REGIONAL_LIB = 'lib/locations/country-regional.ts';
const COUNTRY_DOCUMENT = /[Cc][ée]dula|[Tt]arjeta de identidad|[Ee]xtranjer[ií]a|\b(?:CC|TI|CE)\b|INVIMA/;
/** Siglas de documentos de otros países: en cualquier caja, como palabra. */
const COUNTRY_DOCUMENT_ACRONYM = /\b(?:NIT|NIF|RIF|DNI|NIE|RUT|CURP|CPF|RUC|CUIL|CUIT|NUIP)\b/i;

function namesCountryDocument(line: string): boolean {
  return COUNTRY_DOCUMENT.test(line) || COUNTRY_DOCUMENT_ACRONYM.test(line);
}

/**
 * Líneas exactas que aún nombran un documento de un país, cada una con el
 * ticket que la quita. Cualquier otra coincidencia se arregla, no se añade
 * aquí.
 */
// Vacía desde DX-323: el recibo dice «Id. fiscal», sin sigla de un país.
const COUNTRY_DOCUMENT_LINE_EXCEPTIONS: readonly { file: string; line: string; until: string }[] = [];

function isLineException(rel: string, line: string): boolean {
  return COUNTRY_DOCUMENT_LINE_EXCEPTIONS.some((e) => e.file === rel && e.line === line.trim());
}

function documentScanFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return documentScanFiles(path);
    if (!/\.(ts|tsx|js|jsx|mjs|json|css|md)$/.test(entry.name)) return [];
    const rel = relative(SRC, path).split(sep).join('/');
    if (/\.(test|spec)\./.test(rel) || rel.startsWith('lib/test/')) return [];
    return LEGACY_FILES.includes(rel) || GENERATED_LIST_COPIES.includes(rel) || rel === COUNTRY_REGIONAL_DATA
      ? []
      : [path];
  });
}

/** Cada línea del texto que nombra un documento de un país, comentarios incluidos. */
function countryDocumentHits(rel: string, text: string): string[] {
  return text
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => namesCountryDocument(line) && !isLineException(rel, line))
    .map(({ line, n }) => `${rel}:${n}: ${line.trim()}`);
}

const E2E = join(SRC, '..', 'e2e');

/** Todo `e2e/` salvo los ficheros `legacy-*`. */
function e2eScanFiles(dir: string = E2E): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return e2eScanFiles(path);
    if (!/\.(ts|json|csv|ics)$/.test(entry.name) || /^legacy[-.]/.test(entry.name)) return [];
    return [path];
  });
}

const LEGACY_NAME = /^legacy/i;

/**
 * Líneas (1-based, inclusivas) de cada `test('legacy …')` (también
 * `test.describe`, `.only`, `.skip`…) y de cada función o constante `legacy…`.
 */
function legacyLineRanges(rel: string, text: string): [number, number][] {
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const ranges: [number, number][] = [];
  const lineOf = (pos: number) => source.getLineAndCharacterOfPosition(pos).line + 1;
  const visit = (node: ts.Node) => {
    let legacy = false;
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      const [title] = node.arguments;
      legacy =
        /^test\b/.test(callee) &&
        title !== undefined &&
        (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title) || ts.isTemplateExpression(title)) &&
        LEGACY_NAME.test((ts.isTemplateExpression(title) ? title.head.text : title.text).trim());
    } else if (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) {
      legacy = node.name !== undefined && ts.isIdentifier(node.name) && LEGACY_NAME.test(node.name.text);
    }
    if (legacy) ranges.push([lineOf(node.getStart(source)), lineOf(node.getEnd())]);
    else ts.forEachChild(node, visit);
  };
  visit(source);
  return ranges;
}

/** Lo que nombra un documento de un país en un fichero de `e2e/` fuera de lo `legacy`. */
function e2eCountryDocumentHits(rel: string, text: string): string[] {
  const ranges = rel.endsWith('.ts') ? legacyLineRanges(rel, text) : [];
  return text
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line, n }) => namesCountryDocument(line) && !ranges.some(([a, b]) => n >= a && n <= b))
    .map(({ line, n }) => `${rel}:${n}: ${line.trim()}`);
}

describe('arquitectura: tipos de documento sin país (DX-327)', () => {
  it('no UI text says Cédula, TI, CE or another country\'s document acronym outside the legacy files', () => {
    const mentions = documentScanFiles().flatMap((path) =>
      countryDocumentHits(relative(SRC, path).split(sep).join('/'), readFileSync(path, 'utf8')),
    );
    expect(mentions).toEqual([]);
  });

  it('only the country and phone region list copies are skipped, and only for their region codes', () => {
    const rels = documentScanFiles().map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rels).toEqual(expect.arrayContaining(['lib/locations/iana-zone-names.json', 'lib/locations/countries.ts']));
    for (const copy of GENERATED_LIST_COPIES) {
      expect([copy, existsSync(join(SRC, copy)), rels.includes(copy)]).toEqual([copy, true, false]);
      const hits = countryDocumentHits(copy, readFileSync(join(SRC, copy), 'utf8'));
      expect(hits.every((h) => /: "code": "[A-Z]{2}",$/.test(h))).toBe(true);
    }
  });

  it('every named line exception still exists, so a closed ticket takes its exception with it', () => {
    for (const e of COUNTRY_DOCUMENT_LINE_EXCEPTIONS) {
      const lines = readFileSync(join(SRC, e.file), 'utf8').split('\n').map((l) => l.trim());
      expect([e.file, e.until, lines.includes(e.line)]).toEqual([e.file, e.until, true]);
      expect(namesCountryDocument(e.line)).toBe(true);
    }
  });

  it('no e2e test names a country document outside a legacy test, function or file', () => {
    const mentions = e2eScanFiles().flatMap((path) =>
      e2eCountryDocumentHits(relative(E2E, path).split(sep).join('/'), readFileSync(path, 'utf8')),
    );
    expect(mentions).toEqual([]);
  });

  it('the e2e scan covers the specs and fixtures, and only legacy tests, functions and files may name a country document', () => {
    const rels = e2eScanFiles().map((f) => relative(E2E, f).split(sep).join('/'));
    expect(rels).toEqual(
      expect.arrayContaining([
        'patient-import.spec.ts',
        'document-types.spec.ts',
        'allowed-skips.json',
        'fixtures/holidays-12.ics',
      ]),
    );
    expect(rels.some((r) => r.startsWith('support/'))).toBe(true);
    // Hoy esos dos specs sí nombran «CC» y «Cédula», dentro de lo legacy.
    const importSpec = readFileSync(join(E2E, 'patient-import.spec.ts'), 'utf8');
    expect(importSpec.split('\n').some(namesCountryDocument)).toBe(true);

    const synthetic = [
      "test('legacy CSV con CC', async () => {",
      "  const csv = 'Tipo Doc;Cédula';",
      '});',
      "test.describe(`legacy ${name}: RUT`, () => {",
      "  test('dentro', () => expect('DNI').toBeTruthy());",
      '});',
      'function legacyCsv() {',
      "  return 'CC;1';",
      '}',
      "test('alta con NIT', async () => {",
      "  await page.fill('#doc', 'CC 1');",
      '});',
      '// un comentario con Cédula',
      "test(`alta ${'legacy'} con dni`, () => {});",
    ].join('\n');
    expect(e2eCountryDocumentHits('synthetic.spec.ts', synthetic)).toEqual([
      "synthetic.spec.ts:10: test('alta con NIT', async () => {",
      "synthetic.spec.ts:11: await page.fill('#doc', 'CC 1');",
      'synthetic.spec.ts:13: // un comentario con Cédula',
      "synthetic.spec.ts:14: test(`alta ${'legacy'} con dni`, () => {});",
    ]);
  });

  it('the document scan covers schema.d.ts, fixtures and comments and skips only the legacy files, and its pattern catches each legacy form', () => {
    const rels = documentScanFiles().map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rels).toEqual(
      expect.arrayContaining([
        'lib/api/schema.d.ts',
        'components/treatment-plans/plan-quote-fixture.ts',
        'components/patients/agreement-fixtures.ts',
        'components/patients/patient-record-header.tsx',
        'components/implants/register-implant-modal.tsx',
        'components/payments/payment-receipt-document.tsx',
        'lib/patients/doc-type.ts',
      ]),
    );
    for (const legacy of LEGACY_FILES) {
      expect(rels).not.toContain(legacy);
      expect(existsSync(join(SRC, legacy))).toBe(true);
    }
    expect(rels.some((r) => /\.(test|spec)\./.test(r) || r.startsWith('lib/test/'))).toBe(false);

    // Control sintético: los comentarios y la JSDoc cuentan como texto.
    const synthetic = [
      '/**',
      ' * Documento del paciente.',
      ' * @example CC 123',
      ' */',
      'const a = 1; // CC 1002',
      "const b = 'NATIONAL_ID';",
      "const c = 'rif: J-1';",
    ].join('\n');
    expect(countryDocumentHits('synthetic.ts', synthetic)).toEqual([
      'synthetic.ts:3: * @example CC 123',
      'synthetic.ts:5: const a = 1; // CC 1002',
      "synthetic.ts:7: const c = 'rif: J-1';",
    ]);
    // Sin excepciones (DX-323): la sigla fiscal de un país cuenta también en el recibo.
    const receipt = 'components/payments/payment-receipt-document.tsx';
    expect(countryDocumentHits(receipt, '  taxId: (value: string) => `NIT/NIF ${value}`,')).toHaveLength(1);
    expect(countryDocumentHits(receipt, "  taxIdLabel: 'NIT',")).toEqual([`${receipt}:1: taxIdLabel: 'NIT',`]);
    expect(countryDocumentHits(receipt, '  taxId: (value: string) => `Id. fiscal ${value}`,')).toEqual([]);
    for (const line of [
      'Cédula de ciudadanía',
      'cedula de extranjería',
      'Tarjeta de identidad',
      "docType: 'TI'",
      'CE 123',
      'Registro sanitario INVIMA',
      'marcado CE',
      'NIT/NIF 900123456-7',
      'RIF J-12345678-9',
      'dni del paciente',
      'Nie: X1234567L',
      'RUT 12.345.678-5',
      'curp',
      '(CPF)',
      'RUC 20123456789',
      'cuil',
      'CUIT: 20-1',
      'Nuip',
      "label: 'Rif'",
    ]) {
      expect([line, namesCountryDocument(line)]).toEqual([line, true]);
    }
    for (const line of [
      "docType: 'NATIONAL_ID'",
      'Documento nacional',
      'Registro sanitario o certificación del producto',
      'Certificación',
      'ACCEPTED',
      'CERT-2019',
      'Identificación fiscal',
      'unit',
      'definite',
      'route',
      'niños',
      'truthy',
      'nitrogen',
      'para ti',
    ]) {
      expect([line, namesCountryDocument(line)]).toEqual([line, false]);
    }
  });

  /**
   * §6.8 (API y web): un solo resolvedor del nombre visible y un solo mapa de
   * nombres genéricos, los de `lib/patients/doc-type.ts`.
   */
  const DOC_TYPE_LIB = 'lib/patients/doc-type.ts';
  const NAME_RESOLVED_BY_HAND = /DOC_TYPE_LABEL\[|docTypeName(?:NationalId|Passport|ResidencePermit|TaxId|Other)\b/;
  const LABEL_MAP = /\b(?:const|let)\s+DOC_TYPE_LABELS?\b|PASSPORT:\s*'Pasaporte'/;

  function productionHits(pattern: RegExp): string[] {
    return documentScanFiles()
      .filter((path) => relative(SRC, path).split(sep).join('/') !== DOC_TYPE_LIB)
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => pattern.test(line))
          .map(({ line, n }) => `${relative(SRC, path)}:${n}: ${line.trim()}`),
      );
  }

  it('architecture: one document type name resolver', () => {
    expect(productionHits(NAME_RESOLVED_BY_HAND)).toEqual([]);
    expect(readFileSync(join(SRC, DOC_TYPE_LIB), 'utf8')).toMatch(NAME_RESOLVED_BY_HAND);
    for (const line of ['label={DOC_TYPE_LABEL[type]}', 'tenant.docTypeNameNationalId', 'docTypeNameOther ?? x']) {
      expect([line, NAME_RESOLVED_BY_HAND.test(line)]).toEqual([line, true]);
    }
    for (const line of ['documentTypeName(type, null, names)', 'dto.docTypeName', 'genericDocTypeName(type)']) {
      expect([line, NAME_RESOLVED_BY_HAND.test(line)]).toEqual([line, false]);
    }
  });

  it('architecture: one document label map', () => {
    expect(productionHits(LABEL_MAP)).toEqual([]);
    expect(readFileSync(join(SRC, DOC_TYPE_LIB), 'utf8')).toMatch(LABEL_MAP);
    for (const line of ['const DOC_TYPE_LABELS = {', "  PASSPORT: 'Pasaporte',", 'let DOC_TYPE_LABEL = x']) {
      expect([line, LABEL_MAP.test(line)]).toEqual([line, true]);
    }
    expect(LABEL_MAP.test("import { DOC_TYPE_LABEL } from '@/lib/patients/doc-type';")).toBe(false);
  });
});

/**
 * DX-312 (spec R10, R12, §6.2): el país de la sede es un código ISO libre y su
 * nombre sale solo de `lib/locations/countries.ts`. Ningún fichero de
 * producción de `src/` tiene un mapa de etiquetas de país (`COUNTRY_LABELS`,
 * `COUNTRY_NAMES`, `phoneCountryName`) ni el enum `ClinicCountry` (fuera de
 * los comentarios), ni nombra Colombia, España o Venezuela (comentarios
 * incluidos, sin tildes ni mayúsculas). Se salta los tests, `lib/test/**`, los
 * `*fixture*`, `lib/api/schema.d.ts` (generado), las copias de las listas de
 * países y de regiones de numeración (datos generados) y la receta legada de
 * R12 (W13).
 */
const COUNTRY_LABEL_CODE = /COUNTRY_LABELS|COUNTRY_NAMES|ClinicCountry|phoneCountryName/;
const COUNTRY_NAME = /colombi|espa[ñn]a|venezuel/i;
const COUNTRY_NAME_EXCEPTIONS = [...GENERATED_LIST_COPIES, PRESCRIPTION_LEGACY_LAYOUT];
const COUNTRY_NAMES_LIB = 'lib/locations/countries.ts';
const REGIONAL_FIELDS = 'components/locations/regional-settings-fields.tsx';

function withoutMarks(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

function namesCountryOutsideList(line: string): boolean {
  return (!COMMENT_LINE.test(line) && COUNTRY_LABEL_CODE.test(line)) || COUNTRY_NAME.test(withoutMarks(line));
}

function countryNameScanFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return countryNameScanFiles(path);
    if (!/\.(ts|tsx|js|jsx|mjs|json|css|md)$/.test(entry.name) || !scanned(path)) return [];
    return COUNTRY_NAME_EXCEPTIONS.includes(relative(SRC, path).split(sep).join('/')) ? [] : [path];
  });
}

/** Un `import`, `import()` o `require` de la copia de la lista de países. */
const IMPORTS_COUNTRY_LIST = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*iso3166-countries\.json['"]/;

describe('arquitectura: país de la sede libre (DX-312)', () => {
  it('no production file names a country label map, ClinicCountry or a country name outside the shared list', () => {
    expect(lineHits(countryNameScanFiles(), namesCountryOutsideList)).toEqual([]);
  });

  it('the country name scan covers production, and skips only tests, the generated files and the named exceptions', () => {
    const rels = countryNameScanFiles().map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rels).toEqual(
      expect.arrayContaining([
        COUNTRY_NAMES_LIB,
        REGIONAL_FIELDS,
        'components/locations/locations-list.tsx',
        'components/patients/patient-communication-section.tsx',
        'lib/patients/communication-api.ts',
        'lib/money/README.md',
      ]),
    );
    for (const rel of COUNTRY_NAME_EXCEPTIONS) {
      expect([rel, existsSync(join(SRC, rel)), rels.includes(rel)]).toEqual([rel, true, false]);
    }
    expect(rels).not.toContain('lib/api/schema.d.ts');
    expect(rels.some((r) => r.startsWith('lib/test/') || r.includes('.test.') || r.includes('fixture'))).toBe(false);
  });

  it('the generated list copies are skipped only for their "name" lines', () => {
    for (const copy of GENERATED_LIST_COPIES) {
      const hits = lineHits([join(SRC, copy)], namesCountryOutsideList);
      expect([copy, hits.length > 0]).toEqual([copy, true]);
      expect(hits.filter((h) => !/: "name": "[^"]+",?$/.test(h))).toEqual([]);
    }
  });

  it('country names come only from lib/locations/countries.ts', () => {
    const importers = sourceFiles(SRC)
      .filter(scanned)
      .filter((path) => readFileSync(path, 'utf8').split('\n').some((line) => IMPORTS_COUNTRY_LIST.test(line)))
      .map((path) => relative(SRC, path).split(sep).join('/'));
    expect(importers).toEqual([COUNTRY_NAMES_LIB]);
    for (const line of [
      "import countries from '@/lib/locations/iso3166-countries.json';",
      "import list from './iso3166-countries.json'",
      "const list = await import('../locations/iso3166-countries.json');",
      'const list = require("./iso3166-countries.json");',
    ]) {
      expect([line, IMPORTS_COUNTRY_LIST.test(line)]).toEqual([line, true]);
    }
    for (const line of ["import { countryName } from '@/lib/locations/countries';", '// iso3166-countries.json']) {
      expect([line, IMPORTS_COUNTRY_LIST.test(line)]).toEqual([line, false]);
    }
  });

  it('the location country copy no longer mentions the prescription or phones', () => {
    const hint = /countryHint:\s*'([^']*)'/.exec(readFileSync(join(SRC, REGIONAL_FIELDS), 'utf8'))?.[1];
    expect(hint).toBeDefined();
    expect(withoutMarks(hint ?? '').toLowerCase()).not.toMatch(/receta|telefono|indicativo/);
  });

  it('the country patterns catch each form and skip neutral text', () => {
    for (const line of [
      'label={COUNTRY_LABELS[c]}',
      'const COUNTRY_NAMES = new Map();',
      'type ClinicCountry = string;',
      'phoneCountryName(code)',
      "'ESPAÑA'",
      'en Espana',
      '// Colombia y España',
      ' * Sede en Venezuela',
      'colombiano',
    ]) {
      expect([line, namesCountryOutsideList(line)]).toEqual([line, true]);
    }
    for (const line of ["country: 'País',", 'countryName(code)', '// ClinicCountry desapareció en DX-312', 'Escribe el nombre o el código del país']) {
      expect([line, namesCountryOutsideList(line)]).toEqual([line, false]);
    }
  });
});

/**
 * DX-312 (R3, final web M5): las mismas guardas que la API
 * (`src/architecture/no-location-fallbacks.spec.ts`). Ningún fichero de
 * producción de `src/` decide por el país: no lo compara con un literal (en
 * cualquier orden y caja), no hace `switch` con `case` de dos letras, no lo
 * busca en una lista, tabla, `Set` o expresión regular, y no tiene objetos con
 * claves que sean códigos de país. Se mira el código sin comentarios. Mismo
 * recorrido que las demás guardas (sin tests, `lib/test/**`, fixtures ni
 * `schema.d.ts`), sin la receta legada de R12.
 *
 * Límite conocido, como en la API: las guardas miran el texto, no siguen
 * valores. Un alias sin «country» en el nombre
 * (`const c = location.country; c === 'VE'`) no se ve.
 */
const COUNTRY = 'coun' + 'try';
const COUNTRY_RULE_EXCEPTIONS = [PRESCRIPTION_LEGACY_LAYOUT, COUNTRY_REGIONAL_LIB];

/** Una expresión con «country»: `country`, `location.countryCode`, `x?.country`. */
const C = `[\\w$.?!()\\[\\]]*${COUNTRY}[\\w$]*(?:\\??\\.[\\w$]+|\\(\\))*`;
/** Un literal de texto no vacío; `group` es el número de su grupo de comilla. */
const L = (group: number): string => `(['"\`])[^'"\`\\n]{1,40}\\${group}`;
/** `typeof país` compara el tipo, no el país. */
const C_OPERAND = `(?<!typeof\\s+)${C}`;
const countryPattern = (source: string): RegExp => new RegExp(source, 'gi');
const COUNTRY_COMPARE = countryPattern(
  `(?:${C_OPERAND}\\s*[!=]==?\\s*${L(1)})|(?:${L(2)}\\s*[!=]==?\\s*${C_OPERAND})`,
);
/** Un `case` de dos letras, con cualquier comilla y en cualquier caja. */
const TWO_LETTER_CASE = /case\s*(['"`])[A-Za-z]{2}\1\s*:/i;
const COUNTRY_LOOKUPS = [
  `${C}\\s*\\??\\.(?:startsWith|endsWith|includes|indexOf|localeCompare|match|test)\\(`,
  `[\\w$\\])]\\s*\\[\\s*${C}\\s*\\]`,
  `${C}\\s+in\\s+[\\w$]`,
].map(countryPattern);
/** `.get(país)`, salvo sobre `countries`. */
const COUNTRY_GET = countryPattern(`(\\b[\\w$]+)\\??\\.get\\(\\s*${C}\\s*\\)`);
/**
 * Una búsqueda de pertenencia sobre cualquier receptor (array con nombre o en
 * línea, `Set`, `Object.keys(T)`, expresión regular): se mira el argumento
 * entero, no el receptor.
 */
const MEMBERSHIP_CALL = /(\b[\w$]+)?\s*\??\.(?:includes|has|test|indexOf|some|find)\s*\(/g;
const isCountryAllowList = (receiver: string): boolean => /^countries$/i.test(receiver);
const ISO_CODES: ReadonlySet<string> = new Set(COUNTRIES.map((country) => country.code));

const CLOSING: Record<string, string> = { '(': ')', '{': '}', '[': ']' };

/** Lo que encierra el `(`, `{` o `[` de `start` (equilibrado). */
function enclosed(text: string, start: number): string {
  const open = text[start];
  const close = CLOSING[open];
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return text.slice(start + 1);
}

/**
 * El texto sin comentarios (`/* … *\/`, `// …`, también `{/* … *\/}` de JSX),
 * cambiados por espacios y con los saltos de línea intactos. Los literales de
 * texto se saltan, para no confundir `'https://…'` con un comentario.
 */
const withoutComments = (text: string): string =>
  text.replace(
    /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (token) => (token.startsWith('/') ? token.replace(/[^\n]/g, ' ') : token),
  );

/** Línea (desde 1) de cada coincidencia de `pattern` (con `g`) en `text`. */
const matchLines = (
  text: string,
  pattern: RegExp,
  accept: (match: RegExpExecArray) => boolean = () => true,
): number[] =>
  [...text.matchAll(pattern)].filter(accept).map((match) => text.slice(0, match.index).split('\n').length);

const compareHits = (code: string): number[] => matchLines(code, COUNTRY_COMPARE);
/** `switch (…country…) {` con un `case` de dos letras antes de otro `switch` anidado. */
const switchHits = (code: string): number[] =>
  matchLines(code, /\bswitch\s*\(/g, (match) => {
    const headStart = match.index + match[0].length - 1;
    const head = enclosed(code, headStart);
    if (!new RegExp(COUNTRY, 'i').test(head)) return false;
    const after = code.slice(headStart + head.length + 2);
    const brace = /^\s*\{/.exec(after);
    if (!brace) return false;
    const body = enclosed(after, brace[0].length - 1);
    return TWO_LETTER_CASE.test(body.split(/\bswitch\s*\(/)[0]);
  });
const lookupHits = (code: string): number[] => [
  ...new Set([
    ...COUNTRY_LOOKUPS.flatMap((pattern) => matchLines(code, pattern)),
    ...matchLines(code, COUNTRY_GET, (match) => !isCountryAllowList(match[1])),
    ...matchLines(
      code,
      MEMBERSHIP_CALL,
      (match) =>
        !(match[1] && isCountryAllowList(match[1])) &&
        new RegExp(COUNTRY, 'i').test(enclosed(code, match.index + match[0].length - 1)),
    ),
  ]),
];
/**
 * Cada objeto literal más interno con ≥ 2 claves, todas de dos letras, y ≥ 2
 * distintas que son códigos ISO 3166-1. Exigir que todas sean de dos letras
 * deja pasar `{ SI, NO, NO_SE }` y `{ kind, at, by }`.
 */
const countryKeyedHits = (code: string): number[] =>
  matchLines(code, /\{[^{}]*\}/g, ([object]) => {
    const keys = [...object.matchAll(/(?:^|[,{])\s*['"]?([\w$]+)['"]?\s*:(?!:)/g)].map((key) => key[1]);
    const isoKeys = new Set(keys.map((key) => key.toUpperCase()).filter((key) => ISO_CODES.has(key)));
    return keys.length >= 2 && keys.every((key) => /^[A-Za-z]{2}$/.test(key)) && isoKeys.size >= 2;
  });

/** `fichero:línea` de cada coincidencia de `hits` sobre el código sin comentarios. */
const countryOffenders = (files: string[], hits: (code: string) => number[]): string[] =>
  files.flatMap((file) =>
    hits(withoutComments(readFileSync(file, 'utf8'))).map((line) => `${relative(SRC, file)}:${line}`),
  );

describe('arquitectura: la web no decide por el país (DX-312, R3)', () => {
  const ruled = sourceFiles(SRC)
    .filter(scanned)
    .filter((file) => !COUNTRY_RULE_EXCEPTIONS.includes(relative(SRC, file).split(sep).join('/')));

  it('no production file compares a country with a literal, in either order and any case', () => {
    expect(ruled.length).toBeGreaterThan(500);
    expect(countryOffenders(ruled, compareHits)).toEqual([]);
  });

  it('no production file switches on a country with a two-letter case', () => {
    expect(countryOffenders(ruled, switchHits)).toEqual([]);
  });

  it('no production file looks a country up in a list, a table or a string method', () => {
    expect(countryOffenders(ruled, lookupHits)).toEqual([]);
  });

  it('no production file keys an object by country codes', () => {
    expect(countryOffenders(ruled, countryKeyedHits)).toEqual([]);
  });

  it('the scan covers the location screens and skips tests, lib/test and the named exception', () => {
    const rels = ruled.map((f) => relative(SRC, f).split(sep).join('/'));
    expect(rels).toEqual(
      expect.arrayContaining([COUNTRY_NAMES_LIB, REGIONAL_FIELDS, 'components/shared/country-combobox.tsx']),
    );
    for (const rel of COUNTRY_RULE_EXCEPTIONS) {
      expect([rel, existsSync(join(SRC, rel)), rels.includes(rel)]).toEqual([rel, true, false]);
      // La excepción sigue haciendo falta: la receta legada busca su maqueta
      // por país, y las propuestas de R1, la moneda y las zonas del país.
      expect(countryOffenders([join(SRC, rel)], lookupHits)).not.toEqual([]);
    }
    // El helper de prueba sí compara con un literal: queda fuera por ser `lib/test/**`.
    expect(rels.some((r) => r.startsWith('lib/test/') || r.includes('.test.'))).toBe(false);
  });

  it('the country patterns catch each form and skip neutral text', () => {
    /** Cada guarda que atrapa `snippet`, como si fuera un fichero de producción. */
    const caughtBy = (snippet: string): string[] => {
      const code = withoutComments(snippet);
      return (
        [
          ['compare', compareHits(code).length > 0],
          ['switch', switchHits(code).length > 0],
          ['lookup', lookupHits(code).length > 0],
          ['keys', countryKeyedHits(code).length > 0],
        ] as const
      ).flatMap(([guard, hit]) => (hit ? [guard] : []));
    };
    const LOC = `location.${COUNTRY}`;
    for (const [snippet, guard] of [
      [`if ('VE' === ${LOC}) {}`, 'compare'],
      [`if (${LOC} === 've') {}`, 'compare'],
      [`${COUNTRY} == "VE"`, 'compare'],
      [`${COUNTRY} !== \`VE\``, 'compare'],
      [`{values.${COUNTRY} === 'VE' ? <BolivarHint /> : null}`, 'compare'],
      [`['VE', 'CO'].includes(${LOC})`, 'lookup'],
      [`['VE','CO'].indexOf(${COUNTRY})`, 'lookup'],
      [`${LOC}.startsWith('V')`, 'lookup'],
      [`TABLE[${LOC}Code]`, 'lookup'],
      [`${COUNTRY}Code in CODES`, 'lookup'],
      [`CURRENCY_BY_COUNTRY.get(${LOC})`, 'lookup'],
      [`ALLOWED.includes(${LOC})`, 'lookup'],
      [`new Set(['VE', 'CO']).has(${COUNTRY})`, 'lookup'],
      [`Object.keys(TABLE).includes(${COUNTRY})`, 'lookup'],
      [`/^(VE|CO)$/.test(${COUNTRY})`, 'lookup'],
      [`RULES.some((code) => code === ${LOC})`, 'lookup'],
      [`switch (norm(${LOC})) {\n  case 'VE':\n    break;\n}`, 'switch'],
      [`switch (${LOC}) {\n  case 've':\n    break;\n}`, 'switch'],
      [`const t = { VE: 'VES', CO: 'COP' };`, 'keys'],
      [`const t = { ve: 'VES', co: 'COP' };`, 'keys'],
      [`const t = { 'VE': 1, "CO": 2 };`, 'keys'],
    ]) {
      expect({ snippet, caught: caughtBy(snippet).includes(guard as never) }).toEqual({ snippet, caught: true });
    }
    for (const snippet of [
      `switch (status) {\n  case 'OK':\n    return true;\n}`,
      `switch (kind(${COUNTRY})) {\n  case 'phone':\n    return 1;\n}`,
      `const labels = { SI: 'Sí', NO: 'No', NO_SE: 'No sé' };`,
      `const event = { kind: 'X', at: d, by: u };`,
      `countries.find((c) => c.code === code)`,
      `countryName(${LOC})`,
      `aria-selected={${COUNTRY}.code === value}`,
      `// ${COUNTRY} === 'CO'`,
      `{/* ${COUNTRY} === 'VE' */}`,
      `/** ${COUNTRY}Code === 'VE' */`,
      `${COUNTRY} === ''`,
      `if (typeof ${COUNTRY} !== 'string') {}`,
      `const url = 'https://x.test/${COUNTRY}';`,
    ]) {
      expect({ snippet, caughtBy: caughtBy(snippet) }).toEqual({ snippet, caughtBy: [] });
    }
  });
});

/**
 * DX-329 (D3, §6.2, PATTERNS W9): la web no valida ni normaliza teléfonos; lo
 * hace la API con una sola versión de metadatos, y la web pinta su formato.
 * - Ningún fichero de la web (`src/`, `e2e/`, `scripts/` y la raíz) importa la
 *   librería de teléfonos, en ninguna forma (`from`, `import`, `import()`,
 *   `require`, `export … from`), y `package.json` no la declara.
 * - Ningún fichero de producción agrupa un teléfono por su indicativo: ni un
 *   patrón que empiece por `^\+` y una cifra (literal o en `new RegExp`), ni
 *   la función retirada que lo hacía.
 * - Los nombres de las regiones de numeración salen solo de
 *   `lib/locations/phone-regions.ts`: nadie más importa su copia de la lista.
 * Se mira el código sin comentarios. El nombre de la librería se compone para
 * que este fichero no lo contenga.
 */
const PHONE_LIBRARY_NAME = 'libphone' + 'number';
const PHONE_LIBRARY = `${PHONE_LIBRARY_NAME}-js`;
const ROOT = join(SRC, '..');
const PHONE_REGIONS_LIB = 'lib/locations/phone-regions.ts';
const RETIRED_PHONE_FORMATTER = 'format' + 'E164';

/** Un `from`, `import`, `import()` o `require()` del paquete o de una de sus rutas. */
const PHONE_LIBRARY_IMPORT = new RegExp(
  String.raw`(?:\bfrom|\bimport|\brequire)\s*\(?\s*(['"\`])${PHONE_LIBRARY}(?:\/[^'"\`\n]*)?\1`,
  'g',
);
/**
 * Un patrón de teléfono que empieza por `^\+` y una cifra (`\d` o un
 * indicativo escrito): en un literal `/…/` o en el texto de un `new RegExp`.
 */
const CALLING_CODE_GROUP = new RegExp(
  String.raw`\/\^\\\+(?:\\d|\d)|(['"\`])\^\\\\\+(?:\\\\d|\d)|\b${RETIRED_PHONE_FORMATTER}\b`,
  'g',
);
const IMPORTS_PHONE_REGION_LIST = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*phone-regions-list\.json['"]/g;

const phoneLibraryImportHits = (code: string): number[] => matchLines(code, PHONE_LIBRARY_IMPORT);
const callingCodeGroupHits = (code: string): number[] => matchLines(code, CALLING_CODE_GROUP);
const phoneRegionListHits = (code: string): number[] => matchLines(code, IMPORTS_PHONE_REGION_LIST);

/** Todo el código de la web: `src/`, `e2e/`, `scripts/` y los ficheros de la raíz. */
function webCodeFiles(): string[] {
  const code = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
  const tree = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return tree(path);
      return code.test(entry.name) ? [path] : [];
    });
  const rootFiles = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && code.test(entry.name))
    .map((entry) => join(ROOT, entry.name));
  return [...tree(SRC), ...tree(E2E), ...tree(join(ROOT, 'scripts')), ...rootFiles];
}

describe(`teléfono con ${PHONE_LIBRARY_NAME} (DX-329)`, () => {
  const production = sourceFiles(SRC).filter(scanned);

  it(`no web file imports ${PHONE_LIBRARY}`, () => {
    const files = webCodeFiles();
    const rels = files.map((file) => relative(ROOT, file).split(sep).join('/'));
    expect(rels).toEqual(
      expect.arrayContaining([
        `src/${PHONE_REGIONS_LIB}`,
        'src/architecture/no-location-fallbacks.test.ts',
        'e2e/location-phone-region.spec.ts',
        'scripts/check-api-reference-sync.mjs',
        'playwright.config.ts',
      ]),
    );
    expect(countryOffenders(files, phoneLibraryImportHits)).toEqual([]);
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;
    const declared = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].flatMap(
      (field) => Object.keys((pkg[field] as Record<string, string> | undefined) ?? {}),
    );
    expect(declared).not.toContain(PHONE_LIBRARY);
  });

  it('no production file groups a phone by calling code', () => {
    expect(production.map((file) => relative(SRC, file).split(sep).join('/'))).toEqual(
      expect.arrayContaining([
        PHONE_REGIONS_LIB,
        'lib/patients/communication-api.ts',
        'components/patients/patient-communication-section.tsx',
      ]),
    );
    expect(countryOffenders(production, callingCodeGroupHits)).toEqual([]);
  });

  it('phone region names come only from lib/locations/phone-regions.ts', () => {
    const importers = production
      .filter((file) => countryOffenders([file], phoneRegionListHits).length > 0)
      .map((file) => relative(SRC, file).split(sep).join('/'));
    expect(importers).toEqual([PHONE_REGIONS_LIB]);
  });

  it('the phone patterns catch each form and skip neutral text', () => {
    /** Cada guarda que atrapa `snippet`, como si fuera un fichero de producción. */
    const caughtBy = (snippet: string): string[] => {
      const code = withoutComments(snippet);
      return (
        [
          ['import', phoneLibraryImportHits(code).length > 0],
          ['group', callingCodeGroupHits(code).length > 0],
          ['list', phoneRegionListHits(code).length > 0],
        ] as const
      ).flatMap(([guard, hit]) => (hit ? [guard] : []));
    };
    for (const [snippet, guard] of [
      [`import { parsePhoneNumber } from '${PHONE_LIBRARY}';`, 'import'],
      [`import {\n  isValidPhoneNumber,\n} from "${PHONE_LIBRARY}/max";`, 'import'],
      [`import '${PHONE_LIBRARY}';`, 'import'],
      [`const lib = await import('${PHONE_LIBRARY}');`, 'import'],
      [`const lib = require(\`${PHONE_LIBRARY}/min\`);`, 'import'],
      [`export { AsYouType } from '${PHONE_LIBRARY}';`, 'import'],
      [String.raw`const co = /^\+57(\d{3})(\d{3})(\d{4})$/.exec(e164);`, 'group'],
      [String.raw`const any = /^\+\d{1,3}/;`, 'group'],
      [String.raw`const es = new RegExp('^\\+34(\\d{3})');`, 'group'],
      [String.raw`const cc = new RegExp("^\\+\\d+");`, 'group'],
      [`export function ${RETIRED_PHONE_FORMATTER}(e164: string): string {}`, 'group'],
      [`{${RETIRED_PHONE_FORMATTER}(data.phoneE164)}`, 'group'],
      [`import list from './phone-regions-list.json';`, 'list'],
      [`const list = await import('@/lib/locations/phone-regions-list.json');`, 'list'],
      [`const list = require("../locations/phone-regions-list.json");`, 'list'],
    ] as const) {
      expect({ snippet, caught: caughtBy(snippet).includes(guard) }).toEqual({ snippet, caught: true });
    }
    for (const snippet of [
      'phoneRegionLabel(code)',
      "phoneRegion: 'Prefijo telefónico por defecto',",
      String.raw`const callingCode = /^\+?(\d+)$/.exec(key)?.[1];`,
      "import { phoneRegionLabel, searchPhoneRegions } from '@/lib/locations/phone-regions';",
      `// import { parsePhoneNumber } from '${PHONE_LIBRARY}';`,
      `/** ${RETIRED_PHONE_FORMATTER} se retiró en DX-329. */`,
      "await expect(block).toContainText('+58 412 1234567');",
      `const ${RETIRED_PHONE_FORMATTER}Retired = true;`,
    ]) {
      expect({ snippet, caughtBy: caughtBy(snippet) }).toEqual({ snippet, caughtBy: [] });
    }
  });
});

/**
 * DX-368: ningún texto visible pone de ejemplo un teléfono, una moneda, una
 * dirección o una ciudad de un país. El teléfono pide el indicativo sin dar
 * uno («Con indicativo internacional (+…).»); la moneda, el código ISO 4217.
 * Los documentos los guarda DX-327 (arriba) y las monedas entre comillas,
 * GLOBAL-G1 (al principio). Recorre lo mismo que G1: `src/` sin tests,
 * fixtures, `schema.d.ts` ni líneas de comentario, y deja las claves de
 * `ZONE_CITY_LABELS`, que rotulan una zona elegida.
 */
/** Un teléfono con indicativo real: `+57 601…`, `+34612…`, `+57…`. */
const PHONE_EXAMPLE = /(?<![\w+\\])\+[1-9]\d{0,2}(?:[\s-]?\d{2,}|…|\.\.\.)/;
/** Un literal que es solo un teléfono nacional sin indicativo: `'310 000 0001'`, `"612 34 56 78"` (no fechas ni importes). */
const NATIONAL_PHONE_EXAMPLE = /['"`>]\s*\(?\d{3}\)?(?: \d{2,4}){2,}\s*['"`<]/;
/** Monedas de la región y las que salieron de ejemplo, tras «p. ej.» o «por ejemplo». */
const CURRENCY_FOR_EXAMPLE =
  /(?:p\.\s*ej\.|por ejemplo|ej\.)[:,]?\s*[«"'(]?\d*[\s.,\d]*(?:COP|USD|EUR|VES|MXN|ARS|CLP|PEN|BRL|BOB|PYG|UYU|GTQ|CRC|DOP|GBP)\b/i;
/** Dirección con número a la colombiana o similar: `Calle 1 # 2-3`, `Cra 15 #90-20`. */
const ADDRESS_EXAMPLE =
  /\b(?:Calle|Carrera|Cra|Cl|Kr|Avenida|Av|Diagonal|Dg|Transversal|Tv)\.?\s*\d+[A-Za-z]?\s*(?:#|N[°º.o]\.?)\s*\d/i;
/** Ciudades que eran ejemplo de dirección o de hora (con tilde: no son ids IANA). */
const CITY_EXAMPLE = /Bogotá|Medellín/;

function countryExampleHit(line: string): boolean {
  if (COMMENT_LINE.test(line) || ZONE_LABEL_KEY.test(line)) return false;
  return [PHONE_EXAMPLE, NATIONAL_PHONE_EXAMPLE, CURRENCY_FOR_EXAMPLE, ADDRESS_EXAMPLE, CITY_EXAMPLE].some((pattern) =>
    pattern.test(line),
  );
}

describe('arquitectura: textos sin ejemplos de un país (DX-368)', () => {
  it('src/ shows no phone, currency, address or city of one country as an example', () => {
    const files = sourceFiles(SRC).filter(scanned);
    expect(files.length).toBeGreaterThan(300);
    const found = files.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, i) => (countryExampleHit(line) ? [`${relative(SRC, path)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(found).toEqual([]);
  });

  it('the example patterns catch each retired form and skip neutral text', () => {
    for (const line of [
      "  hint: 'Con indicativo de país, p. ej. +57 601 555 0101',",
      "    'El paciente no tiene un teléfono con indicativo de país (p. ej. +57…). Agrégalo en su ficha.',",
      '  placeholder="+34 612 34 56 78"',
      '  placeholder="612 34 56 78"',
      "  phonePlaceholder: '310 000 0001',",
      '  <span>(601) 555 0101</span>',
      "  currencyHint: 'Código de 3 letras (p. ej. COP).',",
      "  hint: 'Por ejemplo, 150.000 COP.',",
      "  addressPlaceholder: 'Calle 1 # 2-3',",
      "  addressPlaceholder: 'Cra 15 #90-20',",
      '  <p>Un abono a las 20:00 en Bogotá cuenta ese día.</p>',
    ]) {
      expect({ line, caught: countryExampleHit(line) }).toEqual({ line, caught: true });
    }
    for (const line of [
      "  hint: 'Con indicativo internacional (+…).',",
      "  currencyHint: 'Código ISO 4217 de 3 letras.',",
      "  codeHintCreate: 'Corto y único, p. ej. EXO o CIR-3M. No se puede cambiar después.',",
      "  emailInvalid: 'Revisa el correo electrónico: le falta algo (p. ej. nombre@dominio.com).',",
      "  'America/Bogota': 'Bogotá',",
      '  // (medianoche UTC sería la tarde del día anterior en Bogotá).',
      '   * siempre en USD). Mientras no se sabe la moneda',
      '  const co = /^\\+57(\\d{3})(\\d{3})(\\d{4})$/.exec(e164);',
      "  mobileInvalidHint: 'No sirve para WhatsApp: revisa el número o escríbelo con + y su indicativo.',",
      "  label: 'Mejora: +20 % frente al periodo anterior',",
      "  const day = '2026-10-17';",
      "  const amount = '1 500 000';",
    ]) {
      expect({ line, caught: countryExampleHit(line) }).toEqual({ line, caught: false });
    }
  });
});
