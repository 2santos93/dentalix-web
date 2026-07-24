import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from './login-form';
import { apiFetch, ApiError } from '../../lib/api/client';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/api/client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));
jest.mock('../../lib/auth/auth-store', () => ({
  useAuthStore: (selector: (s: { setTokens: jest.Mock }) => unknown) =>
    selector({ setTokens: jest.fn() }),
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
    (apiFetch as jest.Mock).mockResolvedValueOnce({
      accessToken: 'a',
      refreshToken: 'r',
    });
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
});
