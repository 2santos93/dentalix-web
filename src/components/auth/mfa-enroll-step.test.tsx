import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { startLoginMfaEnrollment } from '@/lib/auth/mfa-api';
import { MfaEnrollStep } from './mfa-enroll-step';

jest.mock('../../lib/auth/mfa-api', () => ({
  ...jest.requireActual('../../lib/auth/mfa-api'),
  startLoginMfaEnrollment: jest.fn(),
}));
jest.mock('./mfa-secret-panel', () => ({
  MfaSecretPanel: ({ secret }: { secret: string }) => <p>{secret}</p>,
}));

const mockedStart = startLoginMfaEnrollment as jest.MockedFunction<typeof startLoginMfaEnrollment>;
const ENROLLMENT = { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x' };

function setup(emailCodeRequired: boolean) {
  const onExpired = jest.fn();
  render(
    <MfaEnrollStep
      mfaToken="tok"
      emailCodeRequired={emailCodeRequired}
      onDone={jest.fn()}
      onExpired={onExpired}
    />,
  );
  return { onExpired };
}

beforeEach(() => mockedStart.mockReset());

describe('MfaEnrollStep: alta del superadmin (DX-021-bis)', () => {
  it('sin código del correo empieza sola, como siempre', async () => {
    mockedStart.mockResolvedValue(ENROLLMENT);
    setup(false);
    expect(await screen.findByText(ENROLLMENT.secret)).toBeInTheDocument();
    expect(mockedStart).toHaveBeenCalledWith('tok');
  });

  it('con código del correo no pide nada a la API hasta escribirlo y entonces enseña la clave', async () => {
    const user = userEvent.setup();
    mockedStart.mockResolvedValue(ENROLLMENT);
    setup(true);
    expect(mockedStart).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('El código tiene 8 dígitos.')).toBeInTheDocument();
    expect(mockedStart).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Código del correo'), '1234 5678');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText(ENROLLMENT.secret)).toBeInTheDocument();
    expect(mockedStart).toHaveBeenCalledWith('tok', '12345678');
  });

  it('dice qué correo usar: cada intento tiene su código', () => {
    render(
      <MfaEnrollStep
        mfaToken="tok"
        emailCodeRequired
        emailCodeRef="A1F3"
        onDone={jest.fn()}
        onExpired={jest.fn()}
      />,
    );
    expect(screen.getByText(/referencia A1F3/)).toBeInTheDocument();
  });

  it('un código malo se queda en el paso, con el mensaje de la API', async () => {
    const user = userEvent.setup();
    mockedStart.mockRejectedValue(new ApiError(400, 'El código del correo no es correcto.'));
    setup(true);
    await user.type(screen.getByLabelText('Código del correo'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('El código del correo no es correcto.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código del correo')).toBeInTheDocument();
  });

  it('el paso caducado vuelve a la contraseña', async () => {
    const user = userEvent.setup();
    mockedStart.mockRejectedValue(
      new ApiError(401, 'caducó', { code: 'MFA_CHALLENGE_EXPIRED' }),
    );
    const { onExpired } = setup(true);
    await user.type(screen.getByLabelText('Código del correo'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(onExpired).toHaveBeenCalled());
  });
});
