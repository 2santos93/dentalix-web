/**
 * @jest-environment node
 *
 * DX-063: la regla `no-restricted-syntax` de `eslint.config.mjs` impide volver a
 * enseñar `err.message` de la API fuera de `apiErrorMessage()`. Se lanza el
 * ESLint real del repo (con su configuración) sobre código de ejemplo por
 * stdin, como si fuera un componente.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(__dirname, '../../..');
const eslintBin = path.join(root, 'node_modules/eslint/bin/eslint.js');

interface LintMessage {
  ruleId: string | null;
}

function restrictedHits(code: string, filePath = 'src/components/demo/demo.tsx'): number {
  let out: string;
  try {
    out = execFileSync(
      process.execPath,
      [eslintBin, '--stdin', '--stdin-filename', filePath, '--format', 'json'],
      { cwd: root, input: code, encoding: 'utf8' },
    );
  } catch (err) {
    // ESLint sale con código 1 cuando hay errores; el JSON está en stdout.
    out = (err as { stdout: string }).stdout;
  }
  const [result] = JSON.parse(out) as { messages: LintMessage[] }[];
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length;
}

const header = `import { ApiError } from '@/lib/api/client';\nimport { apiErrorMessage } from '@/lib/api/error-message';\nexport function f(err: unknown, set: (m: string) => void) {\n`;

describe('regla ESLint contra `ApiError.message` (DX-063)', () => {
  it('falla con el patrón de antes (ternario instanceof ApiError)', () => {
    expect(restrictedHits(`${header}set(err instanceof ApiError ? err.message : 'x');\n}\n`)).toBe(1);
  });

  it('falla con cualquier nombre de variable dentro de un instanceof ApiError', () => {
    expect(
      restrictedHits(`${header}const fail = err;\nif (fail instanceof ApiError) set(fail.message);\n}\n`),
    ).toBe(1);
  });

  it('falla leyendo `.message` / `.messages` de un error sin comprobar el tipo', () => {
    expect(restrictedHits(`${header}set((err as ApiError).message);\nconst e = err as ApiError;\nset(e.messages[0]);\n}\n`)).toBe(2);
  });

  it('pasa con apiErrorMessage()', () => {
    expect(restrictedHits(`${header}set(apiErrorMessage(err, 'No pudimos guardar.'));\n}\n`)).toBe(0);
  });

  it('no aplica dentro de src/lib/api (el helper sí lee el texto)', () => {
    expect(
      restrictedHits(
        `${header}set(err instanceof ApiError ? err.message : 'x');\n}\n`,
        'src/lib/api/demo.ts',
      ),
    ).toBe(0);
  });
});
