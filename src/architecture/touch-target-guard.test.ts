import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * DX-485 (FE-098, FE-093): en Tailwind 4 el bloque `@media (pointer: coarse)`
 * se emite DESPUÉS del de `max-sm` (`width < 40rem`). Con la misma
 * especificidad, el `pointer-coarse:h-*` de `Button` gana a un `max-sm:h-11`
 * puesto encima: en un teléfono real el arreglo no se aplica. Por eso, sobre
 * un `Button` (o un elemento con `buttonVariants`), el alto mínimo en el
 * teléfono se pide con `max-sm:min-h-11` (y `max-sm:min-w-11` para el ancho),
 * que nunca compite con el `height` de la primitiva.
 */
const SRC = join(__dirname, '..');
const FIXED_PHONE_SIZE = /(?:^|[\s'"`])max-sm:(?:h|size)-11(?=$|[\s'"`])/;

function tsxFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

function attribute(tag: JsxTag, name: string): ts.JsxAttribute | undefined {
  return tag.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

/** `fichero:línea` de cada botón con un `max-sm:h-11`/`max-sm:size-11` en su `className`. */
function fixedPhoneSizeHits(rel: string, text: string): string[] {
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const className = attribute(node, 'className')?.initializer?.getText(source) ?? '';
      const isButton = node.tagName.getText(source) === 'Button' || className.includes('buttonVariants(');
      if (isButton && FIXED_PHONE_SIZE.test(className)) {
        hits.push(`${rel}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

describe('guarda de objetivos táctiles en botones (DX-485)', () => {
  it('detecta el max-sm:h-11 sobre un Button y sobre un elemento con buttonVariants', () => {
    const sample = [
      '<Button size="sm" className="max-sm:h-11 max-sm:flex-1">Cambiar</Button>;',
      '<Button className={cn("w-full", "max-sm:size-11")} />;',
      '<a className={cn(buttonVariants({ size: "sm" }), "max-sm:h-11")}>WhatsApp</a>;',
      '<Button size="sm" className="max-sm:min-h-11">Bien</Button>;',
      '<Input className="h-10 max-sm:h-11" />;',
    ].join('\n');
    expect(fixedPhoneSizeHits('x.tsx', sample)).toEqual(['x.tsx:1', 'x.tsx:2', 'x.tsx:3']);
  });

  it('ningún botón de src/ fija su alto con max-sm:h-11 o max-sm:size-11 (usa max-sm:min-h-11)', () => {
    const hits = tsxFiles().flatMap((file) =>
      fixedPhoneSizeHits(relative(SRC, file).split(sep).join('/'), readFileSync(file, 'utf8')),
    );
    expect(hits).toEqual([]);
  });
});
