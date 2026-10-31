import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { LocationFormModal, phoneRegionFollowsCountry } from './location-form-modal';
import { createLocation, updateLocationSettings, type ClinicLocation } from '@/lib/locations/locations-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { browserCountry, browserHourCycle, browserLocale, browserTimeZone } from '@/lib/locations/regional-settings';
import { COUNTRIES, countryName } from '@/lib/locations/countries';
import { isPhoneRegion, phoneRegionLabel } from '@/lib/locations/phone-regions';
import { ApiError } from '@/lib/api/api-error';
import { clinicLocation } from '@/lib/test/locations';
import { setupUser } from '@/lib/test/user';
import { chooseCountry, chooseRegionalOption } from '@/lib/test/country';
import { localeLabel, timeZoneLabel } from '@/lib/locations/regional-options';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn().mockResolvedValue([]),
  createLocation: jest.fn(),
  updateLocationSettings: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
jest.mock('../../lib/locations/regional-settings', () => ({
  ...jest.requireActual('../../lib/locations/regional-settings'),
  browserCountry: jest.fn(),
  browserTimeZone: jest.fn(),
  browserLocale: jest.fn(),
  browserHourCycle: jest.fn(),
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
  // Un navegador en UTC y sin región explícita: ningún país sugerido (ni por
  // la zona, R1, ni por el idioma, DX-312 P1).
  jest.mocked(browserCountry).mockReturnValue(null);
  jest.mocked(browserTimeZone).mockReturnValue('UTC');
  jest.mocked(browserLocale).mockReturnValue('ja-JP');
  jest.mocked(browserHourCycle).mockReturnValue('h23');
});

const clockGroup = (dialog: HTMLElement) => within(dialog).getByRole('radiogroup', { name: 'Reloj' });
const clockOption = (dialog: HTMLElement, name: '12 h' | '24 h') =>
  within(clockGroup(dialog)).getByRole('radio', { name });

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

const PREFIX = 'Prefijo telefónico por defecto';
const PREFIX_SUGGESTED = 'Sugerido por el país de la sede.';
const PREFIX_HINT =
  'Se añade a los teléfonos escritos sin +. Cambiarlo cambia cómo se leen los ya guardados sin +, pero no los reescribe.';
const NO_PREFIX = 'Sin prefijo por defecto';

/** Elige un prefijo en su combobox: escribe y pulsa la opción con su etiqueta. */
async function choosePrefix(user: ReturnType<typeof setupUser>, dialog: HTMLElement, query: string, label: string) {
  const field = within(dialog).getByLabelText(PREFIX);
  await user.clear(field);
  // «Sin prefijo por defecto» solo sale con la lista entera: sin consulta, basta con vaciar el campo.
  if (query !== '') await user.type(field, query);
  await user.click(within(dialog).getByRole('option', { name: label }));
}

/** Rellena lo obligatorio del alta (el país lo elige cada test). */
async function fillCreate(dialog: HTMLElement, user: ReturnType<typeof setupUser>) {
  await currenciesLoaded(dialog);
  await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Norte');
  await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
}

describe('LocationFormModal (G1, spec §6.2)', () => {
  it('does not save without the five fields; each error by its field', async () => {
    jest.mocked(browserTimeZone).mockReturnValue(null);
    jest.mocked(browserLocale).mockReturnValue(null);
    jest.mocked(browserHourCycle).mockReturnValue(null);
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
    expect(clockGroup(dialog)).toHaveAccessibleDescription('Elige el reloj de la sede: 12 h o 24 h.');
    // El foco va al primer campo que hay que corregir.
    expect(within(dialog).getByLabelText('País')).toHaveFocus();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('a stored zone or format that is no longer valid is rejected with the API messages', async () => {
    const sede = clinicLocation({ timeZone: 'Marte/Olimpo', locale: 'no_es_un_locale' });
    const { dialog, user } = setup(sede);
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));

    expect(within(dialog).getByLabelText('Zona horaria')).toHaveAccessibleDescription(
      'La zona horaria «Marte/Olimpo» no existe.',
    );
    expect(within(dialog).getByLabelText('Formato regional')).toHaveAccessibleDescription(
      'El formato regional «no_es_un_locale» no es válido.',
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('a typed zone or format that is not in the list is never kept (no free text)', async () => {
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    const zone = within(dialog).getByLabelText('Zona horaria');
    await user.clear(zone);
    await user.type(zone, 'Marte/Olimpo');
    await user.tab();
    expect(zone).toHaveValue(timeZoneLabel('UTC'));
    const locale = within(dialog).getByLabelText('Formato regional');
    await user.clear(locale);
    await user.type(locale, 'no_es_un_locale');
    await user.tab();
    expect(locale).toHaveValue(localeLabel('ja-JP'));
  });

  it('create modal suggests zone, format and clock from the browser; the country re-suggests the format; posts what it shows', async () => {
    mockedCreate.mockResolvedValue(clinicLocation({ id: 'tokyo' }));
    const { dialog, user, onSaved } = setup();
    const zone = within(dialog).getByLabelText('Zona horaria');
    const locale = within(dialog).getByLabelText('Formato regional');
    expect(zone).toHaveValue(timeZoneLabel('UTC'));
    expect(locale).toHaveValue(localeLabel('ja-JP'));
    expect(zone).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));
    expect(locale).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));
    expect(clockOption(dialog, '24 h')).toBeChecked();
    expect(clockGroup(dialog)).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));

    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), '  Sede Tokio ');
    await chooseCountry(user, within(dialog).getByLabelText('País'), 'ES');
    // El país propone su moneda y su formato; la zona del navegador (UTC) no es
    // de España, que tiene varias: se queda, avisada.
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('EUR');
    expect(within(dialog).getByLabelText('Moneda')).toHaveAccessibleDescription(
      expect.stringContaining('Sugerido por el país.'),
    );
    expect(locale).toHaveValue(localeLabel('es-ES'));
    expect(zone).toHaveAccessibleDescription(expect.stringContaining('No es una zona de España'));
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'JPY');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][1]).toEqual({
      name: 'Sede Tokio',
      country: 'ES',
      defaultPhoneRegion: 'ES',
      currency: 'JPY',
      timeZone: 'UTC',
      locale: 'es-ES',
      hourCycle: 'h23',
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('a browser in Caracas proposes Venezuela, USD (VES one click away), Caracas, es-VE and +58 (R1, V1)', async () => {
    jest.mocked(browserTimeZone).mockReturnValue('America/Caracas');
    jest.mocked(browserLocale).mockReturnValue('en-US');
    jest.mocked(browserHourCycle).mockReturnValue('h12');
    jest.mocked(listCurrencies).mockResolvedValue([...CURRENCIES, { code: 'VES', name: 'Bolívar venezolano', symbol: 'Bs.' }, { code: 'USD', name: 'Dólar estadounidense', symbol: '$' }]);
    mockedCreate.mockResolvedValue(clinicLocation({ id: 'caracas' }));
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    expect(within(dialog).getByLabelText('País')).toHaveValue('Venezuela');
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('USD');
    expect(within(dialog).getByLabelText('Moneda')).toHaveAccessibleDescription(expect.stringContaining('Sugerido por el país.'));
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel('America/Caracas'));
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue(localeLabel('es-VE'));
    expect(within(dialog).getByLabelText(PREFIX)).toHaveValue(phoneRegionLabel('VE'));
    // VES a un clic, y elegirlo lo guarda.
    expect(within(dialog).getByText('En Venezuela también se usa VES.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Usar VES' }));
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('VES');
    expect(within(dialog).queryByRole('button', { name: 'Usar VES' })).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Caracas');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][1]).toMatchObject({
      country: 'VE',
      currency: 'VES',
      timeZone: 'America/Caracas',
      locale: 'es-VE',
      defaultPhoneRegion: 'VE',
    });
  });

  it('a browser in Caracas creates a USD sede when nothing is touched (V1)', async () => {
    jest.mocked(browserTimeZone).mockReturnValue('America/Caracas');
    jest.mocked(browserLocale).mockReturnValue('es-VE');
    jest.mocked(browserHourCycle).mockReturnValue('h12');
    jest.mocked(listCurrencies).mockResolvedValue([...CURRENCIES, { code: 'VES', name: 'Bolívar venezolano', symbol: 'Bs.' }, { code: 'USD', name: 'Dólar estadounidense', symbol: '$' }]);
    mockedCreate.mockResolvedValue(clinicLocation({ id: 'caracas' }));
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Caracas');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][1]).toMatchObject({ country: 'VE', currency: 'USD' });
  });

  it('no browser hour cycle leaves the clock empty and required', async () => {
    jest.mocked(browserHourCycle).mockReturnValue(null);
    mockedCreate.mockResolvedValue(clinicLocation({ id: 'tokyo' }));
    const { dialog, user } = setup();
    // Nunca se adivina: ni del formato sugerido ni de ningún otro dato.
    expect(clockOption(dialog, '12 h')).not.toBeChecked();
    expect(clockOption(dialog, '24 h')).not.toBeChecked();
    expect(clockGroup(dialog)).toHaveAttribute('aria-required', 'true');
    expect(clockGroup(dialog)).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));

    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Tokio');
    // Elegir el reloj a mano lo deja fuera de lo que propone el país.
    await user.click(clockOption(dialog, '24 h'));
    await user.click(clockOption(dialog, '12 h'));
    expect(clockOption(dialog, '12 h')).toBeChecked();
    expect(clockGroup(dialog)).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
  });

  it('without a clock from the browser nor the country the clock stays empty and required', async () => {
    jest.mocked(browserHourCycle).mockReturnValue(null);
    jest.mocked(browserLocale).mockReturnValue(null);
    mockedCreate.mockResolvedValue(clinicLocation({ id: 'utc' }));
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede UTC');
    // Sin país no hay formato ni reloj que proponer.
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue('');
    await chooseRegionalOption(user, within(dialog).getByLabelText('Formato regional'), 'ja-JP');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));

    // missing clock shows the §4.1 message next to the field (el país también falta)
    expect(clockGroup(dialog)).toHaveAccessibleDescription('Elige el reloj de la sede: 12 h o 24 h.');
    expect(clockGroup(dialog)).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('País')).toHaveFocus();
    expect(mockedCreate).not.toHaveBeenCalled();

    // Elegirlo quita el error.
    await user.click(clockOption(dialog, '12 h'));
    expect(clockGroup(dialog)).not.toHaveAccessibleDescription(expect.stringContaining('Elige el reloj'));
  });

  it('editing a configured location suggests nothing', async () => {
    const sede = clinicLocation({ currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' });
    mockedUpdate.mockResolvedValue(sede);
    const { dialog, user } = setup(sede);
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue(localeLabel('en-US'));
    expect(clockOption(dialog, '12 h')).toBeChecked();
    expect(within(dialog).getByLabelText('Formato regional')).not.toHaveAccessibleDescription(
      expect.stringContaining('Sugerido'),
    );
    expect(clockGroup(dialog)).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({ locale: 'en-US', hourCycle: 'h12' });
  });

  it('configuring a location with NULL hourCycle suggests only the clock', async () => {
    const sede = clinicLocation({
      currency: 'EUR',
      timeZone: 'Europe/Berlin',
      locale: 'de-DE',
      hourCycle: null,
      regionalSettingsReviewedAt: null,
    });
    mockedUpdate.mockResolvedValue(clinicLocation({ ...sede, hourCycle: 'h23' }));
    const { dialog, user } = setup(sede);
    // El formato guardado se queda, sin marca; el reloj vacío toma la sugerencia.
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue(localeLabel('de-DE'));
    expect(within(dialog).getByLabelText('Formato regional')).not.toHaveAccessibleDescription(
      expect.stringContaining('Sugerido'),
    );
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel('Europe/Berlin'));
    // El reloj va con el formato guardado (de-DE → 24 h), no con el del país.
    expect(clockOption(dialog, '24 h')).toBeChecked();
    expect(clockGroup(dialog)).toHaveAccessibleDescription(
      expect.stringContaining('Sugerido por el formato regional.'),
    );
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({
      locale: 'de-DE',
      hourCycle: 'h23',
      confirmRegionalSettings: true,
    });
  });

  it('configuring a location with NULL locale suggests the format of its country, keeps the stored zone and clock', async () => {
    const sede = clinicLocation({
      currency: 'EUR',
      timeZone: 'Europe/Berlin',
      locale: null,
      hourCycle: 'h12',
      regionalSettingsReviewedAt: null,
    });
    mockedUpdate.mockResolvedValue(clinicLocation({ ...sede, locale: 'es-CO' }));
    const { dialog, user } = setup(sede);
    // Solo el campo vacío toma una sugerencia: la del país de la sede (CO), no
    // la del navegador (ja-JP); lo guardado se queda, sin marca.
    const locale = within(dialog).getByLabelText('Formato regional');
    expect(locale).toHaveValue(localeLabel('es-CO'));
    expect(locale).toHaveAccessibleDescription(expect.stringContaining('Sugerido por el país.'));
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel('Europe/Berlin'));
    expect(within(dialog).getByLabelText('Zona horaria')).not.toHaveAccessibleDescription(
      expect.stringContaining('Sugerido'),
    );
    expect(clockOption(dialog, '12 h')).toBeChecked();
    expect(clockGroup(dialog)).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({
      locale: 'es-CO',
      hourCycle: 'h12',
      confirmRegionalSettings: true,
    });
  });

  it('an edited suggestion loses the «Sugerido» mark and the preview follows it', async () => {
    const { dialog, user } = setup();
    const zone = within(dialog).getByLabelText('Zona horaria');
    await chooseRegionalOption(user, zone, 'Asia/Tokyo');
    expect(zone).toHaveValue(timeZoneLabel('Asia/Tokyo'));
    expect(zone).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
    expect(within(dialog).getByText(/^Vista previa: /)).toBeInTheDocument();
  });

  it('currency starts empty and so does the country without a browser region', async () => {
    const { dialog } = setup();
    await currenciesLoaded(dialog);
    expect(within(dialog).getByLabelText('País')).toHaveValue('');
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('');
  });

  it('create modal suggests the country of an explicit browser region, marked and editable', async () => {
    jest.mocked(browserCountry).mockReturnValue('VE');
    mockedCreate.mockResolvedValue(clinicLocation({ id: 'caracas' }));
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    const country = within(dialog).getByLabelText('País');
    expect(country).toHaveValue('Venezuela');
    expect(country).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Caracas');
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][1]).toMatchObject({ country: 'VE' });
  });

  it('editing a location never replaces its country with a suggestion', async () => {
    jest.mocked(browserCountry).mockReturnValue('VE');
    const sede = clinicLocation({ id: 'madrid', country: 'ES', currency: 'EUR', timeZone: 'Europe/Madrid', locale: null });
    mockedUpdate.mockResolvedValue(sede);
    const { dialog, user } = setup(sede);
    await currenciesLoaded(dialog);
    const country = within(dialog).getByLabelText('País');
    expect(country).toHaveValue('España');
    expect(country).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
    expect(browserCountry).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({ country: 'ES' });
  });

  it('Escape on an open country list closes the list and keeps the dialog', async () => {
    const { dialog, user, onOpenChange } = setup();
    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Caracas');
    const country = within(dialog).getByRole('combobox', { name: 'País' });
    await user.type(country, 'venez');
    expect(country).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(country).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Sede Caracas');
    // Con la lista cerrada, Escape cierra el modal como siempre.
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Escape on an open prefix list closes the list and keeps the dialog (DX-329)', async () => {
    const { dialog, user, onOpenChange } = setup();
    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Norte');
    const prefix = within(dialog).getByRole('combobox', { name: PREFIX });
    await user.clear(prefix);
    await user.type(prefix, 'ital');
    expect(prefix).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(prefix).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Sede Norte');
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('the create description says what is proposed and from where', () => {
    const { dialog } = setup();
    expect(dialog).toHaveAccessibleDescription(
      'País, moneda, zona horaria, formato y reloj son obligatorios. Te proponemos el país y la zona de tu navegador, y la moneda y el formato de ese país: revísalos.',
    );
  });

  it('choosing a country re-suggests the untouched currency and format, never what was chosen by hand', async () => {
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    await chooseCountry(user, within(dialog).getByLabelText('País'), 'CO');
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('COP');
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue(localeLabel('es-CO'));
    // CO tiene una sola zona y la del navegador (UTC) no es suya: se propone la del país.
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel('America/Bogota'));
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'JPY');
    await chooseCountry(user, within(dialog).getByLabelText('País'), 'ES');
    // La moneda elegida a mano se queda; el país ofrece la suya con «Usar EUR».
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('JPY');
    expect(within(dialog).getByText('En España se usa EUR.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue(localeLabel('es-ES'));
    await user.click(within(dialog).getByRole('button', { name: 'Usar EUR' }));
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('EUR');
  });

  it('editing a UTC location and saving unchanged sends timeZone UTC', async () => {
    const utc = clinicLocation({ id: 'utc', currency: 'EUR', timeZone: 'UTC', locale: 'en-GB' });
    mockedUpdate.mockResolvedValue(utc);
    const { dialog, user } = setup(utc);
    // Edición: sin sugerencias del navegador.
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel('UTC'));
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({ timeZone: 'UTC', currency: 'EUR', locale: 'en-GB' });
  });

  it('the current zone is kept even if no country has it', async () => {
    const { dialog, user } = setup(clinicLocation({ timeZone: 'Etc/GMT+5' }));
    const zone = within(dialog).getByLabelText('Zona horaria');
    expect(zone).toHaveValue(timeZoneLabel('Etc/GMT+5'));
    await user.click(zone);
    expect(within(dialog).getByRole('option', { name: timeZoneLabel('Etc/GMT+5') })).toBeInTheDocument();
    // Y la sugerencia del navegador no entra en la edición.
    expect(zone).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
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
      hourCycle: 'h12',
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
    await chooseRegionalOption(user, zone, 'Asia/Tokyo');
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
    await chooseCountry(user, within(dialog).getByLabelText('País'), 'ES');
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Moneda')).toHaveAccessibleDescription(
        'La moneda XTS no está en la lista de monedas admitidas.',
      ),
    );
  });

  it('a location with null regional fields is completed in one PATCH, with what its country proposes', async () => {
    const legacy = clinicLocation({
      country: 'JP',
      currency: null,
      timeZone: null,
      locale: null,
      hourCycle: null,
      regionalSettingsReviewedAt: null,
    });
    mockedUpdate.mockResolvedValue(clinicLocation({ currency: 'JPY', timeZone: 'Asia/Tokyo', locale: 'ja-JP' }));
    const { dialog, user } = setup(legacy);
    // Configurar: cada campo vacío toma lo que propone el país, marcado; nada se guarda sin «Guardar».
    expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel('Asia/Tokyo'));
    expect(within(dialog).getByLabelText('Formato regional')).toHaveValue(localeLabel('ja-JP'));
    expect(clockOption(dialog, '24 h')).toBeChecked();
    await currenciesLoaded(dialog);
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('JPY');
    expect(within(dialog).getByLabelText('Moneda')).toHaveAccessibleDescription(
      expect.stringContaining('Sugerido por el país.'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({
      country: 'JP',
      currency: 'JPY',
      timeZone: 'Asia/Tokyo',
      locale: 'ja-JP',
      hourCycle: 'h23',
      confirmRegionalSettings: true,
    });
  });

  it('editing shows what changes before saving: currency and zone keep history, format only changes how it reads', async () => {
    const { dialog, user } = setup(clinicLocation());
    await currenciesLoaded(dialog);
    expect(within(dialog).queryByTestId('regional-consequences')).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
    const callout = within(dialog).getByTestId('regional-consequences');
    expect(callout).toHaveTextContent('Qué cambia al guardar');
    expect(callout).toHaveTextContent(
      'Moneda: lo ya registrado en COP (cobros con su tasa de cambio, gastos, presupuestos y listas de precios) se queda en COP; no se convierte. Lo nuevo se registrará en EUR. La numeración de los recibos no cambia.',
    );
    await chooseRegionalOption(user, within(dialog).getByLabelText('Zona horaria'), 'America/Caracas');
    expect(callout).toHaveTextContent(/Zona horaria: las citas no se mueven, conservan su hora exacta\./);
    expect(callout).toHaveTextContent(timeZoneLabel('America/Caracas'));
    await chooseRegionalOption(user, within(dialog).getByLabelText('Formato regional'), 'es-VE');
    expect(callout).toHaveTextContent(/Formato y reloj: solo cambia cómo se escriben fechas, números y horas \(Español \(Venezuela\), 12 h\)\. Ningún dato cambia\./);
    // Volver a lo guardado lo quita.
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'COP');
    expect(callout).not.toHaveTextContent('Moneda:');
  });

  it('the zone is saved and shown in its canonical casing; unchanged in another case is not a move', async () => {
    const sede = clinicLocation({ timeZone: 'Asia/Tokyo' });
    mockedUpdate.mockResolvedValue(sede);
    const { dialog, user } = setup(sede);
    await currenciesLoaded(dialog);
    const zone = within(dialog).getByLabelText('Zona horaria');
    await chooseRegionalOption(user, zone, 'asia/tokyo');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({ timeZone: 'Asia/Tokyo' });
    expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('confirmRegionalChange');
    expect(zone).toHaveValue(timeZoneLabel('Asia/Tokyo'));
  });

  it('a 400 about the phone goes next to the phone; its hint describes it otherwise', async () => {
    mockedCreate.mockRejectedValue(new ApiError(400, 'El teléfono admite hasta 40 caracteres.', { field: 'phone' }));
    const { dialog, user } = setup();
    const phone = within(dialog).getByLabelText('Teléfono');
    expect(phone).toHaveAccessibleDescription('Con indicativo internacional (+…).');
    await currenciesLoaded(dialog);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Sede Norte');
    await user.type(phone, '+34 600');
    await chooseCountry(user, within(dialog).getByLabelText('País'), 'ES');
    await user.selectOptions(within(dialog).getByLabelText('Moneda'), 'EUR');
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));
    await waitFor(() => expect(phone).toHaveAccessibleDescription('El teléfono admite hasta 40 caracteres.'));
    expect(phone).toHaveAttribute('aria-invalid', 'true');
  });

  it('invalid country and currency get the danger border, like the inputs', async () => {
    const { dialog, user } = setup();
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));
    for (const label of ['País', 'Moneda']) {
      const select = within(dialog).getByLabelText(label);
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select.className).toContain('aria-[invalid=true]:border-danger');
    }
  });

  it.each(['Asia/Kolkata', 'Europe/Kyiv', 'Asia/Ho_Chi_Minh'])(
    'a location in %s saved unchanged keeps its zone and is not a zone change',
    async (zone) => {
      const sede = clinicLocation({ timeZone: zone });
      mockedUpdate.mockResolvedValue(sede);
      const { dialog, user } = setup(sede);
      await currenciesLoaded(dialog);
      await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate.mock.calls[0][2]).toMatchObject({ timeZone: zone });
      expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('confirmRegionalChange');
      expect(within(dialog).getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel(zone));
    },
  );

  it('a stored lowercase zone saved unchanged is not a move: CASH_OPEN does not land on the zone', async () => {
    const message = 'Cierra la caja abierta de la sede antes de cambiar su moneda o su zona horaria.';
    mockedUpdate.mockRejectedValue(new ApiError(409, message, { code: 'LOCATION_REGIONAL_CASH_OPEN' }));
    const { dialog, user } = setup(clinicLocation({ timeZone: 'asia/tokyo' }));
    await currenciesLoaded(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][2]).toMatchObject({ timeZone: 'Asia/Tokyo' });
    expect(within(dialog).getByLabelText('Zona horaria')).not.toHaveAccessibleDescription(message);
  });

  describe('prefijo telefónico por defecto (DX-329, spec §6.3)', () => {
    /** Un país de la lista que no es región de numeración. */
    const NO_PHONE_COUNTRY = COUNTRIES.find((c) => !isPhoneRegion(c.code))!.code;

    it("creating a location suggests the country's prefix and follows the country until touched", async () => {
      const { dialog, user } = setup();
      const prefix = within(dialog).getByLabelText(PREFIX);
      // Sin país, nada que sugerir: sin prefijo y sin marca.
      expect(prefix).toHaveValue(NO_PREFIX);
      expect(prefix).not.toHaveAccessibleDescription(expect.stringContaining(PREFIX_SUGGESTED));
      await chooseCountry(user, within(dialog).getByLabelText('País'), 'VE');
      expect(prefix).toHaveValue(phoneRegionLabel('VE'));
      expect(prefix).toHaveAccessibleDescription(`${PREFIX_SUGGESTED} ${PREFIX_HINT}`);
      await chooseCountry(user, within(dialog).getByLabelText('País'), 'ES');
      expect(prefix).toHaveValue(phoneRegionLabel('ES'));
      expect(prefix).toHaveAccessibleDescription(expect.stringContaining(PREFIX_SUGGESTED));
      await currenciesLoaded(dialog);
    });

    it('a country without phone metadata suggests no prefix', async () => {
      const { dialog, user } = setup();
      await chooseCountry(user, within(dialog).getByLabelText('País'), 'VE');
      await chooseCountry(user, within(dialog).getByLabelText('País'), NO_PHONE_COUNTRY);
      const prefix = within(dialog).getByLabelText(PREFIX);
      expect(prefix).toHaveValue(NO_PREFIX);
      expect(prefix).toHaveAccessibleDescription(expect.stringContaining(PREFIX_SUGGESTED));
      await currenciesLoaded(dialog);
    });

    it('touching the prefix stops following the country and drops the mark', async () => {
      const { dialog, user } = setup();
      await chooseCountry(user, within(dialog).getByLabelText('País'), 'VE');
      await choosePrefix(user, dialog, '+34', phoneRegionLabel('ES')!);
      const prefix = within(dialog).getByLabelText(PREFIX);
      expect(prefix).toHaveValue(phoneRegionLabel('ES'));
      expect(prefix).toHaveAccessibleDescription(PREFIX_HINT);
      await chooseCountry(user, within(dialog).getByLabelText('País'), 'CO');
      expect(prefix).toHaveValue(phoneRegionLabel('ES'));
      expect(prefix).toHaveAccessibleDescription(PREFIX_HINT);
      await currenciesLoaded(dialog);
    });

    it('creating always sends defaultPhoneRegion, also null', async () => {
      mockedCreate.mockResolvedValue(clinicLocation({ id: 'nueva' }));
      let view = setup();
      await fillCreate(view.dialog, view.user);
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), NO_PHONE_COUNTRY);
      await view.user.click(within(view.dialog).getByRole('button', { name: 'Crear sede' }));
      await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
      expect(mockedCreate.mock.calls[0][1]).toHaveProperty('defaultPhoneRegion', null);

      // «Sin prefijo por defecto» elegido a mano sobre un país que sí lo tiene: también null.
      cleanup();
      view = setup();
      await fillCreate(view.dialog, view.user);
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'VE');
      await choosePrefix(view.user, view.dialog, '', NO_PREFIX);
      await view.user.click(within(view.dialog).getByRole('button', { name: 'Crear sede' }));
      await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(2));
      expect(mockedCreate.mock.calls[1][1]).toHaveProperty('defaultPhoneRegion', null);

      cleanup();
      view = setup();
      await fillCreate(view.dialog, view.user);
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'VE');
      await view.user.click(within(view.dialog).getByRole('button', { name: 'Crear sede' }));
      await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(3));
      expect(mockedCreate.mock.calls[2][1]).toMatchObject({ country: 'VE', defaultPhoneRegion: 'VE' });
    });

    it("editing shows the stored prefix and changing the country proposes the new one only if it was the old country's", async () => {
      // La región era la del país: cambiar el país propone la del nuevo, marcada.
      let view = setup(clinicLocation({ country: 'CO', defaultPhoneRegion: 'CO' }));
      let prefix = within(view.dialog).getByLabelText(PREFIX);
      expect(prefix).toHaveValue(phoneRegionLabel('CO'));
      expect(prefix).toHaveAccessibleDescription(PREFIX_HINT);
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'ES');
      expect(prefix).toHaveValue(phoneRegionLabel('ES'));
      expect(prefix).toHaveAccessibleDescription(`${PREFIX_SUGGESTED} ${PREFIX_HINT}`);
      // Volver al país guardado vuelve a lo guardado, sin marca.
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'CO');
      expect(prefix).toHaveValue(phoneRegionLabel('CO'));
      expect(prefix).toHaveAccessibleDescription(PREFIX_HINT);
      await currenciesLoaded(view.dialog);

      // La región no era la del país: no se toca.
      cleanup();
      view = setup(clinicLocation({ country: 'CO', defaultPhoneRegion: 'VE' }));
      prefix = within(view.dialog).getByLabelText(PREFIX);
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'ES');
      expect(prefix).toHaveValue(phoneRegionLabel('VE'));
      expect(prefix).toHaveAccessibleDescription(PREFIX_HINT);
      await currenciesLoaded(view.dialog);

      // Ni aunque el país cambie dos veces.
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'CO');
      expect(prefix).toHaveValue(phoneRegionLabel('VE'));
      expect(prefix).toHaveAccessibleDescription(PREFIX_HINT);

      // Sin prefijo guardado: tampoco.
      cleanup();
      view = setup(clinicLocation({ country: 'CO', defaultPhoneRegion: null }));
      prefix = within(view.dialog).getByLabelText(PREFIX);
      expect(prefix).toHaveValue(NO_PREFIX);
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'ES');
      expect(prefix).toHaveValue(NO_PREFIX);
      expect(prefix).toHaveAccessibleDescription(PREFIX_HINT);
      await currenciesLoaded(view.dialog);
    });

    it('editing keeps the stored prefix when the country is cleared', async () => {
      const sede = clinicLocation({ country: 'CO', defaultPhoneRegion: 'CO' });
      // Sin país no se propone nada: queda lo guardado, no «Sin prefijo».
      expect(phoneRegionFollowsCountry(sede, '')).toBe(false);
      expect(phoneRegionFollowsCountry(sede, 'CO')).toBe(false);
      expect(phoneRegionFollowsCountry(sede, 'ES')).toBe(true);
      expect(phoneRegionFollowsCountry(null, '')).toBe(true);
      // El combobox no deja el país vacío: borrarlo y salir vuelve al último elegido, y el prefijo con él.
      const view = setup(sede);
      const prefix = within(view.dialog).getByLabelText(PREFIX);
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'ES');
      await view.user.clear(within(view.dialog).getByLabelText('País'));
      await view.user.tab();
      expect(within(view.dialog).getByLabelText('País')).toHaveValue(countryName('ES'));
      expect(prefix).toHaveValue(phoneRegionLabel('ES'));
      await currenciesLoaded(view.dialog);
    });

    it('editing sends defaultPhoneRegion only when it changed', async () => {
      const sede = clinicLocation({ country: 'CO', defaultPhoneRegion: 'CO' });
      mockedUpdate.mockResolvedValue(sede);
      let view = setup(sede);
      await currenciesLoaded(view.dialog);
      await view.user.click(within(view.dialog).getByRole('button', { name: 'Guardar sede' }));
      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('defaultPhoneRegion');

      cleanup();
      view = setup(sede);
      await currenciesLoaded(view.dialog);
      await choosePrefix(view.user, view.dialog, '', NO_PREFIX);
      await view.user.click(within(view.dialog).getByRole('button', { name: 'Guardar sede' }));
      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
      expect(mockedUpdate.mock.calls[1][2]).toHaveProperty('defaultPhoneRegion', null);

      // La propuesta al cambiar el país también es un cambio.
      cleanup();
      view = setup(sede);
      await currenciesLoaded(view.dialog);
      await chooseCountry(view.user, within(view.dialog).getByLabelText('País'), 'VE');
      await view.user.click(within(view.dialog).getByRole('button', { name: 'Guardar sede' }));
      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(3));
      expect(mockedUpdate.mock.calls[2][2]).toMatchObject({ country: 'VE', defaultPhoneRegion: 'VE' });
    });

    it('a location from an older API, without the prefix key, does not send null when the prefix is untouched (DX-329)', async () => {
      const old: Partial<ClinicLocation> = { ...clinicLocation({ country: 'CO' }) };
      delete old.defaultPhoneRegion;
      const sede = old as ClinicLocation;
      mockedUpdate.mockResolvedValue(sede);
      const { user, dialog } = setup(sede);
      await currenciesLoaded(dialog);
      await user.clear(within(dialog).getByLabelText('Nombre'));
      await user.type(within(dialog).getByLabelText('Nombre'), 'Sede renombrada');
      await user.click(within(dialog).getByRole('button', { name: 'Guardar sede' }));
      await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
      expect(mockedUpdate.mock.calls[0][2]).toMatchObject({ name: 'Sede renombrada' });
      expect(mockedUpdate.mock.calls[0][2]).not.toHaveProperty('defaultPhoneRegion');
    });

    it('the API error for the prefix shows under its field', async () => {
      const message = 'El prefijo telefónico XX no está en la lista de regiones admitidas.';
      mockedCreate.mockRejectedValue(new ApiError(400, message, { field: 'defaultPhoneRegion' }));
      const { dialog, user } = setup();
      await fillCreate(dialog, user);
      await chooseCountry(user, within(dialog).getByLabelText('País'), 'VE');
      await user.click(within(dialog).getByRole('button', { name: 'Crear sede' }));
      const prefix = within(dialog).getByLabelText(PREFIX);
      await waitFor(() => expect(prefix).toHaveAccessibleDescription(message));
      expect(prefix).toHaveAttribute('aria-invalid', 'true');
      expect(prefix).toHaveFocus();
      expect(within(dialog).queryByRole('alert', { name: /No pudimos guardar/ })).not.toBeInTheDocument();
      // Elegir otro prefijo quita el error.
      await choosePrefix(user, dialog, '+34', phoneRegionLabel('ES')!);
      expect(prefix).not.toHaveAttribute('aria-invalid');
      expect(prefix).toHaveAccessibleDescription(PREFIX_HINT);
    });

    it('the prefix hint says how saved numbers are read and that they are not rewritten', async () => {
      const { dialog } = setup(clinicLocation({ defaultPhoneRegion: 'CO' }));
      expect(within(dialog).getByLabelText(PREFIX)).toHaveAccessibleDescription(PREFIX_HINT);
      expect(within(dialog).getByText(PREFIX_HINT)).toBeInTheDocument();
      await currenciesLoaded(dialog);
    });
  });
});
