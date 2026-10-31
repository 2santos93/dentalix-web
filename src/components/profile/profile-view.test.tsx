import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileView } from './profile-view';

jest.mock('../../lib/me/me-api', () => ({
  getMe: jest.fn(),
  updateName: jest.fn(),
  uploadAvatar: jest.fn(),
  removeAvatar: jest.fn(),
}));
import { getMe, updateName, uploadAvatar } from '../../lib/me/me-api';
import { AvatarResizeError } from '../../lib/me/avatar-resize';

const profile = {
  id: 'u1', email: 'ana@clinica.com', fullName: 'Ana Gómez', avatarUrl: null, emailVerifiedAt: null,
  memberships: [{ tenantId: 't1', clinicName: 'Clínica Sur', role: 'DENTIST' }],
};

describe('ProfileView', () => {
  beforeEach(() => {
    (getMe as jest.Mock).mockResolvedValue(profile);
    (updateName as jest.Mock).mockResolvedValue({ ...profile, fullName: 'Ana G. Nueva' });
  });

  it('shows name, email and clinic/role once loaded', async () => {
    render(<ProfileView token="T" />);
    expect(await screen.findByDisplayValue('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByText('ana@clinica.com')).toBeInTheDocument();
    expect(screen.getByText(/Clínica Sur/)).toBeInTheDocument();
  });

  it('saves an edited name from the «Cambios sin guardar» bar (no Save button until it changes)', async () => {
    render(<ProfileView token="T" />);
    const input = await screen.findByLabelText('Nombre completo');
    expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Ana G. Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar el nombre' }));
    await waitFor(() => expect(updateName).toHaveBeenCalledWith('T', 'Ana G. Nueva'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument());
  });

  it('read-only facts come before the editable name; other clinics are listed', async () => {
    (getMe as jest.Mock).mockResolvedValue({
      ...profile,
      memberships: [...profile.memberships, { tenantId: 't2', clinicName: 'Clínica Norte', role: 'ADMIN' }],
    });
    render(<ProfileView token="T" />);
    const email = await screen.findByText('ana@clinica.com');
    const input = screen.getByLabelText('Nombre completo');
    expect(email.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Clínica Norte (Administrador/a)')).toBeInTheDocument();
  });

  it('revisión M-7: si la foto no se puede reducir, el aviso dice el tope real (900 KB)', async () => {
    (uploadAvatar as jest.Mock).mockRejectedValue(new AvatarResizeError());
    render(<ProfileView token="t" />);
    const input = await screen.findByLabelText('Cambiar foto');
    fireEvent.change(input, { target: { files: [new File(['x'], 'foto.jpg', { type: 'image/jpeg' })] } });
    expect(
      await screen.findByText('La foto pesa más de 900 KB y no pudimos reducirla. Elige otra imagen (PNG, JPEG o WebP).'),
    ).toBeInTheDocument();
  });
});
