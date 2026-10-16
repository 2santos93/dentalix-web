import { render, screen, fireEvent } from '@testing-library/react';
import { VerifyRegistration } from './verify-registration';
import { apiFetch, ApiError } from '../../lib/api/client';
import { clinicLoginHref } from '../../lib/tenant';

jest.mock('../../lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

describe('VerifyRegistration (DX-029)', () => {
  beforeEach(() => (apiFetch as jest.Mock).mockReset());

  const fillPassword = (value: string) =>
    fireEvent.change(screen.getByLabelText('Contraseña que elegiste al registrarte'), {
      target: { value },
    });

  it('no consume el enlace al cargar: pide la contraseña del registro, confirma y ofrece iniciar sesión', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      tenantId: 't1',
      userId: 'u1',
      subdomain: 'sonrisa',
    });
    render(<VerifyRegistration verifyToken="tok-1" />);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Contraseña que elegiste al registrarte')).toHaveAttribute(
      'autocomplete',
      'current-password',
    );

    fillPassword('Clave-Segura-2026!');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear mi clínica' }));

    expect(
      await screen.findByRole('heading', { name: '¡Tu clínica está lista!' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute(
      'href',
      'http://sonrisa.localhost/login',
    );
    expect(apiFetch).toHaveBeenCalledWith('/auth/register/verify', {
      method: 'POST',
      body: { token: 'tok-1', password: 'Clave-Segura-2026!' },
    });
  });

  it('sin contraseña no llama a la API y lo explica', () => {
    render(<VerifyRegistration verifyToken="tok-3" />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear mi clínica' }));
    expect(apiFetch).not.toHaveBeenCalled();
    expect(
      screen.getByText('Escribe la contraseña que elegiste al registrarte.'),
    ).toBeInTheDocument();
  });

  it('enlace inválido o contraseña errónea: muestra el error genérico de la API y deja reintentar', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(
      new ApiError(
        404,
        'No pudimos confirmar el registro: el enlace no es válido o ya se usó, o la contraseña no es la que elegiste al registrarte. Revísala o vuelve a registrarte.',
      ),
    );
    render(<VerifyRegistration verifyToken="tok-4" />);
    fillPassword('otra-clave');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear mi clínica' }));

    expect(await screen.findByText(/la contraseña no es la que elegiste/)).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña que elegiste al registrarte')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Confirmar y crear mi clínica' })).toBeEnabled();
  });

  it('muestra en español el error de la API (enlace usado o caducado)', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(
      new ApiError(410, 'El enlace para confirmar el registro caducó (vale 24 horas).'),
    );
    render(<VerifyRegistration verifyToken="tok-2" />);
    fillPassword('Clave-Segura-2026!');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear mi clínica' }));

    expect(await screen.findByText(/caducó \(vale 24 horas\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar y crear mi clínica' })).toBeEnabled();
  });
});

describe('clinicLoginHref', () => {
  it('ruta relativa si ya estamos en el host de la clínica', () => {
    expect(
      clinicLoginHref('demo', {
        protocol: 'http:',
        host: 'demo.localhost:3001',
      }),
    ).toBe('/login');
  });

  it('origen de la clínica (con puerto) desde otro host', () => {
    expect(clinicLoginHref('demo', { protocol: 'http:', host: 'localhost:3001' })).toBe(
      'http://demo.localhost:3001/login',
    );
    expect(
      clinicLoginHref('demo', {
        protocol: 'https:',
        host: 'otra.dentalix.local',
      }),
    ).toBe('https://demo.dentalix.local/login');
  });
});
