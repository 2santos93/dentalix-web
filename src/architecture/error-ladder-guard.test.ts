import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * DX-442 (FE-092): la escalera de errores vive en `src/components/errors`
 * (DESIGN.md → Error States). Un `<p role="alert">` o `<div role="alert">`
 * escrito a mano fuera de ahí es un error sin icono, sin reintento o sin el
 * `id` que el control necesita para `aria-describedby`: se usa `InlineError`,
 * `FieldError` o `SectionError`. Los componentes (`<Callout role="alert">`) no
 * cuentan: la primitiva documenta cuándo anuncia.
 *
 * La lista de abajo son los `role="alert"` a mano que NO son errores de la
 * escalera y se quedan, cada uno con su porqué. Solo puede bajar.
 */
const SRC = join(__dirname, '..');

const ALLOWED: Record<string, string> = {
  // El límite de la app entera (global-error): no hay escalera por encima.
  'app/global-error.tsx': 'límite global de la app',
  // Alertas MÉDICAS del paciente: «alerta» es el dominio, no un fallo.
  'components/clinical/appointment-medical-alerts.tsx': 'alerta clínica',
  'components/patients/clinical-alert-banner.tsx': 'alerta clínica',
  // Avisos de negocio que interrumpen a propósito tras una acción.
  'components/payments/reallocate-payment-modal.tsx': 'aviso de exceso al redistribuir',
  'components/postop/appointment-postop-panel.tsx': 'aviso de envío no encolado',
};

function tsxFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function roleAttribute(tag: JsxTag): string | null {
  const attr = tag.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === 'role',
  );
  const init = attr?.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) return init.expression.text;
  return null;
}

/** `fichero:línea` de cada elemento intrínseco (etiqueta en minúscula) con `role="alert"`. */
export function handMadeAlerts(rel: string, text: string): string[] {
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (/^[a-z]/.test(tag) && roleAttribute(node) === 'alert') {
        hits.push(`${rel}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

describe('guarda de la escalera de errores (DX-442)', () => {
  it('detecta el role="alert" a mano y deja pasar los componentes', () => {
    const sample = [
      '<p role="alert">Mal</p>;',
      '<div role={"alert"} className="x">Mal</div>;',
      '<Callout tone="warning" role="alert">Bien</Callout>;',
      '<InlineError>Bien</InlineError>;',
      '<p role="status">Bien</p>;',
    ].join('\n');
    expect(handMadeAlerts('x.tsx', sample)).toEqual(['x.tsx:1', 'x.tsx:2']);
  });

  it('fuera de src/components/errors, ningún role="alert" a mano salvo los justificados', () => {
    const hits = tsxFiles()
      .filter((file) => !file.includes(`${sep}components${sep}errors${sep}`))
      .flatMap((file) =>
        handMadeAlerts(relative(SRC, file).split(sep).join('/'), readFileSync(file, 'utf8')),
      )
      .filter((hit) => !(hit.replace(/:\d+$/, '') in ALLOWED));
    expect(hits).toEqual([]);
  });

  it('la lista de justificados no tiene entradas viejas', () => {
    const present = new Set(
      tsxFiles().flatMap((file) =>
        handMadeAlerts(relative(SRC, file).split(sep).join('/'), readFileSync(file, 'utf8')).map((hit) =>
          hit.replace(/:\d+$/, ''),
        ),
      ),
    );
    expect(Object.keys(ALLOWED).filter((file) => !present.has(file))).toEqual([]);
  });
});
