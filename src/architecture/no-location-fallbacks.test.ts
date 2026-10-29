import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
 * antiguo ni rótulo de pagador con país. Excepciones: el normalizador legado y
 * los nombres de pagadores reales (los de ejemplo del contrato).
 */
const LEGACY_PAYER_CODE =
  /\b(?:MUTUA_ES|PREPAGADA_CO|EPS_CO)\b|['"`](?:EMPRESA|OTRO)['"`]|PAYER_COUNTRY_LABELS|PAYER_NO_COUNTRY_LABEL|PayerCountry|\((?:Colombia|España)\)|\bEPS\b|\b[Mm]utuas?\b|\b[Pp]repagadas?\b/;
const REAL_PAYER_NAMES = /\bSura EPS\b/g;

function legacyPayerCodeHit(line: string): boolean {
  return LEGACY_PAYER_CODE.test(line.replace(REAL_PAYER_NAMES, ''));
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
    ]) {
      expect([line, legacyPayerCodeHit(line)]).toEqual([line, true]);
    }
    for (const line of [
      '/** @example Convenio Sura EPS */',
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
