import { formatDate } from '@/lib/format/date';

/**
 * «Cita del 17/10 · Dra. Ríos» (DX-170): de qué visita es una evolución. La
 * fecha es la del inicio de la cita en la hora local; sin nombre del
 * profesional (ya no es de la clínica), solo la fecha.
 */
export function appointmentLine(start: string, providerName: string | null | undefined): string {
  const day = formatDate(start).slice(0, 5);
  return providerName ? `Cita del ${day} · ${providerName}` : `Cita del ${day}`;
}
