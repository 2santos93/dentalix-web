import type { OfflineKv } from './offline-kv';

/**
 * Copia CIFRADA de la agenda de hoy y mañana en el navegador (DX-405), para
 * verla sin conexión. Reglas:
 *
 * - **Clave de sesión.** Una clave AES-GCM de 256 bits por sesión (usuario +
 *   clínica: `owner`), generada en el navegador con `extractable: false`: el
 *   JavaScript puede cifrar y descifrar con ella, pero nunca leer sus bytes.
 *   Vive en IndexedDB del host de la clínica (sobrevive a recargar y a cerrar
 *   el navegador, que es justo lo que pasa en un corte de luz). Otro usuario en
 *   el mismo equipo genera otra clave y lo anterior se borra.
 * - **Cerrar sesión la invalida.** `wipe()` borra la clave y los datos: aunque
 *   quedara un resto de la copia (un borrado a medias, una copia del perfil),
 *   sin la clave no se descifra («borrado criptográfico»).
 * - **Una sola copia: la de la sede.** Se guarda la de UNA sede; cambiar de
 *   sede la borra (`wipeData()`) y leer con otra sede activa también.
 * - **48 h.** Pasado ese tiempo desde que se guardó, se borra al leerla.
 * - **Integridad.** Dueño, clínica, sede y hora de guardado van como datos
 *   autenticados (AAD) del cifrado: cambiarlos (p. ej. alargar la caducidad)
 *   rompe el descifrado y la copia se borra.
 */

export const OFFLINE_AGENDA_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const KEY_ID = 'session';
const RECORD_ID = 'current';
const FORMAT = 1;

/** A quién y a qué sede pertenece la copia. */
export interface AgendaScope {
  /** `sub|tenantId` del access token. */
  owner: string;
  tenantId: string;
  locationId: string;
}

interface KeyRecord {
  owner: string;
  key: CryptoKey;
  createdAt: number;
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

export interface EncryptedAgendaStoreDeps {
  kv: OfflineKv;
  subtle?: SubtleCrypto;
  random?: (bytes: Uint8Array) => Uint8Array;
  now?: () => number;
}

function aad(record: Pick<AgendaRecord, 'v' | 'owner' | 'tenantId' | 'locationId' | 'savedAt'>): Uint8Array {
  const { v, owner, tenantId, locationId, savedAt } = record;
  return new TextEncoder().encode(JSON.stringify([v, owner, tenantId, locationId, savedAt]));
}

export function createEncryptedAgendaStore<T>(deps: EncryptedAgendaStoreDeps) {
  const { kv } = deps;
  const subtle = deps.subtle ?? globalThis.crypto.subtle;
  const random = deps.random ?? ((bytes: Uint8Array) => globalThis.crypto.getRandomValues(bytes));
  const now = deps.now ?? Date.now;

  // Las operaciones van en fila: un borrado al cambiar de sede no se cruza con
  // un guardado que empezó antes.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <R>(op: () => Promise<R>): Promise<R> => {
    const next = queue.then(op, op);
    queue = next.catch(() => undefined);
    return next;
  };

  const wipeAll = async () => {
    await kv.clear('agenda');
    await kv.clear('keys');
  };

  async function keyFor(owner: string): Promise<CryptoKey> {
    const existing = await kv.get<KeyRecord>('keys', KEY_ID);
    if (existing && existing.owner === owner) return existing.key;
    // Otra sesión (u otro usuario) en este navegador: lo suyo se va con su clave.
    await wipeAll();
    const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await kv.put<KeyRecord>('keys', KEY_ID, { owner, key, createdAt: now() });
    return key;
  }

  return {
    /** Cifra y guarda la agenda de `scope` (sustituye la que hubiera). */
    save(scope: AgendaScope, payload: T): Promise<void> {
      return serial(async () => {
        const key = await keyFor(scope.owner);
        const meta = { v: FORMAT, ...scope, savedAt: now() };
        const iv = random(new Uint8Array(12));
        const data = await subtle.encrypt(
          { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad(meta) as BufferSource },
          key,
          new TextEncoder().encode(JSON.stringify(payload)),
        );
        await kv.put<AgendaRecord>('agenda', RECORD_ID, { ...meta, iv, data });
      });
    },

    /**
     * La agenda guardada, o `null` si no hay, es de otra sesión u otra sede,
     * caducó, falta la clave o no se descifra. Salvo «no hay», cada caso la
     * borra.
     */
    read(expect: ReadExpectations = {}): Promise<StoredAgenda<T> | null> {
      return serial(async () => {
        const record = await kv.get<AgendaRecord>('agenda', RECORD_ID);
        if (!record) return null;
        const drop = async () => {
          await kv.delete('agenda', RECORD_ID);
          return null;
        };
        if (record.v !== FORMAT) return drop();
        if (now() - record.savedAt > OFFLINE_AGENDA_MAX_AGE_MS || record.savedAt > now() + 60_000) return drop();
        if (expect.activeLocationId && expect.activeLocationId !== record.locationId) return drop();
        const keyRecord = await kv.get<KeyRecord>('keys', KEY_ID);
        if (!keyRecord || keyRecord.owner !== record.owner) return drop();
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
