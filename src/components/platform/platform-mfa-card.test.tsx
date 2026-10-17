import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlatformMfaCard } from './platform-mfa-card';
import { ApiError } from '@/lib/api/client';
import {
  confirmPlatformMfa,
  getPlatformMfa,
  groupSecret,
  startPlatformMfaEnrollment,
} from '@/lib/platform/platform-api';

jest.mock('../../lib/platform/platform-api', () => ({
  ...jest.requireActual('../../lib/platform/platform-api'),
  getPlatformMfa: jest.fn(),
  startPlatformMfaEnrollment: jest.fn(),
  confirmPlatformMfa: jest.fn(),
}));

const mockedGet = getPlatformMfa as jest.MockedFunction<typeof getPlatformMfa>;
const mockedStart = startPlatformMfaEnrollment as jest.MockedFunction<typeof startPlatformMfaEnrollment>;
const mockedConfirm = confirmPlatformMfa as jest.MockedFunction<typeof confirmPlatformMfa>;

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

beforeEach(() => {
  mockedGet.mockReset();
  mockedStart.mockReset();
  mockedConfirm.mockReset();
});

describe('PlatformMfaCard (SEC-008)', () => {
  it('sin MFA: explica que es obligatorio y lo activa en dos pasos dentro de un modal', async () => {
    mockedGet.mockResolvedValueOnce({ enabled: false, enabledAt: null });
    mockedStart.mockResolvedValueOnce({
      secret: SECRET,
      otpauthUri: `otpauth://totp/Dentalix:a%40b.c?secret=${SECRET}&issuer=Dentalix`,
    });
    mockedConfirm.mockResolvedValueOnce({ enabled: true, enabledAt: '2026-10-17T12:00:00.000Z' });
    render(<PlatformMfaCard token="pt" />);

    expect(await screen.findByText(/obligatoria para entrar como soporte/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));

    const dialog = await screen.findByRole('dialog', { name: /activar la verificación/i });
    expect(dialog).toHaveTextContent(groupSecret(SECRET));
    expect(screen.getByRole('link', { name: /abrir en la app/i })).toHaveAttribute(
      'href',
      expect.stringContaining('otpauth://totp/'),
    );

    await userEvent.type(screen.getByLabelText('Código de la app'), '123 456');
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));

    expect(mockedConfirm).toHaveBeenCalledWith('pt', '123456');
    expect(await screen.findByText('Verificación en dos pasos activada.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
  });

  it('un código erróneo deja el modal abierto con el error en español', async () => {
    mockedGet.mockResolvedValueOnce({ enabled: false, enabledAt: null });
    mockedStart.mockResolvedValueOnce({ secret: SECRET, otpauthUri: 'otpauth://totp/x' });
    mockedConfirm.mockRejectedValueOnce(
      new ApiError(400, 'El código no es correcto. Revisa la hora del móvil y usa el código vigente de la app.'),
    );
    render(<PlatformMfaCard token="pt" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Activar' }));
    await screen.findByRole('dialog');
    await userEvent.type(screen.getByLabelText('Código de la app'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));

    expect(await screen.findByText(/el código no es correcto/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('valida 6 dígitos antes de llamar a la API', async () => {
    mockedGet.mockResolvedValueOnce({ enabled: false, enabledAt: null });
    mockedStart.mockResolvedValueOnce({ secret: SECRET, otpauthUri: 'otpauth://totp/x' });
    render(<PlatformMfaCard token="pt" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Activar' }));
    await screen.findByRole('dialog');
    await userEvent.type(screen.getByLabelText('Código de la app'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(await screen.findByText('El código tiene 6 dígitos.')).toBeInTheDocument();
    expect(mockedConfirm).not.toHaveBeenCalled();
  });

  it('con MFA activo muestra desde cuándo y no ofrece activarlo', async () => {
    mockedGet.mockResolvedValueOnce({ enabled: true, enabledAt: '2026-10-01T12:00:00.000Z' });
    render(<PlatformMfaCard token="pt" />);
    expect(await screen.findByText(/activa desde el/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
  });

  it('si no carga el estado: error de sección con «Reintentar»', async () => {
    mockedGet
      .mockRejectedValueOnce(new ApiError(500, 'boom'))
      .mockResolvedValueOnce({ enabled: true, enabledAt: '2026-10-01T12:00:00.000Z' });
    render(<PlatformMfaCard token="pt" />);
    await userEvent.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText(/activa desde el/i)).toBeInTheDocument();
  });
});
