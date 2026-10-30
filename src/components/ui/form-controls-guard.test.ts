import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/*
 * Guardián de UX System v2 (formularios): fuera de `src/components/ui` ningún
 * componente pinta un control de formulario crudo. Los selects van por
 * `NativeSelect`, los textos largos por `Textarea`, las casillas por
 * `Checkbox`/`Switch` y las opciones exclusivas por `RadioGroup`
 * (`RadioOption`/`RadioCard`). Cada copia a mano llevaba su propia receta de
 * clases y ninguna pintaba `aria-invalid` (code-audit §1).
 *
 * Cuando nació quedaban ~250 controles crudos en ~120 ficheros, a la espera de
 * la ola de migración. Por eso es un TRINQUETE, no una prohibición:
 * `form-controls-allowlist.json` congela, por fichero y por tipo, cuántos
 * quedan. El test falla si
 *   - un fichero que no está en la lista pinta uno nuevo, o
 *   - un fichero de la lista pinta MÁS de los que tenía;
 * y también si un fichero tiene MENOS de los que dice la lista, para que la
 * lista solo pueda encoger: la migración de cada carpeta baja sus números (o
 * borra la entrada) en el mismo commit. Para reescribirla tras migrar:
 *   UPDATE_FORM_CONTROLS_ALLOWLIST=1 npx jest form-controls-guard
 * que solo baja números — nunca añade ficheros ni sube cuentas.
 * La meta es un JSON vacío `{}`; entonces este test pasa a ser una prohibición.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const UI_DIR = join(SRC, 'components', 'ui') + sep;
const ALLOWLIST_PATH = join(__dirname, 'form-controls-allowlist.json');

const KINDS = {
  select: /<select\b/g,
  textarea: /<textarea\b/g,
  checkbox: /\btype=(?:"checkbox"|'checkbox'|\{\s*['"]checkbox['"]\s*\})/g,
  radio: /\btype=(?:"radio"|'radio'|\{\s*['"]radio['"]\s*\})/g,
} as const;
type Kind = keyof typeof KINDS;
type Counts = Partial<Record<Kind, number>>;
type Allowlist = Record<string, Counts>;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

function countRawControls(source: string): Counts {
  const counts: Counts = {};
  for (const kind of Object.keys(KINDS) as Kind[]) {
    const n = source.match(KINDS[kind])?.length ?? 0;
    if (n > 0) counts[kind] = n;
  }
  return counts;
}

function scan(): Allowlist {
  const found: Allowlist = {};
  for (const file of sources(SRC)) {
    if (file.startsWith(UI_DIR)) continue;
    const counts = countRawControls(readFileSync(file, 'utf8'));
    if (Object.keys(counts).length > 0) found[relative(ROOT, file).split(sep).join('/')] = counts;
  }
  return found;
}

const allowlist: Allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));

describe('UX v2: sin controles de formulario crudos fuera de src/components/ui', () => {
  it('el detector reconoce cada tipo', () => {
    expect(countRawControls('<select id="a">')).toEqual({ select: 1 });
    expect(countRawControls('<select\n  value={x}>')).toEqual({ select: 1 });
    expect(countRawControls('<textarea rows={3} />')).toEqual({ textarea: 1 });
    expect(countRawControls('<input type="checkbox" />')).toEqual({ checkbox: 1 });
    expect(countRawControls("<input type={'checkbox'} />")).toEqual({ checkbox: 1 });
    expect(countRawControls('<input\n  type="radio"\n  name="x" />')).toEqual({ radio: 1 });
    // Los primitivos no saltan.
    expect(countRawControls('<NativeSelect id="a"><option /></NativeSelect>')).toEqual({});
    expect(countRawControls('<Textarea /> <Checkbox label="x" /> <RadioOption value="a" label="A" />')).toEqual({});
    expect(countRawControls('<selector />')).toEqual({});
  });

  it('ningún fichero suma controles crudos y la lista solo encoge', () => {
    const found = scan();
    const grown: string[] = [];
    const stale: string[] = [];
    const shrunk: Allowlist = {};

    for (const [file, counts] of Object.entries(found)) {
      for (const kind of Object.keys(counts) as Kind[]) {
        const now = counts[kind] ?? 0;
        const allowed = allowlist[file]?.[kind] ?? 0;
        if (now > allowed) {
          grown.push(
            `${file}: ${now} <${kind}> crudo(s), permitido(s) ${allowed} — usa el primitivo de src/components/ui (DESIGN.md → Form Controls)`,
          );
        }
      }
    }
    for (const [file, counts] of Object.entries(allowlist)) {
      const kept: Counts = {};
      for (const kind of Object.keys(counts) as Kind[]) {
        const now = found[file]?.[kind] ?? 0;
        const allowed = counts[kind] ?? 0;
        if (now < allowed) stale.push(`${file}: ${kind} ${allowed} → ${now} (baja el número en form-controls-allowlist.json)`);
        const keep = Math.min(now, allowed);
        if (keep > 0) kept[kind] = keep;
      }
      if (Object.keys(kept).length > 0) shrunk[file] = kept;
    }

    if (process.env.UPDATE_FORM_CONTROLS_ALLOWLIST === '1' && stale.length > 0) {
      const sorted = Object.fromEntries(Object.entries(shrunk).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
      stale.length = 0;
    }

    expect(grown).toEqual([]);
    expect(stale).toEqual([]);
  });
});
