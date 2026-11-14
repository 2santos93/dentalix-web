import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { listLocations } from '@/lib/locations/locations-api';
import { getMe, type MyProfile } from '@/lib/me/me-api';
import { clinicLocation } from '@/lib/test/locations';
import {
  clearSessionStore,
  invalidateLocations,
  loadLocations,
  loadMe,
  putMe,
  sessionKeyOf,
  useLocations,
  useMe,
  useSessionLocations,
} from './session-store';

jest.mock('../locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../me/me-api', () => ({ getMe: jest.fn() }));
const listLocationsMock = jest.mocked(listLocations);
const getMeMock = jest.mocked(getMe);

function jwt(claims: Record<string, unknown>): string {
  const part = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part('{"alg":"HS256"}')}.${part(JSON.stringify(claims))}.firma`;
}
const ANA = { sub: 'u1', tenantId: 't1', role: 'ADMIN' };
const profile: MyProfile = {
  id: 'u1',
  email: 'ana@example.test',
  fullName: 'Ana Gómez',
  avatarUrl: null,
  emailVerifiedAt: null,
  memberships: [{ tenantId: 't1', clinicName: 'Sonrisa', role: 'ADMIN' }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lo que pinta el shell: el menú de cuenta y el selector de sede, dos veces cada uno. */
function ShellConsumers() {
  const me = useMe();
  const locations = useLocations();
  return (
    <p>
      {me.status}:{me.data?.fullName ?? '-'} {locations.status}:{locations.data?.length ?? '-'}
    </p>
  );
}

describe('session-store (FE-031)', () => {
  beforeEach(() => {
    listLocationsMock.mockReset().mockResolvedValue([clinicLocation()]);
    getMeMock.mockReset().mockResolvedValue(profile);
    window.localStorage.clear();
    act(() => useAuthStore.getState().setAccessToken(jwt({ ...ANA, iat: 1 })));
  });
  afterEach(() => {
    act(() => useAuthStore.getState().clear());
  });

  it('la clave es la sesión (usuario, clínica, rol, sedes), no el token', () => {
    expect(sessionKeyOf(jwt({ ...ANA, iat: 1 }))).toBe(sessionKeyOf(jwt({ ...ANA, iat: 2, exp: 9 })));
    expect(sessionKeyOf(jwt({ ...ANA, tenantId: 't2' }))).not.toBe(sessionKeyOf(jwt(ANA)));
    expect(sessionKeyOf(jwt({ ...ANA, loc: ['b', 'a'] }))).toBe(sessionKeyOf(jwt({ ...ANA, loc: ['a', 'b'] })));
    expect(sessionKeyOf(jwt({ ...ANA, loc: ['a'] }))).not.toBe(sessionKeyOf(jwt(ANA)));
    expect(sessionKeyOf(null)).toBeNull();
  });

  it('varios consumidores montados a la vez: un GET /me y un GET /locations', async () => {
    render(
      <>
        <ShellConsumers />
        <ShellConsumers />
      </>,
    );
    const token = useAuthStore.getState().accessToken!;
    // Una vista que lee por su cuenta mientras la del shell está en vuelo.
    await Promise.all([loadLocations(token), loadMe(token)]);
    await waitFor(() => expect(screen.getAllByText('ready:Ana Gómez ready:1')).toHaveLength(2));
    expect(getMeMock).toHaveBeenCalledTimes(1);
    expect(listLocationsMock).toHaveBeenCalledTimes(1);
  });

  it('renovar el access token no vuelve a pedir /me ni /locations', async () => {
    render(<ShellConsumers />);
    await screen.findByText('ready:Ana Gómez ready:1');
    act(() => useAuthStore.getState().setAccessToken(jwt({ ...ANA, iat: 2 })));
    const rotated = useAuthStore.getState().accessToken!;
    await loadLocations(rotated);
    await loadMe(rotated);
    expect(screen.getByText('ready:Ana Gómez ready:1')).toBeInTheDocument();
    expect(getMeMock).toHaveBeenCalledTimes(1);
    expect(listLocationsMock).toHaveBeenCalledTimes(1);
  });

  it('un token de otra sesión (otra clínica o sedes acotadas) vuelve a leer', async () => {
    render(<ShellConsumers />);
    await screen.findByText('ready:Ana Gómez ready:1');
    act(() => useAuthStore.getState().setAccessToken(jwt({ ...ANA, loc: ['loc-1'] })));
    await waitFor(() => expect(listLocationsMock).toHaveBeenCalledTimes(2));
    expect(getMeMock).toHaveBeenCalledTimes(2);
  });

  it('cambiar de sede invalida /locations (no /me) y los consumidores releen', async () => {
    const tokyo = clinicLocation({ id: 'tokyo', name: 'Tokio' });
    render(<ShellConsumers />);
    await screen.findByText('ready:Ana Gómez ready:1');
    listLocationsMock.mockResolvedValue([clinicLocation(), tokyo]);
    act(() => setActiveLocationId('loc-1'));
    expect(await screen.findByText('ready:Ana Gómez ready:2')).toBeInTheDocument();
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
    expect(getMeMock).toHaveBeenCalledTimes(1);
  });

  it('invalidateLocations (alta o edición en Ajustes → Sedes) estrena lector y relee', async () => {
    const token = useAuthStore.getState().accessToken!;
    const { result } = renderHook(() => useSessionLocations(token));
    expect(await result.current()).toHaveLength(1);
    const before = result.current;
    listLocationsMock.mockResolvedValue([clinicLocation(), clinicLocation({ id: 'loc-2' })]);
    act(() => invalidateLocations());
    await waitFor(() => expect(result.current).not.toBe(before));
    expect(await result.current()).toHaveLength(2);
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });

  it('un fallo no se cachea: Reintentar vuelve a la API', async () => {
    listLocationsMock.mockRejectedValueOnce(new Error('red caída'));
    const { result } = renderHook(() => useLocations());
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });

  it('cerrar sesión (el token pasa a null, también desde otra pestaña) vacía la caché', async () => {
    render(<ShellConsumers />);
    await screen.findByText('ready:Ana Gómez ready:1');
    act(() => useAuthStore.getState().clear());
    expect(await screen.findByText('loading:- loading:-')).toBeInTheDocument();
    // La sesión siguiente (aunque sea el mismo usuario) lee de nuevo.
    act(() => useAuthStore.getState().setAccessToken(jwt(ANA)));
    await screen.findByText('ready:Ana Gómez ready:1');
    expect(getMeMock).toHaveBeenCalledTimes(2);
    expect(listLocationsMock).toHaveBeenCalledTimes(2);
  });

  it('clearSessionStore olvida también lo que llega de una lectura en vuelo', async () => {
    const pending = deferred<MyProfile>();
    getMeMock.mockReturnValueOnce(pending.promise);
    const token = useAuthStore.getState().accessToken!;
    const inFlight = loadMe(token);
    clearSessionStore();
    pending.resolve(profile);
    await inFlight;
    getMeMock.mockResolvedValue({ ...profile, fullName: 'Ana Nueva' });
    expect((await loadMe(token)).fullName).toBe('Ana Nueva');
  });

  it('putMe deja el perfil del PATCH sin releer', async () => {
    const { result } = renderHook(() => useMe());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => putMe(useAuthStore.getState().accessToken!, { ...profile, fullName: 'Ana G.' }));
    expect(result.current.data?.fullName).toBe('Ana G.');
    expect(getMeMock).toHaveBeenCalledTimes(1);
  });
});
