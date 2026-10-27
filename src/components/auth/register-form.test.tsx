import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { RegisterForm } from './register-form';
import { apiFetch, ApiError } from '../../lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/api/client', () => ({
  apiFetch: jest.fn(),
  // La clase real: `apiErrorMessage` la reconoce con `instanceof`.
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
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
  fireEvent.change(screen.getByLabelText('País'), { target: { value: 'ES' } });
  fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'EUR' } });
  fireEvent.change(screen.getByLabelText('Zona horaria'), { target: { value: 'Europe/Madrid' } });
  fireEvent.change(screen.getByLabelText('Formato regional'), { target: { value: 'es-ES' } });
}

beforeEach(() => {
  mockedFetch.mockReset();
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
    // País y moneda empiezan vacíos; nada se deduce de nada (R10).
    expect(within(group).getByLabelText('País')).toHaveValue('');
    expect(within(group).getByLabelText('Moneda')).toHaveValue('');
  });

  it('register form does not submit without the four fields and the body equals what is shown', async () => {
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
    // Sin las sugerencias del navegador, los cuatro campos quedan vacíos.
    await user.clear(within(group).getByLabelText('Zona horaria'));
    await user.clear(within(group).getByLabelText('Formato regional'));

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
    expect(within(group).getByLabelText('País')).toHaveFocus();

    await user.selectOptions(within(group).getByLabelText('País'), 'ES');
    await user.selectOptions(within(group).getByLabelText('Moneda'), 'JPY');
    await user.type(within(group).getByLabelText('Zona horaria'), 'Asia/Tokyo');
    await user.type(within(group).getByLabelText('Formato regional'), 'ja-jp');
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
    });
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
  });

  it('the typed format is shown in canonical form when it is sent', async () => {
    // La API tarda: mientras, el campo ya muestra lo que se envió.
    let resolve: (value: unknown) => void = () => {};
    mockApi(() => new Promise((r) => (resolve = r)));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Formato regional'), { target: { value: 'es-es' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    await waitFor(() => expect(registerCalls()).toHaveLength(1));
    expect(screen.getByLabelText('Formato regional')).toHaveValue('es-ES');
    expect(registerCalls()[0][1]?.body).toMatchObject({ locationLocale: 'es-ES' });
    resolve({ message: 'genérico' });
    await screen.findByRole('heading', { name: 'Revisa tu correo' });
  });

  it('suggests zone and format from the browser, marked as such', async () => {
    mockApi(() => Promise.resolve({ message: 'genérico' }));
    render(<RegisterForm tenant={null} />);
    const group = screen.getByRole('group', { name: 'Tu sede' });
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await waitFor(() => expect(within(group).getByLabelText('Zona horaria')).toHaveValue(zone));
    expect(within(group).getByLabelText('Zona horaria')).toHaveAccessibleDescription(
      /Sugerido por tu navegador\./,
    );
    expect(within(group).getByLabelText('Formato regional')).not.toHaveValue('');
    await within(group).findByRole('option', { name: 'Euro (€)' });
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

  it('the typed zone is sent and shown in its canonical casing', async () => {
    let resolve: (value: unknown) => void = () => {};
    mockApi(() => new Promise((r) => (resolve = r)));
    render(<RegisterForm tenant={null} />);
    await fillRequiredFields();
    fireEvent.change(screen.getByLabelText('Zona horaria'), { target: { value: 'europe/madrid' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    await waitFor(() => expect(registerCalls()).toHaveLength(1));
    expect(screen.getByLabelText('Zona horaria')).toHaveValue('Europe/Madrid');
    expect(registerCalls()[0][1]?.body).toMatchObject({ locationTimeZone: 'Europe/Madrid' });
    resolve({ message: 'genérico' });
    await screen.findByRole('heading', { name: 'Revisa tu correo' });
  });
});
