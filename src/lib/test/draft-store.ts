import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { act } from '@testing-library/react';
import { memoryKv } from '@/lib/offline/offline-kv';
import { resetConnectivityForTests } from '@/lib/offline/connectivity';
import { createDraftStore, type DraftScope } from '@/lib/drafts/draft-store';
import { setDraftRuntimeForTests } from '@/lib/drafts/drafts-runtime';

/** Hora fija de los borradores de las pruebas (TZ=UTC en jest: «14:05»). */
export const DRAFT_SAVED_AT = Date.parse('2026-11-18T14:05:00Z');

/**
 * DX-574: almacén de borradores en memoria con WebCrypto de Node (jsdom no
 * trae IndexedDB ni `crypto.subtle`), instalado como el del navegador.
 */
export async function installMemoryDraftStore() {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
  const subtle = webcrypto.subtle as unknown as SubtleCrypto;
  const key = (await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])) as CryptoKey;
  const kv = memoryKv();
  const store = createDraftStore({
    kv,
    subtle,
    random: (bytes) => webcrypto.getRandomValues(bytes),
    now: () => DRAFT_SAVED_AT,
    getKey: async () => key,
  });
  setDraftRuntimeForTests({ kv, store });
  return {
    kv,
    store,
    /** Un borrador ya guardado, como lo deja `useFormDraft`. */
    seed: <T>(scope: DraftScope, value: T, idempotencyKey: string) =>
      store.save(scope, { v: 1, value, idempotencyKey }),
    read: <T>(scope: DraftScope) => store.load<{ v: 1; value: T; idempotencyKey: string }>(scope),
  };
}

export function uninstallDraftStore(): void {
  setDraftRuntimeForTests();
}

/** Se va la red y vuelve (eventos del navegador): dispara `onReconnect`. */
export function dropAndRestoreNetwork(): void {
  act(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
}

export { resetConnectivityForTests };

/** JWT de prueba con dueño (`sub|tenantId`). */
export function draftTestToken(sub = 'u-me', tenantId = 't1', role = 'DENTIST'): string {
  const part = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part('{"alg":"HS256"}')}.${part(JSON.stringify({ sub, tenantId, role }))}.sig`;
}
