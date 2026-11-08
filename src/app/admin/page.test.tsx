/**
 * @jest-environment node
 */
import type { ReactElement } from 'react';

const requestHeaders = new Map<string, string>();
jest.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null }),
}));
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
jest.mock('../../components/platform/platform-view', () => ({ PlatformView: () => null }));

import AdminPage from './page';
import { PlatformView } from '../../components/platform/platform-view';

function onHost(host: string | null, extra: Record<string, string> = {}) {
  requestHeaders.clear();
  if (host !== null) requestHeaders.set('host', host);
  for (const [k, v] of Object.entries(extra)) requestHeaders.set(k, v);
}

describe('/admin (DX-554-bis): solo en el dominio principal', () => {
  it.each([null, 'localhost:3001', '127.0.0.1:3001', 'dentalix.local', 'www.dentalix.local'])(
    '%s → vista de la plataforma',
    async (host) => {
      onHost(host);
      expect(((await AdminPage()) as ReactElement).type).toBe(PlatformView);
    },
  );

  it.each(['demo.localhost:3001', 'clinica.dentalix.local', 'clinica.test:3001', 'CLINICA.TEST'])(
    '%s → 404',
    async (host) => {
      onHost(host);
      await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );

  it('la cabecera x-tenant del proxy también da 404', async () => {
    onHost(null, { 'x-tenant': 'demo' });
    await expect(AdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
