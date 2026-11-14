import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from './login-form';
import { apiFetch, ApiError } from '../../lib/api/client';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/api/client', () => ({
  apiFetch: jest.fn(),
  // La clase real: `apiErrorMessage` la reconoce con `instanceof`.
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));
jest.mock('../../lib/auth/auth-store', () => ({
  useAuthStore: (selector: (s: { setAccessToken: jest.Mock }) => unknown) =>
    selector({ setAccessToken: jest.fn() }),
}));

describe('LoginForm', () => {
  it('renders email and password fields and a submit button', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/email|correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password|contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar|entrar|login/i })).toBeInTheDocument();
  });

  it('does not render a subdomain field', () => {
    render(<LoginForm />);
    expect(
      screen.queryByLabelText(/subdominio|subdomain|clínica|clinic/i),
    ).not.toBeInTheDocument();
  });

  it('submits only email and password to /auth/login', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ accessToken: 'a' });
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email|correo/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password|contraseña/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar|entrar|login/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith('/auth/login', {
      method: 'POST',
      body: { email: 'user@example.com', password: 'secret123' },
    });
  });

  it('shows the error message when the API call fails', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new ApiError(401, 'Credenciales inválidas'));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email|correo/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password|contraseña/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar|entrar|login/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  });

  // Revisión M-2: un 403 («Origin not allowed») en el login no es «pide acceso».
  it('un 403 en el login no habla de pedir permisos a un administrador', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new ApiError(403, 'Origin not allowed'));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email|correo/i), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText(/password|contraseña/i), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: /iniciar|entrar|login/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos iniciar sesión');
    expect(alert).not.toHaveTextContent(/administrador|origin/i);
  });

  it('keeps aria-describedby resolving to the error banner on both fields', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new ApiError(401, 'Credenciales inválidas'));
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email|correo/i), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password|contraseña/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /iniciar|entrar|login/i }));

    const alert = await screen.findByRole('alert');
    const errorId = alert.getAttribute('id');
    expect(errorId).toBeTruthy();
    expect(screen.getByLabelText(/email|correo/i)).toHaveAttribute('aria-describedby', errorId);
    expect(screen.getByLabelText(/password|contraseña/i)).toHaveAttribute(
      'aria-describedby',
      errorId,
    );
  });

  it('enlaza «¿Olvidaste tu contraseña?» (DX-010)', () => {
    render(<LoginForm />);
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toHaveAttribute(
      'href',
      '/olvide-contrasena',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('tras restablecer la contraseña muestra el aviso de éxito', () => {
    render(<LoginForm passwordReset />);
    expect(screen.getByRole('status')).toHaveTextContent('tu contraseña se cambió');
  });

  describe('demasiados intentos (429, DX-048)', () => {
    beforeEach(() => {
      (apiFetch as jest.Mock).mockReset();
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    function submit() {
      fireEvent.change(screen.getByLabelText(/email|correo/i), {
        target: { value: 'doctora@sonrisa.com' },
      });
      fireEvent.change(screen.getByLabelText(/password|contraseña/i), {
        target: { value: 'secret123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /iniciar|entrar|login/i }));
    }

    it('muestra la espera en minutos según Retry-After en una región aria-live, con cuenta atrás', async () => {
      (apiFetch as jest.Mock).mockRejectedValueOnce(
        new ApiError(429, 'Demasiados intentos.', { retryAfterSeconds: 120 }),
      );
      render(<LoginForm />);
      submit();

      const region = await screen.findByText(
        'Demasiados intentos. Vuelve a intentarlo en 2 min.',
      );
      const live = region.closest('[aria-live]');
      expect(live).toHaveAttribute('aria-live', 'polite');
      // Cuenta atrás visible (mm:ss) y el botón no deja reintentar antes.
      expect(screen.getByText('2:00')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /iniciar|entrar|login/i })).toBeDisabled();
      // Los campos siguen describiéndose con el aviso.
      expect(screen.getByLabelText(/email|correo/i)).toHaveAttribute(
        'aria-describedby',
        live?.getAttribute('id'),
      );

      act(() => {
        jest.advanceTimersByTime(61_000);
      });
      expect(
        screen.getByText('Demasiados intentos. Vuelve a intentarlo en 1 min.'),
      ).toBeInTheDocument();
      expect(screen.getByText('0:59')).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(59_000);
      });
      expect(screen.getByText('Ya puedes volver a intentarlo.')).toBeInTheDocument();
      expect(screen.queryByText(/Demasiados intentos/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /iniciar|entrar|login/i })).toBeEnabled();
    });

    it('sin Retry-After explica la espera en español y no bloquea el botón', async () => {
      (apiFetch as jest.Mock).mockRejectedValueOnce(new ApiError(429, 'Too Many Requests'));
      render(<LoginForm />);
      submit();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Demasiados intentos seguidos. Espera un momento.',
      );
      expect(screen.getByRole('button', { name: /iniciar|entrar|login/i })).toBeEnabled();
    });

    it('un login correcto tras la espera limpia el aviso', async () => {
      (apiFetch as jest.Mock)
        .mockRejectedValueOnce(new ApiError(429, 'x', { retryAfterSeconds: 1 }))
        .mockResolvedValueOnce({ accessToken: 'a' });
      render(<LoginForm />);
      submit();
      await screen.findByText('Demasiados intentos. Vuelve a intentarlo en 1 min.');
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      fireEvent.click(screen.getByRole('button', { name: /iniciar|entrar|login/i }));
      await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(screen.queryByText('Ya puedes volver a intentarlo.')).not.toBeInTheDocument(),
      );
    });
  });

  describe('acceso de soporte del superadmin (SEC-008)', () => {
    function fillCredentials() {
      fireEvent.change(screen.getByLabelText(/correo/i), {
        target: { value: 'soporte@dentalix.app' },
      });
      fireEvent.change(screen.getByLabelText(/^contraseña/i), {
        target: { value: 'clave-larga' },
      });
      fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));
    }

    beforeEach(() => {
      (apiFetch as jest.Mock).mockReset();
    });

    it('si la API pide MFA y motivo, muestra el paso extra y reenvía con código y motivo', async () => {
      (apiFetch as jest.Mock)
        .mockRejectedValueOnce(
          new ApiError(401, 'Acceso de soporte…', { code: 'BREAK_GLASS_REQUIRED' }),
        )
        .mockResolvedValueOnce({ accessToken: 'bg', breakGlass: true, expiresAt: '2026-10-17T12:30:00.000Z' });
      render(<LoginForm />);
      fillCredentials();

      const code = await screen.findByLabelText(/código de verificación/i);
      expect(screen.getByText(/la clínica verá este acceso/i)).toBeInTheDocument();
      // El paso de credenciales ya no se ve (se conservan en memoria).
      expect(screen.queryByLabelText(/^contraseña/i)).not.toBeInTheDocument();
      expect(code).toHaveFocus();

      fireEvent.change(code, { target: { value: '123 456' } });
      fireEvent.change(screen.getByLabelText(/motivo del acceso/i), {
        target: { value: 'Ticket 42: no cuadra la caja' },
      });
      fireEvent.click(screen.getByRole('button', { name: /entrar como soporte/i }));

      await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
      expect(apiFetch).toHaveBeenLastCalledWith('/auth/login', {
        method: 'POST',
        body: {
          email: 'soporte@dentalix.app',
          password: 'clave-larga',
          mfaCode: '123456',
          breakGlassReason: 'Ticket 42: no cuadra la caja',
        },
      });
    });

    it('valida en el cliente: 6 dígitos y motivo de al menos 10 caracteres', async () => {
      (apiFetch as jest.Mock).mockRejectedValueOnce(
        new ApiError(401, 'x', { code: 'BREAK_GLASS_REQUIRED' }),
      );
      render(<LoginForm />);
      fillCredentials();
      await screen.findByLabelText(/código de verificación/i);

      fireEvent.change(screen.getByLabelText(/código de verificación/i), {
        target: { value: '12' },
      });
      fireEvent.change(screen.getByLabelText(/motivo del acceso/i), {
        target: { value: 'corto' },
      });
      fireEvent.click(screen.getByRole('button', { name: /entrar como soporte/i }));

      expect(await screen.findByText('El código tiene 6 dígitos.')).toBeInTheDocument();
      expect(screen.getByText(/al menos 10 caracteres/i)).toBeInTheDocument();
      expect(apiFetch).toHaveBeenCalledTimes(1);
    });

    it('un código erróneo o reutilizado se explica sin salir del paso', async () => {
      (apiFetch as jest.Mock)
        .mockRejectedValueOnce(new ApiError(401, 'x', { code: 'BREAK_GLASS_REQUIRED' }))
        .mockRejectedValueOnce(new ApiError(401, 'Invalid credentials'));
      render(<LoginForm />);
      fillCredentials();
      fireEvent.change(await screen.findByLabelText(/código de verificación/i), {
        target: { value: '123456' },
      });
      fireEvent.change(screen.getByLabelText(/motivo del acceso/i), {
        target: { value: 'Ticket 42: no cuadra la caja' },
      });
      fireEvent.click(screen.getByRole('button', { name: /entrar como soporte/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /código no es correcto o ya se usó/i,
      );
      expect(screen.getByLabelText(/código de verificación/i)).toBeInTheDocument();
    });

    it('en espera por demasiados intentos (429) el botón no dice «Entrando…» y «Volver» sigue activo', async () => {
      (apiFetch as jest.Mock)
        .mockRejectedValueOnce(new ApiError(401, 'x', { code: 'BREAK_GLASS_REQUIRED' }))
        .mockRejectedValueOnce(new ApiError(429, 'Demasiados intentos.', { retryAfterSeconds: 60 }));
      render(<LoginForm />);
      fillCredentials();
      fireEvent.change(await screen.findByLabelText(/código de verificación/i), {
        target: { value: '123456' },
      });
      fireEvent.change(screen.getByLabelText(/motivo del acceso/i), {
        target: { value: 'Ticket 42: no cuadra la caja' },
      });
      fireEvent.click(screen.getByRole('button', { name: /entrar como soporte/i }));

      expect(
        await screen.findByText('Demasiados intentos. Vuelve a intentarlo en 1 min.'),
      ).toBeInTheDocument();
      const submit = screen.getByRole('button', { name: /entrar como soporte/i });
      expect(submit).toBeDisabled();
      expect(screen.queryByText('Entrando…')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /volver/i })).toBeEnabled();
      expect(apiFetch).toHaveBeenCalledTimes(2);
    });

    it('«Volver» regresa al paso de credenciales', async () => {
      (apiFetch as jest.Mock).mockRejectedValueOnce(
        new ApiError(401, 'x', { code: 'BREAK_GLASS_REQUIRED' }),
      );
      render(<LoginForm />);
      fillCredentials();
      fireEvent.click(await screen.findByRole('button', { name: /volver/i }));
      expect(screen.getByLabelText(/^contraseña/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/código de verificación/i)).not.toBeInTheDocument();
    });

    it('MFA recién activado (espera de seguridad) lo explica sin pedir código', async () => {
      (apiFetch as jest.Mock).mockRejectedValueOnce(
        new ApiError(401, 'x', { code: 'MFA_COOLDOWN' }),
      );
      render(<LoginForm />);
      fillCredentials();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /activaste la verificación en dos pasos hace poco/i,
      );
      expect(screen.getByRole('alert')).toHaveTextContent(/si no la activaste tú/i);
      expect(screen.queryByLabelText(/código de verificación/i)).not.toBeInTheDocument();
    });

    it('sin MFA enrolado explica que hay que activarlo en el área de plataforma', async () => {
      (apiFetch as jest.Mock).mockRejectedValueOnce(
        new ApiError(401, 'x', { code: 'MFA_NOT_ENROLLED' }),
      );
      render(<LoginForm />);
      fillCredentials();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /activa la verificación en dos pasos en el área de plataforma/i,
      );
      expect(screen.queryByLabelText(/código de verificación/i)).not.toBeInTheDocument();
    });
  });

  describe('DX-021: segundo factor', () => {
    async function passPassword(res: unknown) {
      (apiFetch as jest.Mock).mockReset();
      (apiFetch as jest.Mock).mockResolvedValueOnce(res);
      render(<LoginForm />);
      fireEvent.change(screen.getByLabelText(/email|correo/i), { target: { value: 'a@b.co' } });
      fireEvent.change(screen.getByLabelText(/password|contraseña/i), {
        target: { value: 'secret123' },
      });
      fireEvent.click(screen.getByRole('button', { name: /iniciar/i }));
    }

    it('con MFA activo pide el código y lo canjea con el token intermedio', async () => {
      await passPassword({ mfa: 'MFA_REQUIRED', mfaToken: 'tok', expiresAt: 'x' });
      const input = await screen.findByLabelText('Código de verificación');
      (apiFetch as jest.Mock).mockResolvedValueOnce({ accessToken: 'a' });
      fireEvent.change(input, { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
      await waitFor(() =>
        expect(apiFetch).toHaveBeenLastCalledWith('/auth/login/mfa', {
          method: 'POST',
          body: { mfaToken: 'tok', code: '123456' },
        }),
      );
    });

    it('un código incorrecto se queda en el paso con el error', async () => {
      await passPassword({ mfa: 'MFA_REQUIRED', mfaToken: 'tok', expiresAt: 'x' });
      const input = await screen.findByLabelText('Código de verificación');
      (apiFetch as jest.Mock).mockRejectedValueOnce(
        new ApiError(401, 'x', { code: 'MFA_INVALID_CODE' } as never),
      );
      fireEvent.change(input, { target: { value: '123456' } });
      fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument();
    });
  });
});
