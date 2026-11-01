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

const AVAILABILITY = /^\/public\/subdomains\/([^/]+)\/availability$/;

/**
 * `GET /public/currencies` responde la lista; la disponibilidad de la
 * dirección, `availability` (libre por defecto); `POST /auth/register`, lo que
 * diga el test.
 */
function mockApi(register: () => Promise<unknown>, availability: (slug: string) => string = () => 'available') {
  mockedFetch.mockImplementation(((path: string) => {
    if (path === '/public/currencies') return Promise.resolve(CURRENCIES);
    const slug = AVAILABILITY.exec(path)?.[1];
    if (slug) return Promise.resolve({ subdomain: slug, status: availability(slug) });
    return register();
  }) as typeof apiFetch);
}

const availabilityCalls = () => mockedFetch.mock.calls.filter(([path]) => AVAILABILITY.test(String(path)));

const registerCalls = () => mockedFetch.mock.calls.filter(([path]) => path === '/auth/register');

/** Paso 1 (la clínica): nombre, dirección web y la sede; no avanza. */
async function fillClinicStep() {
  fireEvent.change(screen.getByLabelText(/nombre de la clínica/i), {
    target: { value: 'Clínica Uno' },
  });
  fireEvent.change(screen.getByLabelText('Dirección web'), { target: { value: 'clinica-uno' } });
  await screen.findByRole('option', { name: 'Euro (€)' });
  // El país se elige en el combobox: se escribe el código y se elige la opción.
  fireEvent.change(screen.getByLabelText('País'), { target: { value: 'ES' } });
  fireEvent.click(screen.getByRole('option', { name: 'España' }));
  fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'EUR' } });
  pickRegional('Zona horaria', 'Europe/Madrid');
  pickRegional('Formato regional', 'es-ES');
}

/** «Continuar» al paso 2 (la cuenta). */
async function continueToAccount() {
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await screen.findByLabelText(/nombre completo/i);
}

/** Paso 2 (la cuenta): nombre, correo y contraseña. */
function fillAccountStep() {
  fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Ana Ruiz' } });
  fireEvent.change(screen.getByLabelText(/correo/i), {
    target: { value: 'ana@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } });
}

/** Los dos pasos completos, listos para «Crear cuenta». */
async function fillRequiredFields() {
  await fillClinicStep();
  await continueToAccount();
  fillAccountStep();
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
  it('a 409 sends you back to step 1, next to the address, with its message and focus', async () => {
    mockApi(() => Promise.reject(new ApiError(409, 'Subdominio ya existe')));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Subdominio ya existe');
    const address = screen.getByLabelText('Dirección web');
    expect(address).toHaveAccessibleDescription('Subdominio ya existe');
    expect(address).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(address).toHaveFocus());
    // Lo escrito en el paso 1 sigue ahí.
    expect(address).toHaveValue('clinica-uno');
    expect(screen.getByLabelText(/nombre de la clínica/i)).toHaveValue('Clínica Uno');
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

  it('keeps aria-describedby resolving to the error banner on the three account fields', async () => {
    mockApi(() => Promise.reject(new ApiError(500, 'Internal server error')));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    const alert = await screen.findByRole('alert');
    const errorId = alert.getAttribute('id');
    expect(errorId).toBeTruthy();
    expect(screen.getByLabelText(/nombre completo/i)).toHaveAttribute(
      'aria-describedby',
      errorId,
    );
    expect(screen.getByLabelText(/correo/i)).toHaveAttribute('aria-describedby', errorId);
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('aria-describedby', errorId);
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

  it('un 409 sin mensaje propio habla solo de la dirección (nunca del correo)', async () => {
    mockApi(() => Promise.reject(new ApiError(409, 'Conflict')));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Esa dirección web ya está en uso. Elige otra.');
    expect(alert).not.toHaveTextContent(/correo/i);
  });

  describe('disponibilidad de la dirección mientras se escribe', () => {
    const address = () => screen.getByLabelText('Dirección web');
    const statusLine = () => document.getElementById('register-subdomain-status') as HTMLElement;

    it('al dejar de escribir dice «Disponible» (una sola petición, con lo último escrito)', async () => {
      mockApi(() => Promise.resolve({ message: 'genérico' }));
      render(<RegisterForm tenant={null} />);
      for (const value of ['s', 'so', 'sonrisa']) fireEvent.change(address(), { target: { value } });

      await waitFor(() => expect(statusLine()).toHaveTextContent('Disponible'), { timeout: 2000 });
      expect(statusLine()).toHaveAttribute('aria-live', 'polite');
      expect(address()).toHaveAccessibleDescription(expect.stringContaining('Disponible'));
      expect(availabilityCalls().map(([path]) => path)).toEqual(['/public/subdomains/sonrisa/availability']);
      // El sufijo sigue a la vista.
      expect(screen.getByText('.dentalix.app')).toBeInTheDocument();
    });

    it('en uso: «En uso, prueba otra.» y «Continuar» no avanza', async () => {
      mockApi(() => Promise.resolve({ message: 'genérico' }), () => 'taken');
      render(<RegisterForm tenant={null} />);
      await fillClinicStep();
      await waitFor(() => expect(statusLine()).toHaveTextContent('En uso, prueba otra.'), { timeout: 2000 });

      fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
      expect(address()).toHaveAttribute('aria-invalid', 'true');
      expect(address()).toHaveAccessibleDescription('Esa dirección web ya está en uso. Elige otra.');
      await waitFor(() => expect(address()).toHaveFocus());
      expect(screen.queryByLabelText(/nombre completo/i)).not.toBeInTheDocument();
    });

    it('reservada: lo dice la API (la lista no se copia en la web)', async () => {
      mockApi(() => Promise.resolve({ message: 'genérico' }), () => 'reserved');
      render(<RegisterForm tenant={null} />);
      fireEvent.change(address(), { target: { value: 'admin' } });
      await waitFor(() => expect(statusLine()).toHaveTextContent('Reservada para la plataforma, prueba otra.'), {
        timeout: 2000,
      });
    });

    it('mal formada: la regla del formato, sin preguntar a la API', async () => {
      mockApi(() => Promise.resolve({ message: 'genérico' }));
      render(<RegisterForm tenant={null} />);
      fireEvent.change(address(), { target: { value: 'sonrisa-' } });
      await waitFor(() => expect(statusLine()).toHaveTextContent('sin guion al principio ni al final'), {
        timeout: 2000,
      });
      expect(availabilityCalls()).toHaveLength(0);
    });

    it('si no se puede comprobar no afirma nada y deja seguir (lo dirá el envío)', async () => {
      mockApi(() => Promise.resolve({ message: 'genérico' }));
      const base = mockedFetch.getMockImplementation()!;
      mockedFetch.mockImplementation(((path: string, opts?: unknown) =>
        AVAILABILITY.test(path) ? Promise.reject(new ApiError(429, 'Too Many Requests')) : base(path, opts as never)) as typeof apiFetch);
      render(<RegisterForm tenant={null} />);
      await fillClinicStep();
      await waitFor(() => expect(availabilityCalls().length).toBeGreaterThan(0), { timeout: 2000 });
      expect(statusLine()).toHaveTextContent('');
      await continueToAccount();
    });

    it('un 409 SUBDOMAIN_RESERVED del envío vuelve al campo con su texto', async () => {
      mockApi(() =>
        Promise.reject(new ApiError(409, 'Esa dirección está reservada', { code: 'SUBDOMAIN_RESERVED' })),
      );
      render(<RegisterForm tenant={null} />);
      await fillRequiredFields();
      fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
      await waitFor(() =>
        expect(address()).toHaveAccessibleDescription('Esa dirección está reservada para la plataforma. Elige otra.'),
      );
    });
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
    fireEvent.change(screen.getByLabelText('Dirección web'), { target: { value: 'clinica-uno' } });
    // Sin las sugerencias del navegador, los cinco campos quedan vacíos.
    expect(within(group).getByLabelText('Zona horaria')).toHaveValue('');
    expect(within(group).getByLabelText('Formato regional')).toHaveValue('');

    // «Continuar» no avanza sin la sede: cada campo dice qué falta.
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByLabelText(/nombre completo/i)).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    fillAccountStep();
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
    await fillClinicStep();
    pickRegional('Formato regional', 'en-US');
    // Al elegir España el reloj pasó al suyo (24 h); el formato elegido a mano no lo cambia: se envía lo que se ve.
    expect(within(clock).getByRole('radio', { name: '24 h' })).toBeChecked();
    await continueToAccount();
    fillAccountStep();
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
    // Vuelve al paso 1, donde vive el reloj.
    const clock = await screen.findByRole('radiogroup', { name: 'Reloj' });
    await waitFor(() =>
      expect(clock).toHaveAccessibleDescription('El reloj «h11» no es válido: elige 12 h o 24 h.'),
    );
  });

  it('the chosen format is sent canonical and shown by its name', async () => {
    // La API tarda: mientras, el campo ya muestra lo que se envió.
    let resolve: (value: unknown) => void = () => {};
    mockApi(() => new Promise((r) => (resolve = r)));
    render(<RegisterForm tenant={null} />);
    await fillClinicStep();
    pickRegional('Formato regional', 'es-es');
    // Al avanzar, el formato queda en su forma canónica; al volver se ve por su nombre.
    await continueToAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByLabelText('Formato regional')).toHaveValue(localeLabel('es-ES'));
    await continueToAccount();
    fillAccountStep();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    await waitFor(() => expect(registerCalls()).toHaveLength(1));
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
    // V1: en Venezuela, USD, con VES a un clic; en España ya no hay alternativa.
    await waitFor(() => expect(within(group).getByLabelText('Moneda')).toHaveValue('USD'));
    expect(within(group).getByLabelText('Moneda')).toHaveAccessibleDescription(
      expect.stringContaining('Sugerido por el país.'),
    );
    expect(within(group).getByRole('button', { name: 'Usar VES' })).toBeInTheDocument();
    await chooseCountry(user, country, 'ES');
    expect(within(group).queryByRole('button', { name: 'Usar VES' })).not.toBeInTheDocument();
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
    // Vuelve al paso 1, junto a la moneda.
    const currency = await screen.findByLabelText('Moneda');
    await waitFor(() =>
      expect(currency).toHaveAccessibleDescription('La moneda XYZ no está en la lista de monedas admitidas.'),
    );
    await waitFor(() => expect(currency).toHaveFocus());
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
    await fillClinicStep();
    pickRegional('Zona horaria', 'europe/madrid');
    await continueToAccount();
    fireEvent.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByLabelText('Zona horaria')).toHaveValue(timeZoneLabel('Europe/Madrid'));
    await continueToAccount();
    fillAccountStep();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    await waitFor(() => expect(registerCalls()).toHaveLength(1));
    expect(registerCalls()[0][1]?.body).toMatchObject({ locationTimeZone: 'Europe/Madrid' });
    resolve({ message: 'genérico' });
    await screen.findByRole('heading', { name: 'Revisa tu correo' });
  });

  it('shows a step indicator: «Tu clínica» first, «Tu cuenta» after «Continuar»', async () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    expect(screen.getByRole('button', { name: /tu clínica/i }).closest('li')).toHaveAttribute('aria-current', 'step');
    await fillClinicStep();
    await continueToAccount();
    expect(screen.getByRole('button', { name: /tu cuenta/i }).closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByLabelText(/nombre completo/i)).toHaveFocus();
    expect(screen.queryByRole('group', { name: 'Tu sede' })).not.toBeInTheDocument();
  });

  it('the address field shows its suffix and the resulting address, and only takes lowercase', () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    const address = screen.getByLabelText('Dirección web');
    // El dominio se lee como en el componente: el CI fija NEXT_PUBLIC_ROOT_DOMAIN.
    const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'dentalix.app';
    expect(screen.getByText(`.${rootDomain}`)).toBeInTheDocument();
    fireEvent.change(address, { target: { value: 'Sonrisa' } });
    expect(address).toHaveValue('sonrisa');
    expect(address).toHaveAccessibleDescription(
      `Así entrarás: sonrisa.${rootDomain}. Solo minúsculas sin tildes, números y guiones.`,
    );
  });

  it('«Continuar» checks the clinic name and the address format before moving on', async () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    await fillClinicStep();
    fireEvent.change(screen.getByLabelText(/nombre de la clínica/i), { target: { value: ' ' } });
    fireEvent.change(screen.getByLabelText('Dirección web'), { target: { value: 'sonrisa norte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByLabelText(/nombre de la clínica/i)).toHaveAccessibleDescription(
      'Escribe el nombre de la clínica (al menos 2 caracteres).',
    );
    expect(screen.getByLabelText(/nombre de la clínica/i)).toHaveFocus();
    expect(screen.getByLabelText('Dirección web')).toHaveAccessibleDescription(
      'Usa solo minúsculas sin tildes, números y guiones, sin guion al principio ni al final (por ejemplo, sonrisa-norte).',
    );
    expect(screen.queryByLabelText(/nombre completo/i)).not.toBeInTheDocument();
  });

  it('states the password rule before submitting and checks it, with the other account fields', async () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    await fillClinicStep();
    await continueToAccount();
    const password = screen.getByLabelText('Contraseña');
    expect(password).toHaveAccessibleDescription('Mínimo 8 caracteres.');
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'ana@' } });
    fireEvent.change(password, { target: { value: 'corta' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    expect(registerCalls()).toHaveLength(0);
    expect(screen.getByLabelText(/nombre completo/i)).toHaveAccessibleDescription(
      'Escribe tu nombre (al menos 2 caracteres).',
    );
    expect(screen.getByLabelText(/nombre completo/i)).toHaveFocus();
    expect(screen.getByLabelText(/correo/i)).toHaveAccessibleDescription(
      'Escribe un correo electrónico válido (por ejemplo, nombre@clinica.com).',
    );
    expect(password).toHaveAccessibleDescription('La contraseña debe tener al menos 8 caracteres.');
  });
});
