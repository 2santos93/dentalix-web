import { changePassword } from './me-api';
import { useAuthStore } from '@/lib/auth/auth-store';

describe('me-api changePassword', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    useAuthStore.getState().clear();
  });

  // Cambiar la contraseña cierra en el backend TODAS las sesiones previas
  // (el refresh de la cookie deja de renovar) y devuelve una sesión nueva para
  // este cliente: el refresh nuevo llega en la cookie HttpOnly (DX-062) y el
  // access token en el body, que se guarda en memoria.
  it('stores the fresh access token returned by POST /me/password', async () => {
    useAuthStore.getState().setAccessToken('OLD');
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ accessToken: 'NEW' }),
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
  });

  it('keeps the current session when the backend answers 204 without a body', async () => {
    useAuthStore.getState().setAccessToken('OLD');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
    }) as unknown as typeof fetch;

    await changePassword('OLD', 'OldPass1!', 'NewPass2!');

    expect(useAuthStore.getState().accessToken).toBe('OLD');
  });
});
