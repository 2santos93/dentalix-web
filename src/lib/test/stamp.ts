import { regionalFormat } from '@/lib/format/regional-format';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { stampPainters, type SedePainters } from '@/lib/locations/sede-stamp';
import { clinicLocation } from './locations';
import { caracasSede, testAgendaClock } from './sede-clock';

/** Los pintores de sede con estas sedes (la primera es la de la pantalla): para probar ayudantes de `lib/**` (DX-354b). */
export function testStamp(locations?: ClinicLocation[], activeLocationId?: string | null): SedePainters {
  return stampPainters(testAgendaClock(locations, activeLocationId));
}

/**
 * Las tres sedes de las pruebas de pantalla (DX-354b, criterio 2). Jest corre
 * con TZ=UTC, así que ninguna es la del entorno: una pantalla que usara la hora
 * del navegador (o la de otra sede) saldría distinta de la esperada.
 * - Caracas: `America/Caracas`, `es-VE`, 12 h, USD (la sede de la pantalla).
 * - Berlín: `Europe/Berlin`, `de-DE`, 24 h, EUR.
 * - Miami: `America/New_York`, `en-US`, 12 h, USD (la tercera: la sede de la fila).
 */
export const STAMP_SEDES = {
  caracas: caracasSede({ id: 'sede-caracas', name: 'Caracas' }),
  berlin: clinicLocation({
    id: 'sede-berlin',
    name: 'Berlín',
    timeZone: 'Europe/Berlin',
    locale: 'de-DE',
    hourCycle: 'h23',
    currency: 'EUR',
  }),
  miami: clinicLocation({
    id: 'sede-miami',
    name: 'Miami',
    timeZone: 'America/New_York',
    locale: 'en-US',
    hourCycle: 'h12',
    currency: 'USD',
  }),
};

/** Los formatos esperados, calculados con `regionalFormat` (nunca cadenas a ojo). */
export const STAMP_FORMATS = {
  caracas: regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }),
  berlin: regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }),
  miami: regionalFormat({ locale: 'en-US', hourCycle: 'h12' }),
};

/** El instante `iso` tal como lo pinta cada sede (fecha y hora), para las aserciones. */
export function dateTimeIn(sede: keyof typeof STAMP_SEDES, iso: string): string {
  return STAMP_FORMATS[sede].dateTime(new Date(iso), STAMP_SEDES[sede].timeZone ?? 'UTC');
}
export function dateIn(sede: keyof typeof STAMP_SEDES, iso: string): string {
  return STAMP_FORMATS[sede].date(new Date(iso), STAMP_SEDES[sede].timeZone ?? 'UTC');
}
export function timeIn(sede: keyof typeof STAMP_SEDES, iso: string): string {
  return STAMP_FORMATS[sede].time(new Date(iso), STAMP_SEDES[sede].timeZone ?? 'UTC');
}
