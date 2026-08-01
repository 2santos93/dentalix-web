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
 * `POST /staff/invitations` — issues a new invitation and returns it together
 * with the raw `token` (only ever exposed here, at creation time) so the
 * caller can build the shareable invitation link.
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
 * `DELETE /staff/invitations/:id` — revokes a pending invitation. The
 * backend returns `204` with an EMPTY body, which `apiFetch`'s `res.json()`
 * would throw on (same situation as `deactivateStaff` in `staff-api.ts`) —
 * use `apiFetchOrNull` and discard the (always-null) result.
 */
export async function revokeInvitation(token: string, id: string): Promise<void> {
  await apiFetchOrNull<null>(`/staff/invitations/${id}`, {
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
 * activates their staff membership, returning a fresh access/refresh pair so
 * the accept page can log them straight in. Public endpoint: no session
 * `token` is sent.
 */
export async function acceptInvitation(
  inviteToken: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  return apiFetch<{ accessToken: string; refreshToken: string }>(
    `/public/invitations/${inviteToken}/accept`,
    {
      method: 'POST',
      body: { password },
    },
  );
}
