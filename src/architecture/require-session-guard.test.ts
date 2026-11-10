import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * FE-020 (DX-117): la guarda de sesión de las pantallas de la app vive en UN
 * sitio, `RequireSession` (`components/layouts/require-session.tsx`), montada
 * en `app/(app)/layout.tsx`. Antes iba copiada en ~56 páginas; una página que
 * vuelva a mandar a /login por su cuenta reabre la deriva (copias que esperan
 * o no al arranque, que pintan otro «Verificando sesión…»).
 *
 * Recorre `src/app/(app)` sin los tests, con el AST de TypeScript (los
 * comentarios no cuentan), y prohíbe cualquier literal que apunte a /login:
 * `router.replace('/login')`, `router.push("/login")`, `redirect('/login')`,
 * `location.href = '/login'`, `` `/login?next=${...}` ``, `href="/login"`…
 * Los avisos por rol (403, `RouteRoleGate`) siguen en cada página.
 */
const SRC = join(__dirname, '..');
const APP_GROUP = 'app/(app)/';
const LAYOUT = 'app/(app)/layout.tsx';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const LOGIN = /^\/login(?:$|[?#/])/;

/** Literales que mandan a /login, como `ruta:línea: texto`. */
function loginRedirects(rel: string, text: string): string[] {
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const literal =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : ts.isTemplateExpression(node)
          ? node.head.text
          : null;
    if (literal !== null && LOGIN.test(literal)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push(`${rel}:${line + 1}: ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe('FE-020: la sesión se exige una vez, en el layout de (app)', () => {
  it('ninguna página de src/app/(app) manda a /login por su cuenta', () => {
    const offenders = sourceFiles(join(SRC, 'app', '(app)'))
      .map((path) => relative(SRC, path).split(sep).join('/'))
      .filter((rel) => rel.startsWith(APP_GROUP) && !/\.test\./.test(rel))
      .flatMap((rel) => loginRedirects(rel, readFileSync(join(SRC, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('el layout de (app) monta RequireSession', () => {
    const layout = readFileSync(join(SRC, LAYOUT), 'utf8');
    expect(layout).toMatch(/from '@\/components\/layouts\/require-session'/);
    expect(layout).toMatch(/<RequireSession>/);
  });

  it('el detector reconoce las variantes (y no los comentarios ni otras rutas)', () => {
    const sample = [
      "router.replace('/login');",
      'router.push("/login");',
      'redirect(`/login?next=${path}`);',
      "window.location.href = '/login#x';",
      "// router.replace('/login') en un comentario",
      "router.replace('/login-help');",
      "router.replace('/patients');",
    ].join('\n');
    expect(loginRedirects('x.tsx', sample).map((hit) => hit.split(': ')[1])).toEqual([
      "'/login'",
      '"/login"',
      '`/login?next=${path}`',
      "'/login#x'",
    ]);
  });
});
