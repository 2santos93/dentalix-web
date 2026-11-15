import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { createOfflineVault } from './offline-vault';
import { memoryKv } from './offline-kv';
import {
  enableOfflineCopy,
  forgetOfflineSession,
  markOfflineSession,
  offlineSessionOwner,
  resetOfflineAgendaForTests,
  setOfflineVaultForTests,
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

function useMemoryVault() {
  const kv = memoryKv();
  setOfflineVaultForTests(
    createOfflineVault<OfflineAgenda>({
      kv,
      tab: window.sessionStorage,
      subtle,
      random,
      iterations: 1000,
      hasSession: (owner: string) => offlineSessionOwner() === owner,
    }),
  );
  return kv;
}

describe('copia sin conexión: sesión, PIN y época (DX-405)', () => {
  beforeEach(() => {
    resetOfflineAgendaForTests();
    window.sessionStorage.clear();
    mockApiFetch.mockReset();
  });

  it('sin activar (sin PIN) no pide ni guarda nada', async () => {
    const kv = useMemoryVault();
    markOfflineSession(TOKEN);
    expect(await syncOfflineAgenda(TOKEN, 'sede-1')).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(kv.tables.agenda.size).toBe(0);
  });

  it('activada con PIN y con sesión: guarda', async () => {
    const kv = useMemoryVault();
    expect(await enableOfflineCopy(TOKEN, '2468')).toBe(true);
    mockApiFetch.mockResolvedValue(AGENDA);
    expect(await syncOfflineAgenda(TOKEN, 'sede-1')).toBe(true);
    expect(kv.tables.agenda.size).toBe(1);
  });

  it('carrera: cerrar sesión entre la petición y el guardado no deja nada guardado', async () => {
    const kv = useMemoryVault();
    await enableOfflineCopy(TOKEN, '2468');
    let answer!: (value: OfflineAgenda) => void;
    mockApiFetch.mockReturnValue(
      new Promise<OfflineAgenda>((resolve) => {
        answer = resolve;
      }),
    );
    const syncing = syncOfflineAgenda(TOKEN, 'sede-1');
    await new Promise((r) => setTimeout(r, 0));
    expect(mockApiFetch).toHaveBeenCalled();
    await forgetOfflineSession();
    answer(AGENDA);
    expect(await syncing).toBe(false);
    expect(kv.tables.agenda.size).toBe(0);
    expect(kv.tables.vault.size).toBe(0);
    expect(offlineSessionOwner()).toBeNull();
  });

  it('carrera aunque se vuelva a activar en la pestaña: la época antigua no escribe', async () => {
    const kv = useMemoryVault();
    await enableOfflineCopy(TOKEN, '2468');
    let answer!: (value: OfflineAgenda) => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise<OfflineAgenda>((resolve) => {
        answer = resolve;
      }),
    );
    const syncing = syncOfflineAgenda(TOKEN, 'sede-1');
    await new Promise((r) => setTimeout(r, 0));
    await forgetOfflineSession();
    await enableOfflineCopy(TOKEN, '1357');
    answer(AGENDA);
    expect(await syncing).toBe(false);
    expect(kv.tables.agenda.size).toBe(0);
  });
});
