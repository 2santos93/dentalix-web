import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForgotPasswordForm } from './forgot-password-form';
import { apiFetch, ApiError } from '../../lib/api/client';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/api/client', () => ({
  apiFetch: jest.fn(),
  apiFetchOrNull: jest.fn(),
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const SENT =
  'Si el correo pertenece a una cuenta de esta clínica, te enviamos un enlace para restablecer la contraseña. Revisa también la carpeta de spam.';

function submit(email: string) {
  fireEvent.change(screen.getByLabelText('Correo electrónico'), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));
}

describe('ForgotPasswordForm', () => {
  beforeEach(() => (apiFetch as jest.Mock).mockReset());

  it('valida el correo en español sin llamar a la API', () => {
    render(<ForgotPasswordForm />);
    submit('no-es-un-correo');
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un correo electrónico válido');
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('envía el correo (sin espacios) y muestra el mismo mensaje de la API, exista o no la cuenta', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ message: SENT });
    render(<ForgotPasswordForm />);
    submit('  ana@clinica.co ');
    expect(await screen.findByRole('status')).toHaveTextContent(SENT);
    expect(screen.getByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(screen.getByText(/vale 30 minutos/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/auth/forgot-password', {
      method: 'POST',
      body: { email: 'ana@clinica.co' },
    });
    expect(screen.getByRole('link', { name: 'Volver a iniciar sesión' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('mientras envía deshabilita el formulario y muestra el estado de carga', async () => {
    let resolve: (v: unknown) => void = () => undefined;
    (apiFetch as jest.Mock).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    render(<ForgotPasswordForm />);
    submit('ana@clinica.co');
    expect(screen.getByRole('button', { name: /Enviando/ })).toBeDisabled();
    expect(screen.getByLabelText('Correo electrónico')).toBeDisabled();
    resolve({ message: SENT });
    await screen.findByRole('status');
  });

  it('un 429 se explica en español y deja reintentar', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(
      new ApiError(429, 'Too Many Requests', { retryAfterSeconds: 120 }),
    );
    render(<ForgotPasswordForm />);
    submit('ana@clinica.co');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/[áéíóúñ]|intent/i);
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeEnabled();
  });

  it('«Enviar otro enlace» vuelve al formulario', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ message: SENT });
    render(<ForgotPasswordForm />);
    submit('ana@clinica.co');
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar otro enlace' }));
    await waitFor(() => expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument());
  });
});
