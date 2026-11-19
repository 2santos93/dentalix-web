import { apiFetch } from '@/lib/api/client';
import { ApiError } from '@/lib/api/api-error';
import type { components } from '@/lib/api/schema';

/**
 * DX-562: citas en serie («cada N semanas»). Cliente de las cinco rutas de
 * `/appointments/series`: vista previa, crear, cancelar «esta y las
 * siguientes», vista previa de mover y mover. Los textos de las razones los
 * manda la API (`reasons[].message`, los mismos de la cita suelta): aquí no se
 * traduce ningún código.
 */

export type SeriesPreviewInput = components['schemas']['PreviewAppointmentSeriesDto'];
export type CreateSeriesInput = components['schemas']['CreateAppointmentSeriesDto'];
export type CancelSeriesInput = components['schemas']['CancelAppointmentSeriesDto'];
export type MoveSeriesInput = components['schemas']['MoveAppointmentSeriesDto'];
export type SeriesPreview = components['schemas']['AppointmentSeriesPreviewDto'];
export type SeriesPreviewOccurrence = components['schemas']['SeriesPreviewOccurrenceDto'];
export type SeriesConflictReason = components['schemas']['SeriesConflictReasonDto'];
export type SeriesConflictItem = components['schemas']['SeriesConflictItemDto'];
export type SeriesNotifySkipReason = components['schemas']['SeriesNotifySkipReason'];
export type AppointmentSeriesRef = components['schemas']['AppointmentSeriesRefDto'];
export type CreatedAppointmentSeries = components['schemas']['CreatedAppointmentSeriesDto'];
export type AppointmentSeriesChange = components['schemas']['AppointmentSeriesChangeDto'];

/** 409 de crear o mover: alguna fecha ya no está libre (con la lista). */
export const APPOINTMENT_SERIES_CONFLICT = 'APPOINTMENT_SERIES_CONFLICT';
/** 409 de cancelar o mover: otra persona cambió alguna cita de la serie a la vez. */
export const APPOINTMENT_SERIES_STALE = 'APPOINTMENT_SERIES_STALE';

export {
  SERIES_COUNT_MAX,
  SERIES_COUNT_MIN,
  SERIES_INTERVAL_MAX,
  SERIES_INTERVAL_MIN,
} from './series-limits';

function locationHeaders(locationId?: string) {
  return locationId ? { headers: { 'X-Location-Id': locationId } } : {};
}

function seriesPath(seriesId: string, rest: string): string {
  return `/appointments/series/${encodeURIComponent(seriesId)}/${rest}`;
}

/** `POST /appointments/series/preview`: no escribe nada. */
export function previewAppointmentSeries(
  token: string,
  input: SeriesPreviewInput,
  locationId?: string,
): Promise<SeriesPreview> {
  return apiFetch<SeriesPreview>('/appointments/series/preview', {
    method: 'POST',
    body: input,
    token,
    ...locationHeaders(locationId),
  });
}

/**
 * `POST /appointments/series`: todas las citas o ninguna. Un 409
 * `APPOINTMENT_SERIES_CONFLICT` trae en `ApiError.seriesConflicts` las fechas
 * que chocan, con el `index` de la vista previa.
 */
export function createAppointmentSeries(
  token: string,
  input: CreateSeriesInput,
  locationId?: string,
): Promise<CreatedAppointmentSeries> {
  return apiFetch<CreatedAppointmentSeries>('/appointments/series', {
    method: 'POST',
    body: input,
    token,
    ...locationHeaders(locationId),
  });
}

/** `POST /appointments/series/:id/cancel`: cancela la cita y las siguientes pendientes. */
export function cancelAppointmentSeries(
  token: string,
  seriesId: string,
  input: CancelSeriesInput,
): Promise<AppointmentSeriesChange> {
  return apiFetch<AppointmentSeriesChange>(seriesPath(seriesId, 'cancel'), {
    method: 'POST',
    body: input,
    token,
  });
}

/** `POST /appointments/series/:id/move/preview`: cómo quedarían la cita y las siguientes. */
export function previewMoveAppointmentSeries(
  token: string,
  seriesId: string,
  input: MoveSeriesInput,
): Promise<SeriesPreview> {
  return apiFetch<SeriesPreview>(seriesPath(seriesId, 'move/preview'), {
    method: 'POST',
    body: input,
    token,
  });
}

/** `POST /appointments/series/:id/move`: mueve la cita y las siguientes, todas o ninguna. */
export function moveAppointmentSeries(
  token: string,
  seriesId: string,
  input: MoveSeriesInput,
): Promise<AppointmentSeriesChange> {
  return apiFetch<AppointmentSeriesChange>(seriesPath(seriesId, 'move'), {
    method: 'POST',
    body: input,
    token,
  });
}

/** Las fechas del 409 `APPOINTMENT_SERIES_CONFLICT`, o `null` si el error es otro. */
export function seriesConflictsOf(err: unknown): readonly SeriesConflictItem[] | null {
  return err instanceof ApiError && err.status === 409 && err.code === APPOINTMENT_SERIES_CONFLICT
    ? (err.seriesConflicts ?? [])
    : null;
}

/** El 409 `APPOINTMENT_SERIES_STALE`: hay que recargar la agenda y repetir. */
export function isSeriesStale(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && err.code === APPOINTMENT_SERIES_STALE;
}

/**
 * Por qué no salió el email de la serie, en palabras de recepción (`null` si
 * se envió o si no hace falta decir nada: `DISABLED` es la casilla desmarcada).
 */
export const SERIES_NOTIFY_REASON_LABELS: Record<SeriesNotifySkipReason, string | null> = {
  DISABLED: null,
  OPTED_OUT: 'El paciente se dio de baja de los avisos por email.',
  CHANNEL_NONE: 'El paciente no recibe avisos.',
  CHANNEL_WHATSAPP: 'El paciente recibe los avisos por WhatsApp, no por email.',
  NO_EMAIL: 'El paciente no tiene email (ni su responsable).',
  QUOTA: 'Se alcanzó el límite de emails de hoy: no se envió el aviso.',
  UNAVAILABLE: 'No se pudo preparar el email del aviso.',
};

/** La serie de una cita como «Serie · 3 de 6» (sin total: «Serie · 3»). */
export function seriesLabel(series: AppointmentSeriesRef): string {
  return series.total ? `Serie · ${series.index} de ${series.total}` : `Serie · ${series.index}`;
}

/** Una cita de la serie que aún se puede cancelar o mover «con las siguientes». */
export function isPendingSeriesStatus(status: string): boolean {
  return status === 'SCHEDULED' || status === 'CONFIRMED';
}
