import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChangePasswordForm } from './change-password-form';

jest.mock('../../lib/me/me-api', () => ({ changePassword: jest.fn() }));
import { changePassword } from '../../lib/me/me-api';

describe('ChangePasswordForm', () => {
  beforeEach(() => (changePassword as jest.Mock).mockReset());

  it('rejects a mismatched confirmation without calling the API', async () => {
    render(<ChangePasswordForm token="T" />);
    fireEvent.change(screen.getByLabelText(/actual/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText(/nueva contraseña/i), { target: { value: 'NewPass2!' } });
    fireEvent.change(screen.getByLabelText(/confirmar/i), { target: { value: 'Different9' } });
    fireEvent.click(screen.getByRole('button', { name: /cambiar/i }));
    expect(await screen.findByText(/no coinciden/i)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('submits the change when confirmation matches', async () => {
    (changePassword as jest.Mock).mockResolvedValue(undefined);
    render(<ChangePasswordForm token="T" />);
    fireEvent.change(screen.getByLabelText(/actual/i), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText(/nueva contraseña/i), { target: { value: 'NewPass2!' } });
    fireEvent.change(screen.getByLabelText(/confirmar/i), { target: { value: 'NewPass2!' } });
    fireEvent.click(screen.getByRole('button', { name: /cambiar/i }));
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('T', 'OldPass1!', 'NewPass2!'));
    expect(await screen.findByText(/actualizada/i)).toBeInTheDocument();
  });
});
