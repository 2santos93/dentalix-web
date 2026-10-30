import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';
import type { Patient } from './patients-api';

// DX-128: la API documenta el bloque con @ApiProperty, así que los tipos salen
// tal cual del contrato generado.
export type PatientOptOutMatchWarning = components['schemas']['PatientOptOutMatchWarningDto'];
export type PatientCommunication = components['schemas']['PatientCommunicationDto'];
export type UpdatePatientCommunicationInput =
  components['schemas']['UpdatePatientCommunicationDto'];
export type ContactChannel = components['schemas']['ContactChannel'];
export type WhatsappOptInSource = components['schemas']['WhatsappOptInSource'];
export type ReminderOptOutSource = components['schemas']['ReminderOptOutSource'];

/** Cambiar el canal: recepción y ADMIN (la API también lo exige: 403). */
export function canEditCommunication(role: ClinicRole | null): boolean {
  return role === 'RECEPTION' || role === 'ADMIN';
}

export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  NONE: 'Ninguno',
};

export const OPT_IN_SOURCE_LABELS: Record<WhatsappOptInSource, string> = {
  IN_PERSON: 'En persona',
  LINK: 'Por enlace',
  MESSAGE: 'Por mensaje',
};

export const OPT_OUT_SOURCE_LABELS: Record<ReminderOptOutSource, string> = {
  LINK: 'con el enlace del email',
  MESSAGE: 'respondiendo «BAJA» al mensaje',
  STAFF: 'anotada por la clínica',
};

/** `GET /patients/:id/communication`: lo ven los 4 roles. */
export async function getPatientCommunication(
  token: string,
  patientId: string,
): Promise<PatientCommunication> {
  return apiFetch<PatientCommunication>(
    `/patients/${encodeURIComponent(patientId)}/communication`,
    { token },
  );
}

/** `PATCH /patients/:id/communication`: solo recepción y ADMIN. */
export async function updatePatientCommunication(
  token: string,
  patientId: string,
  input: UpdatePatientCommunicationInput,
): Promise<PatientCommunication> {
  return apiFetch<PatientCommunication>(
    `/patients/${encodeURIComponent(patientId)}/communication`,
    { method: 'PATCH', body: input, token },
  );
}

/**
 * La ficha con lo que acaba de guardar el bloque «Comunicaciones»: el teléfono
 * (que «Datos» muestra y «Editar» siembra) y la preferencia. El resto, igual.
 */
export function withCommunication(patient: Patient, c: PatientCommunication): Patient {
  return {
    ...patient,
    phone: c.phone,
    contactChannel: c.contactChannel,
    whatsappOptInAt: c.whatsappOptIn?.at ?? null,
    whatsappOptInSource: c.whatsappOptIn?.source ?? null,
    whatsappOptInById: c.whatsappOptIn?.recordedBy?.id ?? null,
    reminderOptOutAt: c.reminderOptOut?.at ?? null,
    reminderOptOutSource: c.reminderOptOut?.source ?? null,
  };
}

/** Solo recepción y ADMIN; últimos 20 avisos bajo RLS del paciente. */
export function getPatientOptOutWarnings(
  token: string,
  patientId: string,
): Promise<PatientOptOutMatchWarning[]> {
  return apiFetch<PatientOptOutMatchWarning[]>(
    `/patients/${encodeURIComponent(patientId)}/communication/opt-out-warnings`,
    { token },
  );
}
