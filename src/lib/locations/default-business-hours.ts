import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeMinuteRanges } from './sede-clock';

/**
 * DX-533: el horario de alta de una sede (el de la API,
 * `src/shared/locations/default-business-hours.ts`). En una sede sin horario,
 * «Buscar hueco» propone solo dentro de él (`defaultHours` en la respuesta),
 * aunque la agenda acepta cualquier hora.
 */
const WEEKDAYS = [
  { startMinute: 9 * 60, endMinute: 13 * 60 },
  { startMinute: 15 * 60, endMinute: 19 * 60 },
];
const SATURDAY = [{ startMinute: 9 * 60, endMinute: 13 * 60 }];

/** «lunes a viernes 09:00–13:00, 15:00–19:00; sábados 09:00–13:00» con el reloj de la sede. */
export function defaultHoursLabel(fmt: RegionalFormat): string {
  return `lunes a viernes ${sedeMinuteRanges(WEEKDAYS, fmt)}; sábados ${sedeMinuteRanges(SATURDAY, fmt)}`;
}

/** El aviso de «Buscar hueco» y «Mover a…» cuando la sede no tiene horario. */
export function defaultHoursNote(fmt: RegionalFormat): string {
  return `Esta sede no tiene horario: los huecos se buscan en el horario de alta (${defaultHoursLabel(fmt)}). A otra hora puedes agendar eligiéndola a mano; el horario lo configura un administrador en Ajustes › Horarios.`;
}
