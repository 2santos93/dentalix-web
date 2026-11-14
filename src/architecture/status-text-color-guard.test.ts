import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * DX-487 (FE-100): los colores de estado sin sufijo (`text-warning`…) son para
 * rellenos y puntos: como texto o icono no llegan a AA (el aviso «Es de un día
 * anterior» de la agenda de contingencia quedaba a 2,0:1). Para leer, siempre
 * la variante `-text` (DESIGN.md → Status tones).
 */
const SRC = join(__dirname, '..');
const BARE_STATUS_INK = /(?<![\w-])(?:[\w-]+:)*(?:text|fill|stroke)-(?:warning|success|danger|info)(?![\w-])/g;

function sources(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('colores de estado como texto o icono (DX-487)', () => {
  it('la regla reconoce los que no llegan a AA y deja pasar los demás', () => {
    const hits = (text: string) => text.match(BARE_STATUS_INK) ?? [];
    expect(hits('text-sm text-warning')).toEqual(['text-warning']);
    expect(hits('hover:text-danger/80 fill-info')).toEqual(['hover:text-danger', 'fill-info']);
    expect(hits('text-warning-text bg-warning border-success/30 text-success-text')).toEqual([]);
  });

  it('ningún fichero los usa', () => {
    const found = sources().flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          (line.match(BARE_STATUS_INK) ?? []).map((m) => `${relative(SRC, file).split(sep).join('/')}:${i + 1} ${m}`),
        ),
    );
    expect(found).toEqual([]);
  });
});
