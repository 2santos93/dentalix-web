import { act, render, screen, waitFor } from '@testing-library/react';
import { AppShell } from './app-shell';
import CajaPage from '@/app/(app)/caja/page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { clinicLocation } from '@/lib/test/locations';

/**
 * FE-031 (DX-117): cuántas veces pide la web `GET /me` y `GET /locations` con
 * el shell montado y «Caja» abierta. Nada de la sesión ni de la API se mockea
 * salvo `fetch`: el contador ve las peticiones reales del cliente HTTP.
 */
jest.mock('next/navigation', () => ({
  usePathname: () => '/caja',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }) }));
// El arranque pediría `POST /auth/refresh` con la cookie: aquí la sesión ya está.
jest.mock('../../lib/auth/use-session-bootstrap', () => ({ useSessionBootstrap: jest.fn() }));

function jwt(claims: Record<string, unknown>): string {
  const part = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part('{"alg":"HS256"}')}.${part(JSON.stringify(claims))}.firma`;
}
const RECEPTION = { sub: 'u1', tenantId: 't1', role: 'RECEPTION' };

const profile = {
  id: 'u1',
  email: 'recepcion@example.test',
  fullName: 'Rosa Pérez',
  avatarUrl: null,
  emailVerifiedAt: null,
  memberships: [{ tenantId: 't1', clinicName: 'Sonrisa', role: 'RECEPTION' }],
};

const requests: string[] = [];
const realFetch = global.fetch;

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob([JSON.stringify(body)]),
  };
}

/** Solo `/me` y `/locations` responden; el resto, 404 (cada vista muestra su error). */
function fakeApi(input: RequestInfo | URL) {
  const url = new URL(String(input), 'http://demo.localhost:3001');
  requests.push(url.pathname);
  if (url.pathname === '/api/v1/me') return Promise.resolve(reply(200, profile));
  if (url.pathname === '/api/v1/locations') return Promise.resolve(reply(200, [clinicLocation()]));
  return Promise.resolve(reply(404, { statusCode: 404, message: 'Not Found' }));
}

const count = (path: string) => requests.filter((p) => p === path).length;

describe('AppShell + Caja: peticiones de sesión (FE-031)', () => {
  beforeEach(() => {
    requests.length = 0;
    window.localStorage.clear();
    global.fetch = jest.fn(fakeApi) as unknown as typeof fetch;
    act(() => useAuthStore.getState().setAccessToken(jwt({ ...RECEPTION, iat: 1 })));
  });
  afterEach(() => {
    act(() => useAuthStore.getState().clear());
    global.fetch = realFetch;
  });

  function mountCaja() {
    return render(
      <AppShell>
        <CajaPage />
      </AppShell>,
    );
  }

  /** Espera a que el shell (las dos copias) y la Caja hayan pintado con /me y /locations. */
  async function settled() {
    await waitFor(() => expect(screen.getAllByText('Rosa Pérez').length).toBeGreaterThan(0));
    await waitFor(() => expect(document.querySelectorAll('select[data-location-switcher]').length).toBe(2));
    // Deja correr los efectos que aún pudieran pedir algo.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  }

  it('montar el shell y abrir «Caja»: un GET /me y un GET /locations', async () => {
    mountCaja();
    await settled();
    expect(count('/api/v1/me')).toBe(1);
    expect(count('/api/v1/locations')).toBe(1);
  });

  it('renovar el access token no vuelve a pedirlos; cambiar de sede relee /locations', async () => {
    mountCaja();
    await settled();
    act(() => useAuthStore.getState().setAccessToken(jwt({ ...RECEPTION, iat: 2 })));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(count('/api/v1/me')).toBe(1);
    expect(count('/api/v1/locations')).toBe(1);

    act(() => setActiveLocationId('loc-1'));
    await waitFor(() => expect(count('/api/v1/locations')).toBe(2));
    expect(count('/api/v1/me')).toBe(1);
  });
});
