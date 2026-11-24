/**
 * @jest-environment node
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MAX_HORIZON_DAYS,
  flakyGrep,
  utcDay,
  validateFlakyList,
  withFlakyRetries,
  type FlakyEntry,
} from '../e2e/support/flaky-tests';

/**
 * DX-419 (TST-051): la lista de tests de Playwright intermitentes
 * (e2e/flaky-tests.json) y el reparto de proyectos que hace que SOLO ellos se
 * reintenten. El test «la lista versionada es válida hoy» es la puerta de la
 * CI: con la fecha UTC del runner, una entrada caducada o mal formada lo pone
 * en rojo.
 */
const ROOT = path.join(__dirname, '..');
const TODAY = '2026-11-24';

const entry = (over: Partial<FlakyEntry> = {}): FlakyEntry => ({
  file: 'e2e/agenda.spec.ts',
  title: 'Agenda › crea una cita',
  ticket: 'DX-419',
  clickup: 'https://app.clickup.com/t/1244errrke0',
  expires: '2026-12-31',
  reason: 'carrera conocida',
  ...over,
});

const validate = (entries: unknown[], exists = true) =>
  validateFlakyList({ entries }, { today: TODAY, fileExists: () => exists });

describe('e2e/flaky-tests.json (DX-419)', () => {
  it('la lista versionada es válida hoy (fecha UTC de la CI): caducada = rojo', () => {
    const raw: unknown = JSON.parse(readFileSync(path.join(ROOT, 'e2e', 'flaky-tests.json'), 'utf8'));
    const result = validateFlakyList(raw, {
      today: utcDay(new Date()),
      fileExists: (f) => existsSync(path.join(ROOT, f)),
    });
    expect(result.problems).toEqual([]);
  });

  it('acepta una entrada completa y vigente (también el día que caduca)', () => {
    expect(validate([entry()])).toEqual({ problems: [], active: [entry()] });
    expect(validate([entry({ expires: TODAY })]).problems).toEqual([]);
  });

  it('una entrada caducada es un problema y no se reintenta', () => {
    const r = validate([entry({ expires: '2026-11-23' })]);
    expect(r.active).toEqual([]);
    expect(r.problems).toEqual([expect.stringMatching(/caducó el 2026-11-23 \(hoy es 2026-11-24, UTC\)/)]);
  });

  it(`no admite caducidades de más de ${MAX_HORIZON_DAYS} días`, () => {
    expect(validate([entry({ expires: '2027-02-22' })]).problems).toEqual([]);
    expect(validate([entry({ expires: '2027-02-23' })]).problems).toEqual([expect.stringMatching(/pasa de 90 días/)]);
  });

  it('exige ticket DX-NNN, enlace de ClickUp, motivo, fecha real y un spec de e2e/ que exista', () => {
    const r = validate([
      entry({ ticket: 'TST-051' }),
      entry({ title: 'b', clickup: 'https://example.com/t/1' }),
      entry({ title: 'c', reason: '' }),
      entry({ title: 'd', expires: '2026-02-30' }),
      entry({ title: 'e', file: 'src/a.test.ts' }),
    ]);
    expect(r.active).toEqual([]);
    expect(r.problems).toEqual([
      expect.stringMatching(/«ticket» debe ser DX-NNN/),
      expect.stringMatching(/«clickup» debe ser/),
      expect.stringMatching(/falta «reason»/),
      expect.stringMatching(/«expires» no es una fecha/),
      expect.stringMatching(/spec de Playwright/),
    ]);
    expect(validate([entry()], false).problems).toEqual([expect.stringMatching(/el fichero no existe/)]);
  });

  it('rechaza repetidas y una lista sin «entries»', () => {
    expect(validate([entry(), entry()]).problems).toEqual([expect.stringMatching(/repetida/)]);
    expect(validateFlakyList([], { today: TODAY, fileExists: () => true }).problems).toEqual([
      expect.stringMatching(/«entries»/),
    ]);
  });
});

describe('flakyGrep: casa el título que Playwright filtra (« proyecto fichero describe… test @tags»)', () => {
  const grep = flakyGrep([entry({ title: 'Agenda › crea una cita (390 px) [a|b]' })])!;

  it('casa el test exacto, con o sin etiquetas, en cualquier proyecto', () => {
    expect(grep.test(' chromium agenda.spec.ts Agenda crea una cita (390 px) [a|b]')).toBe(true);
    expect(grep.test(' chromium-reintento agenda.spec.ts Agenda @lento crea una cita (390 px) [a|b] @tag')).toBe(true);
  });

  it('no casa el mismo nombre en otro fichero, otro describe ni un título más largo', () => {
    expect(grep.test(' chromium otra-agenda.spec.ts Agenda crea una cita (390 px) [a|b]')).toBe(false);
    expect(grep.test(' chromium agenda.spec.ts Otra crea una cita (390 px) [a|b]')).toBe(false);
    expect(grep.test(' chromium agenda.spec.ts Agenda crea una cita (390 px) [a|b] y más')).toBe(false);
  });

  it('«*» casa todo el fichero y nada más', () => {
    const whole = flakyGrep([entry({ title: '*' })])!;
    expect(whole.test(' chromium agenda.spec.ts Agenda lo que sea')).toBe(true);
    expect(whole.test(' chromium agenda.spec.ts.bak Agenda lo que sea')).toBe(false);
  });

  it('sin entradas no hay patrón', () => {
    expect(flakyGrep([])).toBeUndefined();
  });
});

describe('withFlakyRetries: un test fuera de la lista nunca se reintenta', () => {
  const projects = [
    { name: 'chromium', use: {} },
    { name: 'touch', testMatch: /touch/ },
  ];

  it('con la lista vacía los proyectos quedan igual (y el config pone retries: 0)', () => {
    expect(withFlakyRetries(projects, [], { retries: 1 })).toBe(projects);
    const config = readFileSync(path.join(ROOT, 'playwright.config.ts'), 'utf8');
    expect(config).toMatch(/^\s*retries: 0,$/m);
    expect(config).toContain('projects: withFlakyRetries(');
  });

  it('con entradas: cada proyecto sin ellas y sin reintentos, y su gemelo «-reintento» solo con ellas', () => {
    const out = withFlakyRetries(projects, [entry()], { retries: 1 });
    const grep = flakyGrep([entry()]);
    expect(out).toEqual([
      { name: 'chromium', use: {}, grepInvert: grep, retries: 0 },
      { name: 'chromium-reintento', use: {}, grep, retries: 1 },
      { name: 'touch', testMatch: /touch/, grepInvert: grep, retries: 0 },
      { name: 'touch-reintento', testMatch: /touch/, grep, retries: 1 },
    ]);
  });

  it('no parte un proyecto que ya filtra por grep', () => {
    expect(() => withFlakyRetries([{ name: 'x', grep: /a/ }], [entry()], { retries: 1 })).toThrow(/DX-419/);
  });
});

describe('scripts de shell sin la carrera de `| grep -q` con pipefail (DX-419)', () => {
  // Con `set -o pipefail`, `cmd | grep -q x` falla (141, SIGPIPE) si `grep`
  // encuentra la línea y sale mientras `cmd` aún escribe: así falló una vez el
  // humo de la imagen («el arranque no registró los plazos» con la línea en el
  // log). Se captura la salida y se busca después (logs_have en web.sh).
  const shellScripts = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? shellScripts(path.join(dir, d.name)) : d.name.endsWith('.sh') ? [path.join(dir, d.name)] : [],
    );

  it.each(shellScripts(path.join(ROOT, 'scripts')).map((f) => path.relative(ROOT, f)))('%s', (file) => {
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    if (!/pipefail/.test(text)) return;
    const offenders = text
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => !line.trim().startsWith('#') && /\|\s*grep\s+(-\w*q|--quiet)/.test(line));
    expect(offenders).toEqual([]);
  });
});
