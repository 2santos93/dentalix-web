import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { createEncryptedAgendaStore, memoryKeyHolder } from './encrypted-agenda-store';
import { memoryKv } from './offline-kv';
import {
  forgetOfflineSession,
  markOfflineSession,
  offlineSessionOwner,
  readOfflineAgenda,
  resetOfflineAgendaStoreForTests,
  setOfflineAgendaStoreForTests,
  syncOfflineAgenda,
  type OfflineAgenda,
} from './offline-agenda';

const mockApiFetch = jest.fn();
jest.mock('../api/client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// jsdom (hace falta su sessionStorage) no trae TextEncoder.
Object.assign(globalThis, { TextEncoder, TextDecoder });

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const random = (bytes: Uint8Array) => webcrypto.getRandomValues(bytes);

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64(claims)}.sig`;
}
const TOKEN = jwt({ sub: 'user-1', tenantId: 'tenant-1', role: 'RECEPTION' });
const AGENDA = { locationId: 'sede-1', appointments: [] } as unknown as OfflineAgenda;

function memoryStore() {
  const kv = memoryKv();
  const keys = memoryKeyHolder(subtle);
  const store = createEncryptedAgendaStore<OfflineAgenda>({
    kv,
    keys,
    subtle,
    random,
    canCreateKey: (owner) => offlineSessionOwner() === owner,
  });
  setOfflineAgendaStoreForTests(store);
  return { kv, keys };
}

describe('copia sin conexión: sesión de la pestaña y época (DX-405)', () => {
  beforeEach(() => {
    resetOfflineAgendaStoreForTests();
    window.sessionStorage.clear();
    mockApiFetch.mockReset();
  });

  it('con la marca de sesión de la pestaña guarda y se lee', async () => {
    const { kv } = memoryStore();
    markOfflineSession(TOKEN);
    mockApiFetch.mockResolvedValue(AGENDA);
    expect(await syncOfflineAgenda(TOKEN, 'sede-1')).toBe(true);
    expect(kv.tables.agenda.size).toBe(1);
    expect((await readOfflineAgenda({}))?.payload).toEqual(AGENDA);
  });

  it('sin la marca (otra pestaña, navegador nuevo) ni pide ni guarda ni enseña', async () => {
    const { kv, keys } = memoryStore();
    mockApiFetch.mockResolvedValue(AGENDA);
    expect(await syncOfflineAgenda(TOKEN, 'sede-1')).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(kv.tables.agenda.size).toBe(0);
    expect(keys.record).toBeUndefined();
    expect(await readOfflineAgenda({})).toBeNull();
  });

  it('carrera: cerrar sesión entre la petición y el guardado no deja nada guardado', async () => {
    const { kv, keys } = memoryStore();
    markOfflineSession(TOKEN);
    let answer!: (value: OfflineAgenda) => void;
    mockApiFetch.mockReturnValue(
      new Promise<OfflineAgenda>((resolve) => {
        answer = resolve;
      }),
    );
    const syncing = syncOfflineAgenda(TOKEN, 'sede-1');
    // La petición está en vuelo: se cierra sesión.
    await forgetOfflineSession();
    expect(offlineSessionOwner()).toBeNull();
    // Llega la respuesta tarde.
    answer(AGENDA);
    expect(await syncing).toBe(false);
    expect(kv.tables.agenda.size).toBe(0);
    expect(keys.record).toBeUndefined();
  });

  it('carrera aunque la marca se vuelva a poner (nuevo login en la pestaña): la época antigua no escribe', async () => {
    const { kv } = memoryStore();
    markOfflineSession(TOKEN);
    let answer!: (value: OfflineAgenda) => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise<OfflineAgenda>((resolve) => {
        answer = resolve;
      }),
    );
    const syncing = syncOfflineAgenda(TOKEN, 'sede-1');
    await forgetOfflineSession();
    markOfflineSession(TOKEN);
    answer(AGENDA);
    expect(await syncing).toBe(false);
    expect(kv.tables.agenda.size).toBe(0);
  });
});
