import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ChangePasswordForm } from './change-password-form';

jest.mock('../../lib/me/me-api', () => ({ changePassword: jest.fn() }));
import { changePassword } from '../../lib/me/me-api';

describe('ChangePasswordForm', () => {
  beforeEach(() => (changePassword as jest.Mock).mockReset());

  it('rejects a mismatched confirmation without calling the API', async () => {
    render(<ChangePasswordForm token="T" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    fireEvent.change(screen.getByLabelText(/actual/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText(/nueva contraseña/i), { target: { value: 'NewPass2!' } });
    fireEvent.change(screen.getByLabelText(/confirmar/i), { target: { value: 'Different9' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirmar/i)).toHaveAttribute('aria-invalid', 'true');
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('submits the change when confirmation matches', async () => {
    (changePassword as jest.Mock).mockResolvedValue(undefined);
    render(<ChangePasswordForm token="T" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.getByLabelText(/nueva contraseña/i)).toHaveAccessibleDescription(/Al menos 8 caracteres/);
    fireEvent.change(screen.getByLabelText(/actual/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText(/nueva contraseña/i), { target: { value: 'NewPass2!' } });
    fireEvent.change(screen.getByLabelText(/confirmar/i), { target: { value: 'NewPass2!' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cambiar contraseña' }));
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('T', 'OldPass1!', 'NewPass2!'));
    expect(await screen.findByText(/actualizada/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
