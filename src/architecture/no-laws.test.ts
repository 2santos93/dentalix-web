import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { citesLaw } from './law-citation';

/**
 * DX-369: la landing pública describe sus garantías (auditoría, historia
 * clínica inmutable, cifrado y consentimientos versionados) sin nombrar leyes
 * ni regímenes de ningún país ni prometer que los cumple. Citar uno lo decide
 * el dueño con evidencia. Recorre todo el código de la landing, comentarios
 * incluidos: los componentes de `components/marketing/`, la raíz que la pinta
 * y el layout raíz, que lleva el título y la descripción públicos.
 */
const SRC = join(__dirname, '..');
const MARKETING = join(SRC, 'components', 'marketing');
const LANDING_ROUTE_FILES = ['app/page.tsx', 'app/layout.tsx'];


function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

const rel = (path: string): string => relative(SRC, path).split(sep).join('/');

const landingFiles = (): string[] => [
  ...sourceFiles(MARKETING),
  ...LANDING_ROUTE_FILES.map((path) => join(SRC, ...path.split('/'))),
];

/** Cada línea de los ficheros que cumple `cites`, como `ruta:línea: texto`. */
function offending(files: string[], cites: (line: string, file: string) => boolean): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (cites(line, rel(file)) ? [`${rel(file)}:${i + 1}: ${line.trim()}`] : [])),
  );
}

describe('arquitectura: landing sin leyes ni regímenes (DX-369)', () => {
  it('the landing, its route and the root metadata name no law', () => {
    const files = landingFiles();
    expect(files.map(rel)).toEqual(expect.arrayContaining(['components/marketing/landing-page.tsx', ...LANDING_ROUTE_FILES]));
    expect(offending(files, citesLaw)).toEqual([]);
  });

  it('the pattern catches each regime and numbered law and skips the guarantees', () => {
    for (const text of [
      'Pensado para Habeas Data, LGPD, GDPR e HIPAA.',
      'Cumple el RGPD',
      'conforme a la Ley 1581 de 2012',
      'Ley Orgánica 3/2018',
      'Reglamento (UE) 2016/679',
      'Decreto 1377 de 2013',
      'hipaa-ready',
      'Cumple la LOPDGDD',
      'Hábeas Data',
      'Ley Estatutaria 1581 de 2012',
    ]) {
      expect({ text, caught: citesLaw(text) }).toEqual({ text, caught: true });
    }
    for (const text of [
      'Registro de auditoría de accesos y cambios, historia clínica inmutable, consentimientos versionados y conexión cifrada.',
      'Protección de datos',
      'Leyenda del odontograma',
      'ley de oferta y demanda',
    ]) {
      expect({ text, caught: citesLaw(text) }).toEqual({ text, caught: false });
    }
  });
});

/**
 * DX-323: ninguna pantalla cita una norma ni una autoridad de un país; el
 * producto es mundial y cada clínica escribe su base legal. Recorre la
 * producción de `src/` sin líneas de comentario (los comentarios son de
 * DX-371), y el contrato generado de la API con comentarios, porque sus
 * `@description` son textos que la API devuelve. La única excepción con nombre
 * congela las recetas emitidas antes de DX-324 (R12).
 */
/** Comentarios (JSDoc y `//`), como en `no-location-fallbacks.test.ts`. */
const COMMENT_LINE = /^\s*(?:\*|\/\/|\/\*)/;
const API_SCHEMA = 'lib/api/schema.d.ts';
const LAW_CITATION_FILE = 'architecture/law-citation.ts';
const PRESCRIPTION_LEGACY_LAYOUT = 'lib/prescriptions/legacy-prescription-layout.ts';
/**
 * Líneas exactas (sin sangría) que pueden citar una norma, cada una en su
 * fichero. Cualquier otra cita, también en ese fichero, falla. Armadas por
 * partes, como los casos de la autoprueba.
 */
const LAW_LINE_EXCEPTIONS: readonly { file: string; line: string }[] = [
  { file: PRESCRIPTION_LEGACY_LAYOUT, line: "subtitle: 'Decr" + "eto 780 de 2016, art. 2.5.3.10.16'," },
  { file: PRESCRIPTION_LEGACY_LAYOUT, line: "subtitle: 'Real Decr" + "eto 1718/2010, art. 3'," },
];
const DX325_FILES = [
  'components/implants/implant-card-document.tsx',
  'components/data-consents/privacy-policy-settings.tsx',
  'lib/data-consents/policy-template.ts',
  API_SCHEMA,
];

/** Comentarios de bloque cerrados al principio de la línea: no ocultan el código que los sigue. */
const LEADING_BLOCK_COMMENTS = /^(?:\s*\/\*.*?\*\/)+/;

/** El código de la línea: sin los bloques del principio y vacío si lo que queda es un comentario. */
function codeOf(line: string): string {
  const rest = line.replace(LEADING_BLOCK_COMMENTS, '');
  return COMMENT_LINE.test(rest) ? '' : rest;
}

const citesLawInCode = (line: string): boolean => citesLaw(codeOf(line));

/** Cuántas veces aparece la línea fijada (sin sangría) en el texto del fichero. */
const pinnedCount = (text: string, pinned: string): number =>
  text.split('\n').filter((l) => l.trim() === pinned).length;

function isLawLineException(file: string, line: string): boolean {
  return LAW_LINE_EXCEPTIONS.some((e) => e.file === file && e.line === line.trim());
}

/** El predicado de la guarda: una cita en código que no es una de las líneas fijadas. */
const lawHit = (line: string, file: string): boolean => citesLawInCode(line) && !isLawLineException(file, line);

function productionFiles(): string[] {
  return sourceFiles(SRC).filter((path) => {
    const r = rel(path);
    if (r.startsWith('lib/test/') || /\/fixture/.test(`/${r}`)) return false;
    return r !== LAW_CITATION_FILE && r !== API_SCHEMA;
  });
}

describe('arquitectura: ninguna pantalla nombra una ley ni una autoridad (DX-323)', () => {
  it('no production line of src cites a law or an authority outside the legacy prescription layout', () => {
    const files = productionFiles();
    expect(files.length).toBeGreaterThan(300);
    expect(files.map(rel)).toContain(PRESCRIPTION_LEGACY_LAYOUT);
    expect(offending(files, lawHit)).toEqual([]);
  });

  it('the generated API contract cites no law, comments included', () => {
    expect(offending([join(SRC, ...API_SCHEMA.split('/'))], citesLaw)).toEqual([]);
  });

  it('the scan covers the privacy, implant and contract files', () => {
    const covered = [...productionFiles().map(rel), API_SCHEMA];
    expect(covered).toEqual(expect.arrayContaining(DX325_FILES));
    expect(covered).toEqual(expect.arrayContaining(['app/(app)/settings/privacidad/page.tsx']));
  });

  it('every named exception still exists and still needs its exception', () => {
    for (const e of LAW_LINE_EXCEPTIONS) {
      const path = join(SRC, ...e.file.split('/'));
      expect([e.file, existsSync(path)]).toEqual([e.file, true]);
      const lines = readFileSync(path, 'utf8').split('\n').map((l) => l.trim());
      expect([e.file, e.line, pinnedCount(lines.join('\n'), e.line)]).toEqual([e.file, e.line, 1]);
      expect([e.line, citesLawInCode(e.line)]).toEqual([e.line, true]);
    }
  });

  it('the exception covers only its pinned lines: a new citation in the legacy layout is caught', () => {
    const [pinned] = LAW_LINE_EXCEPTIONS;
    expect(lawHit(`    ${pinned.line}`, PRESCRIPTION_LEGACY_LAYOUT)).toBe(false);
    expect(lawHit("  footer: 'Decr" + "eto 780 de 2016',", PRESCRIPTION_LEGACY_LAYOUT)).toBe(true);
    expect(lawHit(pinned.line.replace('2016', '2017'), PRESCRIPTION_LEGACY_LAYOUT)).toBe(true);
    expect(lawHit(pinned.line, 'lib/prescriptions/prescription-layout.ts')).toBe(true);
  });

  it('a second copy of a pinned line in the same file is detected', () => {
    const [pinned] = LAW_LINE_EXCEPTIONS;
    expect(pinnedCount(`a\n  ${pinned.line}\nb`, pinned.line)).toBe(1);
    expect(pinnedCount(`a\n  ${pinned.line}\nb\n    ${pinned.line}`, pinned.line)).toBe(2);
    expect(pinnedCount('a\nb', pinned.line)).toBe(0);
  });

  it('the law patterns catch each citation and skip neutral text', () => {
    // Armados por partes: ningún test nuevo nombra una ley ni una autoridad.
    for (const text of [
      'De' + 'c. 1377 de 2013, ' + 'ar' + 't. 6',
      'Le' + 'y 1581 de 2012',
      'Le' + 'y No. 1581',
      'Re' + 's. 839/2017',
      'Re' + 's. 4816/2008',
      'R' + 'D 192/2023',
      'Reglam' + 'ento (UE) 2017/745',
      'Regul' + 'ation (EU) 2016/679',
      'Superinten' + 'dencia de Industria y Comercio',
      'ante la ' + 'SIC',
      'la superinten' + 'dencia de salud',
      'LA SUPERINTEN' + 'DENCIA DE SALUD',
      'Registro ' + 'IN' + 'VIMA',
      'Registro sanitario ' + 'IN' + 'VIMA',
      'Real Decr' + 'eto 1718/2010',
      'Resoluc' + 'ión 1995 de 1999',
      'Resoluc' + 'ión No. 5 de 2020',
      'artícu' + 'lo 6',
      'Le' + 'y de Protección de Datos Personales',
      'La' + 'w No. 25.326',
      'Le' + 'i 13.709',
      'registro ' + 'IN' + 'HRR',
      'permiso ' + 'SA' + 'CS',
      'AN' + 'PD',
      'CN' + 'IL',
      "/* nota */ const basis = '" + 'Le' + "y 1581';",
      "/* a */ /* b */ subtitle: '" + 'Le' + "y 1581',",
      "const url = 'https://example.org // " + 'Le' + "y 1581';",
    ]) {
      expect({ text, caught: citesLawInCode(text) }).toEqual({ text, caught: true });
    }
    for (const text of [
      'la resolución de precios del plan',
      'Resolución del precio por convenio',
      'Resolución 1920×1080',
      'Resolución 300 ppp',
      'Dec. 31',
      'Leyenda del odontograma',
      'ley de oferta y demanda',
      '(sic)',
      'basic',
      'artículos de limpieza',
      '// ' + 'Le' + 'y 1581',
      ' * ' + 'Le' + 'y 1581',
      '/* nota */ // ' + 'Le' + 'y 1581',
      '/* ' + 'Le' + 'y 1581 */',
    ]) {
      expect({ text, caught: citesLawInCode(text) }).toEqual({ text, caught: false });
    }
  });
});

/**
 * DX-323/DX-325: Dentalix es mundial y ningún país es el de por defecto. Ni el
 * código de producción ni sus comentarios ni el contrato generado nombran
 * Colombia, sus leyes y autoridades, su zona, locale o prefijo, sus
 * aseguradoras y siglas sanitarias o fiscales, sus figuras legales ni sus
 * ciudades. Aquí los comentarios cuentan: un comentario que justifica el
 * código con la ley de un país es lo que vuelve a colar la regla. Las únicas
 * excepciones son el layout de recetas ya emitidas (se reimprimen byte a byte,
 * con sus líneas fijadas arriba) y las listas de referencia mundiales en JSON,
 * que no se recorren. Los literales se arman por partes.
 */
const COLOMBIA_TERMS: ReadonlyArray<[string, RegExp]> = [
  ['país', new RegExp('colombi', 'i')],
  ['zona o ciudad', new RegExp('bogot[aá]|medell[ií]n|barranquilla|antioquia|cundinamarca', 'i')],
  ['locale', new RegExp('\\bes-' + 'CO\\b')],
  ['prefijo', new RegExp('(?<![\\w+])\\+' + '57\\b')],
  [
    'ley o autoridad',
    new RegExp(
      ['\\b15' + '81\\b', '\\b13' + '77\\b', 'superinten' + 'dencia', '83' + '9/2017', '19' + '95/1999', '48' + '16/2008'].join('|'),
      'i',
    ),
  ],
  [
    'aseguradora',
    new RegExp(
      '\\b(?:' +
        ['fami' + 'sanar', 'sani' + 'tas', 'nueva ' + 'eps', 'su' + 'ra', 'compen' + 'sar', 'coo' + 'meva', 'salud ' + 'total'].join('|') +
        ')\\b',
      'i',
    ),
  ],
  ['sigla nacional', new RegExp('\\b(?:' + ['EP' + 'S', 'RI' + 'PS', 'CU' + 'PS', 'RE' + 'PS', 'DI' + 'AN', 'NI' + 'T'].join('|') + ')\\b')],
  ['figura legal de un país', new RegExp('acudi' + 'ente', 'i')],
  ['identificador interno', new RegExp('\\b(?:MUTUA' + '_ES|PREPAGADA' + '_CO|EPS' + '_CO)\\b|[Ii]nsurer' + 'Eps')],
];

/** Todo fichero de texto bajo `dir` (tests y e2e incluidos). */
function allTextFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : allTextFiles(path);
    return /\.(ts|tsx|js|mjs|json|md)$/.test(entry.name) ? [path] : [];
  });
}

function colombiaHit(line: string): string | null {
  const hit = COLOMBIA_TERMS.find(([, pattern]) => pattern.test(line));
  return hit ? hit[0] : null;
}

describe('arquitectura: sin Colombia (DX-323, DX-325)', () => {
  it('no production line, comment or generated contract line is Colombian', () => {
    const files = [
      ...productionFiles().filter((path) => rel(path) !== PRESCRIPTION_LEGACY_LAYOUT),
      join(SRC, ...API_SCHEMA.split('/')),
    ];
    expect(files.length).toBeGreaterThan(300);
    const hits = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => {
          const kind = colombiaHit(line);
          return kind ? [`${rel(file)}:${i + 1} (${kind}): ${line.trim()}`] : [];
        }),
    );
    expect(hits).toEqual([]);
  });

  it('no file of src or e2e, tests included, names a Colombian internal identifier', () => {
    // Desde la migración 20261110130000 de la API ningún código de pagador ni
    // campo del contrato lleva el nombre de un país; la web no los traduce.
    const self = join(__dirname, 'no-laws.test.ts');
    const files = [...allTextFiles(SRC), ...allTextFiles(join(SRC, '..', 'e2e'))].filter((f) => f !== self);
    expect(files.length).toBeGreaterThan(800);
    const hits = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (colombiaHit(line) === 'identificador interno' ? [`${rel(file)}:${i + 1}`] : [])),
    );
    expect(hits).toEqual([]);
    expect(existsSync(join(SRC, 'lib/payers/legacy-payer-type.ts'))).toBe(false);
    expect(existsSync(join(SRC, 'lib/patients/legacy-doc-type.ts'))).toBe(false);
  });

  it('the Colombia patterns catch each retired form and skip neutral text', () => {
    for (const line of [
      `// ${'Colom' + 'bia'} (UTC-5)`,
      ` * @example America/${'Bogo' + 'ta'}`,
      ` * (medianoche UTC sería la tarde en ${'Bogo' + 'tá'})`,
      ` * @example ${'es-' + 'CO'}`,
      `  hint: 'p. ej. +${'57'} 300 000 0000',`,
      `  // Autorización ${'Ley ' + '1581'} (DX-037)`,
      `  checklist: '(${'Dec. ' + '1377'}, art. 6)',`,
      `  // retención legal (${'Res. ' + '839'}/2017)`,
      ` * adenda (${'Res. ' + '1995'}/1999 art. 18)`,
      `/** @example Convenio ${'Su' + 'ra'} ${'EP' + 'S'} */`,
      `'${'Fami' + 'sanar'}'`,
      `'Aseguradora / ${'EP' + 'S'}'`,
      `  taxId: (value: string) => \`${'NI' + 'T'}/NIF \${value}\`,`,
      `  LEGAL_GUARDIAN: '${'Acudi' + 'ente'} o tutor legal',`,
      `'el código ${'RI' + 'PS'}'`,
      `  ${'EPS' + '_CO'}`,
      `type: '${'PREPAGADA' + '_CO'}'`,
      `${'MUTUA' + '_ES'}: 'INSURER',`,
      `  migratedFrom${'Insurer' + 'Eps'}: boolean;`,
      `expect(input).not.toHaveProperty('${'insurer' + 'Eps'}');`,
    ]) {
      expect({ line, caught: colombiaHit(line) !== null }).toEqual({ line, caught: true });
    }
    for (const line of [
      ' * @example UTC',
      ' * @example es',
      "const ZERO = ['COP', 'CLP', 'JPY'];",
      '  PUBLIC_SYSTEM',
      '  migratedFromLegacyInsurer: boolean;',
      '  taxId: (value: string) => `Id. fiscal ${value}`,',
      "  LEGAL_GUARDIAN: 'Tutor legal',",
      "'+00 000 000 0001'",
      "'surable'",
      'const steps = 3;',
      "  'America/Caracas',",
    ]) {
      expect({ line, caught: colombiaHit(line) !== null }).toEqual({ line, caught: false });
    }
  });
});
