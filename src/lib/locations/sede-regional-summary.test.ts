import { act, renderHook, waitFor } from '@testing-library/react';
import { listLocations } from './locations-api';
import { setActiveLocationId } from './location-store';
import { clinicLocation } from '@/lib/test/locations';
import {
  dashboardCurrencyKey,
  sedeSettingsHref,
  sedeZoneNote,
  useDashboardCurrency,
  useSedeZoneNote,
} from './sede-regional-summary';
import { NO_ACTIVE_LOCATION_ERROR, SEDE_TIME_ZONE_ERROR } from './use-sede-time-zone';

jest.mock('./locations-api', () => ({ listLocations: jest.fn() }));
const listLocationsMock = jest.mocked(listLocations);

/** Un JWT legible con `sub` (la firma no se mira en el cliente). */
function token(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub, role: 'ADMIN', tenantId: 't' })).toString('base64url');
  return `h.${payload}.s`;
}

const caracas = clinicLocation({ id: 'ccs', name: 'Sede Caracas', country: 'VE', currency: 'VES', timeZone: 'America/Caracas', locale: 'es-VE' });
const valencia = clinicLocation({ id: 'val', name: 'Sede Valencia', country: 'VE', currency: 'USD', timeZone: 'America/Caracas', locale: 'es-VE' });
const madrid = clinicLocation({ id: 'mad', name: 'Sede Madrid', country: 'ES', currency: 'EUR', timeZone: 'Europe/Madrid', locale: 'es-ES' });
const at = new Date('2026-10-31T12:00:00Z');
const retry = () => {};

beforeEach(() => {
  window.localStorage.clear();
  setActiveLocationId(null);
  listLocationsMock.mockReset();
});

describe('sedeZoneNote', () => {
  it('names the zone of the active sede, readable, with where to change it', () => {
    expect(sedeZoneNote([caracas, madrid], 'mad', retry, at)).toEqual({
      status: 'ready',
      timeZone: 'Europe/Madrid',
      label: 'Madrid (UTC+1)',
      text: 'Días en hora de Madrid (UTC+1).',
      locationId: 'mad',
      locationName: 'Sede Madrid',
      scope: 'sede',
      settingsHref: '/settings/sedes?sede=mad',
    });
  });

  it('on «Todas las sedes» uses the main sede and says which one when there are several', () => {
    const note = sedeZoneNote([caracas, madrid], null, retry, at);
    expect(note).toMatchObject({ status: 'ready', scope: 'clinic', locationId: 'ccs' });
    expect(note.status === 'ready' && note.text).toBe('Días en hora de Caracas (UTC−4) (Sede Caracas).');
    const single = sedeZoneNote([caracas], null, retry, at);
    expect(single.status === 'ready' && single.text).toBe('Días en hora de Caracas (UTC−4).');
  });

  it('never falls back to another zone', () => {
    expect(sedeZoneNote([clinicLocation({ timeZone: null })], null, retry)).toMatchObject({
      status: 'error',
      message: SEDE_TIME_ZONE_ERROR,
    });
    expect(sedeZoneNote([], null, retry)).toMatchObject({ status: 'error', message: NO_ACTIVE_LOCATION_ERROR });
  });

  it('the hook follows the active sede', async () => {
    listLocationsMock.mockResolvedValue([caracas, madrid]);
    const { result } = renderHook(() => useSedeZoneNote(token('u1')));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ locationId: 'ccs', scope: 'clinic' });
    act(() => setActiveLocationId('mad'));
    await waitFor(() => expect(result.current).toMatchObject({ locationId: 'mad', timeZone: 'Europe/Madrid' }));
  });
});

describe('useDashboardCurrency', () => {
  it('defaults to the active sede currency; a choice is remembered per user and per sede', async () => {
    listLocationsMock.mockResolvedValue([caracas, valencia]);
    setActiveLocationId('ccs');
    const { result, unmount } = renderHook(() => useDashboardCurrency(token('u1')));
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', currency: 'VES', source: 'sede' }));
    act(() => {
      if (result.current.status === 'ready') result.current.choose('USD');
    });
    expect(result.current).toMatchObject({ currency: 'USD', source: 'chosen', defaultCurrency: 'VES' });
    expect(window.localStorage.getItem(dashboardCurrencyKey(token('u1'), 'ccs')!)).toBe('USD');
    unmount();

    // Vuelve a entrar: recordada.
    const again = renderHook(() => useDashboardCurrency(token('u1')));
    await waitFor(() => expect(again.result.current).toMatchObject({ currency: 'USD', source: 'chosen' }));
    // Otra sede: su propia moneda.
    act(() => setActiveLocationId('val'));
    await waitFor(() => expect(again.result.current).toMatchObject({ currency: 'USD', source: 'sede' }));
    again.unmount();

    // Otro usuario: la suya.
    setActiveLocationId('ccs');
    const other = renderHook(() => useDashboardCurrency(token('u2')));
    await waitFor(() => expect(other.result.current).toMatchObject({ currency: 'VES', source: 'sede' }));
  });

  it('choosing the default currency forgets the choice', async () => {
    listLocationsMock.mockResolvedValue([caracas]);
    setActiveLocationId('ccs');
    const { result } = renderHook(() => useDashboardCurrency(token('u1')));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => {
      if (result.current.status === 'ready') result.current.choose('EUR');
    });
    act(() => {
      if (result.current.status === 'ready') result.current.choose('VES');
    });
    expect(result.current).toMatchObject({ currency: 'VES', source: 'sede' });
    expect(window.localStorage.getItem(dashboardCurrencyKey(token('u1'), 'ccs')!)).toBeNull();
  });

  it('on «Todas las sedes»: the common currency, or a clear choice when they differ', async () => {
    listLocationsMock.mockResolvedValue([caracas, valencia]);
    const { result } = renderHook(() => useDashboardCurrency(token('u1')));
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'ready', currency: null, source: null, scope: 'clinic' }),
    );
    act(() => {
      if (result.current.status === 'ready') result.current.choose('USD');
    });
    expect(result.current).toMatchObject({ currency: 'USD', source: 'chosen', scope: 'clinic' });

    listLocationsMock.mockResolvedValue([caracas]);
    window.localStorage.clear();
    const single = renderHook(() => useDashboardCurrency(token('u3')));
    await waitFor(() => expect(single.result.current).toMatchObject({ currency: 'VES', source: 'clinic' }));
  });

  it('a sede without currency is an error that points to its settings, never a fallback currency', async () => {
    const unconfigured = clinicLocation({ id: 'old', currency: null });
    listLocationsMock.mockResolvedValue([unconfigured]);
    setActiveLocationId('old');
    const { result } = renderHook(() => useDashboardCurrency(token('u1')));
    await waitFor(() =>
      expect(result.current).toMatchObject({ status: 'error', settingsHref: sedeSettingsHref('old') }),
    );
  });

  it('ignores a stored value that is not a currency code', async () => {
    listLocationsMock.mockResolvedValue([caracas]);
    setActiveLocationId('ccs');
    window.localStorage.setItem(dashboardCurrencyKey(token('u1'), 'ccs')!, 'zzz<script>');
    const { result } = renderHook(() => useDashboardCurrency(token('u1')));
    await waitFor(() => expect(result.current).toMatchObject({ currency: 'VES', source: 'sede' }));
  });
});
