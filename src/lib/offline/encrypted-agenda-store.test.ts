/**
 * @jest-environment node
 */
import { webcrypto } from 'node:crypto';
import { createEncryptedAgendaStore, OFFLINE_AGENDA_MAX_AGE_MS, type AgendaScope } from './encrypted-agenda-store';
import { memoryKv } from './offline-kv';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const random = (bytes: Uint8Array) => webcrypto.getRandomValues(bytes);

const SCOPE: AgendaScope = { owner: 'user-1|tenant-1', tenantId: 'tenant-1', locationId: 'sede-centro' };
const PAYLOAD = { appointments: [{ patientName: 'María Pérez', phone: '+58 412 1234567', medicalAlert: true }] };

function setup(start = Date.parse('2026-11-15T12:00:00Z')) {
  const kv = memoryKv();
  let clock = start;
  const store = createEncryptedAgendaStore<typeof PAYLOAD>({ kv, subtle, random, now: () => clock });
  return {
    kv,
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
    const raw = kv.tables.agenda.get('current') as { data: ArrayBuffer };
    const bytes = new TextDecoder().decode(new Uint8Array(raw.data));
    expect(bytes).not.toContain('María');
    expect(bytes).not.toContain('412');
    const read = await store.read({ owner: SCOPE.owner, activeLocationId: SCOPE.locationId });
    expect(read?.payload).toEqual(PAYLOAD);
    expect(read?.scope).toEqual(SCOPE);
    expect(read?.savedAt).toBe(Date.parse('2026-11-15T12:00:00Z'));
  });

  it('la clave de sesión no es extraíble', async () => {
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const { key } = kv.tables.keys.get('session') as { key: CryptoKey };
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
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const other = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    kv.tables.keys.set('session', { owner: SCOPE.owner, key: other, createdAt: 0 });
    expect(await store.read()).toBeNull();
    expect(kv.tables.agenda.size).toBe(0);
  });

  it('otra sesión (otro usuario) no la lee y se borra todo, clave incluida', async () => {
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    expect(await store.read({ owner: 'user-2|tenant-1' })).toBeNull();
    expect(kv.tables.agenda.size).toBe(0);
    expect(kv.tables.keys.size).toBe(0);
  });

  it('guardar con otra sesión genera otra clave: lo anterior no se puede descifrar', async () => {
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const first = kv.tables.keys.get('session') as { key: CryptoKey };
    await store.save({ ...SCOPE, owner: 'user-2|tenant-1' }, PAYLOAD);
    const second = kv.tables.keys.get('session') as { key: CryptoKey; owner: string };
    expect(second.owner).toBe('user-2|tenant-1');
    expect(second.key).not.toBe(first.key);
  });

  it('manipular la hora de guardado (AAD) rompe el descifrado', async () => {
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    const rec = kv.tables.agenda.get('current') as { savedAt: number };
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
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    await store.wipe();
    expect(kv.tables.keys.size).toBe(0);
    expect(kv.tables.agenda.size).toBe(0);
    expect(await store.read()).toBeNull();
  });

  it('cambiar de sede borra la agenda (y leer con otra sede activa también)', async () => {
    const { kv, store } = setup();
    await store.save(SCOPE, PAYLOAD);
    await store.wipeData();
    expect(kv.tables.agenda.size).toBe(0);
    expect(kv.tables.keys.size).toBe(1);

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
});
