/**
 * @jest-environment node
 */
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import { memoryKv } from '@/lib/offline/offline-kv';
import { createDraftStore, DRAFT_MAX_AGE_MS, serializeScope, type DraftScope } from './draft-store';
import { importDraftKey } from './draft-key';

Object.assign(globalThis, { TextEncoder, TextDecoder });

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const random = (bytes: Uint8Array) => webcrypto.getRandomValues(bytes);

const ANA = 'user-ana|tenant-caracas';
const LUIS = 'user-luis|tenant-caracas';
const ANA_OTRA_CLINICA = 'user-ana|tenant-valencia';
const EVOLUTION: DraftScope = { owner: ANA, patientId: 'pac-maria', form: 'evolution' };
const NOTE = { notes: 'Resina en 36 por caries oclusal. Se cobra en USD.' };

/** Una clave «del servidor» por dueño, determinista como la de la API. */
async function serverKeys() {
  const raw = new Map<string, string>();
  const keyFor = (owner: string) => {
    if (!raw.has(owner)) raw.set(owner, Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64'));
    return importDraftKey(subtle, raw.get(owner)!);
  };
  return keyFor;
}

async function setup(opts: { shared?: boolean } = {}) {
  const kv = memoryKv();
  let clock = Date.parse('2026-11-18T14:05:00Z');
  const getKey = jest.fn(await serverKeys());
  const store = createDraftStore({
    kv,
    subtle,
    random,
    now: () => clock,
    getKey,
    isShared: () => opts.shared ?? false,
  });
  return {
    kv,
    store,
    getKey,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('almacén cifrado de borradores (DX-574)', () => {
  it('guarda y recupera el borrador con su hora; el texto no se guarda en claro', async () => {
    const { kv, store } = await setup();
    expect(await store.save(EVOLUTION, NOTE)).toBe(true);
    expect(await store.load(EVOLUTION)).toEqual({ payload: NOTE, savedAt: Date.parse('2026-11-18T14:05:00Z') });
    const [key] = [...kv.tables.drafts.keys()];
    // La clave del registro es un hash: ni el paciente ni el usuario en claro.
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('pac-maria');
    const record = kv.tables.drafts.get(key) as { data: ArrayBuffer };
    expect(Buffer.from(record.data).toString('utf8')).not.toContain('Resina');
  });

  it('caduca a las 72 h: ya no se ofrece y se purga', async () => {
    const { kv, store, advance } = await setup();
    await store.save(EVOLUTION, NOTE);
    advance(DRAFT_MAX_AGE_MS - 1000);
    expect(await store.load(EVOLUTION)).not.toBeNull();
    advance(2000);
    expect(await store.has(EVOLUTION)).toBe(false);
    expect(await store.load(EVOLUTION)).toBeNull();
    expect(kv.tables.drafts.size).toBe(0);
  });

  it('purga los caducados de otros alcances en la primera lectura', async () => {
    const { kv, advance, getKey } = await setup();
    let clock = Date.parse('2026-11-18T14:05:00Z');
    const first = createDraftStore({ kv, subtle, random, now: () => clock, getKey });
    await first.save({ ...EVOLUTION, patientId: 'pac-jose' }, NOTE);
    clock += DRAFT_MAX_AGE_MS + 1;
    advance(0);
    const later = createDraftStore({ kv, subtle, random, now: () => clock, getKey });
    expect(await later.load(EVOLUTION)).toBeNull();
    expect(kv.tables.drafts.size).toBe(0);
  });

  it('aislado por usuario, por clínica, por paciente y por formulario', async () => {
    const { store } = await setup();
    await store.save(EVOLUTION, NOTE);
    expect(await store.load({ ...EVOLUTION, owner: LUIS })).toBeNull();
    expect(await store.load({ ...EVOLUTION, owner: ANA_OTRA_CLINICA })).toBeNull();
    expect(await store.load({ ...EVOLUTION, patientId: 'pac-jose' })).toBeNull();
    expect(await store.load({ ...EVOLUTION, form: 'prescription' })).toBeNull();
    expect(await store.load({ ...EVOLUTION, variant: 'cita-1' })).toBeNull();
    expect(await store.load(EVOLUTION)).not.toBeNull();
  });

  it('otro dueño nunca lee un registro aunque tenga su clave de registro', async () => {
    const { kv, store } = await setup();
    await store.save(EVOLUTION, NOTE);
    // Un registro de Ana colocado en la clave que calcularía Luis.
    const [anaKey] = [...kv.tables.drafts.keys()];
    const record = kv.tables.drafts.get(anaKey);
    const luisScope = { ...EVOLUTION, owner: LUIS };
    const luisKey = Buffer.from(
      await subtle.digest('SHA-256', new TextEncoder().encode(serializeScope(luisScope))),
    ).toString('hex');
    kv.tables.drafts.set(luisKey, record);
    expect(await store.load(luisScope)).toBeNull();
  });

  it('AAD: un registro copiado a otro alcance del mismo dueño no se descifra (y se descarta)', async () => {
    const { kv, store } = await setup();
    await store.save(EVOLUTION, NOTE);
    const [key] = [...kv.tables.drafts.keys()];
    const record = kv.tables.drafts.get(key);
    const other: DraftScope = { ...EVOLUTION, patientId: 'pac-jose' };
    const otherKey = Buffer.from(
      await subtle.digest('SHA-256', new TextEncoder().encode(serializeScope(other))),
    ).toString('hex');
    kv.tables.drafts.set(otherKey, record);
    expect(await store.load(other)).toBeNull();
    expect(kv.tables.drafts.has(otherKey)).toBe(false);
    expect(await store.load(EVOLUTION)).not.toBeNull();
  });

  it('wipeOwner borra solo los del usuario; wipeAll, todos', async () => {
    const { kv, store } = await setup();
    await store.save(EVOLUTION, NOTE);
    await store.save({ ...EVOLUTION, form: 'anamnesis' }, { notes: 'Alergia a penicilina' });
    await store.save({ ...EVOLUTION, owner: LUIS }, NOTE);
    await store.wipeOwner(ANA);
    expect(kv.tables.drafts.size).toBe(1);
    expect(await store.load({ ...EVOLUTION, owner: LUIS })).not.toBeNull();
    await store.wipeAll();
    expect(kv.tables.drafts.size).toBe(0);
  });

  it('en un equipo compartido no guarda nada (ni pide la clave)', async () => {
    const { kv, store, getKey } = await setup({ shared: true });
    expect(await store.save(EVOLUTION, NOTE)).toBe(false);
    expect(kv.tables.drafts.size).toBe(0);
    expect(getKey).not.toHaveBeenCalled();
  });

  it('sin clave (sin red al recargar): peek dice que hay borrador y load lanza', async () => {
    const { kv, store } = await setup();
    await store.save(EVOLUTION, NOTE);
    const offline = createDraftStore({
      kv,
      subtle,
      random,
      now: () => Date.parse('2026-11-18T15:00:00Z'),
      getKey: () => Promise.reject(new Error('Network request failed')),
    });
    expect(await offline.peek(EVOLUTION)).toEqual({ savedAt: Date.parse('2026-11-18T14:05:00Z') });
    await expect(offline.load(EVOLUTION)).rejects.toThrow();
    // El registro sigue ahí para cuando vuelva la red.
    expect(kv.tables.drafts.size).toBe(1);
  });

  it('la clave cambió (tokenVersion nueva tras cambiar la contraseña o el MFA): sin borrador, sin error, y se borra', async () => {
    const { kv, store, getKey } = await setup();
    await store.save(EVOLUTION, NOTE);
    expect(kv.tables.drafts.size).toBe(1);
    // La sesión nueva recibe OTRA clave del servidor para el mismo dueño.
    const rotated = await importDraftKey(subtle, Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))).toString('base64'));
    getKey.mockResolvedValue(rotated);

    await expect(store.load(EVOLUTION)).resolves.toBeNull();
    expect(kv.tables.drafts.size).toBe(0);
    expect(await store.has(EVOLUTION)).toBe(false);
  });

  it('remove borra el borrador del alcance', async () => {
    const { store } = await setup();
    await store.save(EVOLUTION, NOTE);
    await store.remove(EVOLUTION);
    expect(await store.has(EVOLUTION)).toBe(false);
  });

  it('la clave importada no es extraíble y exige 32 bytes', async () => {
    const key = await importDraftKey(subtle, Buffer.alloc(32, 7).toString('base64'));
    expect(key.extractable).toBe(false);
    await expect(subtle.exportKey('raw', key)).rejects.toThrow();
    await expect(importDraftKey(subtle, Buffer.alloc(16).toString('base64'))).rejects.toThrow('DRAFT_KEY_INVALID');
  });
});
