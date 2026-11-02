import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MfaSettings } from './mfa-settings';
import * as api from '../../lib/auth/mfa-api';

jest.mock('qrcode.react', () => ({ QRCodeSVG: () => <svg data-testid="qr" /> }));
jest.mock('../../lib/auth/mfa-api', () => ({
  ...jest.requireActual('../../lib/auth/mfa-api'),
  getMyMfa: jest.fn(),
  startMyMfaEnrollment: jest.fn(),
  confirmMyMfaEnrollment: jest.fn(),
  disableMyMfa: jest.fn(),
  regenerateRecoveryCodes: jest.fn(),
}));
const mock = api as jest.Mocked<typeof api>;
const OFF = { enabled: false, enabledAt: null, recoveryCodesRemaining: 0, required: false };
const ON = { ...OFF, enabled: true, enabledAt: '2026-10-01T10:00:00Z', recoveryCodesRemaining: 8 };

describe('MfaSettings (DX-021)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('alta: contraseña → QR y clave → código → códigos de recuperación una vez', async () => {
    mock.getMyMfa.mockResolvedValue(OFF as never);
    mock.startMyMfaEnrollment.mockResolvedValue({ secret: 'ABCDEFGH', otpauthUri: 'otpauth://x' });
    mock.confirmMyMfaEnrollment.mockResolvedValue({
      ...ON,
      recoveryCodesRemaining: 10,
      recoveryCodes: ['AAAA-BBBB-CCCC-DDDD'],
      accessToken: 'nuevo',
    } as never);
    render(<MfaSettings token="t" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activar' }));
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByTestId('qr')).toBeInTheDocument();
    expect(mock.startMyMfaEnrollment).toHaveBeenCalledWith('t', 'pw');
    expect(screen.getByTestId('mfa-secret')).toHaveTextContent('ABCD EFGH');
    fireEvent.change(screen.getByLabelText('Código de la app'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    expect(await screen.findByText('AAAA-BBBB-CCCC-DDDD')).toBeInTheDocument();
    // No se cierra sin confirmar que se guardaron.
    expect(screen.getByRole('button', { name: 'Listo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(screen.queryByText('AAAA-BBBB-CCCC-DDDD')).not.toBeInTheDocument());
    expect(screen.getByText('Quedan 10')).toBeInTheDocument();
  });

  it('error de contraseña: se muestra el mensaje de la API y sigue en el paso', async () => {
    mock.getMyMfa.mockResolvedValue(OFF as never);
    const { ApiError } = jest.requireActual('../../lib/api/api-error');
    mock.startMyMfaEnrollment.mockRejectedValue(
      new ApiError(400, 'La contraseña no es correcta.'),
    );
    render(<MfaSettings token="t" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Activar' }));
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('La contraseña no es correcta.')).toBeInTheDocument();
    expect(screen.queryByTestId('qr')).not.toBeInTheDocument();
  });

  it('desactivar pide contraseña y código', async () => {
    mock.getMyMfa.mockResolvedValue(ON as never);
    mock.disableMyMfa.mockResolvedValue();
    render(<MfaSettings token="t" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar' }));
    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'pw' } });
    fireEvent.change(screen.getByLabelText('Código de la app'), { target: { value: '654321' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Desactivar' }).at(-1)!);
    await waitFor(() =>
      expect(mock.disableMyMfa).toHaveBeenCalledWith('t', 'pw', { code: '654321' }),
    );
    expect(await screen.findByText('Desactivada')).toBeInTheDocument();
  });

  it('obligatoria: sin «Desactivar»', async () => {
    mock.getMyMfa.mockResolvedValue({ ...ON, required: true } as never);
    render(<MfaSettings token="t" />);
    await screen.findByText(/obligatoria en tu cuenta/);
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
  });

  it('pocos códigos: avisa', async () => {
    mock.getMyMfa.mockResolvedValue({ ...ON, recoveryCodesRemaining: 2 } as never);
    render(<MfaSettings token="t" />);
    expect(await screen.findByText(/Te quedan pocos códigos/)).toBeInTheDocument();
  });
});
