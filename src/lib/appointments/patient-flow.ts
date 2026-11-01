import { apiFetch } from '@/lib/api/client';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { locationRegionalFormat } from '@/lib/locations/location-settings';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { Appointment, AppointmentStatus } from './appointments-api';
import { canExitCompleted } from './plan-item-reservations';

/**
 * DX-200: flujo del paciente en la clínica — llegó (en espera), en sillón y
 * listo para cobrar — y el panel «En clínica» de la sede. Los permisos copian
 * los de la API (`domain/patient-flow.ts`): aquí solo deciden qué botones se
 * PINTAN; el servidor responde 403/409 a cualquier otro intento.
 */
export type InClinicView = components['schemas']['InClinicViewDto'];
export type InClinicItem = components['schemas']['InClinicItemDto'];
export type Punctuality = InClinicItem['punctuality'];

export const IN_CLINIC_STATUSES = ['ARRIVED', 'IN_CHAIR', 'READY_FOR_CHECKOUT'] as const;

export function isInClinic(status: AppointmentStatus): boolean {
  return (IN_CLINIC_STATUSES as readonly string[]).includes(status);
}

/** Cada cuánto se refresca el panel (DX-200: sondeo de 30–60 s, sin WebSocket). */
export const IN_CLINIC_POLL_MS = 45_000;

const IN_CLINIC_CHANGED = 'dentalix:in-clinic-changed';

/**
 * Aviso de esta pestaña: una cita entró, cambió o salió del flujo. Lo escucha
 * el contador «Te esperan N» de la cabecera, que si no esperaría al siguiente
 * sondeo (hasta 45 s) para dejar de contar a quien ya pasó al sillón.
 */
export function notifyInClinicChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(IN_CLINIC_CHANGED));
}

/** Suscripción a {@link notifyInClinicChanged}; devuelve la baja. */
export function onInClinicChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(IN_CLINIC_CHANGED, listener);
  return () => window.removeEventListener(IN_CLINIC_CHANGED, listener);
}

export type FlowAction = 'ARRIVE' | 'SEAT' | 'READY' | 'CHECKOUT' | 'UNDO_ARRIVAL';

export const FLOW_ACTION_LABELS: Record<FlowAction, string> = {
  ARRIVE: 'Llegó',
  SEAT: 'En sillón',
  READY: 'Listo para cobrar',
  CHECKOUT: 'Completar',
  UNDO_ARRIVAL: 'Deshacer llegada',
};

/** El estado al que lleva cada botón («Deshacer llegada» tiene su propia ruta). */
export const FLOW_ACTION_STATUS: Record<Exclude<FlowAction, 'UNDO_ARRIVAL'>, AppointmentStatus> = {
  ARRIVE: 'ARRIVED',
  SEAT: 'IN_CHAIR',
  READY: 'READY_FOR_CHECKOUT',
  CHECKOUT: 'COMPLETED',
};

/** Llegada, salida y «Deshacer llegada»: el mostrador. */
const FRONT_DESK: readonly ClinicRole[] = ['RECEPTION', 'ASSISTANT', 'ADMIN'];
/** En sillón y listo para cobrar: quien atiende. */
const CHAIRSIDE: readonly ClinicRole[] = ['DENTIST', 'ASSISTANT', 'ADMIN'];

/**
 * Los botones rápidos de una cita: el paso siguiente del flujo que el rol
 * puede dar. «Llegó» solo el día de la cita (`isToday`).
 */
export function flowActions(
  status: AppointmentStatus,
  role: ClinicRole | null,
  isToday: boolean,
): FlowAction[] {
  if (role === null) return [];
  const frontDesk = FRONT_DESK.includes(role);
  const chairside = CHAIRSIDE.includes(role);
  switch (status) {
    case 'SCHEDULED':
    case 'CONFIRMED':
      return frontDesk && isToday ? ['ARRIVE'] : [];
    case 'ARRIVED':
      return [
        ...(chairside ? (['SEAT'] as const) : []),
        ...(frontDesk ? (['UNDO_ARRIVAL'] as const) : []),
      ];
    case 'IN_CHAIR':
      return [
        ...(chairside ? (['READY'] as const) : []),
        ...(frontDesk ? (['CHECKOUT'] as const) : []),
      ];
    case 'READY_FOR_CHECKOUT':
      return frontDesk ? ['CHECKOUT'] : [];
    default:
      return [];
  }
}

const CLASSIC_STATUSES: AppointmentStatus[] = [
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

/**
 * Opciones del selector de estado. Fuera del flujo, las de siempre (la
 * llegada se marca con «Llegó»); dentro, su estado y la salida: completar, o
 * cancelar si se fue sin pasar al sillón. Nunca «No asistió» desde el flujo.
 * DX-273: una cita completada solo la sacan de «Completada» el odontólogo y
 * la administración (con motivo); para el resto, solo su estado. Sin `role`
 * (quien no lo conoce), las de siempre: el servidor decide.
 */
export function statusOptionsFor(
  status: AppointmentStatus,
  role?: ClinicRole | null,
): AppointmentStatus[] {
  if (status === 'COMPLETED' && role !== undefined && !canExitCompleted(role)) {
    return ['COMPLETED'];
  }
  if (status === 'ARRIVED') return ['ARRIVED', 'COMPLETED', 'CANCELLED'];
  if (status === 'IN_CHAIR' || status === 'READY_FOR_CHECKOUT') return [status, 'COMPLETED'];
  return CLASSIC_STATUSES;
}

const PUNCTUALITY_LABELS: Record<Punctuality, string> = {
  ON_TIME: 'a tiempo',
  LATE: 'hasta 5 min tarde',
  VERY_LATE: 'más de 5 min tarde',
};

export function punctualityLabel(p: Punctuality): string {
  return PUNCTUALITY_LABELS[p];
}

export function inClinicCount(view: Pick<InClinicView, 'waiting' | 'inChair' | 'readyForCheckout'>): number {
  return view.waiting.length + view.inChair.length + view.readyForCheckout.length;
}

export function waitingForYouLabel(n: number): string {
  return n === 1 ? 'Te espera 1 paciente' : `Te esperan ${n} pacientes`;
}

/** La hora de un instante en la zona y con el reloj de la sede (todos ven la hora de la clínica). */
export function timeInZone(iso: string, timeZone: string, fmt: RegionalFormat): string {
  return fmt.time(new Date(iso), timeZone);
}

/**
 * El formato con el que se pinta el panel: el `locale` y el reloj que la API
 * manda en la vista (G1-B). `null` si faltan o no son válidos (API antigua,
 * sede sin configurar): el panel muestra `SedeConfigError`, nunca otro formato.
 */
export function inClinicFormat(view: Pick<InClinicView, 'locale' | 'hourCycle'>): RegionalFormat | null {
  return locationRegionalFormat(view);
}

/**
 * `GET /appointments/in-clinic`: el panel de una sede (X-Location-Id), hoy en
 * su zona. La sede va explícita: en una clínica de una sede no hay sede
 * activa elegida, y sin cabecera la API responde 400.
 */
export async function getInClinic(token: string, locationId: string): Promise<InClinicView> {
  return apiFetch<InClinicView>('/appointments/in-clinic', {
    token,
    headers: { 'X-Location-Id': locationId },
  });
}

/**
 * `POST /appointments/:id/undo-arrival`: vuelve al estado previo y borra la
 * hora. DX-509: `keepOverbooked` deja en sobrecupo, a sabiendas, una urgencia
 * cuya hora ya ocupa otra cita (tras el 409 `OVERBOOK_SLOT_TAKEN`).
 */
export async function undoArrival(
  token: string,
  id: string,
  options: { keepOverbooked?: boolean } = {},
): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${id}/undo-arrival`, {
    method: 'POST',
    token,
    ...(options.keepOverbooked ? { body: { keepOverbooked: true } } : {}),
  });
}
