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
 * `color`: resolved via `catalogById` from the `catalogItemId` of the most
 * recent record that matters for this tooth (whole-tooth record if present,
 * else the latest of any surface record); `null` when there's no catalog
 * map, no matching id, or no relevant record.
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

    // The record that determines this tooth's color: prefer the
    // whole-tooth record (it represents the tooth as a whole, e.g. an
    // extraction), else fall back to the most recently recorded surface
    // record (last one seen in ASC iteration order).
    const colorSourceRecord =
      wholeToothRecord ??
      group.records
        .filter((r) => r.surfaces.length > 0)
        .reduce<ToothRecord | null>((_latest, r) => r, null);

    const color =
      colorSourceRecord?.catalogItemId && catalogById
        ? (catalogById.get(colorSourceRecord.catalogItemId)?.color ?? null)
        : null;

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
