/**
 * @jest-environment node
 */
import { webcrypto } from 'node:crypto';
import {
  createOfflineVault,
  MAX_PIN_ATTEMPTS,
  OFFLINE_AGENDA_MAX_AGE_MS,
  PBKDF2_ITERATIONS,
  type AgendaScope,
} from './offline-vault';
import { memoryKv } from './offline-kv';

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const random = (bytes: Uint8Array) => webcrypto.getRandomValues(bytes);
const OWNER = 'user-1|tenant-1';
const SCOPE: AgendaScope = { owner: OWNER, tenantId: 'tenant-1', locationId: 'sede-centro' };
const PAYLOAD = { appointments: [{ patientName: 'María Pérez', phone: '+58 412 1234567', medicalAlert: true }] };
const PIN = '2468';

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

function setup(opts: { hasSession?: (owner: string) => boolean } = {}) {
  const kv = memoryKv();
  let clock = Date.parse('2026-11-15T12:00:00Z');
  const make = (tab: Storage = fakeStorage()) =>
    createOfflineVault<typeof PAYLOAD>({
      kv,
      tab,
      subtle,
      random,
      now: () => clock,
      // Pocas iteraciones en los tests (el valor real se comprueba aparte).
      iterations: 1000,
      hasSession: opts.hasSession,
    });
  return {
    kv,
    make,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('copia sin conexión con PIN (DX-405)', () => {
  it('PBKDF2 con las iteraciones de OWASP (≥ 600 000) y 5 intentos', () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(MAX_PIN_ATTEMPTS).toBe(5);
  });

  it('en el disco solo hay la clave envuelta, la salt y las iteraciones; la agenda, cifrada', async () => {
    const { kv, make } = setup();
    const vault = make();
    expect(await vault.status(OWNER)).toBe('off');
    expect(await vault.enable(OWNER, PIN)).toBe(true);
    expect(await vault.save(SCOPE, PAYLOAD)).toBe(true);
    const stored = kv.tables.vault.get('key') as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['failures', 'iterations', 'iv', 'owner', 'salt', 'v', 'wrapped'].sort());
    expect((stored.salt as Uint8Array).length).toBe(16);
    expect(stored.iterations).toBe(1000);
    // Nada usable: ningún CryptoKey en el disco (la marca de un CryptoKey, comprobada).
    const sample = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    expect(Object.prototype.toString.call(sample)).toBe('[object CryptoKey]');
    for (const value of [...kv.tables.vault.values(), ...kv.tables.agenda.values()]) {
      for (const field of Object.values(value as object)) expect(Object.prototype.toString.call(field)).not.toBe('[object CryptoKey]');
    }
    const data = new TextDecoder().decode(new Uint8Array((kv.tables.agenda.get('current') as { data: ArrayBuffer }).data));
    expect(data).not.toContain('María');
    expect((await vault.read())?.payload).toEqual(PAYLOAD);
  });

  it('pestaña nueva (o equipo reiniciado): bloqueada; con el PIN bueno se abre', async () => {
    const { make } = setup();
    const first = make();
    await first.enable(OWNER, PIN);
    await first.save(SCOPE, PAYLOAD);
    const restarted = make(fakeStorage());
    expect(await restarted.status()).toBe('locked');
    expect(await restarted.read()).toBeNull();
    expect(await restarted.unlock(PIN)).toEqual({ ok: true });
    expect(await restarted.status()).toBe('ready');
    expect((await restarted.read())?.payload).toEqual(PAYLOAD);
  });

  it('recargar la misma pestaña no pide el PIN (la clave está en su sessionStorage)', async () => {
    const { make } = setup();
    const tab = fakeStorage();
    const before = make(tab);
    await before.enable(OWNER, PIN);
    await before.save(SCOPE, PAYLOAD);
    const reloaded = make(tab);
    expect(await reloaded.status()).toBe('ready');
    expect((await reloaded.read())?.payload).toEqual(PAYLOAD);
  });

  it('PIN malo: no abre y cuenta el intento; el bueno reinicia la cuenta', async () => {
    const { kv, make } = setup();
    await make().enable(OWNER, PIN);
    const other = make(fakeStorage());
    expect(await other.unlock('1111')).toEqual({ ok: false, remaining: 4 });
    expect(await other.unlock('12')).toEqual({ ok: false, remaining: 3 });
    expect(await other.read()).toBeNull();
    expect(await other.unlock(PIN)).toEqual({ ok: true });
    expect((kv.tables.vault.get('key') as { failures: number }).failures).toBe(0);
  });

  it('5 fallos seguidos (también entre pestañas) borran la copia y la clave envuelta', async () => {
    const { kv, make } = setup();
    const first = make();
    await first.enable(OWNER, PIN);
    await first.save(SCOPE, PAYLOAD);
    for (let i = 0; i < 4; i += 1) expect((await make(fakeStorage()).unlock('0000')).ok).toBe(false);
    expect(await make(fakeStorage()).unlock('0000')).toEqual({ ok: false, wiped: true });
    expect(kv.tables.vault.size).toBe(0);
    expect(kv.tables.agenda.size).toBe(0);
    expect(await make(fakeStorage()).unlock(PIN)).toEqual({ ok: false, wiped: true });
  });

  it('sin sesión en la pestaña no se activa ni se guarda', async () => {
    const { kv, make } = setup({ hasSession: () => false });
    const vault = make();
    expect(await vault.enable(OWNER, PIN)).toBe(false);
    expect(kv.tables.vault.size).toBe(0);
    expect(await vault.save(SCOPE, PAYLOAD)).toBe(false);
  });

  it('PIN que no son 4–6 dígitos: no se activa', async () => {
    const { make } = setup();
    for (const pin of ['123', '1234567', 'abcd', '12 34']) expect(await make().enable(OWNER, pin)).toBe(false);
  });

  it('carrera: la sesión se cierra (época) antes de escribir → no se guarda', async () => {
    const { kv, make } = setup();
    const vault = make();
    await vault.enable(OWNER, PIN);
    let current = true;
    const saving = vault.save(SCOPE, PAYLOAD, { isCurrent: () => current });
    current = false;
    const wiping = vault.wipe();
    expect(await saving).toBe(false);
    await wiping;
    expect(kv.tables.agenda.size).toBe(0);
    expect(kv.tables.vault.size).toBe(0);
  });

  it('caduca a las 48 h; cambiar de sede borra la agenda; leer con otro dueño borra todo', async () => {
    const { kv, make, advance } = setup();
    const vault = make();
    await vault.enable(OWNER, PIN);
    await vault.save(SCOPE, PAYLOAD);
    advance(OFFLINE_AGENDA_MAX_AGE_MS);
    expect(await vault.read()).not.toBeNull();
    advance(1);
    expect(await vault.read()).toBeNull();

    await vault.save(SCOPE, PAYLOAD);
    expect(await vault.read({ activeLocationId: 'sede-norte' })).toBeNull();
    expect(kv.tables.agenda.size).toBe(0);

    await vault.save(SCOPE, PAYLOAD);
    await vault.wipeData();
    expect(kv.tables.agenda.size).toBe(0);
    expect(await vault.status(OWNER)).toBe('ready');

    await vault.save(SCOPE, PAYLOAD);
    expect(await vault.read({ owner: 'user-2|tenant-1' })).toBeNull();
    expect(kv.tables.vault.size).toBe(0);
    expect(await vault.status()).toBe('off');
  });

  it('manipular la hora de guardado (AAD) rompe el descifrado', async () => {
    const { kv, make } = setup();
    const vault = make();
    await vault.enable(OWNER, PIN);
    await vault.save(SCOPE, PAYLOAD);
    (kv.tables.agenda.get('current') as { savedAt: number }).savedAt += 3_600_000;
    expect(await vault.read()).toBeNull();
  });

  it('cerrar sesión (wipe) deja la pestaña y el disco sin nada', async () => {
    const { kv, make } = setup();
    const tab = fakeStorage();
    const vault = make(tab);
    await vault.enable(OWNER, PIN);
    await vault.save(SCOPE, PAYLOAD);
    await vault.wipe();
    expect(tab.length).toBe(0);
    expect(kv.tables.vault.size + kv.tables.agenda.size).toBe(0);
    expect(await vault.status()).toBe('off');
  });
});
