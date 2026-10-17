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
});
