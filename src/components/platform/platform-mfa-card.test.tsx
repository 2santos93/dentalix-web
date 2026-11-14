import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlatformMfaCard } from './platform-mfa-card';
import { ApiError } from '@/lib/api/client';
import { getPlatformMfa, regeneratePlatformRecoveryCodes } from '@/lib/platform/platform-api';

jest.mock('../../lib/platform/platform-api', () => ({
  ...jest.requireActual('../../lib/platform/platform-api'),
  getPlatformMfa: jest.fn(),
  regeneratePlatformRecoveryCodes: jest.fn(),
}));

const mockedGet = getPlatformMfa as jest.MockedFunction<typeof getPlatformMfa>;
const mockedRegenerate = regeneratePlatformRecoveryCodes as jest.MockedFunction<
  typeof regeneratePlatformRecoveryCodes
>;

const ACTIVE = {
  enabled: true,
  enabledAt: '2026-10-01T12:00:00.000Z',
  breakGlassAvailableAt: '2026-10-02T12:00:00.000Z',
  recoveryCodesRemaining: 10,
};

beforeEach(() => {
  mockedGet.mockReset();
  mockedRegenerate.mockReset();
});

describe('PlatformMfaCard (SEC-008, DX-021-bis)', () => {
  it('dice desde cuándo está activa y cuántos códigos quedan', async () => {
    mockedGet.mockResolvedValue(ACTIVE);
    render(<PlatformMfaCard token="tok" />);
    expect(await screen.findByText(/Activa desde el/)).toBeInTheDocument();
    expect(screen.getByText('Quedan 10')).toBeInTheDocument();
    expect(screen.queryByText(/No tienes códigos/)).not.toBeInTheDocument();
  });

  it('la fecha de alta sale en UTC con la palabra «UTC», sin sede ni hora del navegador (DX-354b, E8)', async () => {
    // 22:30 en Caracas del 1 de octubre ya es el 2 en UTC: el día que se pinta es el de UTC.
    mockedGet.mockResolvedValue({ ...ACTIVE, enabledAt: '2026-10-02T02:30:00.000Z' });
    render(<PlatformMfaCard token="tok" />);
    expect(
      await screen.findByText(/^Activa desde el 2026-10-02 02:30 UTC\./),
    ).toBeInTheDocument();
    // Sin sede en esta pantalla: nada de «a. m.» ni de aviso de formato.
    expect(screen.queryByText(/formato regional/)).not.toBeInTheDocument();
  });

  it('la espera de seguridad también sale en UTC', async () => {
    const future = new Date(Date.now() + 3_600_000);
    mockedGet.mockResolvedValue({ ...ACTIVE, breakGlassAvailableAt: future.toISOString() });
    render(<PlatformMfaCard token="tok" />);
    const iso = future.toISOString();
    const expected = `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
    expect(await screen.findByText(new RegExp(`desde el ${expected}\\.`))).toBeInTheDocument();
  });

  it('ya no ofrece activarla: el alta es la del login', async () => {
    mockedGet.mockResolvedValue(ACTIVE);
    render(<PlatformMfaCard token="tok" />);
    await screen.findByText(/Activa desde el/);
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
  });

  it('avisa de la espera de seguridad mientras dura', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    mockedGet.mockResolvedValue({ ...ACTIVE, breakGlassAvailableAt: future });
    render(<PlatformMfaCard token="tok" />);
    expect(await screen.findByText(/podrás usarla para entrar como soporte/)).toBeInTheDocument();
  });

  it('quien la activó antes de los códigos ve el aviso y los genera con contraseña y código', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...ACTIVE, recoveryCodesRemaining: 0 });
    mockedRegenerate.mockResolvedValue(['ABCD-EFGH-2345-6723', 'BCDE-FGHI-3456-7234']);
    render(<PlatformMfaCard token="tok" />);
    expect(await screen.findByText(/No tienes códigos de recuperación/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generar nuevos' }));
    await user.type(screen.getByLabelText('Contraseña actual'), 'Secreta123!');
    await user.type(screen.getByLabelText('Código de la app'), '123456');
    await user.click(screen.getByRole('button', { name: 'Generar' }));

    expect(mockedRegenerate).toHaveBeenCalledWith('tok', 'Secreta123!', { code: '123456' });
    expect(await screen.findByTestId('mfa-recovery-codes')).toHaveTextContent('ABCD-EFGH-2345-6723');
  });

  it('un error de la API se queda en el diálogo', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(ACTIVE);
    mockedRegenerate.mockRejectedValue(
      new ApiError(400, 'La contraseña no es correcta.'),
    );
    render(<PlatformMfaCard token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Generar nuevos' }));
    await user.type(screen.getByLabelText('Contraseña actual'), 'mala');
    await user.type(screen.getByLabelText('Código de la app'), '123456');
    await user.click(screen.getByRole('button', { name: 'Generar' }));
    expect(await screen.findByText('La contraseña no es correcta.')).toBeInTheDocument();
  });

  it('si no carga el estado, deja reintentar', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom'));
    mockedGet.mockResolvedValueOnce(ACTIVE);
    const user = userEvent.setup();
    render(<PlatformMfaCard token="tok" />);
    await user.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText(/Activa desde el/)).toBeInTheDocument();
  });
});
