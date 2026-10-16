import { render, screen, fireEvent } from '@testing-library/react';
import { RegisterForm } from './register-form';
import { apiFetch, ApiError } from '../../lib/api/client';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/api/client', () => ({
  apiFetch: jest.fn(),
  // La clase real: `apiErrorMessage` la reconoce con `instanceof`.
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/nombre de la clínica/i), {
    target: { value: 'Clínica Uno' },
  });
  fireEvent.change(screen.getByLabelText(/subdominio/i), { target: { value: 'clinica-uno' } });
  fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Ana Ruiz' } });
  fireEvent.change(screen.getByLabelText(/correo/i), {
    target: { value: 'ana@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'secret123' } });
}

describe('RegisterForm', () => {
  it('shows the error message when the API call fails', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'Subdominio ya existe'));
    render(<RegisterForm tenant={null} />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Subdominio ya existe');
  });

  // Revisión M-2: el 403 por origen no permitido no manda a «pedir acceso a un
  // administrador» a alguien que todavía no tiene clínica.
  it('un 403 («Untrusted origin») no habla de pedir permisos', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new ApiError(403, 'Untrusted origin'));
    render(<RegisterForm tenant={null} />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos crear la cuenta');
    expect(alert).not.toHaveTextContent(/administrador|untrusted/i);
  });

  it('keeps aria-describedby resolving to the error banner on all five fields', async () => {
    (apiFetch as jest.Mock).mockRejectedValueOnce(new ApiError(409, 'Subdominio ya existe'));
    render(<RegisterForm tenant={null} />);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));

    const alert = await screen.findByRole('alert');
    const errorId = alert.getAttribute('id');
    expect(errorId).toBeTruthy();
    expect(screen.getByLabelText(/nombre de la clínica/i)).toHaveAttribute(
      'aria-describedby',
      errorId,
    );
    expect(screen.getByLabelText(/subdominio/i)).toHaveAttribute('aria-describedby', errorId);
    expect(screen.getByLabelText(/nombre completo/i)).toHaveAttribute(
      'aria-describedby',
      errorId,
    );
    expect(screen.getByLabelText(/correo/i)).toHaveAttribute('aria-describedby', errorId);
    expect(screen.getByLabelText(/contraseña/i)).toHaveAttribute('aria-describedby', errorId);
  });
});
