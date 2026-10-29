import { render, screen, waitFor, within } from '@testing-library/react';
import { LocationsList } from './locations-list';
import { LocationSwitcher } from './location-switcher';
import { LocationPhoneSettings } from './location-phone-settings';
import {
  createLocation,
  listLocations,
  updateLocationSettings,
} from '@/lib/locations/locations-api';
import { SessionLocationsProvider } from '@/lib/locations/session-locations';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { useAuthStore } from '@/lib/auth/auth-store';
import { clinicLocation } from '@/lib/test/locations';
import { tokenFor } from '@/lib/test/prescriptions';
import { setupUser } from '@/lib/test/user';
import { browserHourCycle } from '@/lib/locations/regional-settings';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
  createLocation: jest.fn(),
  updateLocationSettings: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
// El reloj sugerido se fija aquí: los tests no dependen del `Intl` del entorno.
jest.mock('../../lib/locations/regional-settings', () => ({
  ...jest.requireActual('../../lib/locations/regional-settings'),
  browserHourCycle: jest.fn(),
}));

const mockedList = jest.mocked(listLocations);
const ADMIN = tokenFor('ADMIN', 'u-admin');
const RECEPTIONIST = tokenFor('RECEPTIONIST', 'u-recep');

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', country: 'ES', currency: 'EUR', timeZone: 'Europe/Madrid', locale: 'es-ES' });
const legacy = clinicLocation({
  id: 'legacy',
  name: 'Sede Antigua',
  currency: null,
  timeZone: null,
  locale: null,
  hourCycle: null,
  regionalSettingsReviewedAt: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  jest.mocked(browserHourCycle).mockReturnValue('h23');
  jest
    .mocked(listCurrencies)
    .mockResolvedValue([
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
    ]);
});

describe('LocationsList (G1, spec §6.3)', () => {
  it('lists each location with its country name', async () => {
    const caracas = clinicLocation({ id: 'ccs', name: 'Sede Caracas', country: 'VE', currency: 'VES', timeZone: 'America/Caracas', locale: 'es-VE' });
    // Un código que no está en la copia compartida se pinta tal cual.
    const unknown = clinicLocation({ id: 'zz', name: 'Sede Sin Lista', country: 'ZZ' });
    mockedList.mockResolvedValue([norte, caracas, unknown]);
    render(<LocationsList token={ADMIN} canEdit />);
    const row = (await screen.findByText('Sede Norte')).closest('li')!;
    expect(screen.getByText('Sede Caracas').closest('li')).toHaveTextContent('Venezuela');
    expect(screen.getByText('Sede Sin Lista').closest('li')).toHaveTextContent('ZZ');
    expect(row).toHaveTextContent('España');
    expect(row).toHaveTextContent('EUR');
    expect(row).toHaveTextContent('Europe/Madrid');
    expect(row).toHaveTextContent('es-ES');
    expect(row).toHaveTextContent('Activa');
  });

  it('lists the clock of each location; a location without one is «Por configurar»', async () => {
    const tokyo = clinicLocation({ id: 'tokyo', name: 'Sede Tokio', currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP', hourCycle: 'h23' });
    const paris = clinicLocation({ id: 'paris', name: 'Sede París', currency: 'EUR', timeZone: 'Europe/Paris', locale: 'fr-FR', hourCycle: 'h12' });
    const noClock = clinicLocation({ id: 'ny', name: 'Sede Nueva York', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', hourCycle: null });
    mockedList.mockResolvedValue([tokyo, paris, noClock]);
    render(<LocationsList token={ADMIN} canEdit />);
    const clockOf = (name: string) => {
      const row = screen.getByText(name).closest('li')!;
      return within(row).getByText('Reloj').nextElementSibling;
    };
    await screen.findByText('Sede Tokio');
    expect(clockOf('Sede Tokio')).toHaveTextContent('24 h');
    expect(clockOf('Sede París')).toHaveTextContent('12 h');
    expect(clockOf('Sede Nueva York')).toHaveTextContent('Por configurar');
    // Sin reloj la sede está sin configurar, como en las pantallas que pintan horas.
    const ny = screen.getByText('Sede Nueva York').closest('li')!;
    expect(within(ny).getAllByText('Por configurar')).toHaveLength(2);
    expect(within(screen.getByText('Sede Tokio').closest('li')!).queryByText('Por configurar')).not.toBeInTheDocument();
  });

  it('only ADMIN sees Nueva sede/Editar', async () => {
    mockedList.mockResolvedValue([norte]);
    const { unmount } = render(<LocationsList token={RECEPTIONIST} canEdit={false} />);
    await screen.findByText('Sede Norte');
    expect(screen.queryByRole('button', { name: 'Nueva sede' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Sede Norte' })).not.toBeInTheDocument();
    unmount();

    render(<LocationsList token={ADMIN} canEdit />);
    await screen.findByText('Sede Norte');
    expect(screen.getByRole('button', { name: 'Nueva sede' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Sede Norte' })).toBeInTheDocument();
  });

  it('the Sedes list links «Calendario Sede Norte» to /settings/calendario?sede=<id> for ADMIN only', async () => {
    const otra = clinicLocation({ id: 'loc 2', name: 'Sede Sur', isActive: false });
    mockedList.mockResolvedValue([norte, otra]);
    const { unmount } = render(<LocationsList token={RECEPTIONIST} canEdit={false} />);
    await screen.findByText('Sede Norte');
    expect(screen.queryByRole('link', { name: /^Calendario/ })).not.toBeInTheDocument();
    unmount();

    render(<LocationsList token={ADMIN} canEdit />);
    await screen.findByText('Sede Norte');
    expect(screen.getByRole('link', { name: 'Calendario Sede Norte' })).toHaveAttribute(
      'href',
      '/settings/calendario?sede=norte',
    );
    // El id va codificado; una sede inactiva también tiene su calendario.
    expect(screen.getByRole('link', { name: 'Calendario Sede Sur' })).toHaveAttribute(
      'href',
      '/settings/calendario?sede=loc%202',
    );
    expect(screen.getByRole('link', { name: 'Calendario Sede Norte' })).toHaveTextContent('Calendario');
  });

  it('the «Calendario» link follows canManageLocationCalendar (the token role), not canEdit', async () => {
    mockedList.mockResolvedValue([norte]);
    const { unmount } = render(<LocationsList token={RECEPTIONIST} canEdit />);
    await screen.findByText('Sede Norte');
    expect(screen.getByRole('button', { name: 'Editar Sede Norte' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Calendario Sede Norte' })).not.toBeInTheDocument();
    unmount();

    render(<LocationsList token={ADMIN} canEdit={false} />);
    await screen.findByText('Sede Norte');
    expect(screen.queryByRole('button', { name: 'Editar Sede Norte' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calendario Sede Norte' })).toBeInTheDocument();
  });

  it('a location with null regional fields is listed «Por configurar» and the modal completes it', async () => {
    mockedList.mockResolvedValue([legacy]);
    const completed = { ...legacy, currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP', hourCycle: 'h23' as const, regionalSettingsReviewedAt: '2026-10-27T10:00:00.000Z' };
    jest.mocked(updateLocationSettings).mockResolvedValue(completed);
    const user = setupUser();
    render(<LocationsList token={ADMIN} canEdit />);
    const row = (await screen.findByText('Sede Antigua')).closest('li')!;
    expect(within(row).getAllByText('Por configurar').length).toBeGreaterThan(0);
    expect(row).not.toHaveTextContent(/COP|America\/Bogota|es-CO/);

    await user.click(within(row).getByRole('button', { name: 'Revisar Sede Antigua' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar sede' });
    await within(dialog).findByRole('option', { name: 'Yen japonés (¥)' });
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'JPY');
    await user.type(within(dialog).getByLabelText('Zona horaria'), 'Asia/Tokyo');
    await user.clear(within(dialog).getByLabelText('Formato regional'));
    await user.type(within(dialog).getByLabelText('Formato regional'), 'ja-JP');
    await user.click(within(dialog).getByRole('radio', { name: '24 h' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));

    await waitFor(() => expect(updateLocationSettings).toHaveBeenCalledTimes(1));
    expect(jest.mocked(updateLocationSettings).mock.calls[0][2]).toMatchObject({
      currency: 'JPY',
      timeZone: 'Asia/Tokyo',
      locale: 'ja-JP',
      hourCycle: 'h23',
      confirmRegionalSettings: true,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const updated = screen.getByText('Sede Antigua').closest('li')!;
    expect(updated).not.toHaveTextContent('Por configurar');
    expect(updated).toHaveTextContent('Asia/Tokyo');
  });

  it('after save the switcher lists the new location without reload', async () => {
    const tokyo = clinicLocation({ id: 'tokyo', name: 'Sede Tokio', currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP' });
    mockedList.mockResolvedValueOnce([norte]).mockResolvedValue([norte, tokyo]);
    jest.mocked(createLocation).mockResolvedValue(tokyo);
    useAuthStore.setState({ accessToken: ADMIN });
    const user = setupUser();
    const { unmount } = render(
      <SessionLocationsProvider token={ADMIN}>
        <LocationSwitcher />
        <LocationsList token={ADMIN} canEdit />
      </SessionLocationsProvider>,
    );
    await screen.findByRole('button', { name: 'Editar Sede Norte' });
    const switcher = await screen.findByRole('combobox', { name: 'Sede' });
    await within(switcher).findByRole('option', { name: 'Sede Norte' });
    expect(within(switcher).queryByRole('option', { name: 'Sede Tokio' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nueva sede' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva sede' });
    await within(dialog).findByRole('option', { name: 'Yen japonés (¥)' });
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Tokio');
    await user.selectOptions(within(dialog).getByLabelText('País'), 'ES');
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'JPY');
    await user.clear(within(dialog).getByLabelText('Zona horaria'));
    await user.type(within(dialog).getByLabelText('Zona horaria'), 'Asia/Tokyo');
    await user.clear(within(dialog).getByLabelText('Formato regional'));
    await user.type(within(dialog).getByLabelText('Formato regional'), 'ja-JP');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));

    // `invalidate()`: el selector vuelve a leer las sedes sin recargar la página.
    expect(await within(switcher).findByRole('option', { name: 'Sede Tokio' })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
    const list = screen.getByRole('region', { name: 'Sedes de la clínica' });
    expect(within(list).getByText('Sede Tokio').closest('li')).toHaveTextContent('JPY');
    unmount();
    useAuthStore.setState({ accessToken: null });
  });

  it('?sede=<id> opens that location modal for ADMIN and consumes the link', async () => {
    mockedList.mockResolvedValue([norte, legacy]);
    const consumed = jest.fn();
    render(<LocationsList token={ADMIN} canEdit initialEditId="legacy" onInitialEditConsumed={consumed} />);
    const dialog = await screen.findByRole('dialog', { name: 'Editar sede' });
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Sede Antigua');
    await within(dialog).findByRole('option', { name: 'Yen japonés (¥)' });
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('?sede=<id> of a location that does not exist says so and opens nothing', async () => {
    mockedList.mockResolvedValue([norte]);
    const consumed = jest.fn();
    render(<LocationsList token={ADMIN} canEdit initialEditId="borrada" onInitialEditConsumed={consumed} />);
    expect(await screen.findByText('No encontramos la sede del enlace: elígela en la lista.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('a zone this browser does not know is «Por configurar», like the screens that need it (§5)', async () => {
    mockedList.mockResolvedValue([clinicLocation({ id: 'icu', name: 'Sede ICU', timeZone: 'Marte/Olimpo' })]);
    render(<LocationsList token={ADMIN} canEdit />);
    const row = (await screen.findByText('Sede ICU')).closest('li')!;
    expect(within(row).getByText('Por configurar')).toBeInTheDocument();
    expect(within(row).getByText('Marte/Olimpo (no válido)')).toBeInTheDocument();
  });

  it('the other cards of the page read the same session list: a new location shows there without reload', async () => {
    const tokyo = clinicLocation({ id: 'tokyo', name: 'Sede Tokio', currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP' });
    mockedList.mockResolvedValueOnce([norte]).mockResolvedValue([norte, tokyo]);
    jest.mocked(createLocation).mockResolvedValue(tokyo);
    const user = setupUser();
    render(
      <SessionLocationsProvider token={ADMIN}>
        <LocationsList token={ADMIN} canEdit />
        <LocationPhoneSettings token={ADMIN} canEdit />
      </SessionLocationsProvider>,
    );
    const phones = await screen.findByRole('region', { name: 'Teléfono de la sede' });
    await within(phones).findByRole('button', { name: 'Guardar el teléfono de Sede Norte' });
    // Una sola lectura para las dos tarjetas.
    expect(mockedList).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Nueva sede' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva sede' });
    await within(dialog).findByRole('option', { name: 'Yen japonés (¥)' });
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Tokio');
    await user.selectOptions(within(dialog).getByLabelText('País'), 'ES');
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'JPY');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));

    expect(
      await within(phones).findByRole('button', { name: 'Guardar el teléfono de Sede Tokio' }),
    ).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });
});
