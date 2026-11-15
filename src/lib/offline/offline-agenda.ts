import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { readJwtClaims } from '@/lib/auth/jwt-claims';
import {
  createEncryptedAgendaStore,
  sessionStorageKeyHolder,
  type EncryptedAgendaStore,
  type ReadExpectations,
} from './encrypted-agenda-store';
import { indexedDbKv } from './offline-kv';
import { forgetOfflinePages } from './service-worker';

/** La agenda de hoy y mañana de una sede, tal cual la da la API (DX-405). */
export type OfflineAgenda = components['schemas']['OfflineAgendaDto'];
export type OfflineAgendaAppointment = components['schemas']['OfflineAgendaAppointmentDto'];

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

// ── Marca de sesión de la pestaña ───────────────────────────────────────────
// La pone `markOfflineSession` cuando la pestaña tiene un access token y la
// quita el cierre de sesión. Vive en `sessionStorage`: la recarga de ESTA
// pestaña la conserva (también sin red); otra pestaña, o el navegador abierto
// de nuevo, no la tienen. Sin ella ni se enseña la copia sin conexión ni se
// genera una clave.
const SESSION_MARK = 'dentalix.offline.session';
const SESSION_KEY = 'dentalix.offline.key';

function tabStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Esta pestaña tiene sesión (token) para el dueño de `token`. */
export function markOfflineSession(token: string | null | undefined): void {
  const who = offlineOwnerOf(token);
  if (!who) return;
  try {
    tabStorage()?.setItem(SESSION_MARK, who.owner);
  } catch {
    // Sin almacenamiento de pestaña: sin copia sin conexión.
  }
}

/** Dueño de la sesión de esta pestaña, o `null` si no la hubo (o se cerró). */
export function offlineSessionOwner(): string | null {
  try {
    return tabStorage()?.getItem(SESSION_MARK) ?? null;
  } catch {
    return null;
  }
}

function clearSessionMark(): void {
  try {
    tabStorage()?.removeItem(SESSION_MARK);
  } catch {
    // Nada que borrar.
  }
}

// ── Época ───────────────────────────────────────────────────────────────────
// Sube con cada cierre de sesión: un guardado cuya petición salió antes no
// escribe después del borrado.
let epoch = 0;

export function offlineEpoch(): number {
  return epoch;
}

let store: EncryptedAgendaStore<OfflineAgenda> | null | undefined;

function agendaStore(): EncryptedAgendaStore<OfflineAgenda> | null {
  if (store !== undefined) return store;
  const subtle = globalThis.crypto?.subtle;
  const tab = tabStorage();
  const kv = typeof window === 'undefined' || !subtle || !tab ? null : indexedDbKv();
  store =
    kv && subtle && tab
      ? createEncryptedAgendaStore<OfflineAgenda>({
          kv,
          keys: sessionStorageKeyHolder(tab, subtle, SESSION_KEY),
          canCreateKey: (owner) => offlineSessionOwner() === owner,
        })
      : null;
  return store;
}

/**
 * Pide la agenda de la sede y la guarda cifrada. `false` si no se guardó (sin
 * sesión en la pestaña, o se cerró mientras llegaba). Lanza si la API falla.
 */
export async function syncOfflineAgenda(token: string, locationId: string): Promise<boolean> {
  const s = agendaStore();
  const who = offlineOwnerOf(token);
  if (!s || !who || offlineSessionOwner() !== who.owner) return false;
  const startedAt = epoch;
  const agenda = await fetchOfflineAgenda(token, locationId);
  return s.save({ ...who, locationId: agenda.locationId }, agenda, {
    isCurrent: () => epoch === startedAt && offlineSessionOwner() === who.owner,
  });
}

/** La copia guardada (descifrada) o `null`. Sin sesión en la pestaña, nunca. */
export async function readOfflineAgenda(expect: ReadExpectations) {
  const s = agendaStore();
  if (!s || !offlineSessionOwner()) return null;
  try {
    return await s.read(expect);
  } catch {
    return null;
  }
}

/** Al cambiar de sede. */
export async function forgetOfflineAgendaData(): Promise<void> {
  try {
    await agendaStore()?.wipeData();
  } catch {
    // Sin IndexedDB (modo privado estricto): no había nada guardado.
  }
}

/**
 * Al cerrar la sesión (aquí, en otra pestaña o porque la API la dio por
 * muerta) o al arrancar con red sin sesión: la marca, la clave, la agenda y
 * las páginas guardadas por el service worker. Sube la época ANTES de borrar,
 * así un guardado en vuelo ya no escribe.
 */
export async function forgetOfflineSession(): Promise<void> {
  epoch += 1;
  clearSessionMark();
  try {
    await agendaStore()?.wipe();
  } catch {
    // Ídem: nada que borrar.
  }
  await forgetOfflinePages();
}

/** Solo tests: un almacén con dependencias propias. */
export function setOfflineAgendaStoreForTests(
  next: EncryptedAgendaStore<OfflineAgenda> | null | undefined,
): void {
  store = next;
}

/** Solo tests. */
export function resetOfflineAgendaStoreForTests(): void {
  store = undefined;
  epoch = 0;
}

