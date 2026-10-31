import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * DX-312 (P1, pre-flight m14): el navegador de la suite habla `es`, sin
 * región, para que la web no sugiera ningún país; un contexto en `es-CO`
 * rellenaría «Colombia» en silencio en el alta o en «Nueva sede». Todo
 * `locale` de las opciones del navegador (`use`/`test.use`, `newContext`,
 * `newPage`, `launchPersistentContext`) es `E2E_BROWSER_LOCALE`, salvo en
 * `location-country.spec.ts`, el único test con un idioma regional (es-VE).
 * Los `locale` de los datos de una sede (`RegionalSettings`) no son opciones
 * del navegador y no cuentan.
 */
const ROOT = join(__dirname, '..', '..');
const E2E = join(ROOT, 'e2e');
const REGIONAL_LOCALE_SPEC = 'e2e/location-country.spec.ts';
const BROWSER_OPTION_CALL = /(?:^|\.)(?:use|newContext|newPage|launchPersistentContext)$/;

function e2eFiles(dir: string = E2E): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return e2eFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/** Objetos de opciones del navegador: argumentos de esas llamadas y el `use:` de la config. */
function browserOptionObjects(source: ts.SourceFile): ts.ObjectLiteralExpression[] {
  const found: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && BROWSER_OPTION_CALL.test(node.expression.getText(source))) {
      found.push(...node.arguments.filter(ts.isObjectLiteralExpression));
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(source) === 'use' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      found.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** `fichero:línea: locale` de cada `locale` de navegador que no es `E2E_BROWSER_LOCALE`. */
function browserLocaleHits(rel: string, text: string): string[] {
  if (rel === REGIONAL_LOCALE_SPEC) return [];
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return browserOptionObjects(source).flatMap((object) =>
    object.properties
      .filter((p) => p.name?.getText(source) === 'locale')
      .filter((p) => !(ts.isPropertyAssignment(p) && p.initializer.getText(source) === 'E2E_BROWSER_LOCALE'))
      .map((p) => `${rel}:${source.getLineAndCharacterOfPosition(p.getStart(source)).line + 1}: ${p.getText(source)}`),
  );
}

const rel = (path: string) => relative(ROOT, path).split(sep).join('/');

describe('arquitectura: el navegador de la suite e2e no tiene región (DX-312)', () => {
  const files = [...e2eFiles(), join(ROOT, 'playwright.config.ts')];

  it('every browser locale in e2e/ and playwright.config.ts is E2E_BROWSER_LOCALE, except location-country.spec.ts', () => {
    expect(files.flatMap((path) => browserLocaleHits(rel(path), readFileSync(path, 'utf8')))).toEqual([]);
  });

  it('the scan covers the config, the specs and support/, and the es-VE spec is the only exception', () => {
    const rels = files.map(rel);
    expect(rels).toEqual(
      expect.arrayContaining(['playwright.config.ts', 'e2e/support/regional.ts', 'e2e/staff-invitation.spec.ts', REGIONAL_LOCALE_SPEC]),
    );
    const spec = readFileSync(join(ROOT, REGIONAL_LOCALE_SPEC), 'utf8');
    expect(spec).toMatch(/test\.use\(\{ locale: 'es-VE'[,}]/);
    // Fuera de su fichero, la misma línea es una infracción.
    expect(browserLocaleHits('e2e/other.spec.ts', spec)).toEqual([
      expect.stringMatching(/^e2e\/other\.spec\.ts:\d+: locale: 'es-VE'$/),
    ]);
  });

  it('the check catches each browser option form and skips location data', () => {
    const synthetic = [
      "const a = await browser.newContext({ locale: 'es-CO', timezoneId: 'UTC' });",
      "const b = await browser.newPage({ viewport, locale: 'es' });",
      "test.use({ locale: VENEZUELA.locale });",
      'const c = await chromium.launchPersistentContext(dir, { locale });',
      "export default defineConfig({ use: { locale: 'en-US' } });",
      "const ok = await browser.newContext({ locale: E2E_BROWSER_LOCALE });",
      "const SEDE = { country: 'US', locale: 'en-US' };",
      "await fillRegistrationLocation(page, { country: 'ES', locale: 'es-ES' });",
    ].join('\n');
    expect(browserLocaleHits('e2e/synthetic.spec.ts', synthetic)).toEqual([
      "e2e/synthetic.spec.ts:1: locale: 'es-CO'",
      "e2e/synthetic.spec.ts:2: locale: 'es'",
      'e2e/synthetic.spec.ts:3: locale: VENEZUELA.locale',
      'e2e/synthetic.spec.ts:4: locale',
      "e2e/synthetic.spec.ts:5: locale: 'en-US'",
    ]);
  });
});
