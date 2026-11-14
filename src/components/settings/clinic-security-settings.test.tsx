import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getSecurityPolicy, updateSecurityPolicy } from '@/lib/auth/mfa-api';
import { ClinicSecuritySettings } from './clinic-security-settings';

jest.mock('../../lib/auth/mfa-api', () => ({
  ...jest.requireActual('../../lib/auth/mfa-api'),
  getSecurityPolicy: jest.fn(),
  updateSecurityPolicy: jest.fn(),
}));

const mockedGet = getSecurityPolicy as jest.MockedFunction<typeof getSecurityPolicy>;
const mockedPut = updateSecurityPolicy as jest.MockedFunction<typeof updateSecurityPolicy>;

beforeEach(() => {
  mockedGet.mockReset();
  mockedPut.mockReset();
});

describe('ClinicSecuritySettings (DX-021-bis)', () => {
  it('exigirla a todos deja fija la de administradores', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ requireAdminMfa: false, requireAllMfa: false });
    mockedPut.mockResolvedValue({ requireAdminMfa: true, requireAllMfa: true });
    render(<ClinicSecuritySettings token="tok" allowed />);
    await user.click(await screen.findByRole('switch', { name: 'Exigirla a todo el equipo' }));
    expect(mockedPut).toHaveBeenCalledWith('tok', { requireAdminMfa: false, requireAllMfa: true });
    expect(await screen.findByRole('switch', { name: 'Exigirla a todo el equipo' })).toBeChecked();
    expect(screen.getByRole('switch', { name: /a los administradores/ })).toBeDisabled();
  });

  it('la de administradores no toca «todo el equipo»', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ requireAdminMfa: false, requireAllMfa: false });
    mockedPut.mockResolvedValue({ requireAdminMfa: true, requireAllMfa: false });
    render(<ClinicSecuritySettings token="tok" allowed />);
    await user.click(await screen.findByRole('switch', { name: /a los administradores/ }));
    expect(mockedPut).toHaveBeenCalledWith('tok', { requireAdminMfa: true, requireAllMfa: false });
  });

  it('sin permiso no pide nada', () => {
    render(<ClinicSecuritySettings token="tok" allowed={false} />);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(screen.getByText(/Solo la administración/)).toBeInTheDocument();
  });
});
