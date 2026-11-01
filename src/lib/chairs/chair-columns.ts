import type { Chair, ChairSummary } from './chairs-api';

/** Id de la columna «Sin sillón» (no es un uuid: no choca con ningún sillón). */
export const NO_CHAIR_COLUMN = 'sin-sillon';

const copy = {
  noChair: 'Sin sillón',
  inactive: (name: string) => `${name} (inactivo)`,
};

export interface ChairColumn {
  id: string;
  label: string;
}

/** «Sillón 1», o «Sillón 1 (inactivo)» si se desactivó después de la cita. */
export function chairDisplayName(chair: ChairSummary): string {
  return chair.active ? chair.name : copy.inactive(chair.name);
}

function byOrder(a: Chair, b: Chair): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es');
}

/**
 * Columnas de la vista Día por sillón (DX-211): los activos en su orden; los
 * desactivados solo si tienen citas ese día (sus citas se siguen viendo, con
 * «(inactivo)»); y al final «Sin sillón».
 */
export function chairColumns(
  chairs: readonly Chair[],
  appointments: readonly { chairId?: string | null }[],
): ChairColumn[] {
  const used = new Set(appointments.map((a) => a.chairId).filter(Boolean));
  const active = chairs.filter((c) => c.active).sort(byOrder);
  const inactive = chairs.filter((c) => !c.active && used.has(c.id)).sort(byOrder);
  return [
    ...active.map((c) => ({ id: c.id, label: c.name })),
    ...inactive.map((c) => ({ id: c.id, label: copy.inactive(c.name) })),
    { id: NO_CHAIR_COLUMN, label: copy.noChair },
  ];
}

/** La columna de una cita en la vista por sillón. */
export function chairColumnOf(appointment: { chairId?: string | null }): string {
  return appointment.chairId ?? NO_CHAIR_COLUMN;
}

/**
 * Al elegir un sillón en la cita: si el profesional está vacío, se propone el
 * suyo por defecto (si sigue en el personal). Nunca sobrescribe un
 * profesional ya elegido (la API aplica la misma precedencia).
 */
export function proposeProvider(
  currentProviderId: string,
  chair: Pick<Chair, 'defaultProviderId'> | null,
  staffIds: readonly string[],
): string {
  if (currentProviderId !== '') return currentProviderId;
  const proposed = chair?.defaultProviderId ?? null;
  return proposed !== null && staffIds.includes(proposed) ? proposed : currentProviderId;
}

/** Sube (`-1`) o baja (`+1`) un sillón un puesto; en los bordes no cambia. */
export function moveChairInOrder(ids: readonly string[], id: string, step: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export type ColumnsBy = 'providers' | 'chairs';

const COLUMNS_BY_KEY = (userId: string) => `dentalix.agenda.columnsBy.${userId}`;

/**
 * «Columnas: Profesionales | Sillones» se recuerda por usuario en este
 * navegador. Es una comodidad: si el almacenamiento falla o está bloqueado,
 * se vuelve a los profesionales sin romper nada.
 */
export function readColumnsBy(userId: string | null): ColumnsBy {
  if (!userId) return 'providers';
  try {
    return window.localStorage.getItem(COLUMNS_BY_KEY(userId)) === 'chairs' ? 'chairs' : 'providers';
  } catch {
    return 'providers';
  }
}

export function writeColumnsBy(userId: string | null, value: ColumnsBy): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(COLUMNS_BY_KEY(userId), value);
  } catch {
    // Sin almacenamiento la preferencia dura lo que la pantalla: no es un error.
  }
}
