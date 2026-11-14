import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type ConfirmationLink = components['schemas']['ConfirmationLinkDto'];
export type ConfirmationAppointment = components['schemas']['PublicConfirmationAppointmentDto'];
export type PublicConfirmation = components['schemas']['PublicAppointmentConfirmationDto'];
export type ConfirmationAction = components['schemas']['RespondAppointmentConfirmationDto']['action'];
export type PublicCancellationPolicy = components['schemas']['PublicCancellationPolicyDto'];
export type PublicWantsEarlierInput = components['schemas']['PublicWantsEarlierDto'];
export type EarlierWindow = NonNullable<PublicWantsEarlierInput['preferredWindow']>;

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

/**
 * `POST /public/appointment-confirmations/:token` — el segundo clic del
 * paciente. DX-291: manda la versión de la política que mostró la página
 * (`null` si ninguna) y, al cancelar, si el paciente la aceptó.
 */
export async function respondPublicConfirmation(
  confirmationToken: string,
  action: ConfirmationAction,
  policy: { policyVersionId: string | null; acknowledgePolicy?: boolean } = { policyVersionId: null },
): Promise<PublicConfirmation> {
  return apiFetch<PublicConfirmation>(
    `/public/appointment-confirmations/${encodeURIComponent(confirmationToken)}`,
    {
      method: 'POST',
      body: {
        action,
        policyVersionId: policy.policyVersionId,
        ...(policy.acknowledgePolicy ? { acknowledgePolicy: true } : {}),
      },
    },
  );
}

/**
 * DX-437: `POST /public/appointment-confirmations/:token/wants-earlier` — el
 * paciente pide (o quita) que le avisen si se libera un hueco antes, con su
 * franja. Vale con el enlace pendiente o ya respondido. Devuelve la vista
 * fresca, con `appointment.wantsEarlier` y `earlierWindow`.
 */
export async function setPublicWantsEarlier(
  confirmationToken: string,
  input: PublicWantsEarlierInput,
): Promise<PublicConfirmation> {
  return apiFetch<PublicConfirmation>(
    `/public/appointment-confirmations/${encodeURIComponent(confirmationToken)}/wants-earlier`,
    { method: 'POST', body: input },
  );
}
