import type { OfflineKv } from '@/lib/offline/offline-kv';

/**
 * Borradores de formularios clínicos que sobreviven a un corte (DX-574).
 *
 * - Viven en IndexedDB (almacén `drafts`), NUNCA en localStorage ni
 *   sessionStorage.
 * - Van cifrados con AES-GCM. La clave la da la API (`GET /me/draft-key`) y
 *   solo vive en memoria como `CryptoKey` no extraíble (`draft-key.ts`).
 * - El AAD es el alcance serializado: un registro copiado a otro alcance (otro
 *   paciente, otro usuario, otra clínica) no se descifra.
 * - La clave del registro es el SHA-256 del alcance: los ids no se ven en las
 *   claves de la base. El registro guarda el `owner` en claro para poder
 *   borrar los de un usuario al cerrar su sesión.
 * - Caducan a las 72 h (se comprueba al leer y se purga en la primera lectura).
 * - En un equipo marcado como compartido no se guarda nada.
 */
export type DraftForm = 'evolution' | 'anamnesis' | 'plan-item' | 'prescription';

export interface DraftScope {
  /** `sub|tenantId` del access token (el mismo dueño que la agenda sin conexión). */
  owner: string;
  patientId: string;
  form: DraftForm;
  /** Para separar borradores del mismo formulario (la cita, el plan). */
  variant?: string | null;
}

export interface DraftRecord {
  owner: string;
  savedAt: number;
  iv: Uint8Array;
  data: ArrayBuffer;
}

export interface LoadedDraft<T> {
  payload: T;
  savedAt: number;
}

export const DRAFT_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const TABLE = 'drafts' as const;

export interface DraftStoreDeps {
  kv: OfflineKv;
  subtle: SubtleCrypto;
  random?: (bytes: Uint8Array) => Uint8Array;
  now?: () => number;
  /**
   * La clave de `owner`. Lanza si no se puede obtener (sin red, sin sesión):
   * `load` propaga el error para que la pantalla diga que hay un borrador que
   * se podrá recuperar al volver la conexión.
   */
  getKey: (owner: string) => Promise<CryptoKey>;
  /** «Este equipo es compartido»: no se guarda nada. */
  isShared?: () => boolean | Promise<boolean>;
}

export interface DraftStore {
  /** `true` si quedó guardado; `false` en un equipo compartido. Lanza si no hay clave. */
  save<T>(scope: DraftScope, payload: T): Promise<boolean>;
  /** El borrador descifrado, o `null` (no hay, caducó, otro dueño o no descifra). Lanza sin clave. */
  load<T>(scope: DraftScope): Promise<LoadedDraft<T> | null>;
  /** Cuándo se guardó el borrador del alcance, sin descifrarlo (no necesita la clave). */
  peek(scope: DraftScope): Promise<{ savedAt: number } | null>;
  has(scope: DraftScope): Promise<boolean>;
  /** Pide la clave de `owner` por adelantado (con red), para poder guardar si la red cae después. */
  prepare(owner: string): Promise<void>;
  remove(scope: DraftScope): Promise<void>;
  purgeExpired(): Promise<void>;
  wipeOwner(owner: string): Promise<void>;
  wipeAll(): Promise<void>;
}

/** Serialización estable del alcance: es el AAD y la entrada del hash de la clave. */
export function serializeScope(scope: DraftScope): string {
  return JSON.stringify(['dx-draft-v1', scope.owner, scope.patientId, scope.form, scope.variant ?? '']);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

function isRecord(value: unknown): value is DraftRecord {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Partial<DraftRecord>;
  return typeof r.owner === 'string' && typeof r.savedAt === 'number' && r.iv != null && r.data != null;
}

export function createDraftStore(deps: DraftStoreDeps): DraftStore {
  const { kv, subtle, getKey } = deps;
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? ((bytes: Uint8Array) => globalThis.crypto.getRandomValues(bytes));
  const encoder = new TextEncoder();
  let purged: Promise<void> | null = null;

  const recordKey = async (scope: DraftScope) =>
    toHex(await subtle.digest('SHA-256', encoder.encode(serializeScope(scope))));

  const expired = (record: DraftRecord) => {
    const age = now() - record.savedAt;
    return age > DRAFT_MAX_AGE_MS || age < -DRAFT_MAX_AGE_MS;
  };

  async function purgeExpired(): Promise<void> {
    for (const key of await kv.keys(TABLE)) {
      const record = await kv.get<unknown>(TABLE, key);
      if (!isRecord(record) || expired(record)) await kv.delete(TABLE, key);
    }
  }

  /** Una vez por almacén (al arrancar la primera lectura). */
  const purgeOnce = () => {
    purged ??= purgeExpired().catch(() => undefined);
    return purged;
  };

  /** El registro vigente del alcance, o `null` (y fuera si caducó o no es de su dueño). */
  async function current(scope: DraftScope): Promise<{ key: string; record: DraftRecord } | null> {
    await purgeOnce();
    const key = await recordKey(scope);
    const record = await kv.get<unknown>(TABLE, key);
    if (!isRecord(record)) return null;
    if (record.owner !== scope.owner) return null;
    if (expired(record)) {
      await kv.delete(TABLE, key);
      return null;
    }
    return { key, record };
  }

  return {
    async save(scope, payload) {
      if (deps.isShared && (await deps.isShared())) return false;
      const cryptoKey = await getKey(scope.owner);
      const iv = random(new Uint8Array(12));
      const data = await subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource, additionalData: encoder.encode(serializeScope(scope)) },
        cryptoKey,
        encoder.encode(JSON.stringify(payload)),
      );
      const record: DraftRecord = { owner: scope.owner, savedAt: now(), iv, data };
      await kv.put(TABLE, await recordKey(scope), record);
      return true;
    },

    async load<T>(scope: DraftScope): Promise<LoadedDraft<T> | null> {
      const found = await current(scope);
      if (!found) return null;
      const cryptoKey = await getKey(scope.owner);
      try {
        const plain = await subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: found.record.iv as BufferSource,
            additionalData: encoder.encode(serializeScope(scope)),
          },
          cryptoKey,
          found.record.data,
        );
        return { payload: JSON.parse(new TextDecoder().decode(plain)) as T, savedAt: found.record.savedAt };
      } catch {
        // Otra clave (secreto rotado) o un registro manipulado: no sirve.
        await kv.delete(TABLE, found.key);
        return null;
      }
    },

    async peek(scope) {
      const found = await current(scope);
      return found ? { savedAt: found.record.savedAt } : null;
    },

    async has(scope) {
      return (await current(scope)) !== null;
    },

    async prepare(owner) {
      try {
        await getKey(owner);
      } catch {
        // Sin red o sin sesión: se volverá a pedir al guardar.
      }
    },

    async remove(scope) {
      await kv.delete(TABLE, await recordKey(scope));
    },

    purgeExpired,

    async wipeOwner(owner) {
      for (const key of await kv.keys(TABLE)) {
        const record = await kv.get<unknown>(TABLE, key);
        if (!isRecord(record) || record.owner === owner) await kv.delete(TABLE, key);
      }
    },

    async wipeAll() {
      await kv.clear(TABLE);
    },
  };
}
