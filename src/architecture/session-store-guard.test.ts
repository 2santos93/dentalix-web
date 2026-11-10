import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * FE-031 (DX-117): `GET /me` y `GET /locations` se piden SOLO desde la caché
 * de la sesión (`lib/session/session-store.ts`), que comparte la lectura entre
 * todas las vistas y no la repite al renovar el token. Una pantalla que vuelva
 * a llamar a `listLocations`/`getMe` por su cuenta, o a pedir `'/locations'` o
 * `'/me'` con `apiFetch`, multiplica otra vez las peticiones de cada carga.
 *
 * Recorre `src/` sin los tests ni `src/lib/test/**`, con el AST de TypeScript
 * (los comentarios no cuentan). Permitido:
 * - `listLocations`/`getMe`: donde se definen (`locations-api.ts`,
 *   `me-api.ts`) y en el store;
 * - los literales `'/locations'` y `'/me'`: solo en esos dos clientes de API
 *   (también los usan `POST /locations` y `PATCH /me`).
 */
const SRC = join(__dirname, '..');
const STORE = 'lib/session/session-store.ts';
const LOCATIONS_API = 'lib/locations/locations-api.ts';
const ME_API = 'lib/me/me-api.ts';

const FETCHERS: Record<string, readonly string[]> = {
  listLocations: [LOCATIONS_API, STORE],
  getMe: [ME_API, STORE],
};
const PATHS: Record<string, readonly string[]> = {
  '/locations': [LOCATIONS_API],
  '/me': [ME_API],
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function scanned(rel: string): boolean {
  if (/\.test\./.test(rel)) return false;
  if (rel.startsWith('lib/test/')) return false;
  if (rel === 'lib/api/schema.d.ts') return false;
  return true;
}

/** Usos prohibidos de un fichero, como `ruta:línea: texto`. */
function violations(rel: string, text: string): string[] {
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, what: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    found.push(`${rel}:${line + 1}: ${what}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && Object.hasOwn(FETCHERS, node.text) && !FETCHERS[node.text].includes(rel)) {
      report(node, node.text);
    }
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      Object.hasOwn(PATHS, node.text) &&
      !PATHS[node.text].includes(rel)
    ) {
      report(node, `'${node.text}'`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('FE-031: /me y /locations solo desde la caché de la sesión', () => {
  it('ninguna vista llama a listLocations/getMe ni pide /locations o /me por su cuenta', () => {
    const offenders = sourceFiles(SRC)
      .map((path) => relative(SRC, path).split(sep).join('/'))
      .filter(scanned)
      .flatMap((rel) => violations(rel, readFileSync(join(SRC, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('la guarda detecta una llamada directa y un apiFetch suelto, y no los comentarios', () => {
    const sample = [
      "import { listLocations } from '@/lib/locations/locations-api';",
      '// listLocations(token) en un comentario no cuenta',
      'listLocations(token);',
      "apiFetch('/me', { token });",
    ].join('\n');
    expect(violations('components/x/view.tsx', sample)).toEqual([
      'components/x/view.tsx:1: listLocations',
      'components/x/view.tsx:3: listLocations',
      "components/x/view.tsx:4: '/me'",
    ]);
    expect(violations(STORE, 'listLocations(token); getMe(token);')).toEqual([]);
  });
});
