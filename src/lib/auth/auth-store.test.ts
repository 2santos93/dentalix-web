import { useAuthStore } from './auth-store';

describe('useAuthStore', () => {
  beforeEach(() => useAuthStore.getState().clear());

  it('stores and clears tokens', () => {
    useAuthStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r' });
    expect(useAuthStore.getState().accessToken).toBe('a');
    useAuthStore.getState().clear();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
