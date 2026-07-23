/**
 * Local-day boundaries (`from` inclusive, `to` inclusive-end-of-day) as UTC
 * ISO instants for `GET /appointments?from&to`. Extracted from `AgendaView`
 * (originally `agenda/page.tsx`) so it's unit-testable on its own — same
 * convention as `projectOdontogram` living in `src/lib/odontogram/projection.ts`
 * rather than inline in the component that uses it.
 */
export function localDayRange(date: string): { from: string; to: string } {
  return {
    from: new Date(`${date}T00:00:00`).toISOString(),
    to: new Date(`${date}T23:59:59.999`).toISOString(),
  };
}
