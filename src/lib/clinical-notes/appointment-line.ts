import { NO_SEDE_FORMAT } from '@/lib/format/sede-number';
import type { SedeClock } from '@/lib/locations/sede-clock';

/**
 * «Cita del 17/10 · Dra. Ríos» (DX-170): de qué visita es una evolución. La
 * fecha es la del inicio de la cita en la zona y con el formato de la sede
 * (DX-378); sin ellos, «—». Sin nombre del profesional (ya no es de la
 * clínica), solo la fecha.
 */
export function appointmentLine(
  start: string,
  providerName: string | null | undefined,
  clock: SedeClock | null,
): string {
  const day = clock ? clock.fmt.dayMonth(new Date(start), clock.timeZone) : NO_SEDE_FORMAT;
  return providerName ? `Cita del ${day} · ${providerName}` : `Cita del ${day}`;
}
