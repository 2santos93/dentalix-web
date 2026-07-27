import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileView } from './profile-view';

jest.mock('../../lib/me/me-api', () => ({
  getMe: jest.fn(),
  updateName: jest.fn(),
  uploadAvatar: jest.fn(),
  removeAvatar: jest.fn(),
}));
import { getMe, updateName } from '../../lib/me/me-api';

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

  it('saves an edited name', async () => {
    render(<ProfileView token="T" />);
    const input = await screen.findByLabelText(/nombre/i);
    fireEvent.change(input, { target: { value: 'Ana G. Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() => expect(updateName).toHaveBeenCalledWith('T', 'Ana G. Nueva'));
  });
});
