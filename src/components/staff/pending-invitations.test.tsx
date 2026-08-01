import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingInvitations } from './pending-invitations';
import { listInvitations, revokeInvitation, createInvitation } from '@/lib/staff/invitations-api';
import { ApiError } from '@/lib/api/client';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path, same convention as staff-view.test.tsx.
jest.mock('../../lib/staff/invitations-api', () => ({
  listInvitations: jest.fn(),
  revokeInvitation: jest.fn(),
  createInvitation: jest.fn(),
}));

const mockedListInvitations = listInvitations as jest.MockedFunction<typeof listInvitations>;
const mockedRevokeInvitation = revokeInvitation as jest.MockedFunction<typeof revokeInvitation>;
const mockedCreateInvitation = createInvitation as jest.MockedFunction<typeof createInvitation>;

const invitation1 = {
  id: 'inv-1',
  fullName: 'Nueva Persona',
  email: 'nueva@clinic.com',
  role: 'RECEPTION' as const,
  expiresAt: '2026-08-08T00:00:00.000Z',
  status: 'VALID' as const,
};
const invitation2 = {
  id: 'inv-2',
  fullName: 'Otra Persona',
  email: 'otra@clinic.com',
  role: 'DENTIST' as const,
  expiresAt: '2026-07-01T00:00:00.000Z',
  status: 'EXPIRED' as const,
};

describe('PendingInvitations', () => {
  beforeEach(() => {
    mockedListInvitations.mockReset();
    mockedRevokeInvitation.mockReset();
    mockedCreateInvitation.mockReset();
  });

  it('renders pending invitations with their status badges in a distinctly-labeled table', async () => {
    mockedListInvitations.mockResolvedValue([invitation1, invitation2]);

    render(<PendingInvitations token="tok" />);

    const table = await screen.findByRole('table', { name: /invitaciones pendientes/i });
    expect(within(table).getByText('nueva@clinic.com')).toBeInTheDocument();
    expect(within(table).getByText('otra@clinic.com')).toBeInTheDocument();
    expect(within(table).getByText('Pendiente')).toBeInTheDocument();
    expect(within(table).getByText('Expirada')).toBeInTheDocument();
  });

  it('revoking asks for confirmation, then calls revokeInvitation and refreshes', async () => {
    mockedListInvitations.mockResolvedValueOnce([invitation1]);
    mockedRevokeInvitation.mockResolvedValue(undefined);
    mockedListInvitations.mockResolvedValueOnce([]);

    const user = userEvent.setup();
    render(<PendingInvitations token="tok" />);

    await screen.findByRole('table', { name: /invitaciones pendientes/i });

    await user.click(screen.getByRole('button', { name: /revocar invitación de nueva persona/i }));
    expect(mockedRevokeInvitation).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /confirmar|revocar/i }));

    await waitFor(() => expect(mockedRevokeInvitation).toHaveBeenCalledWith('tok', 'inv-1'));
    await waitFor(() => expect(mockedListInvitations).toHaveBeenCalledTimes(2));
  });

  it('resending calls createInvitation with the same fields and surfaces the new link', async () => {
    mockedListInvitations.mockResolvedValueOnce([invitation1]);
    mockedCreateInvitation.mockResolvedValue({
      id: 'inv-1-new',
      fullName: 'Nueva Persona',
      email: 'nueva@clinic.com',
      role: 'RECEPTION',
      expiresAt: '2026-08-15T00:00:00.000Z',
      status: 'VALID',
      token: 'tok-resent-456',
    });
    mockedListInvitations.mockResolvedValueOnce([
      { ...invitation1, id: 'inv-1-new', expiresAt: '2026-08-15T00:00:00.000Z' },
    ]);

    const user = userEvent.setup();
    render(<PendingInvitations token="tok" />);

    await screen.findByRole('table', { name: /invitaciones pendientes/i });

    await user.click(screen.getByRole('button', { name: /reenviar invitación de nueva persona/i }));

    await waitFor(() =>
      expect(mockedCreateInvitation).toHaveBeenCalledWith('tok', {
        fullName: 'Nueva Persona',
        email: 'nueva@clinic.com',
        role: 'RECEPTION',
      }),
    );

    expect(
      await screen.findByText(`${window.location.origin}/invitacion/tok-resent-456`),
    ).toBeInTheDocument();
    expect(screen.getByText(/no podrás verlo de nuevo/i)).toBeInTheDocument();
    await waitFor(() => expect(mockedListInvitations).toHaveBeenCalledTimes(2));
  });

  it('shows a friendly empty state without breaking the screen when there are no pending invitations', async () => {
    mockedListInvitations.mockResolvedValue([]);

    render(<PendingInvitations token="tok" />);

    expect(await screen.findByText(/no hay invitaciones pendientes/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /invitaciones pendientes/i })).not.toBeInTheDocument();
  });

  it('refetches when refreshKey changes', async () => {
    mockedListInvitations.mockResolvedValue([invitation1]);

    const { rerender } = render(<PendingInvitations token="tok" refreshKey={0} />);
    await screen.findByRole('table', { name: /invitaciones pendientes/i });
    expect(mockedListInvitations).toHaveBeenCalledTimes(1);

    rerender(<PendingInvitations token="tok" refreshKey={1} />);

    await waitFor(() => expect(mockedListInvitations).toHaveBeenCalledTimes(2));
  });

  it('surfaces a load error verbatim from the API', async () => {
    mockedListInvitations.mockRejectedValue(new ApiError(500, 'Fallo el servidor.'));

    render(<PendingInvitations token="tok" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo el servidor.');
  });
});
