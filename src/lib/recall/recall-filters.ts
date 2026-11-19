import type { RecallDueFilters, RecallDueSort } from './recall-api';
import { RECALL_SOON_DAYS } from './presentation';

/**
 * DX-465: qué parte del ciclo de intentos se ve en la lista.
 * - `due`: lo de siempre, sin los ocultos tras un intento, los que rechazaron ni los agotados.
 * - `contacted`: también los ocultos y los que rechazaron («Incluir contactados»).
 * - `exhausted`: solo los que llegaron al tope de su sede («Intentos agotados»).
 */
export type RecallAttemptsFilter = 'due' | 'contacted' | 'exhausted';
export type RecallListView = 'due' | 'unconfigured';

/** Los filtros de la lista de recall, tal como viajan en la URL de `/recall`. */
export interface RecallListFilters {
  view: RecallListView;
  /** `ALL` o la `ref` de un tipo (su id o, en el respaldo, su clave). */
  typeRef: string;
  soon: boolean;
  sort: RecallDueSort;
  attempts: RecallAttemptsFilter;
  page: number;
}

export const DEFAULT_RECALL_FILTERS: RecallListFilters = {
  view: 'due',
  typeRef: 'ALL',
  soon: false,
  sort: 'MOST_OVERDUE',
  attempts: 'due',
  page: 1,
};

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | null {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

const ATTEMPTS_FROM_URL: Record<string, RecallAttemptsFilter> = { contactados: 'contacted', agotados: 'exhausted' };

/** Los filtros desde la URL; lo que no se entiende cae al valor por defecto. */
export function parseRecallFilters(params: Pick<URLSearchParams, 'get'>): RecallListFilters {
  const page = Number(params.get('page'));
  const type = params.get('tipo')?.trim();
  return {
    view: params.get('vista') === 'sin-recall' ? 'unconfigured' : 'due',
    typeRef: type ? type : 'ALL',
    soon: params.get('ventana') === 'proximos',
    sort: params.get('orden') === 'menos' ? 'LEAST_OVERDUE' : 'MOST_OVERDUE',
    attempts: ATTEMPTS_FROM_URL[oneOf(params.get('intentos'), ['contactados', 'agotados'] as const) ?? ''] ?? 'due',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** La query de `/recall` con esos filtros (sin los valores por defecto); vacía si no hay ninguno. */
export function recallFiltersQuery(filters: RecallListFilters): string {
  const search = new URLSearchParams();
  if (filters.view === 'unconfigured') search.set('vista', 'sin-recall');
  if (filters.typeRef !== 'ALL') search.set('tipo', filters.typeRef);
  if (filters.soon) search.set('ventana', 'proximos');
  if (filters.sort === 'LEAST_OVERDUE') search.set('orden', 'menos');
  if (filters.attempts === 'contacted') search.set('intentos', 'contactados');
  if (filters.attempts === 'exhausted') search.set('intentos', 'agotados');
  if (filters.page > 1) search.set('page', String(filters.page));
  return search.toString();
}

/** Lo que el filtro de intentos pide a `GET /recall/due`. */
export function attemptsQuery(attempts: RecallAttemptsFilter): Pick<RecallDueFilters, 'includeContacted' | 'exhausted'> {
  if (attempts === 'contacted') return { includeContacted: true };
  if (attempts === 'exhausted') return { exhausted: true };
  return {};
}

/** La ventana de vencimiento que se pide a la API. */
export function windowQuery(soon: boolean): Pick<RecallDueFilters, 'withinDays'> {
  return soon ? { withinDays: RECALL_SOON_DAYS } : {};
}
