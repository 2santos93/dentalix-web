import { useAuthStore } from './auth-store';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({ accessToken: null, _hasHydrated: false });
  });

  it('guarda el access token solo en memoria y marca la sesión como resuelta', () => {
    useAuthStore.getState().setAccessToken('a');

    expect(useAuthStore.getState().accessToken).toBe('a');
    expect(useAuthStore.getState()._hasHydrated).toBe(true);
    // DX-062: nada de tokens en el almacenamiento del navegador.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('arranca sin sesión y sin resolver hasta que el arranque de sesión termine', () => {
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState()._hasHydrated).toBe(false);

    useAuthStore.getState().markResolved();

    expect(useAuthStore.getState()._hasHydrated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('clear() olvida el access token y deja la sesión resuelta (sin sesión)', () => {
    useAuthStore.getState().setAccessToken('a');

    useAuthStore.getState().clear();

    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState()._hasHydrated).toBe(true);
  });
});
