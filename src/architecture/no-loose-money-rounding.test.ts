import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import allowlist from './no-loose-money-rounding.allowlist.json';

/**
 * DX-488-bis: ningún importe se redondea «a mano». Cada `Math.round(x * 100)`,
 * `toFixed(…)` o `toPrecision(…)` sobre un importe vive en `src/lib/money/round.ts`
 * (`amountCents`, `roundAmount`, `amountText`…), la misma regla que la API
 * (DX-340/DX-488, `no-loose-money-rounding.spec.ts`). Así lo que se pinta y lo
 * que se envía no se separa porque un modal redondee a su manera.
 *
 * Detecta, en el código que `git ls-files` lista bajo `src` (se ejecuta DESPUÉS
 * del commit; un fichero sin añadir no se ve): `Math.round|floor|trunc|ceil(…)`
 * cuyo argumento escala por 100, 1000, 10000, `1e2`, `10 ** n`, `Math.pow(10, n)` o `/ 0.01`, y cualquier `.toFixed(` o
 * `.toPrecision(`. Solo `src/lib/money/round.ts` (el helper) queda fuera: el resto
 * de `src/lib/money` se vigila como cualquier fichero.
 *
 * Lo que no es dinero (progreso, mg, ratios, tasas) se lista en
 * `no-loose-money-rounding.allowlist.json` con fichero, función, cuántos y por
 * qué. La lista SOLO PUEDE ENCOGER: un sitio nuevo, o uno de más, falla; un
 * cupo que ya no se usa también, hasta que se actualiza.
 */
const ROOT = join(__dirname, '..', '..');
const MATH_ROUNDING = /Math\.(?:round|floor|trunc|ceil)\(/g;
// Factor de céntimos escrito de cualquier forma: ×100/1000/10000, ×1e2, 10 ** n, Math.pow(10, n), / 0.01.
const SCALE_100 =
  /\*\s*(?:100|1000|10000)\b|\*\s*1e[1-4]\b|\b10\s*\*\*|Math\.pow\(\s*10\b|\/\s*(?:0?\.0+1\b|1e-\d)/;
const TO_FIXED = /\.(?:toFixed|toPrecision)\(/g;
const TOP_LEVEL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*[=:]/;

export interface Site {
  file: string;
  fn: string;
  line: number;
  kind: 'math' | 'toFixed';
}

/** Lo que hay entre el paréntesis que abre en `open` y su pareja. */
function argumentOf(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return source.slice(open + 1, i);
  }
  return source.slice(open + 1);
}

function enclosingFunction(lines: string[], lineIndex: number): string {
  for (let i = lineIndex; i >= 0; i--) {
    const match = lines[i].match(TOP_LEVEL);
    if (match) return match[1] ?? match[2];
  }
  return '<module>';
}

export function findRoundingSites(file: string, source: string): Site[] {
  const lines = source.split('\n');
  const lineOf = (offset: number) => source.slice(0, offset).split('\n').length;
  const sites: Site[] = [];
  for (const m of source.matchAll(MATH_ROUNDING)) {
    const at = m.index ?? 0;
    if (SCALE_100.test(argumentOf(source, at + m[0].length - 1))) {
      const line = lineOf(at);
      sites.push({ file, fn: enclosingFunction(lines, line - 1), line, kind: 'math' });
    }
  }
  for (const m of source.matchAll(TO_FIXED)) {
    const line = lineOf(m.index ?? 0);
    sites.push({ file, fn: enclosingFunction(lines, line - 1), line, kind: 'toFixed' });
  }
  return sites;
}

function trackedSources(): string[] {
  const out = execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && !/\.(?:test|spec)\.tsx?$/.test(f) && !f.endsWith('.d.ts'))
    .filter((f) => f !== 'src/lib/money/round.ts');
}

function currentSites(): Site[] {
  return trackedSources().flatMap((file) => findRoundingSites(file, readFileSync(join(ROOT, file), 'utf8')));
}

interface Entry {
  file: string;
  fn: string;
  count: number;
  why: string;
}
const allowed = allowlist as Entry[];
const keyOf = (s: { file: string; fn: string }) => `${s.file} :: ${s.fn}`;

function countsBy(sites: Site[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sites) counts.set(keyOf(s), (counts.get(keyOf(s)) ?? 0) + 1);
  return counts;
}

describe('DX-488-bis: sin redondeos de importes sueltos', () => {
  it('el detector reconoce las formas de redondear un importe', () => {
    const f = (src: string) => findRoundingSites('x.ts', src).length;
    expect(f('const a = Math.round(x * 100) / 100;')).toBe(1);
    expect(f('const a = Math.round(\n  (a - b) * 100,\n) / 100;')).toBe(1);
    expect(f('const a = Math.floor(x*1000);')).toBe(1);
    expect(f('const a = Math.trunc(price * 100);')).toBe(1);
    expect(f('const a = x.toFixed(2);')).toBe(1);
    expect(f('const a = x.toPrecision(4);')).toBe(1);
    expect(f('const a = Math.round(x * 1e2) / 1e2;')).toBe(1);
    expect(f('const a = Math.round(x * 10 ** digits);')).toBe(1);
    expect(f('const a = Math.round(x * Math.pow(10, digits));')).toBe(1);
    expect(f('const a = Math.round(x / 0.01);')).toBe(1);
    expect(f('const a = Math.floor(minute / 60);')).toBe(0);
    expect(f('const a = amountCents(x) + roundAmount(y);')).toBe(0);
  });

  it('ningún redondeo suelto fuera de la lista (la lista solo encoge)', () => {
    const counts = countsBy(currentSites());
    const quota = new Map(allowed.map((e) => [keyOf(e), e.count]));
    const over = [...counts]
      .filter(([key, n]) => n > (quota.get(key) ?? 0))
      .map(([key, n]) => `${key}: ${n} (cupo ${quota.get(key) ?? 0}) — usa amountCents/roundAmount/amountText de @/lib/money/round`);
    expect(over).toEqual([]);
  });

  it('la lista no guarda cupo de más ni entradas sin motivo', () => {
    const counts = countsBy(currentSites());
    const stale = allowed
      .filter((e) => (counts.get(keyOf(e)) ?? 0) !== e.count)
      .map((e) => `${keyOf(e)}: cupo ${e.count}, hay ${counts.get(keyOf(e)) ?? 0}`);
    expect(stale).toEqual([]);
    expect(allowed.filter((e) => e.why.trim().length < 10).map(keyOf)).toEqual([]);
  });
});
