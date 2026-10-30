import type { ClinicLocation } from '@/lib/locations/locations-api';
import { sedeClockFor, type AgendaClock } from '@/lib/locations/sede-clock';
import { clinicLocation } from './locations';

/**
 * Sede de prueba con el reloj del entorno de Jest (UTC, 24 h): las pruebas que
 * no tratan del reloj conservan sus horas. Las que sí, fijan la suya con
 * `overrides` (p. ej. Caracas en 12 h) y comprueban que no se usa la del
 * navegador.
 */
export function utcSede(overrides: Partial<ClinicLocation> = {}): ClinicLocation {
  return clinicLocation({ timeZone: 'UTC', locale: 'es-CO', hourCycle: 'h23', ...overrides });
}

/** Sede de Caracas (UTC−4) en 12 h: el reloj de las pruebas de DX-378. */
export function caracasSede(overrides: Partial<ClinicLocation> = {}): ClinicLocation {
  return clinicLocation({ timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12', ...overrides });
}

/** El reloj de la agenda con estas sedes (la primera es la de la pantalla). */
export function testAgendaClock(
  locations: ClinicLocation[] = [utcSede()],
  activeLocationId: string | null = locations[0]?.id ?? null,
): AgendaClock {
  const result = sedeClockFor(locations, activeLocationId);
  if (result.status !== 'ready') throw new Error(`Sede de prueba sin reloj: ${result.message}`);
  return result.clock;
}
