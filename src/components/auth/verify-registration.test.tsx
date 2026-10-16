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

  it('no consume el enlace al cargar: confirma con un clic y ofrece iniciar sesión', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      tenantId: 't1',
      userId: 'u1',
      subdomain: 'sonrisa',
    });
    render(<VerifyRegistration verifyToken="tok-1" />);
    expect(apiFetch).not.toHaveBeenCalled();

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
      body: { token: 'tok-1' },
    });
  });

  it('muestra en español el error de la API (enlace usado o caducado)', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(
      new ApiError(410, 'El enlace para confirmar el registro caducó (vale 24 horas).'),
    );
    render(<VerifyRegistration verifyToken="tok-2" />);
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
