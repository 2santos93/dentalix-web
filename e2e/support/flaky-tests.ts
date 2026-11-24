/**
 * DX-419 (TST-051): tests de Playwright intermitentes conocidos.
 *
 * Antes la CI reintentaba TODOS los tests una vez (`retries: 1`): un fallo
 * nuevo se escondía como «flaky». Ahora `e2e/flaky-tests.json` es la ÚNICA
 * lista de tests que se pueden reintentar, y solo en la CI, una vez:
 *
 * - Cada entrada: `file` (`e2e/x.spec.ts`), `title` (el título completo del
 *   informe: los describe y el test unidos por « › », como en
 *   e2e/allowed-skips.json; `*` = todos los del fichero), `ticket` (DX-NNN),
 *   `clickup` (enlace de la tarea), `expires` (AAAA-MM-DD, como mucho
 *   MAX_HORIZON_DAYS días) y `reason`.
 * - `validateFlakyList` la comprueba; scripts/flaky-tests.test.ts la corre en
 *   `jest --ci` con la fecha UTC de la CI: una entrada caducada o mal formada
 *   pone la CI en rojo.
 * - `withFlakyRetries` (playwright.config.ts) parte cada proyecto en dos: el de
 *   siempre, sin reintentos y sin los tests de la lista (`grepInvert`), y
 *   `<proyecto>-reintento`, solo con ellos (`grep`) y `retries: 1`. Un test que
 *   no está en la lista nunca se reintenta. Con la lista vacía, los proyectos
 *   quedan como estaban.
 * - scripts/check-e2e-skips.mjs nombra en el resumen de cada run la lista y los
 *   que se reintentaron, y pone rojo un «flaky» que no esté en ella.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Una entrada vigente nunca dura más que esto: el arreglo no se aplaza sin fin. */
export const MAX_HORIZON_DAYS = 90;
/** Reintentos de un test de la lista en la CI. */
export const FLAKY_RETRIES = 1;
export const RETRY_PROJECT_SUFFIX = '-reintento';
/** Todos los tests del fichero. */
export const WHOLE_FILE = '*';
const SEP = ' › ';

export interface FlakyEntry {
  file: string;
  title: string;
  ticket: string;
  clickup: string;
  expires: string;
  reason: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TICKET_RE = /^DX-\d{3,}(-[a-z]+)?$/;
const CLICKUP_RE = /^https:\/\/app\.clickup\.com\/t\/[A-Za-z0-9_-]+$/;
const SPEC_RE = /^e2e\/.+\.spec\.ts$/;

/** Fecha UTC (AAAA-MM-DD): la de la máquina de la CI. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function isRealDay(day: string): boolean {
  if (!DATE_RE.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && utcDay(parsed) === day;
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return utcDay(d);
}

export interface FlakyValidation {
  /** Lo que pone la CI en rojo (formato, caducidad, fichero inexistente). */
  problems: string[];
  /** Entradas válidas y vigentes: las únicas que se reintentan. */
  active: FlakyEntry[];
}

export function validateFlakyList(
  raw: unknown,
  { today, fileExists }: { today: string; fileExists: (file: string) => boolean },
): FlakyValidation {
  const problems: string[] = [];
  const active: FlakyEntry[] = [];
  const entries =
    raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown }).entries)
      ? (raw as { entries: Partial<FlakyEntry>[] }).entries
      : null;
  if (!entries) return { problems: ['la lista debe ser un objeto con «entries»: [...]'], active };
  const horizon = addDays(today, MAX_HORIZON_DAYS);
  const seen = new Set<string>();
  entries.forEach((entry, i) => {
    const where = `entrada ${i + 1}${typeof entry?.file === 'string' ? ` (${entry.file})` : ''}`;
    const own: string[] = [];
    const str = (key: keyof FlakyEntry): string | null => {
      const value = entry?.[key];
      if (typeof value !== 'string' || value.trim() === '') {
        own.push(`${where}: falta «${key}»`);
        return null;
      }
      return value;
    };
    const file = str('file');
    const title = str('title');
    const ticket = str('ticket');
    const clickup = str('clickup');
    const expires = str('expires');
    str('reason');
    if (file !== null) {
      if (!SPEC_RE.test(file)) own.push(`${where}: «file» debe ser un spec de Playwright (e2e/….spec.ts)`);
      else if (!fileExists(file)) own.push(`${where}: el fichero no existe (¿se movió o se borró? quita la entrada)`);
    }
    if (ticket !== null && !TICKET_RE.test(ticket)) own.push(`${where}: «ticket» debe ser DX-NNN (es «${ticket}»)`);
    if (clickup !== null && !CLICKUP_RE.test(clickup)) {
      own.push(`${where}: «clickup» debe ser https://app.clickup.com/t/<id>`);
    }
    if (expires !== null) {
      if (!isRealDay(expires)) own.push(`${where}: «expires» no es una fecha AAAA-MM-DD`);
      else if (expires < today) {
        own.push(
          `${where}: caducó el ${expires} (hoy es ${today}, UTC). Arregla el test (${ticket ?? 'sin ticket'}) y quita la entrada, o, si sigue pendiente, renueva la fecha con un motivo nuevo.`,
        );
      } else if (expires > horizon) {
        own.push(`${where}: «expires» (${expires}) pasa de ${MAX_HORIZON_DAYS} días (como mucho ${horizon})`);
      }
    }
    if (file !== null && title !== null) {
      const key = `${file}${SEP}${title}`;
      if (seen.has(key)) own.push(`${where}: repetida`);
      seen.add(key);
    }
    problems.push(...own);
    if (own.length === 0) active.push(entry as FlakyEntry);
  });
  return { problems, active };
}

/** Lee y valida `e2e/flaky-tests.json` desde la raíz de la web. */
export function loadFlakyList(root: string, today = utcDay(new Date())): FlakyValidation {
  const file = path.join(root, 'e2e', 'flaky-tests.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { problems: [`no se pudo leer ${file}: ${err instanceof Error ? err.message : String(err)}`], active: [] };
  }
  return validateFlakyList(raw, { today, fileExists: (f) => existsSync(path.join(root, f)) });
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Etiquetas (`@tag`) que Playwright mete tras cada título al filtrar. */
const TAGS = '(?: @\\S+)*';

/**
 * Patrón para `grep`/`grepInvert` de un proyecto. Playwright lo prueba contra
 * « <proyecto> <fichero relativo a testDir> <describe…> <test> <@tags…>»
 * (separados por espacios), así que se casa el fichero y el título completos,
 * anclados, para que el mismo nombre en otro describe o fichero no cuente.
 */
export function flakyGrep(entries: FlakyEntry[], testDir = 'e2e'): RegExp | undefined {
  if (entries.length === 0) return undefined;
  const prefix = `${testDir.replace(/\/+$/, '')}/`;
  const alternatives = entries.map((e) => {
    const file = e.file.startsWith(prefix) ? e.file.slice(prefix.length) : e.file;
    const head = `(?:^| )${escapeRegExp(file)}${TAGS}`;
    if (e.title === WHOLE_FILE) return `${head} `;
    const parts = e.title.split(SEP).map((p) => ` ${escapeRegExp(p)}${TAGS}`);
    return `${head}${parts.join('')}$`;
  });
  return new RegExp(alternatives.map((a) => `(?:${a})`).join('|'));
}

interface ProjectLike {
  name?: string;
  grep?: unknown;
  grepInvert?: unknown;
  retries?: number;
}

/**
 * Cada proyecto, sin los tests de la lista y sin reintentos, más su gemelo
 * `<nombre>-reintento` solo con ellos y `retries` (en la CI). Sin entradas,
 * los proyectos tal cual. Un proyecto con su propio grep/grepInvert no se
 * parte (no pasa hoy; se avisa con un error para no mezclar filtros).
 */
export function withFlakyRetries<P extends ProjectLike>(
  projects: P[],
  entries: FlakyEntry[],
  { retries }: { retries: number },
): P[] {
  const grep = flakyGrep(entries);
  if (!grep) return projects;
  return projects.flatMap((project) => {
    if (project.grep !== undefined || project.grepInvert !== undefined) {
      throw new Error(
        `DX-419: el proyecto «${project.name}» ya tiene grep/grepInvert; no se puede partir para la lista de intermitentes.`,
      );
    }
    return [
      { ...project, grepInvert: grep, retries: 0 },
      { ...project, name: `${project.name}${RETRY_PROJECT_SUFFIX}`, grep, retries },
    ];
  });
}
