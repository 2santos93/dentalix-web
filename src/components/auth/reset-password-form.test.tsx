import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResetPasswordForm } from './reset-password-form';
import { apiFetch, apiFetchOrNull, ApiError } from '../../lib/api/client';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/api/client', () => ({
  apiFetch: jest.fn(),
  apiFetchOrNull: jest.fn(),
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const TOKEN = 'a'.repeat(43);

function fill(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('Repite la contraseña'), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    push.mockReset();
    (apiFetch as jest.Mock).mockReset();
    (apiFetchOrNull as jest.Mock).mockReset();
  });

  it('comprueba el enlace al abrir (con estado de carga) y muestra el formulario si vale', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'VALID' });
    render(<ResetPasswordForm resetToken={TOKEN} />);
    expect(screen.getByRole('status')).toHaveTextContent('Verificando el enlace');
    expect(await screen.findByLabelText('Contraseña nueva')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/auth/reset-password/check', {
      method: 'POST',
      body: { token: TOKEN },
    });
    expect(screen.getByText('Mínimo 8 caracteres.')).toBeInTheDocument();
  });

  it.each([
    ['EXPIRED', 'El enlace caducó'],
    ['USED', 'Este enlace ya se usó'],
    ['INVALID', 'Enlace no válido'],
  ])('enlace %s: lo explica y ofrece pedir otro', async (status, title) => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status });
    render(<ResetPasswordForm resetToken={TOKEN} />);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toHaveAttribute(
      'href',
      '/olvide-contrasena',
    );
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument();
  });

  it('valida la política y que coincidan, en español, sin llamar a la API', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'VALID' });
    render(<ResetPasswordForm resetToken={TOKEN} />);
    await screen.findByLabelText('Contraseña nueva');
    fill('corta');
    expect(screen.getByRole('alert')).toHaveTextContent('al menos 8 caracteres');
    fill('Clave-Nueva-2026', 'Clave-Distinta-2026');
    expect(screen.getByRole('alert')).toHaveTextContent('Las contraseñas no coinciden.');
    expect(screen.getByLabelText('Contraseña nueva')).toHaveAttribute('aria-invalid', 'true');
    expect(apiFetchOrNull).not.toHaveBeenCalled();
  });

  it('guarda y lleva al login con el aviso de éxito', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'VALID' });
    (apiFetchOrNull as jest.Mock).mockResolvedValueOnce(null);
    render(<ResetPasswordForm resetToken={TOKEN} />);
    await screen.findByLabelText('Contraseña nueva');
    fill('Clave-Nueva-2026');
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?restablecida=1'));
    expect(apiFetchOrNull).toHaveBeenCalledWith('/auth/reset-password', {
      method: 'POST',
      body: { token: TOKEN, password: 'Clave-Nueva-2026' },
    });
  });

  it('si al guardar el enlace ya caducó (410), lo dice y ofrece pedir otro', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'VALID' });
    (apiFetchOrNull as jest.Mock).mockRejectedValueOnce(
      new ApiError(
        410,
        'El enlace para restablecer la contraseña caducó (vale 30 minutos). Pide un enlace nuevo.',
      ),
    );
    render(<ResetPasswordForm resetToken={TOKEN} />);
    await screen.findByLabelText('Contraseña nueva');
    fill('Clave-Nueva-2026');
    expect(await screen.findByRole('heading', { name: 'El enlace caducó' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('si al guardar el enlace ya no existe (404), lo dice', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'VALID' });
    (apiFetchOrNull as jest.Mock).mockRejectedValueOnce(new ApiError(404, 'No es válido'));
    render(<ResetPasswordForm resetToken={TOKEN} />);
    await screen.findByLabelText('Contraseña nueva');
    fill('Clave-Nueva-2026');
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
  });

  it('un fallo al comprobar el enlace ofrece reintentar', async () => {
    (apiFetch as jest.Mock)
      .mockRejectedValueOnce(new ApiError(500, 'boom'))
      .mockResolvedValueOnce({ status: 'VALID' });
    render(<ResetPasswordForm resetToken={TOKEN} />);
    fireEvent.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByLabelText('Contraseña nueva')).toBeInTheDocument();
  });
});
