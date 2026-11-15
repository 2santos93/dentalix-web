/**
 * Almacén clave-valor mínimo de la copia sin conexión (DX-405): la tabla
 * `agenda`, con la agenda CIFRADA. La clave no vive aquí sino en la pestaña
 * (`sessionStorage`, ver `encrypted-agenda-store.ts`). En el navegador es
 * IndexedDB; en los tests, memoria.
 */
export type OfflineTable = 'agenda';

export interface OfflineKv {
  get<T>(table: OfflineTable, key: string): Promise<T | undefined>;
  put<T>(table: OfflineTable, key: string, value: T): Promise<void>;
  delete(table: OfflineTable, key: string): Promise<void>;
  clear(table: OfflineTable): Promise<void>;
  /** Todas las claves de la tabla (para purgar copias caducadas). */
  keys(table: OfflineTable): Promise<string[]>;
}

const DB_NAME = 'dentalix-offline';
const DB_VERSION = 1;
const TABLES: readonly OfflineTable[] = ['agenda'];

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });
}

/** IndexedDB del origen de la clínica (cada clínica es un host: su propia base). */
export function indexedDbKv(): OfflineKv | null {
  if (typeof indexedDB === 'undefined') return null;
  let opening: Promise<IDBDatabase> | null = null;
  const db = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const table of TABLES) {
          if (!req.result.objectStoreNames.contains(table)) req.result.createObjectStore(table);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        opening = null;
        reject(req.error ?? new Error('IndexedDB'));
      };
    });
    return opening;
  };
  const run = async <T>(table: OfflineTable, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) => {
    const store = (await db()).transaction(table, mode).objectStore(table);
    return request(op(store));
  };
  return {
    get: <T>(table: OfflineTable, key: string) => run(table, 'readonly', (s) => s.get(key)) as Promise<T | undefined>,
    put: async (table, key, value) => {
      await run(table, 'readwrite', (s) => s.put(value, key));
    },
    delete: async (table, key) => {
      await run(table, 'readwrite', (s) => s.delete(key));
    },
    clear: async (table) => {
      await run(table, 'readwrite', (s) => s.clear());
    },
    keys: async (table) => (await run(table, 'readonly', (s) => s.getAllKeys())).map(String),
  };
}

/** En memoria (tests). */
export function memoryKv(): OfflineKv & { tables: Record<OfflineTable, Map<string, unknown>> } {
  const tables: Record<OfflineTable, Map<string, unknown>> = { agenda: new Map() };
  return {
    tables,
    get: async <T>(table: OfflineTable, key: string) => tables[table].get(key) as T | undefined,
    put: async (table, key, value) => {
      tables[table].set(key, value);
    },
    delete: async (table, key) => {
      tables[table].delete(key);
    },
    clear: async (table) => {
      tables[table].clear();
    },
    keys: async (table) => [...tables[table].keys()],
  };
}
