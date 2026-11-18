import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { useAuthStore } from '@/lib/auth/auth-store';
import { readJwtClaims } from '@/lib/auth/jwt-claims';

/**
 * Clave de los borradores (DX-574): `GET /me/draft-key` devuelve 32 bytes en
 * base64, deterministas por usuario y clínica (tras recargar o volver a
 * entrar, la misma clave descifra lo guardado). Se importa como `CryptoKey`
 * AES-GCM NO extraíble y vive solo en memoria, por dueño; nunca se persiste.
 * Se pide la primera vez que un formulario la necesita y se olvida al cerrar
 * sesión (`forgetDraftKeys`).
 */
export type DraftKeyResponse = components['schemas']['DraftKeyDto'];

/** `sub|tenantId` del token: el mismo dueño que la copia sin conexión de la agenda (DX-405). */
export function draftOwnerOf(token: string | null | undefined): string | null {
  const claims = readJwtClaims(token);
  if (!claims || typeof claims.sub !== 'string' || typeof claims.tenantId !== 'string') return null;
  return `${claims.sub}|${claims.tenantId}`;
}

export function fetchDraftKey(token: string): Promise<DraftKeyResponse> {
  return apiFetch<DraftKeyResponse>('/me/draft-key', { token });
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Importa la clave cruda como AES-GCM no extraíble; los bytes se sobrescriben después. */
export async function importDraftKey(subtle: SubtleCrypto, base64: string): Promise<CryptoKey> {
  const raw = fromBase64(base64);
  if (raw.length !== 32) throw new Error('DRAFT_KEY_INVALID');
  try {
    return await subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}

/** Sin sesión del dueño pedido (otro usuario entró, o se cerró la sesión). */
export class DraftKeyUnavailableError extends Error {
  constructor() {
    super('Draft key unavailable');
    this.name = 'DraftKeyUnavailableError';
  }
}

const keys = new Map<string, Promise<CryptoKey>>();
// Sube con cada cierre de sesión: una clave que llega después no se guarda.
let epoch = 0;

/**
 * La clave de `owner`, con el token de la sesión actual. Lanza si el token es
 * de otro dueño o si la API no responde (sin red: `NetworkError`).
 */
export function draftKeyFor(owner: string, subtle: SubtleCrypto = globalThis.crypto.subtle): Promise<CryptoKey> {
  const cached = keys.get(owner);
  if (cached) return cached;
  const token = useAuthStore.getState().accessToken;
  if (!token || draftOwnerOf(token) !== owner) return Promise.reject(new DraftKeyUnavailableError());
  const startedAt = epoch;
  const pending = fetchDraftKey(token)
    .then((res) => importDraftKey(subtle, res.key))
    .then((key) => {
      // Se cerró la sesión mientras llegaba: no sirve ni se guarda.
      if (epoch !== startedAt) throw new DraftKeyUnavailableError();
      return key;
    });
  keys.set(owner, pending);
  pending.catch(() => {
    if (keys.get(owner) === pending) keys.delete(owner);
  });
  return pending;
}

/** Cierre de sesión: ninguna clave queda en memoria. */
export function forgetDraftKeys(): void {
  epoch += 1;
  keys.clear();
}
