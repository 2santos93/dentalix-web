import type { OfflineKv } from './offline-kv';

/**
 * Copia CIFRADA de la agenda de hoy y mañana para verla sin conexión (DX-405),
 * protegida con un PIN (decisión del dueño).
 *
 * - **Clave de datos.** AES-GCM de 256 bits, aleatoria, una por activación.
 *   Cifra la agenda (IV aleatorio; AAD = dueño, clínica, sede y hora de
 *   guardado).
 * - **PIN.** 4–6 dígitos que fija el usuario. De él sale una clave de
 *   envoltura con PBKDF2-SHA256 (`PBKDF2_ITERATIONS`, OWASP 2023: 600 000) y
 *   una salt aleatoria de 16 bytes. Con ella se cifra (AES-GCM, AAD = dueño)
 *   la clave de datos.
 * - **Qué queda en el disco (IndexedDB).** Solo la clave envuelta, la salt, las
 *   iteraciones, el contador de fallos y la agenda cifrada. Nunca una clave
 *   usable.
 * - **Pestaña.** Desenvuelta, la clave de datos vive en memoria (como
 *   `CryptoKey` no extraíble) y en `sessionStorage` (para recargar sin pedir
 *   el PIN); cerrar la pestaña o el navegador la olvida y entonces hace falta
 *   el PIN.
 * - **Tope de intentos.** `MAX_PIN_ATTEMPTS` fallos seguidos (contados en el
 *   disco) borran la copia y la clave envuelta.
 * - **Época.** `save()` recibe `isCurrent()`: si se cerró la sesión mientras
 *   llegaban los datos, no escribe (se comprueba dentro de la fila).
 * - **48 h.** La agenda caduca a las 48 h de guardarse.
 */

export const OFFLINE_AGENDA_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** OWASP Password Storage Cheat Sheet (2023): PBKDF2-HMAC-SHA256, 600 000 iteraciones. */
export const PBKDF2_ITERATIONS = 600_000;
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_PATTERN = /^\d{4,6}$/;

const FORMAT = 1;
const VAULT_ID = 'key';
const RECORD_ID = 'current';

export interface AgendaScope {
  /** `sub|tenantId` del access token. */
  owner: string;
  tenantId: string;
  locationId: string;
}

interface VaultRecord {
  v: number;
  owner: string;
  salt: Uint8Array;
  iterations: number;
  iv: Uint8Array;
  wrapped: ArrayBuffer;
  failures: number;
}

interface AgendaRecord extends AgendaScope {
  v: number;
  savedAt: number;
  iv: Uint8Array;
  data: ArrayBuffer;
}

export interface StoredAgenda<T> {
  scope: AgendaScope;
  savedAt: number;
  payload: T;
}

/** off: sin copia (nunca activada, quitada o borrada); locked: hay copia, falta el PIN en esta pestaña; ready: lista. */
export type VaultStatus = 'off' | 'locked' | 'ready';

export type UnlockResult = { ok: true } | { ok: false; remaining: number } | { ok: false; wiped: true };

export interface ReadExpectations {
  /** Dueño del token, si hay token (sin red puede no haberlo). */
  owner?: string | null;
  /** Sede activa; `null` = «Todas las sedes». */
  activeLocationId?: string | null;
}

export interface OfflineVaultDeps {
  kv: OfflineKv;
  /** `sessionStorage` de la pestaña. */
  tab: Storage;
  subtle?: SubtleCrypto;
  random?: (bytes: Uint8Array) => Uint8Array;
  now?: () => number;
  /** Solo tests: menos iteraciones para que corran rápido. */
  iterations?: number;
  /** Hay sesión con token para `owner` en esta pestaña: sin ella no se activa ni se guarda. */
  hasSession?: (owner: string) => boolean;
}

const TAB_KEY = 'dentalix.offline.key';

const enc = (value: unknown) => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value));
const b64 = {
  encode: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decode: (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
};

function agendaAad(r: Pick<AgendaRecord, 'v' | 'owner' | 'tenantId' | 'locationId' | 'savedAt'>): Uint8Array {
  return enc([r.v, r.owner, r.tenantId, r.locationId, r.savedAt]);
}

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function createOfflineVault<T>(deps: OfflineVaultDeps) {
  const { kv, tab } = deps;
  const subtle = deps.subtle ?? globalThis.crypto.subtle;
  const random = deps.random ?? ((bytes: Uint8Array) => globalThis.crypto.getRandomValues(bytes));
  const now = deps.now ?? Date.now;
  const iterations = deps.iterations ?? PBKDF2_ITERATIONS;
  const hasSession = deps.hasSession ?? (() => true);

  let memory: { owner: string; key: CryptoKey } | null = null;

  let queue: Promise<unknown> = Promise.resolve();
  const serial = <R>(op: () => Promise<R>): Promise<R> => {
    const next = queue.then(op, op);
    queue = next.catch(() => undefined);
    return next;
  };

  const importDataKey = (raw: Uint8Array) =>
    subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

  async function wrappingKey(pin: string, salt: Uint8Array, rounds: number): Promise<CryptoKey> {
    const base = await subtle.importKey('raw', enc(pin) as BufferSource, 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: rounds },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  function forgetTab(): void {
    memory = null;
    try {
      tab.removeItem(TAB_KEY);
    } catch {
      // Nada que borrar.
    }
  }

  async function rememberTab(owner: string, raw: Uint8Array): Promise<void> {
    memory = { owner, key: await importDataKey(raw) };
    try {
      tab.setItem(TAB_KEY, JSON.stringify({ owner, raw: b64.encode(raw) }));
    } catch {
      // Sin sessionStorage: vale en memoria hasta recargar.
    }
  }

  /** La clave de datos de la pestaña (memoria o sessionStorage), si es de `owner` (o de quien sea, sin `owner`). */
  async function tabKey(owner?: string | null): Promise<{ owner: string; key: CryptoKey } | null> {
    if (!memory) {
      try {
        const stored = JSON.parse(tab.getItem(TAB_KEY) ?? 'null') as { owner?: unknown; raw?: unknown } | null;
        if (stored && typeof stored.owner === 'string' && typeof stored.raw === 'string') {
          memory = { owner: stored.owner, key: await importDataKey(b64.decode(stored.raw)) };
        }
      } catch {
        memory = null;
      }
    }
    if (!memory) return null;
    return !owner || memory.owner === owner ? memory : null;
  }

  async function wipeAll(): Promise<void> {
    forgetTab();
    await kv.clear('agenda');
    await kv.clear('vault');
  }

  async function vault(): Promise<VaultRecord | undefined> {
    const record = await kv.get<VaultRecord>('vault', VAULT_ID);
    return record && record.v === FORMAT ? record : undefined;
  }

  return {
    async status(owner?: string | null): Promise<VaultStatus> {
      return serial(async () => {
        const v = await vault();
        if (!v) return 'off';
        if (owner && v.owner !== owner) return 'off';
        const t = await tabKey(v.owner);
        return t ? 'ready' : 'locked';
      });
    },

    /**
     * Activa la copia: clave de datos nueva envuelta con el PIN. Solo con
     * sesión en la pestaña y si la sesión sigue viva al terminar.
     */
    enable(owner: string, pin: string, opts: { isCurrent?: () => boolean } = {}): Promise<boolean> {
      const isCurrent = opts.isCurrent ?? (() => true);
      if (!isValidPin(pin)) return Promise.resolve(false);
      return serial(async () => {
        if (!isCurrent() || !hasSession(owner)) return false;
        const raw = random(new Uint8Array(32));
        const salt = random(new Uint8Array(16));
        const iv = random(new Uint8Array(12));
        const kek = await wrappingKey(pin, salt, iterations);
        const wrapped = await subtle.encrypt(
          { name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc(owner) as BufferSource },
          kek,
          raw as BufferSource,
        );
        if (!isCurrent() || !hasSession(owner)) return false;
        await wipeAll();
        await kv.put<VaultRecord>('vault', VAULT_ID, { v: FORMAT, owner, salt, iterations, iv, wrapped, failures: 0 });
        await rememberTab(owner, raw);
        raw.fill(0);
        return true;
      });
    },

    /** Desenvuelve la clave con el PIN (sin red tras reiniciar, o en otra pestaña). */
    unlock(pin: string): Promise<UnlockResult> {
      return serial(async () => {
        const v = await vault();
        if (!v) return { ok: false, wiped: true } as const;
        try {
          if (!isValidPin(pin)) throw new Error('pin');
          const kek = await wrappingKey(pin, v.salt, v.iterations);
          const raw = new Uint8Array(
            await subtle.decrypt(
              { name: 'AES-GCM', iv: v.iv as BufferSource, additionalData: enc(v.owner) as BufferSource },
              kek,
              v.wrapped,
            ),
          );
          await rememberTab(v.owner, raw);
          raw.fill(0);
          if (v.failures) await kv.put<VaultRecord>('vault', VAULT_ID, { ...v, failures: 0 });
          return { ok: true } as const;
        } catch {
          const failures = v.failures + 1;
          if (failures >= MAX_PIN_ATTEMPTS) {
            await wipeAll();
            return { ok: false, wiped: true } as const;
          }
          await kv.put<VaultRecord>('vault', VAULT_ID, { ...v, failures });
          return { ok: false, remaining: MAX_PIN_ATTEMPTS - failures } as const;
        }
      });
    },

    /** Cifra y guarda la agenda. `false` si no hay clave en la pestaña, sin sesión o con la sesión ya cerrada. */
    save(scope: AgendaScope, payload: T, opts: { isCurrent?: () => boolean } = {}): Promise<boolean> {
      const isCurrent = opts.isCurrent ?? (() => true);
      return serial(async () => {
        if (!isCurrent() || !hasSession(scope.owner)) return false;
        const v = await vault();
        const t = await tabKey(scope.owner);
        if (!v || v.owner !== scope.owner || !t) return false;
        const meta = { v: FORMAT, ...scope, savedAt: now() };
        const iv = random(new Uint8Array(12));
        const data = await subtle.encrypt(
          { name: 'AES-GCM', iv: iv as BufferSource, additionalData: agendaAad(meta) as BufferSource },
          t.key,
          enc(payload) as BufferSource,
        );
        if (!isCurrent()) return false;
        await kv.put<AgendaRecord>('agenda', RECORD_ID, { ...meta, iv, data });
        return true;
      });
    },

    /**
     * La agenda, o `null` si no hay, falta la clave en la pestaña (pide el
     * PIN antes), es de otro dueño u otra sede, caducó o no se descifra.
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
        if (expect.owner && expect.owner !== record.owner) {
          await wipeAll();
          return null;
        }
        if (expect.activeLocationId && expect.activeLocationId !== record.locationId) return drop();
        const t = await tabKey(record.owner);
        if (!t) return null;
        try {
          const plain = await subtle.decrypt(
            { name: 'AES-GCM', iv: record.iv as BufferSource, additionalData: agendaAad(record) as BufferSource },
            t.key,
            record.data,
          );
          const { owner, tenantId, locationId } = record;
          return {
            scope: { owner, tenantId, locationId },
            savedAt: record.savedAt,
            payload: JSON.parse(new TextDecoder().decode(plain)) as T,
          };
        } catch {
          return drop();
        }
      });
    },

    /** Cambio de sede: fuera la agenda (la clave sigue). */
    wipeData(): Promise<void> {
      return serial(() => kv.clear('agenda'));
    },

    /** Cierre de sesión, 401, «Quitar copia sin conexión»: fuera todo. */
    wipe(): Promise<void> {
      return serial(wipeAll);
    },
  };
}

export type OfflineVault<T> = ReturnType<typeof createOfflineVault<T>>;
