import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffPermissionsSection, staffPermissionsCopy } from './staff-permissions-section';
import { replaceStaffPermissions } from '@/lib/staff/staff-api';
import { ApiError } from '@/lib/api/client';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC transform.
jest.mock('../../lib/staff/staff-api', () => ({
  replaceStaffPermissions: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const mockedReplace = replaceStaffPermissions as jest.MockedFunction<typeof replaceStaffPermissions>;
const { labels } = staffPermissionsCopy;

beforeEach(() => mockedReplace.mockReset());

describe('StaffPermissionsSection (DX-090)', () => {
  it('concede PAYMENT_REGISTER a una asistente con un interruptor que guarda al momento', async () => {
    const user = userEvent.setup();
    mockedReplace.mockResolvedValue({
      extraPermissions: ['PAYMENT_REGISTER'],
      effectivePermissions: ['PAYMENT_REGISTER'],
    });
    render(<StaffPermissionsSection token="t" userId="u-asistente" memberRole="ASSISTANT" initial={[]} />);
    const pay = screen.getByRole('switch', { name: labels.PAYMENT_REGISTER });
    expect(pay).not.toBeChecked();
    expect(pay).toHaveAccessibleDescription(/No anula abonos/);
    await user.click(pay);
    expect(mockedReplace).toHaveBeenCalledWith('t', 'u-asistente', ['PAYMENT_REGISTER']);
    expect(pay).toBeChecked();
  });

  it('retirar envía la lista completa sin ese permiso', async () => {
    const user = userEvent.setup();
    mockedReplace.mockResolvedValue({
      extraPermissions: ['FINANCIAL_REPORTS_VIEW'],
      effectivePermissions: ['FINANCIAL_REPORTS_VIEW'],
    });
    render(
      <StaffPermissionsSection
        token="t"
        userId="u1"
        memberRole="DENTIST"
        initial={['PAYMENT_REGISTER', 'FINANCIAL_REPORTS_VIEW']}
      />,
    );
    await user.click(screen.getByRole('switch', { name: labels.PAYMENT_REGISTER }));
    expect(mockedReplace).toHaveBeenCalledWith('t', 'u1', ['FINANCIAL_REPORTS_VIEW']);
  });

  it('si la API falla, vuelve a como estaba y dice por qué', async () => {
    const user = userEvent.setup();
    mockedReplace.mockRejectedValue(new ApiError(409, 'El ADMIN ya tiene todos los permisos: no se le conceden extra.'));
    render(<StaffPermissionsSection token="t" userId="u1" memberRole="ASSISTANT" initial={[]} />);
    const reports = screen.getByRole('switch', { name: labels.FINANCIAL_REPORTS_VIEW });
    await user.click(reports);
    expect(reports).not.toBeChecked();
    expect(await screen.findByText(/ya tiene todos los permisos/)).toBeInTheDocument();
  });

  it('recepción ya cobra por su rol: ese interruptor sale encendido y fijo', () => {
    render(<StaffPermissionsSection token="t" userId="u1" memberRole="RECEPTION" initial={[]} />);
    const pay = screen.getByRole('switch', { name: labels.PAYMENT_REGISTER });
    expect(pay).toBeChecked();
    expect(pay).toBeDisabled();
    expect(screen.getByRole('switch', { name: labels.FINANCIAL_REPORTS_VIEW })).toBeEnabled();
  });

  it('a un ADMIN no se le ofrecen interruptores', () => {
    render(<StaffPermissionsSection token="t" userId="u1" memberRole="ADMIN" initial={[]} />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(staffPermissionsCopy.adminHint)).toBeInTheDocument();
  });
});
