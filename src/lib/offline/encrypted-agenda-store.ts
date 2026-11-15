import type { OfflineKv } from './offline-kv';

/**
 * Copia CIFRADA de la agenda de hoy y mañana en el navegador (DX-405), para
 * verla sin conexión. Reglas:
 *
 * - **Clave de la pestaña.** Una clave AES-GCM de 256 bits por sesión (usuario +
 *   clínica: `owner`), generada en el navegador. Vive SOLO en la pestaña:
 *   `sessionStorage` (sus bytes, para sobrevivir a recargar sin red) y, ya
 *   importada como `CryptoKey` no extraíble, en memoria (`KeyHolder`). Cerrar
 *   la pestaña o el navegador la destruye: lo cifrado que quede en IndexedDB
 *   es ilegible para quien abra el navegador después.
 * - **Solo con sesión.** Sin la marca de sesión de la pestaña (`canCreateKey`)
 *   no se genera clave ni se guarda nada.
 * - **Cerrar sesión la invalida.** `wipe()` borra la clave y los datos.
 * - **Época.** `save()` recibe `isCurrent()`: si entre la petición y el
 *   guardado se cerró la sesión, la escritura no ocurre (se comprueba dentro
 *   de la fila serializada, justo antes de escribir).
 * - **Una sola copia: la de la sede.** Cambiar de sede la borra (`wipeData()`)
 *   y leer con otra sede activa también.
 * - **48 h.** Pasado ese tiempo desde que se guardó, se borra al leerla.
 * - **Integridad.** Dueño, clínica, sede y hora de guardado van como datos
 *   autenticados (AAD): cambiarlos (p. ej. alargar la caducidad) rompe el
 *   descifrado y la copia se borra.
 */

export const OFFLINE_AGENDA_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const FORMAT = 1;

/** A quién y a qué sede pertenece la copia. */
export interface AgendaScope {
  /** `sub|tenantId` del access token. */
  owner: string;
  tenantId: string;
  locationId: string;
}

export interface KeyRecord {
  owner: string;
  key: CryptoKey;
  /** Id de la clave (aleatorio): la copia de ESTA pestaña se guarda con él. */
  id: string;
}

/** Dónde vive la clave de la sesión (en el navegador: la pestaña). */
export interface KeyHolder {
  get(): Promise<KeyRecord | undefined>;
  /** Genera y guarda una clave nueva para `owner`. */
  create(owner: string): Promise<KeyRecord>;
  clear(): Promise<void>;
}

interface AgendaRecord extends AgendaScope {
  v: number;
  savedAt: number;
  iv: Uint8Array;
  data: ArrayBuffer;
}

/** Lo que se exige al leer. Sin token (recarga sin red) no hay `owner` que comprobar. */
export interface ReadExpectations {
  owner?: string | null;
  /** Sede activa; `null` = «Todas las sedes» (vale la copia de la principal). */
  activeLocationId?: string | null;
}

export interface StoredAgenda<T> {
  scope: AgendaScope;
  savedAt: number;
  payload: T;
}

export interface SaveOptions {
  /** `false` si la sesión se cerró después de pedir los datos: no se guarda. */
  isCurrent?: () => boolean;
}

export interface EncryptedAgendaStoreDeps {
  kv: OfflineKv;
  keys: KeyHolder;
  /** Hay sesión con token en esta pestaña para `owner` (sin ella no se crea clave). */
  canCreateKey?: (owner: string) => boolean;
  subtle?: SubtleCrypto;
  random?: (bytes: Uint8Array) => Uint8Array;
  now?: () => number;
}

function aad(record: Pick<AgendaRecord, 'v' | 'owner' | 'tenantId' | 'locationId' | 'savedAt'>): Uint8Array {
  const { v, owner, tenantId, locationId, savedAt } = record;
  return new TextEncoder().encode(JSON.stringify([v, owner, tenantId, locationId, savedAt]));
}

/** Clave en memoria (tests). */
export function memoryKeyHolder(subtle: SubtleCrypto): KeyHolder & { record?: KeyRecord } {
  const holder: KeyHolder & { record?: KeyRecord } = {
    get: async () => holder.record,
    create: async (owner) => {
      const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      holder.record = { owner, key, id: newId() };
      return holder.record;
    },
    clear: async () => {
      holder.record = undefined;
    },
  };
  return holder;
}

const B64 = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decode: (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
};

function newId(): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
}

function readStored(storage: Storage, itemKey: string): { owner: string; raw: string; id: string } | null {
  try {
    const value = JSON.parse(storage.getItem(itemKey) ?? 'null') as { owner?: unknown; raw?: unknown; id?: unknown } | null;
    return value && typeof value.owner === 'string' && typeof value.raw === 'string' && typeof value.id === 'string'
      ? { owner: value.owner, raw: value.raw, id: value.id }
      : null;
  } catch {
    return null;
  }
}

/**
 * La clave en `sessionStorage` de la pestaña: sobrevive a recargarla (también
 * sin red) y muere al cerrarla. Se importa una vez como `CryptoKey` NO
 * extraíble y se usa desde memoria.
 */
export function sessionStorageKeyHolder(storage: Storage, subtle: SubtleCrypto, itemKey: string): KeyHolder {
  let cached: KeyRecord | undefined;
  const importRaw = (raw: Uint8Array) =>
    subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return {
    async get() {
      const stored = readStored(storage, itemKey);
      if (!stored) {
        cached = undefined;
        return undefined;
      }
      if (cached && cached.id === stored.id) return cached;
      cached = { owner: stored.owner, id: stored.id, key: await importRaw(B64.decode(stored.raw)) };
      return cached;
    },
    async create(owner) {
      const raw = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const id = newId();
      storage.setItem(itemKey, JSON.stringify({ owner, id, raw: B64.encode(raw) }));
      const key = await importRaw(raw);
      raw.fill(0);
      cached = { owner, id, key };
      return cached;
    },
    async clear() {
      cached = undefined;
      storage.removeItem(itemKey);
    },
  };
}

export function createEncryptedAgendaStore<T>(deps: EncryptedAgendaStoreDeps) {
  const { kv, keys } = deps;
  const canCreateKey = deps.canCreateKey ?? (() => true);
  const subtle = deps.subtle ?? globalThis.crypto.subtle;
  const random = deps.random ?? ((bytes: Uint8Array) => globalThis.crypto.getRandomValues(bytes));
  const now = deps.now ?? Date.now;

  // Las operaciones van en fila: un borrado (cambio de sede, cierre de sesión)
  // no se cruza con un guardado que empezó antes.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <R>(op: () => Promise<R>): Promise<R> => {
    const next = queue.then(op, op);
    queue = next.catch(() => undefined);
    return next;
  };

  const wipeAll = async () => {
    await keys.clear();
    await kv.clear('agenda');
  };

  const recordId = (key: KeyRecord) => `tab-${key.id}`;

  /**
   * Cada pestaña guarda su copia con el id de SU clave (dos pestañas no se
   * pisan). Las de pestañas ya cerradas quedan ilegibles (su clave murió con
   * ellas) y se purgan aquí al caducar.
   */
  async function purge(also: (record: AgendaRecord) => boolean = () => false): Promise<void> {
    for (const id of await kv.keys('agenda')) {
      const other = await kv.get<AgendaRecord>('agenda', id);
      if (!other || other.v !== FORMAT || now() - other.savedAt > OFFLINE_AGENDA_MAX_AGE_MS || also(other)) {
        await kv.delete('agenda', id);
      }
    }
  }
  const purgeExpired = () => purge();

  /** La clave de `owner`, o una nueva si hay sesión en la pestaña; `null` si no. */
  async function keyFor(owner: string): Promise<KeyRecord | null> {
    const existing = await keys.get();
    if (existing && existing.owner === owner) return existing;
    if (!canCreateKey(owner)) return null;
    // Clave nueva en la pestaña. Lo de otro usuario en este navegador se va;
    // las copias del mismo usuario en otras pestañas se quedan (cada una con
    // su clave).
    await keys.clear();
    await purge((record) => record.owner !== owner);
    return keys.create(owner);
  }

  return {
    /**
     * Cifra y guarda la agenda de `scope` (sustituye la que hubiera). `false`
     * si no se guardó: sin sesión en la pestaña o con la sesión ya cerrada.
     */
    save(scope: AgendaScope, payload: T, opts: SaveOptions = {}): Promise<boolean> {
      const isCurrent = opts.isCurrent ?? (() => true);
      return serial(async () => {
        if (!isCurrent()) return false;
        const keyRecord = await keyFor(scope.owner);
        if (!keyRecord) return false;
        const meta = { v: FORMAT, ...scope, savedAt: now() };
        const iv = random(new Uint8Array(12));
        const data = await subtle.encrypt(
          { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(meta) as BufferSource },
          keyRecord.key,
          new TextEncoder().encode(JSON.stringify(payload)),
        );
        if (!isCurrent()) return false;
        await kv.put<AgendaRecord>('agenda', recordId(keyRecord), { ...meta, iv, data });
        await purgeExpired();
        return true;
      });
    },

    /**
     * La agenda de ESTA pestaña, o `null` si no hay, es de otra sesión u otra
     * sede, caducó, falta la clave (otra pestaña, navegador cerrado) o no se
     * descifra. Salvo «no hay», cada caso la borra.
     */
    read(expect: ReadExpectations = {}): Promise<StoredAgenda<T> | null> {
      return serial(async () => {
        await purgeExpired();
        const keyRecord = await keys.get();
        // Sin clave en la pestaña (otra pestaña, navegador abierto de nuevo): nada que leer.
        if (!keyRecord) return null;
        const id = recordId(keyRecord);
        const record = await kv.get<AgendaRecord>('agenda', id);
        if (!record) return null;
        const drop = async () => {
          await kv.delete('agenda', id);
          return null;
        };
        if (record.v !== FORMAT) return drop();
        if (now() - record.savedAt > OFFLINE_AGENDA_MAX_AGE_MS || record.savedAt > now() + 60_000) return drop();
        if (expect.activeLocationId && expect.activeLocationId !== record.locationId) return drop();
        if (keyRecord.owner !== record.owner) return drop();
        if (expect.owner && expect.owner !== record.owner) {
          await wipeAll();
          return null;
        }
        try {
          const plain = await subtle.decrypt(
            { name: 'AES-GCM', iv: record.iv as BufferSource, additionalData: aad(record) as BufferSource },
            keyRecord.key,
            record.data,
          );
          const payload = JSON.parse(new TextDecoder().decode(plain)) as T;
          const { owner, tenantId, locationId } = record;
          return { scope: { owner, tenantId, locationId }, savedAt: record.savedAt, payload };
        } catch {
          return drop();
        }
      });
    },

    /** Cambio de sede: fuera la agenda (la clave de la sesión sigue). */
    wipeData(): Promise<void> {
      return serial(() => kv.clear('agenda'));
    },

    /** Cierre de sesión: fuera la clave y la agenda. */
    wipe(): Promise<void> {
      return serial(wipeAll);
    },
  };
}

export type EncryptedAgendaStore<T> = ReturnType<typeof createEncryptedAgendaStore<T>>;
