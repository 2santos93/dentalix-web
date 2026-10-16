import { apiFetch, apiFetchOrNull } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';

export type Invitation = components['schemas']['InvitationDto'];
export type CreatedInvitation = components['schemas']['CreatedInvitationDto'];
export type CreateInvitationInput = components['schemas']['CreateInvitationDto'];
export type PublicInvitation = components['schemas']['PublicInvitationDto'];
export type InvitationStatus = Invitation['status'];

/** `GET /staff/invitations` — invitations issued for the current tenant. */
export async function listInvitations(token: string): Promise<Invitation[]> {
  return apiFetch<Invitation[]>('/staff/invitations', {
    token,
  });
}

/**
 * `POST /staff/invitations` — issues a new invitation and queues its email
 * (sent in the background, DX-088). DX-029: the token is NOT returned — the
 * link only travels by email to the invitee. `emailDelivery` is `PENDING`
 * when the email was queued, `null` when it couldn't be.
 */
export async function createInvitation(
  token: string,
  input: CreateInvitationInput,
): Promise<CreatedInvitation> {
  return apiFetch<CreatedInvitation>('/staff/invitations', {
    method: 'POST',
    body: input,
    token,
  });
}

/**
 * `POST /staff/invitations/:id/resend` — «Reenviar invitación» (DX-088): la
 * misma invitación con un token nuevo (el enlace anterior deja de servir), 7
 * días más y un email nuevo. Devuelve `emailDelivery` (el token solo va en el
 * email, DX-029).
 */
export async function resendInvitation(token: string, id: string): Promise<CreatedInvitation> {
  return apiFetch<CreatedInvitation>(`/staff/invitations/${encodeURIComponent(id)}/resend`, {
    method: 'POST',
    token,
  });
}

/**
 * `DELETE /staff/invitations/:id` — revokes a pending invitation. The
 * backend returns `204` with an EMPTY body, which `apiFetch`'s `res.json()`
 * would throw on (same situation as `deactivateStaff` in `staff-api.ts`) —
 * use `apiFetchOrNull` and discard the (always-null) result.
 */
export async function revokeInvitation(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/staff/invitations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * `GET /public/invitations/:token` — looks up an invitation by its raw token
 * for the public accept-invitation page. Public endpoint: no session
 * `token` is sent (the invitee isn't logged in yet). `apiFetch` still
 * attaches `X-Tenant-Host` from `window.location.host`, so the clinic
 * travels automatically even without auth.
 */
export async function getPublicInvitation(inviteToken: string): Promise<PublicInvitation> {
  return apiFetch<PublicInvitation>(`/public/invitations/${inviteToken}`);
}

/**
 * `POST /public/invitations/:token/accept` — sets the invitee's password and
 * activates their staff membership, opening a session so the accept page can
 * log them straight in: the refresh token arrives in the HttpOnly session
 * cookie (DX-062) and the access token in the body. Public endpoint: no
 * session `token` is sent.
 */
export async function acceptInvitation(
  inviteToken: string,
  password: string,
): Promise<{ accessToken: string }> {
  return apiFetch<{ accessToken: string }>(`/public/invitations/${inviteToken}/accept`, {
    method: 'POST',
    body: { password },
  });
}
