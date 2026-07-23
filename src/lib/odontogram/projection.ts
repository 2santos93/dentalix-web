import type { ToothGroup, ToothRecord, ToothSurface } from './odontogram-api';

/**
 * Per-tooth display state derived from its raw records. Pure projection —
 * no I/O, no React. Task 5 (SVG) consumes this.
 *
 * `hasRecords`: false for a tooth that has no records at all ("healthy" /
 * untouched) — the tooth is still present in the map (one entry per input
 * group) so callers can render every tooth uniformly without a fallback
 * branch.
 *
 * `surfaceState`: for each surface, the LATEST record (by `recordedAt`)
 * that lists that surface — "latest wins" per surface, independently.
 *
 * `wholeToothRecord`: the latest record with an EMPTY `surfaces[]` — a
 * whole-tooth record (e.g. an extraction) — tracked independently of
 * per-surface state (a tooth can have both).
 *
 * `color`: recency-based — resolved via `catalogById` from the
 * `catalogItemId` of the MOST RECENT record in the group (by `recordedAt`,
 * regardless of whether it's a whole-tooth or per-surface record) that
 * actually resolves to a catalog color. "Latest finding wins" for the
 * top-level summary color, same recency rule as `surfaceState` /
 * `wholeToothRecord` — it does NOT prefer whole-tooth over surface records.
 * `null` when there's no catalog map, or no record resolves to a color.
 */
export interface ToothState {
  toothNumber: string;
  hasRecords: boolean;
  records: ToothRecord[];
  surfaceState: Partial<Record<ToothSurface, ToothRecord>>;
  wholeToothRecord: ToothRecord | null;
  color: string | null;
}

export function projectOdontogram(
  groups: ToothGroup[],
  catalogById?: Map<string, { color: string }>,
): Map<string, ToothState> {
  const result = new Map<string, ToothState>();

  for (const group of groups) {
    const surfaceState: Partial<Record<ToothSurface, ToothRecord>> = {};
    let wholeToothRecord: ToothRecord | null = null;

    // Records arrive ASC by recordedAt (backend contract), so iterating
    // in order and overwriting on each match naturally leaves the latest
    // record in place — "latest wins" per surface / per whole-tooth slot.
    for (const rec of group.records) {
      if (rec.surfaces.length === 0) {
        wholeToothRecord = rec;
      } else {
        for (const surface of rec.surfaces) {
          surfaceState[surface] = rec;
        }
      }
    }

    // The tooth's summary color is recency-based, not whole-tooth-first:
    // scan records in ASC order (backend contract) and keep overwriting
    // with each record that resolves to a catalog color, whole-tooth or
    // per-surface alike — the last one standing is the most recent
    // record that matters, i.e. "latest finding wins".
    let color: string | null = null;
    if (catalogById) {
      for (const rec of group.records) {
        if (!rec.catalogItemId) continue;
        const resolved = catalogById.get(rec.catalogItemId)?.color;
        if (resolved) {
          color = resolved;
        }
      }
    }

    result.set(group.toothNumber, {
      toothNumber: group.toothNumber,
      hasRecords: group.records.length > 0,
      records: group.records,
      surfaceState,
      wholeToothRecord,
      color,
    });
  }

  return result;
}
