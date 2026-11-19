'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { indexedDbKv, type OfflineKv } from '@/lib/offline/offline-kv';
import { createDraftStore, type DraftStore } from './draft-store';
import { draftKeyFor, forgetDraftKeys } from './draft-key';

/**
 * Piezas del navegador de los borradores (DX-574): el almacén cifrado sobre
 * IndexedDB, la marca «Este equipo es compartido» (almacén `device`, sin
 * datos de salud) y el borrado al cerrar sesión. Sin IndexedDB o sin
 * WebCrypto (contexto no seguro, jsdom) no hay borradores: los formularios
 * funcionan igual, sin recuperar nada.
 */

let kv: OfflineKv | null | undefined;
let store: DraftStore | null | undefined;

function draftsKv(): OfflineKv | null {
  if (kv !== undefined) return kv;
  kv = typeof window === 'undefined' ? null : indexedDbKv();
  return kv;
}

/** El almacén de borradores del navegador, o `null` si no se puede cifrar o guardar. */
export function getDraftStore(): DraftStore | null {
  if (store !== undefined) return store;
  const subtle = typeof window === 'undefined' ? undefined : globalThis.crypto?.subtle;
  const base = draftsKv();
  store =
    base && subtle
      ? createDraftStore({
          kv: base,
          subtle,
          getKey: (owner) => draftKeyFor(owner, subtle),
          isShared: () => isSharedDevice(),
        })
      : null;
  return store;
}

// ── «Este equipo es compartido» ─────────────────────────────────────────────
const SHARED_KEY = 'shared';
let shared: boolean | null = null;
let sharedLoading: Promise<boolean> | null = null;
const sharedListeners = new Set<() => void>();

function emitShared(): void {
  for (const l of sharedListeners) l();
}

/** ¿Está marcado este equipo como compartido? Sin almacén, no. */
export function isSharedDevice(): Promise<boolean> {
  if (shared !== null) return Promise.resolve(shared);
  sharedLoading ??= (async () => {
    const base = draftsKv();
    let value = false;
    try {
      value = base ? (await base.get<boolean>('device', SHARED_KEY)) === true : false;
    } catch {
      value = false;
    }
    shared = value;
    emitShared();
    return value;
  })();
  return sharedLoading;
}

/**
 * Marca o desmarca el equipo como compartido. Al marcarlo borra TODOS los
 * borradores del equipo (de cualquier usuario) y deja de guardar; al
 * desmarcarlo, vuelve a guardar.
 */
export async function setSharedDevice(next: boolean): Promise<void> {
  shared = next;
  sharedLoading = Promise.resolve(next);
  emitShared();
  const base = draftsKv();
  if (!base) return;
  await base.put('device', SHARED_KEY, next);
  if (next) await getDraftStore()?.wipeAll();
}

function subscribeShared(listener: () => void): () => void {
  sharedListeners.add(listener);
  return () => {
    sharedListeners.delete(listener);
  };
}

/** Para el menú: `null` mientras se lee. */
export function useSharedDevice(): boolean | null {
  const value = useSyncExternalStore(
    subscribeShared,
    () => shared,
    () => null,
  );
  useEffect(() => {
    void isSharedDevice();
  }, []);
  return value;
}

// ── Cierre de sesión ────────────────────────────────────────────────────────
/**
 * Lo llama `forgetOfflineSession` (los cinco caminos de cierre de sesión):
 * olvida las claves en memoria y borra los borradores del dueño; si no se
 * sabe quién era, todos los del equipo.
 */
export async function forgetDrafts(owner: string | null): Promise<void> {
  forgetDraftKeys();
  const s = getDraftStore();
  if (!s) return;
  try {
    if (owner) await s.wipeOwner(owner);
    else await s.wipeAll();
  } catch {
    // Sin IndexedDB: no había nada guardado.
  }
}

/** Solo tests. */
export function setDraftRuntimeForTests(next: { kv?: OfflineKv | null; store?: DraftStore | null } = {}): void {
  kv = next.kv === undefined ? undefined : next.kv;
  store = next.store === undefined ? undefined : next.store;
  shared = null;
  sharedLoading = null;
  sharedListeners.clear();
}
