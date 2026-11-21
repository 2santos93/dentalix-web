import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-588: pantallas de sala de espera (el televisor de la sede).
//
// Los tipos salen del contrato generado (la API los documenta con @ApiProperty).
type Schemas = components['schemas'];

export type WaitingRoomNameMode = Schemas['WaitingRoomNameMode'];
export type WaitingRoomScreenDto = Schemas['WaitingRoomScreenDto'];
/** La pantalla recién creada: el token solo viaja en esta respuesta. */
export type CreatedWaitingRoomScreenDto = Schemas['CreatedWaitingRoomScreenDto'];
export type CreateWaitingRoomScreenDto = Schemas['CreateWaitingRoomScreenDto'];
export type UpdateWaitingRoomScreenDto = Schemas['UpdateWaitingRoomScreenDto'];
export type PublicWaitingRoomWaitingItemDto = Schemas['PublicWaitingRoomWaitingItemDto'];
export type PublicWaitingRoomCalledItemDto = Schemas['PublicWaitingRoomCalledItemDto'];
/**
 * El tablero. La API corta cada columna a 40 filas, pero `waitingTotal` y
 * `calledTotal` dicen cuántas hay en total (para «y N más»).
 */
export type PublicWaitingRoomBoardDto = Schemas['PublicWaitingRoomBoardDto'];

export type WaitingRoomScreen = WaitingRoomScreenDto;
export type CreatedWaitingRoomScreen = CreatedWaitingRoomScreenDto;
export type WaitingRoomBoard = PublicWaitingRoomBoardDto;

/** Código estable del 404 público (token desconocido, revocado o de otra clínica). */
export const WAITING_ROOM_SCREEN_INACTIVE = 'WAITING_ROOM_SCREEN_INACTIVE';

/** Límites que también valida la API. */
export const WAITING_ROOM_LIMITS = { nameMax: 60, messagesMax: 5, messageMax: 140 } as const;

/** Crear, editar y revocar pantallas: solo ADMIN (como la API). */
export function canManageWaitingRoomScreens(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

/** La ruta pública que abre el televisor, en el host de la clínica. */
export function waitingRoomScreenUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/sala/${encodeURIComponent(token)}`;
}

// ── Personal (ADMIN) ────────────────────────────────────────────────────────

export function listWaitingRoomScreens(token: string, locationId: string): Promise<WaitingRoomScreen[]> {
  const search = new URLSearchParams({ locationId });
  return apiFetch<WaitingRoomScreen[]>(`/waiting-room-screens?${search.toString()}`, { token });
}

export function createWaitingRoomScreen(
  token: string,
  input: CreateWaitingRoomScreenDto,
): Promise<CreatedWaitingRoomScreen> {
  return apiFetch<CreatedWaitingRoomScreen>('/waiting-room-screens', { method: 'POST', body: input, token });
}

/** 409 si ya está revocada. */
export function updateWaitingRoomScreen(
  token: string,
  id: string,
  input: UpdateWaitingRoomScreenDto,
): Promise<WaitingRoomScreen> {
  return apiFetch<WaitingRoomScreen>(`/waiting-room-screens/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    token,
  });
}

/** Idempotente: el televisor lo nota en su siguiente sondeo. */
export function revokeWaitingRoomScreen(token: string, id: string): Promise<WaitingRoomScreen> {
  return apiFetch<WaitingRoomScreen>(`/waiting-room-screens/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    token,
  });
}

// ── Pública (sin sesión; la clínica sale del host) ──────────────────────────

/** 404 `WAITING_ROOM_SCREEN_INACTIVE`: la pantalla ya no está activa. */
export function getPublicWaitingRoomBoard(screenToken: string): Promise<WaitingRoomBoard> {
  return apiFetch<WaitingRoomBoard>(`/public/waiting-room/${encodeURIComponent(screenToken)}`);
}
