import { apiFetch } from '@/lib/api/client';
import type { ClinicRole } from '@/lib/me/me-api';

// DX-588: pantallas de sala de espera (el televisor de la sede).
//
// Tipos LOCALES con los nombres de los esquemas OpenAPI previstos, hasta que
// la API publique el contrato y se regenere `schema.d.ts`; entonces pasan a
// `components['schemas'][…]` sin cambiar ningún uso.

export type WaitingRoomNameMode = 'NAME_INITIAL' | 'TURN_NUMBER';

export interface WaitingRoomScreenDto {
  id: string;
  locationId: string;
  name: string;
  nameMode: WaitingRoomNameMode;
  messages: string[];
  soundEnabled: boolean;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** La pantalla recién creada: el token solo viaja en esta respuesta. */
export interface CreatedWaitingRoomScreenDto extends WaitingRoomScreenDto {
  token: string;
}

export interface CreateWaitingRoomScreenDto {
  locationId: string;
  name: string;
  nameMode?: WaitingRoomNameMode;
  messages?: string[];
  soundEnabled?: boolean;
}

export interface UpdateWaitingRoomScreenDto {
  name?: string;
  nameMode?: WaitingRoomNameMode;
  messages?: string[];
  soundEnabled?: boolean;
}

export interface PublicWaitingRoomWaitingItemDto {
  key: string;
  label: string;
  minutesWaiting: number;
}

export interface PublicWaitingRoomCalledItemDto {
  key: string;
  label: string;
  chairName: string | null;
  providerName: string | null;
  minutesSinceCalled: number;
}

export interface PublicWaitingRoomBoardDto {
  screenName: string;
  locationName: string;
  nameMode: WaitingRoomNameMode;
  messages: string[];
  soundEnabled: boolean;
  timeZone: string;
  locale: string;
  hourCycle: string | null;
  now: string;
  refreshSeconds: number;
  waiting: PublicWaitingRoomWaitingItemDto[];
  called: PublicWaitingRoomCalledItemDto[];
}

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
