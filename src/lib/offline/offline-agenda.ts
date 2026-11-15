import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { readJwtClaims } from '@/lib/auth/jwt-claims';
import { createEncryptedAgendaStore, type EncryptedAgendaStore, type ReadExpectations } from './encrypted-agenda-store';
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

let store: EncryptedAgendaStore<OfflineAgenda> | null | undefined;

function agendaStore(): EncryptedAgendaStore<OfflineAgenda> | null {
  if (store !== undefined) return store;
  const kv = typeof window === 'undefined' || !globalThis.crypto?.subtle ? null : indexedDbKv();
  store = kv ? createEncryptedAgendaStore<OfflineAgenda>({ kv }) : null;
  return store;
}

/** Pide la agenda de la sede y la guarda cifrada. Lanza si la API falla. */
export async function syncOfflineAgenda(token: string, locationId: string): Promise<void> {
  const s = agendaStore();
  const who = offlineOwnerOf(token);
  if (!s || !who) return;
  const agenda = await fetchOfflineAgenda(token, locationId);
  await s.save({ ...who, locationId: agenda.locationId }, agenda);
}

/** La copia guardada (descifrada) o `null`. */
export async function readOfflineAgenda(expect: ReadExpectations) {
  const s = agendaStore();
  if (!s) return null;
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
 * muerta): la clave, la agenda y las páginas guardadas por el service worker.
 */
export async function forgetOfflineSession(): Promise<void> {
  try {
    await agendaStore()?.wipe();
  } catch {
    // Ídem: nada que borrar.
  }
  await forgetOfflinePages();
}

/** Solo tests. */
export function resetOfflineAgendaStoreForTests(): void {
  store = undefined;
}
