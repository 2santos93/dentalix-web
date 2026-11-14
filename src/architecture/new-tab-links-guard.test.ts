import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * DX-118 (FE-036): un enlace que abre pestaña nueva lo avisa a quien no lo ve.
 * Eso lo hace `ExternalLink` (`src/components/shared/external-link.tsx`) una
 * vez por todas; un `target="_blank"` suelto en otro fichero es un enlace sin
 * aviso. Solo el componente puede escribirlo.
 */
const SRC = join(__dirname, '..');
const OWNER = 'components/shared/external-link.tsx';

function tsxFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(path);
    return entry.name.endsWith('.tsx') && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

export function newTabHits(rel: string, text: string): string[] {
  return text
    .split('\n')
    .flatMap((line, i) => (/target=["'{]_blank/.test(line) || /target=\{?["']_blank/.test(line) ? [`${rel}:${i + 1}`] : []));
}

describe('enlaces en pestaña nueva (DX-118)', () => {
  it('detecta target="_blank" en cualquiera de sus formas', () => {
    expect(newTabHits('x.tsx', '<a target="_blank" />\n<a target={"_blank"} />\n<ExternalLink href="/x" />')).toEqual([
      'x.tsx:1',
      'x.tsx:2',
    ]);
  });

  it('fuera de ExternalLink nadie abre pestaña nueva a mano', () => {
    const hits = tsxFiles()
      .map((file) => relative(SRC, file).split(sep).join('/'))
      .filter((rel) => rel !== OWNER)
      .flatMap((rel) => newTabHits(rel, readFileSync(join(SRC, rel), 'utf8')));
    expect(hits).toEqual([]);
  });
});
