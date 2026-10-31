import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RegisterForm } from './register-form';
import { apiFetch, ApiError } from '../../lib/api/client';
import { setupUser } from '@/lib/test/user';
import { browserCountry, browserHourCycle, browserLocale, browserTimeZone } from '@/lib/locations/regional-settings';
import { chooseCountry } from '@/lib/test/country';
import { localeLabel, timeZoneLabel } from '@/lib/locations/regional-options';

/** Elige en un combobox de zona o formato con eventos sueltos: escribe y pulsa Intro (la coincidencia exacta va primero). */
function pickRegional(label: string, code: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: code } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/api/client', () => ({
  apiFetch: jest.fn(),
  // La clase real: `apiErrorMessage` la reconoce con `instanceof`.
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

// La sugerencia del navegador se fija en cada test (nunca se espía `Intl`).
jest.mock('../../lib/locations/regional-settings', () => ({
  ...jest.requireActual('../../lib/locations/regional-settings'),
  browserCountry: jest.fn(),
  browserLocale: jest.fn(),
  browserHourCycle: jest.fn(),
  browserTimeZone: jest.fn(),
}));

const mockedFetch = jest.mocked(apiFetch);
const CURRENCIES = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
];

/** `GET /public/currencies` responde la lista; `POST /auth/register`, lo que diga el test. */
function mockApi(register: () => Promise<unknown>) {
  mockedFetch.mockImplementation(((path: string) =>
    path === '/public/currencies' ? Promise.resolve(CURRENCIES) : register()) as typeof apiFetch);
}

const registerCalls = () => mockedFetch.mock.calls.filter(([path]) => path === '/auth/register');

async function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/nombre de la clínica/i), {
    target: { value: 'Clínica Uno' },
  });
  fireEvent.change(screen.getByLabelText(/subdominio/i), { target: { value: 'clinica-uno' } });
  fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Ana Ruiz' } });
  fireEvent.change(screen.getByLabelText(/correo/i), {
    target: { value: 'ana@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secret123' } });
  await screen.findByRole('option', { name: 'Euro (€)' });
  // El país se elige en el combobox: se escribe el código y se elige la opción.
  fireEvent.change(screen.getByLabelText('País'), { target: { value: 'ES' } });
  fireEvent.click(screen.getByRole('option', { name: 'España' }));
  fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'EUR' } });
  pickRegional('Zona horaria', 'Europe/Madrid');
  pickRegional('Formato regional', 'es-ES');
}

beforeEach(() => {
  mockedFetch.mockReset();
  // Sin región explícita en el navegador: ningún país sugerido (DX-312 P1).
  jest.mocked(browserCountry).mockReturnValue(null);
  jest.mocked(browserLocale).mockReturnValue('en-US');
  jest.mocked(browserHourCycle).mockReturnValue('h12');
  // Un navegador en UTC: ninguna zona de país, así que tampoco un país sugerido por la zona (R1).
  jest.mocked(browserTimeZone).mockReturnValue('UTC');
});

describe('RegisterForm', () => {
  it('shows the error message when the API call fails', async () => {
    mockApi(() => Promise.reject(new ApiError(409, 'Subdominio ya existe')));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Subdominio ya existe');
  });

  // Revisión M-2: el 403 por origen no permitido no manda a «pedir acceso a un
  // administrador» a alguien que todavía no tiene clínica.
  it('un 403 («Untrusted origin») no habla de pedir permisos', async () => {
    mockApi(() => Promise.reject(new ApiError(403, 'Untrusted origin')));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos crear la cuenta');
    expect(alert).not.toHaveTextContent(/administrador|untrusted/i);
  });

  it('keeps aria-describedby resolving to the error banner on all five fields', async () => {
    mockApi(() => Promise.reject(new ApiError(409, 'Subdominio ya existe')));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    const alert = await screen.findByRole('alert');
    const errorId = alert.getAttribute('id');
    expect(errorId).toBeTruthy();
    expect(screen.getByLabelText(/nombre de la clínica/i)).toHaveAttribute(
      'aria-describedby',
      errorId,
    );
    expect(screen.getByLabelText(/subdominio/i)).toHaveAttribute('aria-describedby', errorId);
    expect(screen.getByLabelText(/nombre completo/i)).toHaveAttribute(
      'aria-describedby',
      errorId,
    );
    expect(screen.getByLabelText(/correo/i)).toHaveAttribute('aria-describedby', errorId);
    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute('aria-describedby', errorId);
  });

  // DX-029: la respuesta del registro es la misma exista o no el correo.
  it('tras enviar muestra «Revisa tu correo» sin decir si el correo ya tenía cuenta', async () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(screen.getByText(/Si ana@example\.com puede registrar una clínica/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crear cuenta/i })).not.toBeInTheDocument();
  });

  it('un 409 sin mensaje propio habla solo del subdominio (nunca del correo)', async () => {
    mockApi(() => Promise.reject(new ApiError(409, 'Conflict')));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent(/correo/i);
  });

  // G1 (spec §6.7, R18): la sección «Tu sede» carga las monedas sin sesión.
  it('register form loads currencies without a session', async () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    const group = screen.getByRole('group', { name: 'Tu sede' });
    expect(await within(group).findByRole('option', { name: 'Yen japonés (¥)' })).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith('/public/currencies');
    // Ninguna llamada lleva token: el registro es anónimo.
    for (const [, options] of mockedFetch.mock.calls) expect(options?.token).toBeUndefined();
    // Sin región explícita en el navegador, país y moneda empiezan vacíos; nada se deduce de nada (R10).
    expect(within(group).getByLabelText('País')).toHaveValue('');
    expect(within(group).getByLabelText('Moneda')).toHaveValue('');
  });

  it('register form does not submit without the five fields and the body equals what is shown', async () => {
    jest.mocked(browserTimeZone).mockReturnValue(null);
    jest.mocked(browserLocale).mockReturnValue(null);
    jest.mocked(browserHourCycle).mockReturnValue(null);
    jest.mocked(browserHourCycle).mockReturnValue(null);
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    const user = setupUser();
    render(<RegisterForm tenant={null} />);
    const group = screen.getByRole('group', { name: 'Tu sede' });
    await within(group).findByRole('option', { name: 'Euro (€)' });
    fireEvent.change(screen.getByLabelText(/nombre de la clínica/i), { target: { value: 'Clínica Uno' } });
    fireEvent.change(screen.getByLabelText(/subdominio/i), { target: { value: 'clinica-uno' } });
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Ana Ruiz' } });
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'ana@example.com' } });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secret123' } });
    // Sin las sugerencias del navegador, los cinco campos quedan vacíos.
    expect(within(group).getByLabelText('Zona horaria')).toHaveValue('');
    expect(within(group).getByLabelText('Formato regional')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(registerCalls()).toHaveLength(0);
    expect(within(group).getByLabelText('País')).toHaveAccessibleDescription('Elige el país de la sede.');
    expect(within(group).getByLabelText('Moneda')).toHaveAccessibleDescription('Elige la moneda de la sede.');
    expect(within(group).getByLabelText('Zona horaria')).toHaveAccessibleDescription(
      'Elige la zona horaria de la sede.',
    );
    expect(within(group).getByLabelText('Formato regional')).toHaveAccessibleDescription(
      'Elige el formato regional de la sede.',
    );
    expect(within(group).getByRole('radiogroup', { name: 'Reloj' })).toHaveAccessibleDescription(
      'Elige el reloj de la sede: 12 h o 24 h.',
    );
    expect(within(group).getByLabelText('País')).toHaveFocus();

    await chooseCountry(user, within(group).getByLabelText('País'), 'ES');
    await user.selectOptions(within(group).getByLabelText('Moneda'), 'JPY');
    await user.type(within(group).getByLabelText('Zona horaria'), 'Asia/Tokyo');
    await user.keyboard('{Enter}');
    await user.clear(within(group).getByLabelText('Formato regional'));
    await user.type(within(group).getByLabelText('Formato regional'), 'ja-jp');
    await user.keyboard('{Enter}');
    await user.click(within(group).getByRole('radio', { name: '24 h' }));
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    await waitFor(() => expect(registerCalls()).toHaveLength(1));
    const [, options] = registerCalls()[0];
    expect(options?.method).toBe('POST');
    expect(options?.body).toEqual({
      clinicName: 'Clínica Uno',
      subdomain: 'clinica-uno',
      fullName: 'Ana Ruiz',
      email: 'ana@example.com',
      password: 'secret123',
      locationCountry: 'ES',
      locationCurrency: 'JPY',
      locationTimeZone: 'Asia/Tokyo',
      // Lo enviado es lo que se ve: el formato, en su forma canónica.
      locationLocale: 'ja-JP',
      locationHourCycle: 'h23',
    });
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
  });

  it('register form sends locationHourCycle from the visible suggestion', async () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    const group = screen.getByRole('group', { name: 'Tu sede' });
    const clock = within(group).getByRole('radiogroup', { name: 'Reloj' });
    await waitFor(() => expect(within(clock).getByRole('radio', { name: '12 h' })).toBeChecked());
    expect(clock).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));
    expect(within(group).getByLabelText('Formato regional')).toHaveValue(localeLabel('en-US'));
    await fillRequiredFields();
    pickRegional('Formato regional', 'en-US');
    // Al elegir España el reloj pasó al suyo (24 h); el formato elegido a mano no lo cambia: se envía lo que se ve.
    expect(within(clock).getByRole('radio', { name: '24 h' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    await waitFor(() => expect(registerCalls()).toHaveLength(1));
    expect(registerCalls()[0][1]?.body).toMatchObject({ locationLocale: 'en-US', locationHourCycle: 'h23' });
    await screen.findByRole('heading', { name: 'Revisa tu correo' });
  });

  it('a 400 about the clock from the API shows next to the clock', async () => {
    mockApi(() =>
      Promise.reject(
        new ApiError(400, 'El reloj «h11» no es válido: elige 12 h o 24 h.', { field: 'locationHourCycle' }),
      ),
    );
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    const clock = screen.getByRole('radiogroup', { name: 'Reloj' });
    await waitFor(() =>
      expect(clock).toHaveAccessibleDescription('El reloj «h11» no es válido: elige 12 h o 24 h.'),
    );
  });

  it('the chosen format is sent canonical and shown by its name', async () => {
    // La API tarda: mientras, el campo ya muestra lo que se envió.
    let resolve: (value: unknown) => void = () => {};
    mockApi(() => new Promise((r) => (resolve = r)));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    pickRegional('Formato regional', 'es-es');
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    await waitFor(() => expect(registerCalls()).toHaveLength(1));
    expect(screen.getByLabelText('Formato regional')).toHaveValue(localeLabel('es-ES'));
    expect(registerCalls()[0][1]?.body).toMatchObject({ locationLocale: 'es-ES' });
    resolve({ message: 'genérico' });
    await screen.findByRole('heading', { name: 'Revisa tu correo' });
  });

  it('suggests zone and format from the browser, marked as such', async () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    const group = screen.getByRole('group', { name: 'Tu sede' });
    const zone = 'UTC';
    await waitFor(() => expect(within(group).getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel(zone)));
    expect(within(group).getByLabelText('Zona horaria')).toHaveAccessibleDescription(
      /Sugerido por tu navegador\./,
    );
    expect(within(group).getByLabelText('Formato regional')).toHaveValue(localeLabel('en-US'));
    await within(group).findByRole('option', { name: 'Euro (€)' });
  });

  it('suggests the country of an explicit browser region, marked and editable (DX-312 P1)', async () => {
    jest.mocked(browserCountry).mockReturnValue('VE');
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    const user = setupUser();
    render(<RegisterForm tenant={null} />);
    const group = screen.getByRole('group', { name: 'Tu sede' });
    const country = within(group).getByLabelText('País');
    await waitFor(() => expect(country).toHaveValue('Venezuela'));
    expect(country).toHaveAccessibleDescription(expect.stringContaining('Sugerido por tu navegador.'));
    // R1: la moneda del país se propone, marcada; elegir otro país la vuelve a proponer.
    expect(within(group).getByLabelText('Moneda')).toHaveAccessibleDescription(
      expect.stringContaining('Sugerido por el país.'),
    );
    await chooseCountry(user, country, 'ES');
    expect(country).toHaveValue('España');
    expect(country).not.toHaveAccessibleDescription(expect.stringContaining('Sugerido'));
    await waitFor(() => expect(within(group).getByLabelText('Moneda')).toHaveValue('EUR'));
  });

  it('the location intro says what is proposed and from where', () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    expect(
      screen.getByText(
        'La primera sede de tu clínica. Te proponemos el país y la zona de tu navegador, y la moneda y el formato de ese país: revísalos. Podrás cambiarlos y añadir más sedes en Ajustes → Sedes.',
      ),
    ).toBeInTheDocument();
  });

  it('a 400 for a location field from the API shows next to that field', async () => {
    mockApi(() =>
      Promise.reject(
        new ApiError(400, 'La moneda XYZ no está en la lista de monedas admitidas.', {
          field: 'locationCurrency',
        }),
      ),
    );
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    const currency = screen.getByLabelText('Moneda');
    await waitFor(() =>
      expect(currency).toHaveAccessibleDescription('La moneda XYZ no está en la lista de monedas admitidas.'),
    );
    expect(currency).toHaveFocus();
    expect(screen.queryByText('No pudimos crear la cuenta. Intenta de nuevo.')).not.toBeInTheDocument();
  });

  it('if /public/currencies fails once, «Monedas no disponibles» retries and the form can still be sent', async () => {
    let currencyCalls = 0;
    mockedFetch.mockImplementation(((path: string) => {
      if (path === '/public/currencies') {
        currencyCalls += 1;
        return currencyCalls === 1 ? Promise.reject(new ApiError(503, 'down')) : Promise.resolve(CURRENCIES);
      }
      return Promise.resolve({ message: 'genérico' });
    }) as typeof apiFetch);
    const user = setupUser();
    render(<RegisterForm tenant={null} />);
    expect(await screen.findByText('Monedas no disponibles')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('option', { name: 'Euro (€)' })).toBeInTheDocument();

    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(registerCalls()[0][1]?.body).toMatchObject({ locationCurrency: 'EUR' });
  });

  it('the chosen zone is sent in its canonical casing and shown by its name', async () => {
    let resolve: (value: unknown) => void = () => {};
    mockApi(() => new Promise((r) => (resolve = r)));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    pickRegional('Zona horaria', 'europe/madrid');
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    await waitFor(() => expect(registerCalls()).toHaveLength(1));
    expect(screen.getByLabelText('Zona horaria')).toHaveValue(timeZoneLabel('Europe/Madrid'));
    expect(registerCalls()[0][1]?.body).toMatchObject({ locationTimeZone: 'Europe/Madrid' });
    resolve({ message: 'genérico' });
    await screen.findByRole('heading', { name: 'Revisa tu correo' });
  });
});
