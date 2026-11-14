import type { AppointmentType } from '@/lib/appointments/appointment-types-api';
import type { CreateRecallContactInput, RecallContactChannel, RecallType } from './recall-api';

/**
 * DX-015-bis (D20): cómo se lee el tipo de cita enlazado a un tipo de recall,
 * con los tipos de cita de la clínica (activos e inactivos):
 * - `none`: sin enlace;
 * - `active`: el tipo sigue activo;
 * - `inactive`: desactivado después de enlazarlo;
 * - `missing`: no está entre los de la clínica (retirado) o aún no se leyeron.
 */
export type LinkedAppointmentType =
  | { kind: 'none' }
  | { kind: 'active' | 'inactive'; name: string }
  | { kind: 'missing' };

export function linkedAppointmentType(
  appointmentTypeId: string | null,
  appointmentTypes: readonly AppointmentType[] | null,
): LinkedAppointmentType {
  if (!appointmentTypeId) return { kind: 'none' };
  const found = appointmentTypes?.find((t) => t.id === appointmentTypeId);
  if (!found) return { kind: 'missing' };
  return { kind: found.active ? 'active' : 'inactive', name: found.name };
}

/**
 * D21: el tipo de cita que se prellena al agendar, solo si está entre los
 * activos que cargó el formulario. Si se retiró o desactivó, ninguno.
 */
export function prefillAppointmentTypeId(
  defaultId: string | null | undefined,
  activeTypes: readonly Pick<AppointmentType, 'id' | 'active'>[],
): string | null {
  if (!defaultId) return null;
  return activeTypes.some((t) => t.id === defaultId && t.active) ? defaultId : null;
}

/** D21: el tipo de cita del tipo de recall de una fila (`null` si no hay o no se sabe). */
export function recallAppointmentTypeId(
  recallTypeId: string | null | undefined,
  types: readonly Pick<RecallType, 'id' | 'appointmentTypeId'>[] | null,
): string | null {
  if (!recallTypeId || !types) return null;
  return types.find((t) => t.id === recallTypeId)?.appointmentTypeId ?? null;
}

/** D22: el contacto «Agendó» de una cita recién creada. La nota vacía no se manda. */
export function bookedContactInput(
  channel: RecallContactChannel,
  appointmentId: string,
  note?: string | null,
): CreateRecallContactInput {
  const trimmed = note?.trim() ?? '';
  return { channel, outcome: 'BOOKED', appointmentId, ...(trimmed ? { note: trimmed } : {}) };
}
