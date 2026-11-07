import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * DX-115: dos reglas que mantienen el contraste con la marca blanca.
 *
 * 1. El foco se pinta en `primary-text` (DESIGN.md: «2px `primary-text`
 *    outline… the one focus ring of the product»), nunca en el relleno
 *    `primary`. El relleno es el color de la clínica tal cual: con una marca
 *    clara (#FDE047) un anillo amarillo sobre blanco no llega a 2:1 y el foco
 *    de teclado desaparece. `primary-text` está derivado para dar ≥4,5:1 sobre
 *    surface y canvas en los dos temas (accent.test.ts). Excepción: el halo de
 *    los campos (`ring-primary/20`, junto al borde en `primary-text`).
 *
 * 2. Sin colores hex sueltos en componentes y páginas: van por tokens, que
 *    cambian con el tema y con la marca. Quedan fuera los documentos de
 *    impresión (papel blanco en cualquier tema) y los ficheros de la lista,
 *    cada uno con su motivo. Un fichero nuevo con un hex no pasa.
 */
const SRC = join(__dirname, '..');
const ROOTS = ['components', 'app'].map((dir) => join(SRC, dir));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__fixtures__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = ROOTS.flatMap((root) => sourceFiles(root)).map((path) => ({
  rel: relative(SRC, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

// El relleno como color del foco: `ring-primary` / `outline-primary` sin
// `-text` ni opacidad detrás.
const FOCUS_ON_FILL = /(?:focus-visible:|focus:)(?:ring|outline)-primary(?![\w/-])/g;

describe('arquitectura: el foco nunca va en el relleno de la marca (DX-115)', () => {
  it('ningún componente pinta el foco con `ring-primary` u `outline-primary`', () => {
    const hits = FILES.flatMap(({ rel, text }) =>
      text.split('\n').flatMap((line, i) => (FOCUS_ON_FILL.test(line) ? [`${rel}:${i + 1}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});

/** Documentos de impresión: papel blanco y tinta fija en cualquier tema. */
const PRINT_DOCUMENT = /-document\.tsx$/;

/** Ficheros con hex justificados; un fichero nuevo con hex no está aquí. */
const HEX_ALLOWED: Record<string, string> = {
  'app/layout.tsx': '`theme-color` del navegador: lo lee el navegador, no la página',
  'components/brand/clinic-fiscal-lines.tsx': 'líneas fiscales del membrete impreso',
  'components/clinic-settings/brand-color-preview.tsx': 'previsualiza la marca sobre las superficies de los dos temas',
  'components/clinic-settings/clinic-settings-form.tsx': 'ejemplo de formato y valor del selector de color',
  'components/clinic-settings/document-header-preview.tsx': 'previsualiza el membrete impreso',
  'components/appointment-types/appointment-type-form-modal.tsx': 'color por defecto y ejemplo del selector de color',
  'components/catalog/catalog-view.tsx': 'color por defecto del selector de color',
  'components/shared/signature-pad/signature-pad.tsx': 'tinta y guía de la firma sobre el lienzo blanco',
  'components/signature-requests/public-budget.tsx': 'presupuesto público con aspecto de documento impreso',
  'components/signature-requests/public-signature-view.tsx': 'documento público para firmar, como impreso',
};

// Un hex de color en código (no en un comentario: `#101` de «paciente #101»).
const HEX = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w])/;
const COMMENT = /^\s*(?:\/\/|\*|\/\*)/;

function hexLines(text: string): number[] {
  return text
    .split('\n')
    .flatMap((line, i) => (!COMMENT.test(line) && HEX.test(line) ? [i + 1] : []));
}

describe('arquitectura: sin colores hex sueltos en componentes (DX-115)', () => {
  it('solo los documentos de impresión y los ficheros de la lista llevan hex', () => {
    const hits = FILES.filter(({ rel }) => !PRINT_DOCUMENT.test(rel) && !(rel in HEX_ALLOWED)).flatMap(
      ({ rel, text }) => hexLines(text).map((line) => `${rel}:${line}`),
    );
    expect(hits).toEqual([]);
  });

  it('la lista no guarda ficheros que ya no tienen hex', () => {
    const stale = Object.keys(HEX_ALLOWED).filter((rel) => {
      const file = FILES.find((f) => f.rel === rel);
      return !file || hexLines(file.text).length === 0;
    });
    expect(stale).toEqual([]);
  });
});
