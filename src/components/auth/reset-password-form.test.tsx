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

  async function saveRejectedWith(err: ApiError) {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'VALID' });
    (apiFetchOrNull as jest.Mock).mockRejectedValueOnce(err);
    render(<ResetPasswordForm resetToken={TOKEN} />);
    await screen.findByLabelText('Contraseña nueva');
    fill('Clave-Nueva-2026');
  }

  // DX-114 (R4): manda el código del cuerpo, no el texto del mensaje.
  it.each([
    [404, 'RESET_TOKEN_INVALID', 'Enlace no válido'],
    [410, 'RESET_TOKEN_EXPIRED', 'El enlace caducó'],
    [410, 'RESET_TOKEN_USED', 'Este enlace ya se usó'],
  ])('si al guardar la API responde %i %s, lo dice y ofrece pedir otro', async (status, code, title) => {
    // El texto apunta a otro estado a propósito: si se leyera, fallaría.
    await saveRejectedWith(new ApiError(status, 'caducó / usado / no válido', { code }));
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('sin código: 404 → no válido', async () => {
    await saveRejectedWith(new ApiError(404, 'No es válido'));
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
  });

  it('sin código: 410 → ya se usó, aunque el texto diga «caducó» (el texto no es contrato)', async () => {
    await saveRejectedWith(
      new ApiError(
        410,
        'El enlace para restablecer la contraseña caducó (vale 30 minutos). Pide un enlace nuevo.',
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Este enlace ya se usó' })).toBeInTheDocument();
  });

  it('un código desconocido en un 404 cae al status', async () => {
    await saveRejectedWith(new ApiError(404, 'x', { code: 'OTRA_COSA' }));
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
  });

  // DX-114 (R5): el formulario desaparece con el foco dentro; el título del
  // estado lo recibe para que el lector de pantalla lo anuncie.
  it('al pasar del formulario al estado de enlace inválido, el foco va al título', async () => {
    await saveRejectedWith(new ApiError(410, 'x', { code: 'RESET_TOKEN_EXPIRED' }));
    const heading = await screen.findByRole('heading', { name: 'El enlace caducó' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('al abrir un enlace que ya no sirve no se roba el foco', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'USED' });
    render(<ResetPasswordForm resetToken={TOKEN} />);
    const heading = await screen.findByRole('heading', { name: 'Este enlace ya se usó' });
    expect(document.activeElement).not.toBe(heading);
  });

  // DX-114 (R5): región aria-live siempre montada con el título del estado.
  it('la región viva está vacía mientras carga y con el enlace válido', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'VALID' });
    render(<ResetPasswordForm resetToken={TOKEN} />);
    const live = screen.getByTestId('reset-password-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).not.toHaveAttribute('role');
    expect(live).toBeEmptyDOMElement();
    await screen.findByLabelText('Contraseña nueva');
    expect(screen.getByTestId('reset-password-live')).toBeEmptyDOMElement();
  });

  it('al abrir un enlace caducado, la región viva lo anuncia (la misma, sin remontarse)', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'EXPIRED' });
    render(<ResetPasswordForm resetToken={TOKEN} />);
    const live = screen.getByTestId('reset-password-live');
    await screen.findByRole('heading', { name: 'El enlace caducó' });
    expect(screen.getByTestId('reset-password-live')).toBe(live);
    expect(live).toHaveTextContent('El enlace caducó');
  });

  it('si el enlace deja de servir al guardar, la región viva lo anuncia', async () => {
    (apiFetch as jest.Mock).mockResolvedValueOnce({ status: 'VALID' });
    (apiFetchOrNull as jest.Mock).mockRejectedValueOnce(
      new ApiError(410, 'x', { code: 'RESET_TOKEN_USED' }),
    );
    render(<ResetPasswordForm resetToken={TOKEN} />);
    await screen.findByLabelText('Contraseña nueva');
    const live = screen.getByTestId('reset-password-live');
    expect(live).toBeEmptyDOMElement();
    fill('Clave-Nueva-2026');
    await waitFor(() => expect(live).toHaveTextContent('Este enlace ya se usó'));
    expect(screen.getByTestId('reset-password-live')).toBe(live);
  });

  it('otro error al guardar (500) se queda en el formulario con el aviso', async () => {
    await saveRejectedWith(new ApiError(500, 'boom'));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña nueva')).toBeInTheDocument();
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
