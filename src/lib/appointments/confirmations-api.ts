import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type ConfirmationLink = components['schemas']['ConfirmationLinkDto'];
export type ConfirmationAppointment = components['schemas']['PublicConfirmationAppointmentDto'];
export type PublicConfirmation = components['schemas']['PublicAppointmentConfirmationDto'];
export type ConfirmationAction = components['schemas']['RespondAppointmentConfirmationDto']['action'];

/**
 * `POST /appointments/:id/confirmation-link` — genera el enlace público (de un
 * solo uso, caduca al inicio de la cita). El token en claro solo viaja dentro
 * de `url`, aquí; emitir otro revoca el anterior.
 */
export async function createConfirmationLink(
  token: string,
  appointmentId: string,
): Promise<ConfirmationLink> {
  return apiFetch<ConfirmationLink>(`/appointments/${appointmentId}/confirmation-link`, {
    method: 'POST',
    token,
  });
}

/**
 * `GET /public/appointment-confirmations/:token` — lo que ve el paciente.
 * Público: sin sesión. `apiFetch` igual manda `X-Tenant-Host` con el host de
 * la página, que es por donde el backend sabe de qué clínica es el enlace.
 * Solo lee: abrir el enlace no responde nada.
 */
export async function getPublicConfirmation(confirmationToken: string): Promise<PublicConfirmation> {
  return apiFetch<PublicConfirmation>(
    `/public/appointment-confirmations/${encodeURIComponent(confirmationToken)}`,
  );
}

/** `POST /public/appointment-confirmations/:token` — el segundo clic del paciente. */
export async function respondPublicConfirmation(
  confirmationToken: string,
  action: ConfirmationAction,
): Promise<PublicConfirmation> {
  return apiFetch<PublicConfirmation>(
    `/public/appointment-confirmations/${encodeURIComponent(confirmationToken)}`,
    { method: 'POST', body: { action } },
  );
}
