import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * DX-354b (E9, E10; absorbe DX-520-bis): ninguna hora ni día se COMPONE a mano.
 * El día de hoy, la hora y el día de una cita salen de la sede (`sedeToday`,
 * `civilDateInZone`, `RegionalFormat`): con los getters locales de `Date` el
 * «hoy» era el del navegador (Tokio ya está en el 5 cuando Caracas va por el 4)
 * y con `padStart` a ambos lados de un `:` o de una `/` el texto salía siempre
 * en 24 h y `dd/mm`, sin mirar el locale de la sede. Es la guarda hermana de
 * `sede-clock-guard` (que mira los imports de `lib/format/date`) y su espejo en
 * la API es `no-location-fallbacks.spec.ts` (ZERO_PAD). Dos reglas para todo
 * `src/` salvo `lib/format/**` (donde viven los formateadores), los tests,
 * `lib/test/**` y `schema.d.ts`:
 *
 * 1. Ningún getter LOCAL de `Date` (`getFullYear|getMonth|getDate|getHours|
 *    getMinutes|getDay`) fuera de `LOCAL_GETTER_EXCEPTIONS`, cada una con su
 *    motivo. Los getters `getUTC*` no entran: leen un día civil sin zona.
 * 2. Ninguna plantilla, concatenación ni `.join` compone una hora (`HH:mm`) o un
 *    día (`dd/mm`) con piezas rellenadas con ceros (`padStart(2, …)` o `pad(…)`)
 *    a ambos lados de un `:` o de una `/`, fuera de `MACHINE_VALUES`: los valores
 *    de máquina (el `HH:mm` de un `<input>`, el sufijo de un id, un hex, la
 *    cuenta atrás `mm:ss`). Las excepciones son por FICHERO, no por carpeta: el
 *    flujo del aviso de DX-520-bis (`components/appointments/**`,
 *    `lib/appointments/**`, `lib/locations/provider-schedule*`) sigue cubierto
 *    aunque un fichero de la misma carpeta sea una excepción.
 *
 * La API manda el texto del aviso «fuera del horario del profesional» ya
 * escrito con las palabras y el reloj de la sede (`appointment-warnings.ts` lo
 * muestra tal cual); esta guarda impide que la web lo reescriba con dígitos.
 */
const SRC = join(__dirname, '..');

/** Getters locales permitidos, por fichero y con su motivo. */
const LOCAL_GETTER_EXCEPTIONS: Readonly<Record<string, string>> = {
  'lib/patients/age.ts':
    'La edad en años cumplidos tiene granularidad de día: el desfase entre el día del navegador y el de la sede solo se nota el día del cumpleaños.',
  'components/marketing/landing-page.tsx': 'El año del copyright de la página pública, sin sede ni clínica.',
};

/** Valores de máquina (DX-520-bis, D9): se componen con ceros, pero no se le enseñan a nadie como fecha u hora. */
const MACHINE_VALUES: Readonly<Record<string, string>> = {
  'components/anesthesia/anesthesia-modal.tsx': '`nowHHmm`: el valor 24 h de un campo de hora (`TimeField` guarda `HH:mm`); lo que se ve lo pinta el reloj de la sede.',
  'components/sedation/sedation-modal.tsx': '`nowHHmm`: el valor 24 h de un campo de hora; lo que se ve lo pinta el reloj de la sede.',
  'components/appointments/agenda-view.tsx': '`addMinutesToTime`: aritmética sobre el `HH:mm` de máquina del formulario, nunca texto en pantalla.',
  'components/appointments/appointment-form.tsx': '`endFor`: la hora de fin como `HH:mm` de máquina del campo de hora; el aviso usa `sedeMinuteRanges` con el reloj de la sede.',
  'lib/appointments/day-grid.ts': '`formatMinute`: el valor de un `<input type="time">`, nunca un texto en pantalla (para eso, `sedeMinute`).',
  'lib/dates/iso.ts': '`timeToIso`: `Time` de un campo → `HH:mm` de máquina para la API (24 h, el reloj de 12 h es solo de pantalla).',
  'lib/locations/schedule-api.ts': '`minutesToTime`: el `HH:mm` del contrato de la API de horarios, no texto en pantalla.',
  // `auth/login-lockout.ts` (cuenta atrás mm:ss) y `color/accent.ts` (hex) no se rellenan con `padStart(2)` a ambos lados de `:`/`/`: la regla no los ve.
};

const LOCAL_GETTERS = new Set(['getFullYear', 'getMonth', 'getDate', 'getHours', 'getMinutes', 'getDay']);
/** El flujo de agenda y del aviso de DX-520-bis: siempre cubierto, aunque una excepción de máquina viva en la misma carpeta. */
const FLOW_SCOPES = ['components/appointments/', 'lib/appointments/', 'lib/locations/provider-schedule'] as const;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const relOf = (path: string) => relative(SRC, path).split(sep).join('/');

function scanned(rel: string): boolean {
  if (/\.test\./.test(rel)) return false;
  if (rel.startsWith('lib/format/') || rel.startsWith('lib/test/')) return false;
  return rel !== 'lib/api/schema.d.ts';
}

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

const where = (source: ts.SourceFile, node: ts.Node) =>
  `${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${node.getText(source).split('\n')[0].slice(0, 90)}`;

/** Regla 1: llamadas `x.getHours()` & co. */
function localGetterCalls(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      LOCAL_GETTERS.has(node.expression.name.text)
    ) {
      found.push(where(source, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Nombres de variables que valen una pieza rellenada con ceros: `const dd = String(d).padStart(2, '0')`. */
function paddedNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isPaddedText(node.initializer, source, new Set())) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

const PAD_CALL = /^(?:pad|zeroPad|pad2|two|twoDigits)\w*$/;

/** ¿Es la expresión una pieza rellenada con ceros: `….padStart(2, …)`, `pad(…)` o una variable que lo es? */
function isPaddedText(node: ts.Expression, source: ts.SourceFile, padded: ReadonlySet<string>): boolean {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return isPaddedText(node.expression, source, padded);
  }
  if (ts.isIdentifier(node)) return padded.has(node.text);
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'padStart') return true;
    if (ts.isIdentifier(callee) && PAD_CALL.test(callee.text)) return true;
    // `String(x).padStart(…)` ya entra arriba; `pad(h)` también.
  }
  return false;
}

/** Regla 2: `${pad(h)}:${pad(m)}`, `${dd}/${mm}`, `pad(h) + ':' + pad(m)`, `[h, m].map(pad).join(':')`. */
function handComposedTexts(source: ts.SourceFile): string[] {
  const padded = paddedNames(source);
  const found: string[] = [];
  const isSeparator = (text: string) => text === ':' || text === '/';
  const visit = (node: ts.Node) => {
    if (ts.isTemplateExpression(node)) {
      node.templateSpans.forEach((span, i) => {
        const next = node.templateSpans[i + 1];
        if (next && isSeparator(span.literal.text) && isPaddedText(span.expression, source, padded) && isPaddedText(next.expression, source, padded)) {
          found.push(where(source, node));
        }
      });
      // `${pad(h)}:` + … también cuando la primera pieza abre la plantilla tras el `head`.
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const mid = node.left;
      if (
        ts.isBinaryExpression(mid) &&
        mid.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        ts.isStringLiteralLike(mid.right) &&
        isSeparator(mid.right.text) &&
        isPaddedText(mid.left, source, padded) &&
        isPaddedText(node.right, source, padded)
      ) {
        found.push(where(source, node));
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'join' &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      isSeparator(node.arguments[0].text) &&
      /padStart\(\s*2/.test(node.expression.expression.getText(source))
    ) {
      found.push(where(source, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const files = sourceFiles(SRC)
  .map((path) => ({ path, rel: relOf(path) }))
  .filter(({ rel }) => scanned(rel))
  .map(({ path, rel }) => ({ rel, source: parse(path, readFileSync(path, 'utf8')) }));

function getterOffenders(list: readonly { rel: string; source: ts.SourceFile }[]): string[] {
  return list
    .filter(({ rel }) => !(rel in LOCAL_GETTER_EXCEPTIONS))
    .flatMap(({ rel, source }) => localGetterCalls(source).map((hit) => `${rel}:${hit}`));
}

function composedOffenders(list: readonly { rel: string; source: ts.SourceFile }[]): string[] {
  return list
    .filter(({ rel }) => !(rel in MACHINE_VALUES))
    .flatMap(({ rel, source }) => handComposedTexts(source).map((hit) => `${rel}:${hit}`));
}

describe('arquitectura: ninguna hora ni día se compone a mano (DX-354b, DX-520-bis)', () => {
  it('no local Date getter outside the documented exceptions', () => {
    expect(getterOffenders(files)).toEqual([]);
  });

  it('no template, concatenation or join zero-pads a time (HH:mm) or a day (dd/mm) outside the machine values', () => {
    expect(composedOffenders(files)).toEqual([]);
  });

  it('every exception still exists and still needs it (no stale entries)', () => {
    const staleGetter = Object.keys(LOCAL_GETTER_EXCEPTIONS).filter((rel) => {
      const file = files.find((f) => f.rel === rel);
      return !file || localGetterCalls(file.source).length === 0;
    });
    const staleMachine = Object.keys(MACHINE_VALUES).filter((rel) => {
      const file = files.find((f) => f.rel === rel);
      return !file || handComposedTexts(file.source).length === 0;
    });
    expect({ staleGetter, staleMachine }).toEqual({ staleGetter: [], staleMachine: [] });
  });

  it('the agenda and warning flow is scanned file by file: a machine value in the same folder does not exempt the rest', () => {
    for (const scope of FLOW_SCOPES) {
      const inScope = files.filter(({ rel }) => rel.startsWith(scope));
      expect([scope, inScope.length > 0]).toEqual([scope, true]);
      // Ninguna excepción cubre una carpeta entera: cada una nombra un fichero.
      for (const rel of [...Object.keys(MACHINE_VALUES), ...Object.keys(LOCAL_GETTER_EXCEPTIONS)]) {
        expect([rel, /\.(ts|tsx)$/.test(rel)]).toEqual([rel, true]);
      }
    }
    // Un fichero nuevo del flujo falla aunque haya una excepción de máquina en la misma carpeta.
    const code = "export const hhmm = (h: number, m: number) => `${pad(h)}:${pad(m)}`;";
    const sibling = [{ rel: 'components/appointments/x.tsx', source: parse('x.tsx', code) }];
    expect(composedOffenders(sibling)).toHaveLength(1);
  });

  it('the machine HH:mm values of the list pass, and would fail without their exception', () => {
    for (const rel of Object.keys(MACHINE_VALUES)) {
      const file = files.find((f) => f.rel === rel)!;
      expect(composedOffenders([file])).toEqual([]);
      expect([rel, handComposedTexts(file.source).length > 0]).toEqual([rel, true]);
    }
  });

  it('catches a local getter in components/ and lets age.ts and the landing page through (with their reason)', () => {
    const code = 'export const today = () => { const d = new Date(); return d.getFullYear() + "-" + d.getDate(); };';
    expect(getterOffenders([{ rel: 'components/foo/x.tsx', source: parse('x.tsx', code) }])).toHaveLength(2);
    expect(getterOffenders([{ rel: 'lib/patients/age.ts', source: parse('x.ts', code) }])).toEqual([]);
    expect(getterOffenders([{ rel: 'components/marketing/landing-page.tsx', source: parse('x.tsx', code) }])).toEqual([]);
    expect(LOCAL_GETTER_EXCEPTIONS['lib/patients/age.ts']).toMatch(/cumpleaños/);
    expect(LOCAL_GETTER_EXCEPTIONS['components/marketing/landing-page.tsx']).toMatch(/copyright/);
    // Los getters UTC leen un día civil sin zona: no entran.
    expect(localGetterCalls(parse('x.ts', 'd.getUTCDate(); d.getUTCFullYear(); d.getTime();'))).toEqual([]);
  });

  it('catches a hand-composed time or day in components/appointments and lets a plain colon through', () => {
    const at = (code: string) => composedOffenders([{ rel: 'components/appointments/x.tsx', source: parse('x.tsx', code) }]);
    expect(at("const a = `${pad(h)}:${pad(m)}`;")).toHaveLength(1);
    expect(at("const a = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;")).toHaveLength(1);
    expect(at("const dd = String(d).padStart(2, '0'); const mm = String(m).padStart(2, '0'); const a = `${dd}/${mm}`;")).toHaveLength(1);
    expect(at("const a = pad(h) + ':' + pad(m);")).toHaveLength(1);
    expect(at("const a = [h, m].map((n) => String(n).padStart(2, '0')).join(':');")).toHaveLength(1);
    // Sin ceros no es una hora compuesta: un cociente, un encabezado, una ruta.
    expect(at("const a = `${label}: ${value}`; const b = `${a}/${b}`; const c = `${h}:${m}`;")).toEqual([]);
  });
});
