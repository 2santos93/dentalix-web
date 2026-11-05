/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * DX-494 (TST-061): ningún workflow de la web cancela una run de main. Tres
 * merges se quedaron sin CI porque el push siguiente cancelaba la run en
 * curso. Un `cancel-in-progress` solo puede ser `false` o una expresión que
 * dependa de que el evento sea un `pull_request`; `true`, o una condición
 * sobre la rama (`github.ref != 'refs/heads/main'`, que cancela también un
 * `workflow_dispatch` o una rama), no valen.
 */
const WORKFLOWS_DIR = path.join(__dirname, '..', '.github', 'workflows');
const yaml = createRequire(__filename)('js-yaml') as { load(src: string): unknown };

type Concurrency = string | { group?: string; 'cancel-in-progress'?: unknown } | undefined;
interface Workflow {
  concurrency?: Concurrency;
  jobs?: Record<string, { concurrency?: Concurrency }>;
}

/** `true` si el valor no puede cancelar fuera de un pull_request. */
function cancelsOnlyInPullRequests(value: unknown): boolean {
  if (value === undefined || value === false) return true;
  if (value === true) return false;
  if (typeof value !== 'string') return false;
  const expr = value.trim().replace(/^\$\{\{|\}\}$/g, '').trim();
  if (expr === 'false') return true;
  // Solo se acepta la igualdad con 'pull_request' (sola o con `&&` y otras
  // condiciones) y sin `||`, que reabriría la cancelación en otro evento.
  return /^github\.event_name\s*==\s*'pull_request'(\s*&&[^|]+)?$/.test(expr);
}

function violations(file: string, wf: Workflow): string[] {
  const out: string[] = [];
  const check = (where: string, c: Concurrency) => {
    if (c && typeof c === 'object' && !cancelsOnlyInPullRequests(c['cancel-in-progress'])) {
      out.push(`${file} ${where}: cancel-in-progress ${JSON.stringify(c['cancel-in-progress'])} sin condición de pull_request`);
    }
  };
  check('concurrency', wf.concurrency);
  for (const [name, job] of Object.entries(wf.jobs ?? {})) check(`jobs.${name}.concurrency`, job?.concurrency);
  return out;
}

describe('workflows de la web: cancel-in-progress', () => {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));

  it('hay workflows que revisar', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'e2e.yml']));
  });

  it.each(files)('%s no cancela fuera de un pull_request', (file) => {
    const wf = yaml.load(readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8')) as Workflow;
    expect(violations(file, wf)).toEqual([]);
  });

  it('ci.yml en main: el grupo lleva el sha del push', () => {
    const wf = yaml.load(readFileSync(path.join(WORKFLOWS_DIR, 'ci.yml'), 'utf8')) as Workflow;
    const group = (wf.concurrency as { group: string }).group;
    expect(group).toContain('github.sha');
  });

  describe('el detector', () => {
    it.each([
      [true, false],
      ["${{ github.ref != 'refs/heads/main' }}", false],
      ["${{ github.event_name == 'pull_request' || true }}", false],
      ['${{ github.event_name != \'pull_request\' }}', false],
      ['${{ inputs.x }}', false],
      [false, true],
      [undefined, true],
      ["${{ github.event_name == 'pull_request' }}", true],
      ["${{ github.event_name == 'pull_request' && github.ref != 'refs/heads/main' }}", true],
    ])('%p -> %p', (value, ok) => {
      expect(cancelsOnlyInPullRequests(value)).toBe(ok);
    });

    it('detecta un workflow con cancel-in-progress: true', () => {
      const wf = yaml.load('concurrency:\n  group: g\n  cancel-in-progress: true\njobs: {}\n') as Workflow;
      expect(violations('x.yml', wf)).toHaveLength(1);
    });
  });
});
