import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { Appointment, AppointmentStatus } from './appointments-api';

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
 */
export function statusOptionsFor(status: AppointmentStatus): AppointmentStatus[] {
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

/** Verde / naranja / rojo: tinte semántico + texto oscuro (DESIGN.md, chips). */
export const PUNCTUALITY_CLASSES: Record<Punctuality, string> = {
  ON_TIME: 'border-success/40 bg-success/10 text-success',
  LATE: 'border-warning/40 bg-warning/10 text-warning',
  VERY_LATE: 'border-danger/40 bg-danger/10 text-danger',
};

export function inClinicCount(view: Pick<InClinicView, 'waiting' | 'inChair' | 'readyForCheckout'>): number {
  return view.waiting.length + view.inChair.length + view.readyForCheckout.length;
}

export function waitingForYouLabel(n: number): string {
  return n === 1 ? 'Te espera 1 paciente' : `Te esperan ${n} pacientes`;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

/** `HH:mm` de un instante en la zona de la sede (todos ven la hora de la clínica). */
export function timeInZone(iso: string, timeZone: string): string {
  let f = timeFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    });
    timeFormatters.set(timeZone, f);
  }
  return f.format(new Date(iso));
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

/** `POST /appointments/:id/undo-arrival`: vuelve al estado previo y borra la hora. */
export async function undoArrival(token: string, id: string): Promise<Appointment> {
  return apiFetch<Appointment>(`/appointments/${id}/undo-arrival`, {
    method: 'POST',
    token,
  });
}
