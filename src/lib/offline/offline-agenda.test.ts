import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { createOfflineVault } from './offline-vault';
import { memoryKv } from './offline-kv';
import { installMemoryDraftStore, uninstallDraftStore } from '../test/draft-store';
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

describe('cerrar sesión borra los borradores del usuario (DX-574)', () => {
  beforeEach(() => {
    resetOfflineAgendaForTests();
    window.sessionStorage.clear();
  });
  afterEach(() => uninstallDraftStore());

  const mine = { owner: 'user-1|tenant-1', patientId: 'pac-1', form: 'evolution' as const };
  const other = { owner: 'user-2|tenant-1', patientId: 'pac-1', form: 'evolution' as const };

  it('con la marca de la pestaña borra solo los de ese usuario', async () => {
    const drafts = await installMemoryDraftStore();
    await drafts.seed(mine, { notes: 'mía' }, 'k1');
    await drafts.seed(other, { notes: 'de otro' }, 'k2');
    markOfflineSession(TOKEN);
    await forgetOfflineSession();
    expect(await drafts.store.has(mine)).toBe(false);
    expect(await drafts.store.has(other)).toBe(true);
  });

  it('sin saber quién era (sin marca) borra todos los del equipo', async () => {
    const drafts = await installMemoryDraftStore();
    await drafts.seed(mine, { notes: 'mía' }, 'k1');
    await drafts.seed(other, { notes: 'de otro' }, 'k2');
    await forgetOfflineSession();
    expect(drafts.kv.tables.drafts.size).toBe(0);
  });
});

