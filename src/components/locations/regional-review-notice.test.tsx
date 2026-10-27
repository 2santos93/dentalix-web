import { act, render, screen, waitFor, within } from '@testing-library/react';
import { RegionalReviewNotice } from './regional-review-notice';
import { LocationsList } from './locations-list';
import { listLocations, updateLocationSettings } from '@/lib/locations/locations-api';
import { SessionLocationsProvider } from '@/lib/locations/session-locations';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenFor } from '@/lib/test/prescriptions';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
  updateLocationSettings: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));

const mockedList = jest.mocked(listLocations);
const ADMIN = tokenFor('ADMIN', 'u-admin');
const RECEPTION = tokenFor('RECEPTION', 'u-recep');

// Asignada por la migración D5 a partir del país: con valores, sin revisar.
const norte = clinicLocation({
  id: 'norte',
  name: 'Sede Norte',
  currency: 'COP',
  timeZone: 'America/Bogota',
  locale: 'es-CO',
  regionalSettingsReviewedAt: null,
});
const reviewed = clinicLocation({
  id: 'centro',
  name: 'Sede Centro',
  country: 'ES',
  currency: 'EUR',
  timeZone: 'Europe/Madrid',
  locale: 'es-ES',
});

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  jest.mocked(listCurrencies).mockResolvedValue([
    { code: 'COP', name: 'Peso colombiano', symbol: '$' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
  ]);
});

describe('RegionalReviewNotice (aviso D5, spec §7)', () => {
  it('ADMIN with an active unreviewed location sees the notice with the value summary', async () => {
    mockedList.mockResolvedValue([norte, reviewed]);
    render(<RegionalReviewNotice token={ADMIN} />);
    const notice = await screen.findByRole('region', { name: 'Sedes por revisar' });
    expect(notice).toHaveTextContent('Revisa la moneda, la zona horaria, el formato y el reloj de 1 sede.');
    expect(notice).toHaveTextContent(
      'Al actualizar Dentalix se asignaron automáticamente (Sede Norte: COP · America/Bogota · es-CO · 12 h). Confírmalos o cámbialos.',
    );
    expect(notice).not.toHaveTextContent('Sede Centro');
    expect(within(notice).getByRole('link', { name: 'Revisar sedes' })).toHaveAttribute('href', '/settings/sedes');
    // No se puede descartar sin confirmar (R12).
    expect(within(notice).queryByRole('button')).not.toBeInTheDocument();
  });

  it('review notice lists the clock', async () => {
    const tokyo = clinicLocation({
      id: 'tokyo',
      name: 'Sede Tokio',
      currency: 'JPY',
      timeZone: 'Asia/Tokyo',
      locale: 'ja-JP',
      hourCycle: 'h23',
      regionalSettingsReviewedAt: null,
    });
    const noClock = clinicLocation({
      id: 'ny',
      name: 'Sede Nueva York',
      currency: 'USD',
      timeZone: 'America/New_York',
      locale: 'en-US',
      hourCycle: null,
      regionalSettingsReviewedAt: null,
    });
    mockedList.mockResolvedValue([tokyo, noClock]);
    render(<RegionalReviewNotice token={ADMIN} />);
    const notice = await screen.findByRole('region', { name: 'Sedes por revisar' });
    expect(notice).toHaveTextContent(
      '(Sede Tokio: JPY · Asia/Tokyo · ja-JP · 24 h; Sede Nueva York: USD · America/New_York · en-US · Por configurar)',
    );
  });

  it('RECEPTIONIST does not', async () => {
    mockedList.mockResolvedValue([norte]);
    render(<RegionalReviewNotice token={RECEPTION} />);
    // Ni siquiera pide las sedes: el aviso es solo de ADMIN. Se vacían antes los
    // efectos y promesas pendientes, para que «no se llamó» no sea solo «aún no».
    await act(async () => {});
    expect(mockedList).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Sedes por revisar' })).not.toBeInTheDocument();
  });

  it('a location filled by the sweep (unreviewed) shows in the notice', async () => {
    // Creada por una réplica antigua y rellenada después por el barrido: valores
    // de su país, sin revisar. Cuenta junto a la de la migración.
    const swept = clinicLocation({
      id: 'sur',
      name: 'Sede Sur',
      country: 'ES',
      currency: 'EUR',
      timeZone: 'Europe/Madrid',
      locale: 'es-ES',
      regionalSettingsReviewedAt: null,
      createdAt: '2026-10-27T09:00:00.000Z',
    });
    mockedList.mockResolvedValue([norte, reviewed, swept]);
    render(<RegionalReviewNotice token={ADMIN} />);
    const notice = await screen.findByRole('region', { name: 'Sedes por revisar' });
    expect(notice).toHaveTextContent('el formato y el reloj de 2 sedes.');
    expect(notice).toHaveTextContent(
      '(Sede Norte: COP · America/Bogota · es-CO · 12 h; Sede Sur: EUR · Europe/Madrid · es-ES · 12 h)',
    );
  });

  it('a retired unreviewed location does not count', async () => {
    const retired = clinicLocation({ ...norte, id: 'vieja', name: 'Sede Vieja', isActive: false });
    mockedList.mockResolvedValue([retired, reviewed]);
    const { container } = render(<RegionalReviewNotice token={ADMIN} />);
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Sedes por revisar' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('notice disappears after saving in the modal', async () => {
    const confirmed = { ...norte, regionalSettingsReviewedAt: '2026-10-27T10:00:00.000Z' };
    mockedList.mockResolvedValueOnce([norte, reviewed]).mockResolvedValue([confirmed, reviewed]);
    jest.mocked(updateLocationSettings).mockResolvedValue(confirmed);
    const user = setupUser();
    render(
      <SessionLocationsProvider token={ADMIN}>
        <RegionalReviewNotice token={ADMIN} showReviewLink={false} />
        <LocationsList token={ADMIN} canEdit />
      </SessionLocationsProvider>,
    );
    const notice = await screen.findByRole('region', { name: 'Sedes por revisar' });
    expect(within(notice).queryByRole('link')).not.toBeInTheDocument();

    // La fila pendiente lleva «Por revisar» y su botón «Revisar».
    const row = (await screen.findByText('Sede Norte')).closest('li')!;
    expect(row).toHaveTextContent('Por revisar');
    expect(screen.getByText('Sede Centro').closest('li')).not.toHaveTextContent('Por revisar');
    await user.click(within(row).getByRole('button', { name: 'Revisar Sede Norte' }));

    // Guardar sin cambiar nada confirma la sede.
    const dialog = await screen.findByRole('dialog', { name: 'Editar sede' });
    await within(dialog).findByRole('option', { name: 'Peso colombiano ($)' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));

    await waitFor(() => expect(updateLocationSettings).toHaveBeenCalledTimes(1));
    expect(jest.mocked(updateLocationSettings).mock.calls[0][2]).toMatchObject({
      currency: 'COP',
      timeZone: 'America/Bogota',
      locale: 'es-CO',
      confirmRegionalSettings: true,
    });
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Sedes por revisar' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Sede Norte').closest('li')).not.toHaveTextContent('Por revisar');
    expect(
      within(screen.getByText('Sede Norte').closest('li')!).getByRole('button', { name: 'Editar Sede Norte' }),
    ).toBeInTheDocument();
  });

  it('with 2 pending, saving one leaves the notice at 1 naming the other', async () => {
    const sur = clinicLocation({
      id: 'sur',
      name: 'Sede Sur',
      country: 'ES',
      currency: 'EUR',
      timeZone: 'Europe/Madrid',
      locale: 'es-ES',
      regionalSettingsReviewedAt: null,
    });
    const confirmed = { ...norte, regionalSettingsReviewedAt: '2026-10-27T10:00:00.000Z' };
    mockedList.mockResolvedValueOnce([norte, sur]).mockResolvedValue([confirmed, sur]);
    jest.mocked(updateLocationSettings).mockResolvedValue(confirmed);
    const user = setupUser();
    render(
      <SessionLocationsProvider token={ADMIN}>
        <RegionalReviewNotice token={ADMIN} showReviewLink={false} />
        <LocationsList token={ADMIN} canEdit />
      </SessionLocationsProvider>,
    );
    const notice = await screen.findByRole('region', { name: 'Sedes por revisar' });
    expect(notice).toHaveTextContent('el formato y el reloj de 2 sedes.');

    await user.click(await screen.findByRole('button', { name: 'Revisar Sede Norte' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar sede' });
    await within(dialog).findByRole('option', { name: 'Peso colombiano ($)' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));

    await waitFor(() => expect(notice).toHaveTextContent('el formato y el reloj de 1 sede.'));
    expect(notice).toHaveTextContent('(Sede Sur: EUR · Europe/Madrid · es-ES · 12 h)');
    expect(notice).not.toHaveTextContent('Sede Norte');
  });
});
