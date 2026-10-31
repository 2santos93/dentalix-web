import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import allowlist from './native-date-inputs.allowlist.json';

/**
 * UX System v2 (DESIGN.md → Dates and times): nada de `<input type="date">`,
 * `type="time"` ni `type="datetime-local"`. El navegador los pinta en SU
 * idioma, no en el de la clínica: una recepcionista con Chrome en inglés ve
 * mm/dd/yyyy y el 04/05 cambia de mes — en una historia clínica es un fallo
 * de seguridad del paciente. Se usan `DateField`, `DatePicker`,
 * `DateRangePicker` y `TimeField` de `src/components/ui`.
 *
 * `native-date-inputs.allowlist.json` congela los ficheros que aún los usan
 * (cuántos por fichero) y SOLO PUEDE ENCOGER: un fichero nuevo, o uno con más
 * que su cupo, hace fallar la prueba; uno que ya migró (o bajó su cuenta)
 * también, hasta que se actualiza la lista.
 */
const SRC = join(__dirname, '..');
const NATIVE_DATE_TYPE = /\btype=(?:"|'|\{\s*['"`])(?:date|time|datetime-local)(?:"|'|['"`]\s*\})/g;

function tsxSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : tsxSources(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

/** Las primitivas de `components/ui` son el único sitio donde vivirían (hoy, ninguno). */
function isPrimitive(file: string): boolean {
  return file.startsWith(['src', 'components', 'ui', ''].join(sep));
}

export function countNativeDateInputs(source: string): number {
  return [...source.matchAll(NATIVE_DATE_TYPE)].length;
}

function currentCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const path of tsxSources(SRC)) {
    const file = relative(join(SRC, '..'), path);
    if (isPrimitive(file)) continue;
    const count = countNativeDateInputs(readFileSync(path, 'utf8'));
    if (count > 0) counts[file.split(sep).join('/')] = count;
  }
  return counts;
}

describe('UX v2: sin campos de fecha/hora nativos', () => {
  it('el detector reconoce las formas de escribirlo', () => {
    expect(countNativeDateInputs('<Input id="a" type="date" value={x} />')).toBe(1);
    expect(countNativeDateInputs("<input type='time' />")).toBe(1);
    expect(countNativeDateInputs("<Input type={'datetime-local'} />")).toBe(1);
    expect(countNativeDateInputs('<Input type="text" /> <Input type="number" />')).toBe(0);
    expect(countNativeDateInputs('<DateField id="dob" value={v} />')).toBe(0);
  });

  it('ningún fichero nuevo, ni más de su cupo (la lista solo encoge)', () => {
    const allowed = allowlist as Record<string, number>;
    const current = currentCounts();
    const over = Object.entries(current)
      .filter(([file, count]) => count > (allowed[file] ?? 0))
      .map(([file, count]) => `${file}: ${count} (cupo ${allowed[file] ?? 0}) — usa DateField/DatePicker/TimeField`);
    expect(over).toEqual([]);
  });

  it('la lista no guarda cupo de más: al migrar un fichero se baja o se quita su entrada', () => {
    const allowed = allowlist as Record<string, number>;
    const current = currentCounts();
    const stale = Object.entries(allowed)
      .filter(([file, count]) => (current[file] ?? 0) < count)
      .map(([file, count]) => `${file}: cupo ${count}, quedan ${current[file] ?? 0}`);
    expect(stale).toEqual([]);
  });
});
