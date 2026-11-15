import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { readJwtClaims } from '@/lib/auth/jwt-claims';
import { indexedDbKv } from './offline-kv';
import {
  createOfflineVault,
  type OfflineVault,
  type ReadExpectations,
  type UnlockResult,
  type VaultStatus,
} from './offline-vault';
import { forgetOfflinePages } from './service-worker';

/** La agenda de hoy y mañana de una sede, tal cual la da la API (DX-405). */
export type OfflineAgenda = components['schemas']['OfflineAgendaDto'];
export type OfflineAgendaAppointment = components['schemas']['OfflineAgendaAppointmentDto'];
export type { UnlockResult, VaultStatus };

/** `GET /locations/:id/contingency-agenda/offline` — auditada en la API. */
export function fetchOfflineAgenda(token: string, locationId: string): Promise<OfflineAgenda> {
  return apiFetch<OfflineAgenda>(`/locations/${encodeURIComponent(locationId)}/contingency-agenda/offline`, { token });
}

/** Dueño de la copia: usuario y clínica del access token; `null` si no se lee. */
export function offlineOwnerOf(token: string | null | undefined): { owner: string; tenantId: string } | null {
  const claims = readJwtClaims(token);
  if (!claims || typeof claims.sub !== 'string' || typeof claims.tenantId !== 'string') return null;
  return { owner: `${claims.sub}|${claims.tenantId}`, tenantId: claims.tenantId };
}

function tabStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function localPrefs(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// ── Marca de sesión de la pestaña ───────────────────────────────────────────
// La pone la pestaña cuando tiene access token y la quita el cierre de
// sesión. Sin ella no se activa la copia ni se guarda nada en ella.
const SESSION_MARK = 'dentalix.offline.session';

export function markOfflineSession(token: string | null | undefined): void {
  const who = offlineOwnerOf(token);
  if (!who) return;
  try {
    tabStorage()?.setItem(SESSION_MARK, who.owner);
  } catch {
    // Sin almacenamiento de pestaña: sin copia sin conexión.
  }
}

export function offlineSessionOwner(): string | null {
  try {
    return tabStorage()?.getItem(SESSION_MARK) ?? null;
  } catch {
    return null;
  }
}

// ── «Ahora no» ──────────────────────────────────────────────────────────────
// Si el usuario no quiere la copia, no se le vuelve a ofrecer en cada visita
// (por usuario, en este navegador; no es un dato sensible).
const declinedKey = (owner: string) => `dentalix.offline.declined.${owner}`;

export function offlineCopyDeclined(token: string | null | undefined): boolean {
  const who = offlineOwnerOf(token);
  if (!who) return false;
  try {
    return localPrefs()?.getItem(declinedKey(who.owner)) === '1';
  } catch {
    return false;
  }
}

export function declineOfflineCopy(token: string | null | undefined): void {
  const who = offlineOwnerOf(token);
  if (!who) return;
  try {
    localPrefs()?.setItem(declinedKey(who.owner), '1');
  } catch {
    // Se volverá a ofrecer.
  }
  notify();
}

// ── Época ───────────────────────────────────────────────────────────────────
// Sube con cada cierre de sesión: lo que empezó antes no escribe después.
let epoch = 0;

// ── Avisos a la interfaz ────────────────────────────────────────────────────
const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}
export function onOfflineCopyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let vault: OfflineVault<OfflineAgenda> | null | undefined;

function offlineVault(): OfflineVault<OfflineAgenda> | null {
  if (vault !== undefined) return vault;
  const subtle = globalThis.crypto?.subtle;
  const tab = tabStorage();
  const kv = typeof window === 'undefined' || !subtle || !tab ? null : indexedDbKv();
  vault =
    kv && tab
      ? createOfflineVault<OfflineAgenda>({ kv, tab, hasSession: (owner) => offlineSessionOwner() === owner })
      : null;
  return vault;
}

/** Estado de la copia para la sesión de `token` (o, sin token, la que haya). */
export async function offlineCopyStatus(token: string | null | undefined): Promise<VaultStatus> {
  const v = offlineVault();
  if (!v) return 'off';
  try {
    return await v.status(offlineOwnerOf(token)?.owner ?? null);
  } catch {
    return 'off';
  }
}

/** Activa la copia con un PIN nuevo (con sesión). */
export async function enableOfflineCopy(token: string, pin: string): Promise<boolean> {
  const v = offlineVault();
  const who = offlineOwnerOf(token);
  if (!v || !who) return false;
  markOfflineSession(token);
  const startedAt = epoch;
  const ok = await v.enable(who.owner, pin, {
    isCurrent: () => epoch === startedAt && offlineSessionOwner() === who.owner,
  });
  try {
    localPrefs()?.removeItem(declinedKey(who.owner));
  } catch {
    // Nada.
  }
  notify();
  return ok;
}

/** Desbloquea la copia en esta pestaña con el PIN. */
export async function unlockOfflineCopy(pin: string): Promise<UnlockResult> {
  const v = offlineVault();
  if (!v) return { ok: false, wiped: true };
  const result = await v.unlock(pin);
  if (!('remaining' in result)) {
    notify();
    if (!result.ok) await forgetOfflinePages();
  }
  return result;
}

/**
 * Pide la agenda de la sede y la guarda cifrada. `false` si no se guardó
 * (copia no activada o bloqueada en la pestaña, sin sesión, o se cerró la
 * sesión mientras llegaba). Lanza si la API falla.
 */
export async function syncOfflineAgenda(token: string, locationId: string): Promise<boolean> {
  const v = offlineVault();
  const who = offlineOwnerOf(token);
  if (!v || !who || offlineSessionOwner() !== who.owner) return false;
  if ((await v.status(who.owner)) !== 'ready') return false;
  const startedAt = epoch;
  const agenda = await fetchOfflineAgenda(token, locationId);
  const saved = await v.save({ ...who, locationId: agenda.locationId }, agenda, {
    isCurrent: () => epoch === startedAt && offlineSessionOwner() === who.owner,
  });
  if (saved) notify();
  return saved;
}

/** La copia descifrada, o `null` (también si falta el PIN en esta pestaña). */
export async function readOfflineAgenda(expect: ReadExpectations) {
  const v = offlineVault();
  if (!v) return null;
  try {
    return await v.read(expect);
  } catch {
    return null;
  }
}

/** Al cambiar de sede. */
export async function forgetOfflineAgendaData(): Promise<void> {
  try {
    await offlineVault()?.wipeData();
  } catch {
    // Sin IndexedDB: no había nada guardado.
  }
  notify();
}

/**
 * Cierre de sesión (aquí, en otra pestaña, o 401 de la API) y «Quitar copia
 * sin conexión»: la marca, la clave envuelta, la de la pestaña, la agenda y la
 * página guardada por el service worker. Sube la época ANTES de borrar.
 */
export async function forgetOfflineSession(): Promise<void> {
  epoch += 1;
  try {
    tabStorage()?.removeItem(SESSION_MARK);
  } catch {
    // Nada que borrar.
  }
  try {
    await offlineVault()?.wipe();
  } catch {
    // Ídem.
  }
  await forgetOfflinePages();
  notify();
}

/** «Quitar copia sin conexión» (con sesión): borra todo y no la vuelve a ofrecer sola. */
export async function removeOfflineCopy(token: string): Promise<void> {
  epoch += 1;
  try {
    await offlineVault()?.wipe();
  } catch {
    // Nada.
  }
  await forgetOfflinePages();
  declineOfflineCopy(token);
}

/** Solo tests. */
export function setOfflineVaultForTests(next: OfflineVault<OfflineAgenda> | null | undefined): void {
  vault = next;
}

/** Solo tests. */
export function resetOfflineAgendaForTests(): void {
  vault = undefined;
  epoch = 0;
  listeners.clear();
}
