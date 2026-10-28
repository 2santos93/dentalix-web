import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

/**
 * DX-316: calendario de días hábiles y festivos de una sede (spec §6). Solo
 * ADMIN; el resto recibe 403. Las fechas son días civiles 'YYYY-MM-DD'.
 * Un 400 trae `message` como texto o como el array de class-validator: los
 * dos llegan a `ApiError.messages`.
 */
export type LocationCalendar = components['schemas']['LocationCalendarDto'];
export type LocationHoliday = components['schemas']['LocationHolidayDto'];
export type HolidayImportResult = components['schemas']['HolidayImportResultDto'];
export type HolidayImportRow = components['schemas']['HolidayImportRowDto'];

type HolidayInput = { date: string; name: string; recurring: boolean };

function base(locationId: string): string {
  return `/locations/${encodeURIComponent(locationId)}`;
}

function holidayPath(locationId: string, holidayId: string): string {
  return `${base(locationId)}/holidays/${encodeURIComponent(holidayId)}`;
}

/** Copia de `fileForm` de `patient-imports-api.ts` (no exportada): el fichero va en el campo `file`. */
function fileForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

/** `GET /locations/:id/calendar`: días hábiles y festivos vivos, ya ordenados. */
export function getLocationCalendar(token: string, locationId: string): Promise<LocationCalendar> {
  return apiFetch<LocationCalendar>(`${base(locationId)}/calendar`, { token });
}

/** `PUT /locations/:id/calendar/working-weekdays`: 0 = domingo … 6 = sábado, al menos uno. */
export function setWorkingWeekdays(token: string, locationId: string, days: number[]): Promise<LocationCalendar> {
  return apiFetch<LocationCalendar>(`${base(locationId)}/calendar/working-weekdays`, {
    method: 'PUT',
    body: { workingWeekdays: days },
    token,
  });
}

/** `POST /locations/:id/holidays`. Un día ya ocupado es 409 `HOLIDAY_ALREADY_EXISTS`. */
export function createHoliday(token: string, locationId: string, input: HolidayInput): Promise<LocationHoliday> {
  return apiFetch<LocationHoliday>(`${base(locationId)}/holidays`, { method: 'POST', body: input, token });
}

/** `PATCH /locations/:id/holidays/:holidayId`: solo los campos que cambian. */
export function updateHoliday(
  token: string,
  locationId: string,
  holidayId: string,
  patch: Partial<HolidayInput>,
): Promise<LocationHoliday> {
  return apiFetch<LocationHoliday>(holidayPath(locationId, holidayId), { method: 'PATCH', body: patch, token });
}

/** `DELETE /locations/:id/holidays/:holidayId`: lo retira (204 sin cuerpo). */
export async function deleteHoliday(token: string, locationId: string, holidayId: string): Promise<void> {
  await apiFetchOrNull<null>(holidayPath(locationId, holidayId), { method: 'DELETE', token });
}

/**
 * `POST /locations/:id/holidays/import/preview`: clasifica el .csv o .ics sin
 * escribir nada. También puede ser 409 `LOCATION_HOLIDAY_LIMIT` (spec I1).
 */
export function previewHolidayImport(token: string, locationId: string, file: File): Promise<HolidayImportResult> {
  return apiFetch<HolidayImportResult>(`${base(locationId)}/holidays/import/preview`, {
    method: 'POST',
    body: fileForm(file),
    token,
  });
}

/** `POST /locations/:id/holidays/import`: crea los nuevos; lo repetido se omite (idempotente). */
export function importHolidays(token: string, locationId: string, file: File): Promise<HolidayImportResult> {
  return apiFetch<HolidayImportResult>(`${base(locationId)}/holidays/import`, {
    method: 'POST',
    body: fileForm(file),
    token,
  });
}
