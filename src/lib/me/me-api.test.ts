import { changePassword } from './me-api';
import { useAuthStore } from '@/lib/auth/auth-store';

describe('me-api changePassword', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    useAuthStore.getState().clear();
  });

  // Cambiar la contraseña cierra en el backend TODAS las sesiones previas
  // (el refresh token guardado deja de renovar) y devuelve un par nuevo para
  // este cliente. Si no se guarda, la sesión moriría en el próximo refresh.
  it('stores the fresh pair returned by POST /me/password', async () => {
    useAuthStore.getState().setTokens({ accessToken: 'OLD', refreshToken: 'R-OLD' });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accessToken: 'NEW', refreshToken: 'R-NEW' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await changePassword('OLD', 'OldPass1!', 'NewPass2!');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/me/password');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass2!',
    });
    expect(useAuthStore.getState().accessToken).toBe('NEW');
    expect(useAuthStore.getState().refreshToken).toBe('R-NEW');
  });

  it('keeps the current session when the backend answers 204 without a body', async () => {
    useAuthStore.getState().setTokens({ accessToken: 'OLD', refreshToken: 'R-OLD' });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    }) as unknown as typeof fetch;

    await changePassword('OLD', 'OldPass1!', 'NewPass2!');

    expect(useAuthStore.getState().accessToken).toBe('OLD');
    expect(useAuthStore.getState().refreshToken).toBe('R-OLD');
  });
});
