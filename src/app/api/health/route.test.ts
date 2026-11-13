/** @jest-environment node */
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { GET, HEAD, dynamic } from './route';
import { config } from '@/proxy';
import { SHUTTING_DOWN } from '@/lib/shutdown-state';

const flags = globalThis as Record<symbol, unknown>;
const fetchSpy = jest.fn();

beforeEach(() => {
  delete flags[SHUTTING_DOWN];
  fetchSpy.mockReset();
  global.fetch = fetchSpy as unknown as typeof fetch;
});
afterAll(() => {
  delete flags[SHUTTING_DOWN];
});

describe('GET /api/health (DX-458)', () => {
  it('200 con {"status":"ok"}, sin caché y sin llamar a la API', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"status":"ok"}');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no expone versión, tenant, host ni ningún otro dato: solo `status`', async () => {
    const body = JSON.parse(await GET().text());
    expect(Object.keys(body)).toEqual(['status']);
    expect([...GET().headers.keys()].sort()).toEqual(['cache-control', 'content-type']);
  });

  it('503 {"status":"draining"} en cuanto el proceso recibe SIGTERM (server-entry.cjs)', async () => {
    flags[SHUTTING_DOWN] = true;
    const res = GET();
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"status":"draining"}');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('HEAD: el mismo estado sin cuerpo', async () => {
    expect(HEAD().status).toBe(200);
    expect(await HEAD().text()).toBe('');
    flags[SHUTTING_DOWN] = true;
    expect(HEAD().status).toBe(503);
  });

  it('dinámica: nunca se prerenderiza al compilar', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('no pasa por src/proxy.ts: ni tenant por host, ni reescritura, ni redirección, ni CSP', () => {
    for (const url of ['/api/health', 'http://demo.dentalix.app/api/health', 'http://dentalix.app/api/health']) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
    }
    // Control: las páginas y /api/v1 sí pasan (la comprobación no es vacía).
    expect(unstable_doesMiddlewareMatch({ config, url: '/login' })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: '/api/v1/health/ready' })).toBe(true);
  });

  it('el símbolo es el mismo que marca la imagen al apagar (scripts/docker/server-entry.cjs)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- el módulo CommonJS de la imagen
    const entry = require('../../../../scripts/docker/server-entry.cjs') as { SHUTTING_DOWN: symbol };
    expect(entry.SHUTTING_DOWN).toBe(SHUTTING_DOWN);
  });
});
