/**
 * @jest-environment node
 */
import { webcrypto } from 'node:crypto';
import {
  createEncryptedAgendaStore,
  memoryKeyHolder,
  sessionStorageKeyHolder,
  OFFLINE_AGENDA_MAX_AGE_MS,
  type AgendaScope,
} from './encrypted-agenda-store';
import { memoryKv } from './offline-kv';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const random = (bytes: Uint8Array) => webcrypto.getRandomValues(bytes);

const SCOPE: AgendaScope = { owner: 'user-1|tenant-1', tenantId: 'tenant-1', locationId: 'sede-centro' };
const PAYLOAD = { appointments: [{ patientName: 'María Pérez', phone: '+58 412 1234567', medicalAlert: true }] };

function setup(start = Date.parse('2026-11-15T12:00:00Z')) {
  const kv = memoryKv();
  const keys = memoryKeyHolder(subtle);
  let clock = start;
  const store = createEncryptedAgendaStore<typeof PAYLOAD>({ kv, keys, subtle, random, now: () => clock });
  return {
    kv,
    keys,
    store,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('almacén cifrado de la agenda sin conexión (DX-405)', () => {
  it('cifra y descifra: lo guardado no está en claro y se lee igual', async () => {
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const raw = [...kv.tables.agenda.values()][0] as { data: ArrayBuffer };
    const bytes = new TextDecoder().decode(new Uint8Array(raw.data));
    expect(bytes).not.toContain('María');
    expect(bytes).not.toContain('412');
    const read = await store.read({ owner: SCOPE.owner, activeLocationId: SCOPE.locationId });
    expect(read?.payload).toEqual(PAYLOAD);
    expect(read?.scope).toEqual(SCOPE);
    expect(read?.savedAt).toBe(Date.parse('2026-11-15T12:00:00Z'));
  });

  it('la clave de sesión no es extraíble', async () => {
    const { keys, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const { key } = keys.record!;
    expect(key.extractable).toBe(false);
    await expect(subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('sin token (recarga sin red) también se lee: la clave del navegador basta', async () => {
    const { store } = setup();
    await store.save(SCOPE, PAYLOAD);
    expect((await store.read())?.payload).toEqual(PAYLOAD);
    expect((await store.read({ owner: null, activeLocationId: null }))?.payload).toEqual(PAYLOAD);
  });

  it('con una clave distinta no se lee nada y la copia se borra', async () => {
    const { kv, keys, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const other = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    keys.record = { ...keys.record!, key: other };
    expect(await store.read()).toBeNull();
    expect(kv.tables.agenda.size).toBe(0);
  });

  it('otra sesión (otro usuario) no la lee y se borra todo, clave incluida', async () => {
    const { kv, keys, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    expect(await store.read({ owner: 'user-2|tenant-1' })).toBeNull();
    expect(kv.tables.agenda.size).toBe(0);
    expect(keys.record).toBeUndefined();
  });

  it('guardar con otra sesión genera otra clave: lo anterior no se puede descifrar', async () => {
    const { keys, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const first = keys.record!;
    await store.save({ ...SCOPE, owner: 'user-2|tenant-1' }, PAYLOAD);
    const second = keys.record!;
    expect(second.owner).toBe('user-2|tenant-1');
    expect(second.key).not.toBe(first.key);
  });

  it('manipular la hora de guardado (AAD) rompe el descifrado', async () => {
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const rec = [...kv.tables.agenda.values()][0] as { savedAt: number };
    rec.savedAt += 60 * 60 * 1000;
    expect(await store.read()).toBeNull();
    expect(kv.tables.agenda.size).toBe(0);
  });

  it('caduca a las 48 h: justo antes se lee, después se borra', async () => {
    const { kv, store, advance } = setup();
    await store.save(SCOPE, PAYLOAD);
    advance(OFFLINE_AGENDA_MAX_AGE_MS);
    expect(await store.read()).not.toBeNull();
    advance(1);
    expect(await store.read()).toBeNull();
    expect(kv.tables.agenda.size).toBe(0);
  });

  it('cerrar sesión borra la clave y los datos', async () => {
    const { kv, keys, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    await store.wipe();
    expect(keys.record).toBeUndefined();
    expect(kv.tables.agenda.size).toBe(0);
    expect(await store.read()).toBeNull();
  });

  it('cambiar de sede borra la agenda (y leer con otra sede activa también)', async () => {
    const { kv, keys, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    await store.wipeData();
    expect(kv.tables.agenda.size).toBe(0);
    expect(keys.record).toBeDefined();

    await store.save(SCOPE, PAYLOAD);
    expect(await store.read({ activeLocationId: 'sede-norte' })).toBeNull();
    expect(kv.tables.agenda.size).toBe(0);
  });

  it('un borrado pedido durante un guardado va después (en fila)', async () => {
    const { store } = setup();
    const saving = store.save(SCOPE, PAYLOAD);
    const wiping = store.wipeData();
    await Promise.all([saving, wiping]);
    expect(await store.read()).toBeNull();
  });

  it('sin sesión en la pestaña no se genera clave ni se guarda', async () => {
    const kv = memoryKv();
    const keys = memoryKeyHolder(subtle);
    const store = createEncryptedAgendaStore<typeof PAYLOAD>({ kv, keys, subtle, random, canCreateKey: () => false });
    expect(await store.save(SCOPE, PAYLOAD)).toBe(false);
    expect(keys.record).toBeUndefined();
    expect(kv.tables.agenda.size).toBe(0);
  });

  it('si la sesión se cierra antes de escribir (época), no se guarda nada', async () => {
    const { kv, store } = setup();
    let current = true;
    const saving = store.save(SCOPE, PAYLOAD, { isCurrent: () => current });
    current = false; // el cierre de sesión sube la época mientras el guardado espera en la fila
    const wiping = store.wipe();
    expect(await saving).toBe(false);
    await wiping;
    expect(kv.tables.agenda.size).toBe(0);
  });
});

describe('clave en sessionStorage de la pestaña (DX-405)', () => {
  function fakeStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k) => map.get(k) ?? null,
      key: (i) => [...map.keys()][i] ?? null,
      removeItem: (k) => void map.delete(k),
      setItem: (k, v) => void map.set(k, v),
    };
  }

  it('recargar la pestaña (misma sessionStorage, memoria nueva) sigue leyendo la copia', async () => {
    const kv = memoryKv();
    const tab = fakeStorage();
    const first = createEncryptedAgendaStore<typeof PAYLOAD>({
      kv,
      keys: sessionStorageKeyHolder(tab, subtle, 'k'),
      subtle,
      random,
    });
    await first.save(SCOPE, PAYLOAD);
    const reloaded = createEncryptedAgendaStore<typeof PAYLOAD>({
      kv,
      keys: sessionStorageKeyHolder(tab, subtle, 'k'),
      subtle,
      random,
    });
    expect((await reloaded.read())?.payload).toEqual(PAYLOAD);
  });

  it('navegador abierto de nuevo (sessionStorage vacía): lo cifrado no se lee (sin clave, ilegible hasta purgarse)', async () => {
    const kv = memoryKv();
    const first = createEncryptedAgendaStore<typeof PAYLOAD>({
      kv,
      keys: sessionStorageKeyHolder(fakeStorage(), subtle, 'k'),
      subtle,
      random,
    });
    await first.save(SCOPE, PAYLOAD);
    const newBrowser = createEncryptedAgendaStore<typeof PAYLOAD>({
      kv,
      keys: sessionStorageKeyHolder(fakeStorage(), subtle, 'k'),
      subtle,
      random,
      canCreateKey: () => false,
    });
    expect(await newBrowser.read()).toBeNull();
    expect(kv.tables.agenda.size).toBe(1); // queda, pero sin clave no se descifra; el 401 o los 48 h la quitan
  });

  it('la clave en uso no es extraíble y el cierre de sesión la quita de la pestaña', async () => {
    const tab = fakeStorage();
    const holder = sessionStorageKeyHolder(tab, subtle, 'k');
    const { key } = await holder.create(SCOPE.owner);
    expect(key.extractable).toBe(false);
    expect(tab.getItem('k')).not.toBeNull();
    await holder.clear();
    expect(tab.getItem('k')).toBeNull();
    expect(await holder.get()).toBeUndefined();
  });

  it('dos pestañas (dos claves) no se pisan: cada una lee la suya', async () => {
    const kv = memoryKv();
    const tabA = createEncryptedAgendaStore<typeof PAYLOAD>({ kv, keys: memoryKeyHolder(subtle), subtle, random });
    const tabB = createEncryptedAgendaStore<typeof PAYLOAD>({ kv, keys: memoryKeyHolder(subtle), subtle, random });
    await tabA.save(SCOPE, PAYLOAD);
    await tabB.save(SCOPE, { appointments: [] });
    expect((await tabA.read())?.payload).toEqual(PAYLOAD);
    expect((await tabB.read())?.payload).toEqual({ appointments: [] });
    expect(kv.tables.agenda.size).toBe(2);
  });

  it('las copias de pestañas cerradas (sin clave) se purgan al caducar', async () => {
    const kv = memoryKv();
    let clock = Date.parse('2026-11-15T12:00:00Z');
    const closed = createEncryptedAgendaStore<typeof PAYLOAD>({ kv, keys: memoryKeyHolder(subtle), subtle, random, now: () => clock });
    await closed.save(SCOPE, PAYLOAD);
    clock += OFFLINE_AGENDA_MAX_AGE_MS + 1;
    const open = createEncryptedAgendaStore<typeof PAYLOAD>({ kv, keys: memoryKeyHolder(subtle), subtle, random, now: () => clock });
    await open.save(SCOPE, PAYLOAD);
    expect(kv.tables.agenda.size).toBe(1);
  });
});
