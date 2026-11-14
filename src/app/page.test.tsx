/**
 * @jest-environment node
 */
import type { ReactElement } from 'react';

const requestHeaders = new Map<string, string>();
jest.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null }),
}));
jest.mock('../components/marketing/landing-page', () => ({ LandingPage: () => null }));
jest.mock('../components/auth/clinic-entry', () => ({ ClinicEntry: () => null }));

import Home, { generateMetadata } from './page';
import { LandingPage } from '../components/marketing/landing-page';
import { ClinicEntry } from '../components/auth/clinic-entry';

function onHost(host: string | null, extra: Record<string, string> = {}) {
  requestHeaders.clear();
  if (host !== null) requestHeaders.set('host', host);
  for (const [k, v] of Object.entries(extra)) requestHeaders.set(k, v);
}

describe('«/» (DX-554): landing solo en el dominio principal', () => {
  it.each([null, 'localhost:3001', '127.0.0.1:3001', 'dentalix.local', 'www.dentalix.local'])(
    '%s → landing de Dentalix, con sus metadatos de siempre',
    async (host) => {
      onHost(host);
      expect(((await Home()) as ReactElement).type).toBe(LandingPage);
      expect(await generateMetadata()).toEqual({});
    },
  );

  it.each(['demo.localhost:3001', 'clinica.dentalix.local', 'clinica.test:3001', 'CLINICA.TEST'])(
    '%s → entrada de la clínica, sin indexar',
    async (host) => {
      onHost(host);
      expect(((await Home()) as ReactElement).type).toBe(ClinicEntry);
      expect(await generateMetadata()).toEqual({ robots: { index: false, follow: false } });
    },
  );

  it('la cabecera x-tenant del proxy también marca la clínica', async () => {
    onHost(null, { 'x-tenant': 'demo' });
    expect(((await Home()) as ReactElement).type).toBe(ClinicEntry);
  });
});
