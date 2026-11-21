/**
 * DX-588: la lógica pura del tablero del televisor (sondeo, destacado y
 * recorte de las listas), aparte del componente para probarla sin DOM.
 */

/** Espera tras un fallo (red, 5xx, 429): 8 → 15 → 30 s, con tope de 30 s. */
const BACKOFF_SECONDS = [8, 15, 30] as const;

/** Segundos que se destaca a quien acaba de pasar a consulta. */
export const HIGHLIGHT_MS = 8_000;

/** Cada cuánto cambia el mensaje de la franja inferior. */
export const MESSAGE_ROTATION_MS = 10_000;

/** Sondeo sin fallos: `refreshSeconds` (8 s) ± 15 %, para que varias pantallas no pidan a la vez. */
export function pollDelayMs(refreshSeconds: number, random: () => number = Math.random): number {
  const base = Math.max(3, Number.isFinite(refreshSeconds) ? refreshSeconds : 8) * 1000;
  const jitter = (random() * 2 - 1) * 0.15;
  return Math.round(base * (1 + jitter));
}

/** Tras `failures` fallos seguidos (≥ 1). `retryAfterSeconds` de un 429 alarga, sin pasar del tope. */
export function backoffDelayMs(failures: number, retryAfterSeconds: number | null = null): number {
  const step = BACKOFF_SECONDS[Math.min(Math.max(failures, 1), BACKOFF_SECONDS.length) - 1];
  const cap = BACKOFF_SECONDS[BACKOFF_SECONDS.length - 1];
  const wanted = Math.max(step, retryAfterSeconds ?? 0);
  return Math.min(wanted, cap) * 1000;
}

/** Las `key` de `next` que no estaban en `previous` (en el orden de `next`). */
export function newKeys(previous: ReadonlySet<string>, next: readonly { key: string }[]): string[] {
  return next.filter((item) => !previous.has(item.key)).map((item) => item.key);
}

/**
 * Cuántas filas caben en una lista de alto `available` px, con filas de paso
 * `step` px (alto + separación). Si no caben todas, la última plaza es para
 * «y N más». Sin medidas (0, p. ej. en jsdom) se muestran todas.
 */
export function visibleCapacity(count: number, available: number, step: number): number {
  if (count <= 0) return 0;
  if (!(available > 0) || !(step > 0)) return count;
  const fit = Math.floor(available / step);
  if (fit >= count) return count;
  return Math.max(1, fit - 1);
}

/** «hace 5 min», «hace 1 h 10 min»; 0 → «Acaba de llegar». */
export function minutesAgo(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  if (m === 0) return 'Acaba de llegar';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `hace ${h} h` : `hace ${h} h ${rest} min`;
}
