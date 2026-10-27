import { render, screen, waitFor, within } from '@testing-library/react';
import { LocationsList } from './locations-list';
import { LocationSwitcher } from './location-switcher';
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

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
  createLocation: jest.fn(),
  updateLocationSettings: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));

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
  regionalSettingsReviewedAt: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  jest
    .mocked(listCurrencies)
    .mockResolvedValue([
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
    ]);
});

describe('LocationsList (G1, spec §6.3)', () => {
  it('lists each location with country, currency, zone and format', async () => {
    mockedList.mockResolvedValue([norte]);
    render(<LocationsList token={ADMIN} canEdit />);
    const row = (await screen.findByText('Sede Norte')).closest('li')!;
    expect(row).toHaveTextContent('España');
    expect(row).toHaveTextContent('EUR');
    expect(row).toHaveTextContent('Europe/Madrid');
    expect(row).toHaveTextContent('es-ES');
    expect(row).toHaveTextContent('Activa');
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

  it('a location with null regional fields is listed «Por configurar» and the modal completes it', async () => {
    mockedList.mockResolvedValue([legacy]);
    const completed = { ...legacy, currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP', regionalSettingsReviewedAt: '2026-10-27T10:00:00.000Z' };
    jest.mocked(updateLocationSettings).mockResolvedValue(completed);
    const user = setupUser();
    render(<LocationsList token={ADMIN} canEdit />);
    const row = (await screen.findByText('Sede Antigua')).closest('li')!;
    expect(within(row).getAllByText('Por configurar').length).toBeGreaterThan(0);
    expect(row).not.toHaveTextContent(/COP|America\/Bogota|es-CO/);

    await user.click(within(row).getByRole('button', { name: 'Editar Sede Antigua' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar sede' });
    await within(dialog).findByRole('option', { name: 'Yen japonés (¥)' });
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'JPY');
    await user.type(within(dialog).getByLabelText('Zona horaria'), 'Asia/Tokyo');
    await user.type(within(dialog).getByLabelText('Formato regional'), 'ja-JP');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));

    await waitFor(() => expect(updateLocationSettings).toHaveBeenCalledTimes(1));
    expect(jest.mocked(updateLocationSettings).mock.calls[0][2]).toMatchObject({
      currency: 'JPY',
      timeZone: 'Asia/Tokyo',
      locale: 'ja-JP',
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
    const list = screen.getByRole('region', { name: 'Sedes' });
    expect(within(list).getByText('Sede Tokio').closest('li')).toHaveTextContent('JPY');
    unmount();
    useAuthStore.setState({ accessToken: null });
  });

  it('?sede=<id> opens that location modal for ADMIN', async () => {
    mockedList.mockResolvedValue([norte, legacy]);
    render(<LocationsList token={ADMIN} canEdit initialEditId="legacy" />);
    const dialog = await screen.findByRole('dialog', { name: 'Editar sede' });
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Sede Antigua');
    await within(dialog).findByRole('option', { name: 'Yen japonés (¥)' });
  });
});
