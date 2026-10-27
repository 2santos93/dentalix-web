import { render, screen, waitFor, within } from '@testing-library/react';
import { LocationFormModal } from './location-form-modal';
import { createLocation, updateLocationSettings, type ClinicLocation } from '@/lib/locations/locations-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { browserLocale, browserTimeZone } from '@/lib/locations/regional-settings';
import { ApiError } from '@/lib/api/api-error';
import { clinicLocation } from '@/lib/test/locations';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn().mockResolvedValue([]),
  createLocation: jest.fn(),
  updateLocationSettings: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
jest.mock('../../lib/locations/regional-settings', () => ({
  ...jest.requireActual('../../lib/locations/regional-settings'),
  browserTimeZone: jest.fn(),
  browserLocale: jest.fn(),
}));

const mockedCreate = jest.mocked(createLocation);
const mockedUpdate = jest.mocked(updateLocationSettings);

const CURRENCIES = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
  { code: 'COP', name: 'Peso colombiano', symbol: '$' },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listCurrencies).mockResolvedValue(CURRENCIES);
  jest.mocked(browserTimeZone).mockReturnValue('Asia/Tokyo');
  jest.mocked(browserLocale).mockReturnValue('ja-JP');
});

function setup(location: ClinicLocation | null = null) {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <LocationFormModal open onOpenChange={onOpenChange} token="tok" location={location} onSaved={onSaved} />,
  );
  const dialog = screen.getByRole('dialog');
  return { onSaved, onOpenChange, dialog, user: setupUser() };
}

async function currenciesLoaded(dialog: HTMLElement) {
  await within(dialog).findByRole('option', { name: 'Yen japonés (¥)' });
}

describe('LocationFormModal (G1, spec §6.2)', () => {
  it('does not save without the four fields; each error by its field', async () => {
    jest.mocked(browserTimeZone).mockReturnValue(null);
    jest.mocked(browserLocale).mockReturnValue(null);
    const { dialog, user } = setup();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Norte');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));

    expect(within(dialog).getByLabelText('País')).toHaveAccessibleDescription('Elige el país de la sede.');
    expect(within(dialog).getByLabelText('Moneda')).toHaveAccessibleDescription('Elige la moneda de la sede.');
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveAccessibleDescription(
      'Elige la zona horaria de la sede.',
    );
    expect(within(dialog).getByLabelText('Formato regional')).toHaveAccessibleDescription(
      'Elige el formato regional de la sede.',
    );
    // El foco va al primer campo que hay que corregir.
    expect(within(dialog).getByLabelText('País')).toHaveFocus();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('invalid zone and format are rejected with the API messages', async () => {
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Norte');
    await user.selectOptions(within(dialog).getByLabelText('País'), 'ES');
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
    await user.clear(within(dialog).getByLabelText('Zona horaria'));
    await user.type(within(dialog).getByLabelText('Zona horaria'), 'Marte/Olimpo');
    await user.clear(within(dialog).getByLabelText('Formato regional'));
    await user.type(within(dialog).getByLabelText('Formato regional'), 'no_es_un_locale');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));

    expect(within(dialog).getByLabelText('Zona horaria')).toHaveAccessibleDescription(
      'La zona horaria «Marte/Olimpo» no existe.',
    );
    expect(within(dialog).getByLabelText('Formato regional')).toHaveAccessibleDescription(
      'El formato regional «no_es_un_locale» no es válido.',
    );
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('browser suggestions for zone and format are visible and the POST equals what is shown', async () => {
    mockedCreate.mockResolvedValue(clinicLocation({ id: 'tokyo' }));
    const { dialog, user, onSaved } = setup();
    const zone = within(dialog).getByLabelText('Zona horaria');
    const locale = within(dialog).getByLabelText('Formato regional');
    expect(zone).toHaveValue('Asia/Tokyo');
    expect(locale).toHaveValue('ja-JP');
    expect(zone).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));
    expect(locale).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));

    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), '  Sede Tokio ');
    await user.selectOptions(within(dialog).getByLabelText('País'), 'ES');
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'JPY');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    const shown = {
      name: (within(dialog).getByLabelText('Nombre') as HTMLInputElement).value.trim(),
      country: (within(dialog).getByLabelText('País') as HTMLSelectElement).value,
      currency: (within(dialog).getByLabelText('Moneda') as HTMLSelectElement).value,
      timeZone: (zone as HTMLInputElement).value,
      locale: (locale as HTMLInputElement).value,
    };
    expect(mockedCreate).toHaveBeenCalledWith('tok', shown);
    expect(mockedCreate.mock.calls[0][1]).toEqual({
      name: 'Sede Tokio',
      country: 'ES',
      currency: 'JPY',
      timeZone: 'Asia/Tokyo',
      locale: 'ja-JP',
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('an edited suggestion loses the «Sugerido» mark and the preview follows it', async () => {
    const { dialog, user } = setup();
    const zone = within(dialog).getByLabelText('Zona horaria');
    await user.clear(zone);
    await user.type(zone, 'UTC');
    expect(zone).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
    expect(within(dialog).getByText(/^Vista previa: /)).toBeInTheDocument();
  });

  it('currency and country start empty', async () => {
    const { dialog } = setup();
    await currenciesLoaded(dialog);
    expect(within(dialog).getByLabelText('País')).toHaveValue('');
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('');
  });

  it('choosing a country changes nothing else', async () => {
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    await user.selectOptions(within(dialog).getByLabelText('País'), 'CO');
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('');
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue('Asia/Tokyo');
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue('ja-JP');
    await user.selectOptions(within(dialog).getByLabelText('País'), 'ES');
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('');
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue('Asia/Tokyo');
  });

  it('editing a UTC location and saving unchanged sends timeZone UTC', async () => {
    const utc = clinicLocation({ id: 'utc', currency: 'EUR', timeZone: 'UTC', locale: 'en-GB' });
    mockedUpdate.mockResolvedValue(utc);
    const { dialog, user } = setup(utc);
    // Edición: sin sugerencias del navegador.
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue('UTC');
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({ timeZone: 'UTC', currency: 'EUR', locale: 'en-GB' });
  });

  it('the current zone is kept even if not in supportedValuesOf', async () => {
    expect(Intl.supportedValuesOf('timeZone')).not.toContain('UTC');
    const { dialog } = setup(clinicLocation({ timeZone: 'UTC' }));
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue('UTC');
    const options = Array.from(dialog.querySelectorAll('#location-form-timeZone-options option')).map((o) =>
      o.getAttribute('value'),
    );
    expect(options).toContain('UTC');
    // Y la sugerencia del navegador no entra en la edición.
    expect(within(dialog).getByLabelText('Zona horaria')).not.toHaveAccessibleDescription(
      expect.stringContaining('Sugerido'),
    );
    await currenciesLoaded(dialog);
  });

  it('edit sends confirmRegionalSettings', async () => {
    const sede = clinicLocation({ address: 'Calle 1', phone: '+34 600 000 000' });
    mockedUpdate.mockResolvedValue(sede);
    const { dialog, user, onSaved, onOpenChange } = setup(sede);
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'loc-1', {
      name: 'Sede principal',
      address: 'Calle 1',
      phone: '+34 600 000 000',
      country: 'CO',
      currency: 'COP',
      timeZone: 'America/Bogota',
      locale: 'es-CO',
      confirmRegionalSettings: true,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(sede));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('409 UNCONFIRMED opens ConfirmDialog and resends with confirmRegionalChange', async () => {
    const sede = clinicLocation();
    const message =
      'La sede ya tiene movimientos en COP. Cambiar la moneda no convierte esos importes ni los de las listas de precios: confirma el cambio para continuar.';
    mockedUpdate
      .mockRejectedValueOnce(
        new ApiError(409, message, { code: 'LOCATION_REGIONAL_CHANGE_UNCONFIRMED' }),
      )
      .mockResolvedValueOnce(clinicLocation({ currency: 'EUR' }));
    const { dialog, user, onSaved } = setup(sede);
    await currenciesLoaded(dialog);
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));

    const confirm = await screen.findByRole('dialog', { name: '¿Cambiar de todos modos?' });
    expect(confirm).toHaveTextContent(message);
    expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('confirmRegionalChange');

    await user.click(within(confirm).getByRole('button', { name: 'Cambiar de todos modos' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
    expect(mockedUpdate.mock.calls[1][2]).toMatchObject({
      currency: 'EUR',
      confirmRegionalSettings: true,
      confirmRegionalChange: true,
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('409 LOCATION_REGIONAL_CASH_OPEN shows inline by the changed field and offers no confirmation', async () => {
    const message = 'Cierra la caja abierta de la sede antes de cambiar su moneda o su zona horaria.';
    mockedUpdate.mockRejectedValue(new ApiError(409, message, { code: 'LOCATION_REGIONAL_CASH_OPEN' }));
    const { dialog, user, onSaved } = setup(clinicLocation());
    await currenciesLoaded(dialog);
    const zone = within(dialog).getByLabelText('Zona horaria');
    await user.clear(zone);
    await user.type(zone, 'Asia/Tokyo');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));

    await waitFor(() => expect(zone).toHaveAccessibleDescription(message));
    expect(within(dialog).getByLabelText('Moneda')).not.toHaveAccessibleDescription(message);
    expect(screen.queryByRole('button', { name: 'Cambiar de todos modos' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a 400 naming a field goes next to that field', async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(400, 'La moneda XTS no está en la lista de monedas admitidas.', { field: 'currency' }),
    );
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Norte');
    await user.selectOptions(within(dialog).getByLabelText('País'), 'ES');
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Moneda')).toHaveAccessibleDescription(
        'La moneda XTS no está en la lista de monedas admitidas.',
      ),
    );
  });

  it('a location with null regional fields is completed with all three in one PATCH', async () => {
    const legacy = clinicLocation({ currency: null, timeZone: null, locale: null, regionalSettingsReviewedAt: null });
    mockedUpdate.mockResolvedValue(clinicLocation({ currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP' }));
    const { dialog, user } = setup(legacy);
    // Sin sugerencias en la edición: los tres campos empiezan vacíos.
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue('');
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue('');
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    expect(mockedUpdate).not.toHaveBeenCalled();

    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'JPY');
    await user.type(within(dialog).getByLabelText('Zona horaria'), 'Asia/Tokyo');
    await user.type(within(dialog).getByLabelText('Formato regional'), 'ja-jp');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({
      currency: 'JPY',
      timeZone: 'Asia/Tokyo',
      locale: 'ja-JP',
      confirmRegionalSettings: true,
    });
    // Lo enviado es lo que se ve: el formato queda canónico en el campo.
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue('ja-JP');
  });
});
