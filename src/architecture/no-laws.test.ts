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
      expect([e.file, e.line, lines.includes(e.line)]).toEqual([e.file, e.line, true]);
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
