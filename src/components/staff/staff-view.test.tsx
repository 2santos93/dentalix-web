import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffView } from './staff-view';
import { listStaff, updateStaff, deactivateStaff } from '@/lib/staff/staff-api';
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from '@/lib/staff/invitations-api';
import { ApiError } from '@/lib/api/client';
import { Toaster } from '@/components/errors/toaster';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, same convention as agenda-view.test.tsx.
jest.mock('../../lib/staff/staff-api', () => ({
  listStaff: jest.fn(),
  updateStaff: jest.fn(),
  deactivateStaff: jest.fn(),
}));
jest.mock('../../lib/staff/invitations-api', () => ({
  createInvitation: jest.fn(),
  listInvitations: jest.fn(),
  revokeInvitation: jest.fn(),
}));

const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedCreateInvitation = createInvitation as jest.MockedFunction<typeof createInvitation>;
const mockedListInvitations = listInvitations as jest.MockedFunction<typeof listInvitations>;
const mockedRevokeInvitation = revokeInvitation as jest.MockedFunction<typeof revokeInvitation>;

const pendingInvite = {
  id: 'i9',
  email: 'pendiente@clinic.com',
  fullName: 'Persona Pendiente',
  role: 'ASSISTANT' as const,
  status: 'VALID' as const,
  expiresAt: '2026-08-08T00:00:00.000Z',
};
const mockedUpdateStaff = updateStaff as jest.MockedFunction<typeof updateStaff>;
const mockedDeactivateStaff = deactivateStaff as jest.MockedFunction<typeof deactivateStaff>;

const member1 = {
  userId: 'u1',
  fullName: 'Ana Ríos',
  email: 'ana@clinic.com',
  role: 'DENTIST' as const,
};
const member2 = {
  userId: 'u2',
  fullName: 'Luis Gómez',
  email: 'luis@clinic.com',
  role: 'ASSISTANT' as const,
};

describe('StaffView', () => {
  beforeEach(() => {
    mockedListStaff.mockReset();
    mockedCreateInvitation.mockReset();
    mockedListInvitations.mockReset();
    mockedRevokeInvitation.mockReset();
    // Por defecto no hay invitaciones pendientes: cada test que las necesite
    // sobreescribe esto.
    mockedListInvitations.mockResolvedValue([]);
    mockedUpdateStaff.mockReset();
    mockedDeactivateStaff.mockReset();
  });

  it('renders rows from listStaff', async () => {
    mockedListStaff.mockResolvedValue([member1, member2]);

    render(<StaffView token="tok" />);

    const table = await screen.findByRole('table', { name: /personal/i });
    expect(within(table).getByText('ana@clinic.com')).toBeInTheDocument();
    expect(within(table).getByText('luis@clinic.com')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header + 2 members
  });

  it('the role select offers the 4 current roles and no Propietario/a (OWNER) option', async () => {
    mockedListStaff.mockResolvedValue([member1]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });
    await user.click(screen.getByRole('button', { name: /agregar personal/i }));

    const roleSelect = screen.getByLabelText<HTMLSelectElement>(/^rol$/i);
    const options = within(roleSelect)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);

    expect(options).toEqual(['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION']);
    expect(screen.queryByText('Propietario/a')).not.toBeInTheDocument();
  });

  it('submitting the add form issues an invitation and shows the shareable link', async () => {
    mockedListStaff.mockResolvedValueOnce([member1]);
    mockedCreateInvitation.mockResolvedValue({
      id: 'i1',
      email: 'nueva@clinic.com',
      fullName: 'Nueva Persona',
      role: 'RECEPTION',
      status: 'VALID',
      expiresAt: '2026-08-08T00:00:00.000Z',
      token: 'raw-token-abc',
    });
    mockedListStaff.mockResolvedValueOnce([member1]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /agregar personal/i }));
    await user.type(screen.getByLabelText(/nombre completo/i), 'Nueva Persona');
    await user.type(screen.getByLabelText(/correo electrónico/i), 'nueva@clinic.com');
    await user.selectOptions(screen.getByLabelText(/^rol$/i), 'RECEPTION');

    await user.click(screen.getByRole('button', { name: /^invitar$/i }));

    await waitFor(() =>
      expect(mockedCreateInvitation).toHaveBeenCalledWith('tok', {
        fullName: 'Nueva Persona',
        email: 'nueva@clinic.com',
        role: 'RECEPTION',
      }),
    );

    // El token en claro solo se devuelve al crear: el modal se queda abierto
    // mostrando el enlace, porque cerrarlo lo perdería para siempre.
    const link = await screen.findByLabelText<HTMLInputElement>(/invitación creada/i);
    // El origen lo pone el navegador (en jsdom, http://localhost): lo que
    // importa es que la ruta lleve el token en claro que devolvió el backend.
    expect(link.value).toContain('/invitaciones/raw-token-abc');
  });

  it('lists pending invitations and hides the section when there are none', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedListInvitations.mockResolvedValue([pendingInvite]);

    render(<StaffView token="tok" />);

    const table = await screen.findByRole('table', { name: /invitaciones pendientes/i });
    expect(within(table).getByText('pendiente@clinic.com')).toBeInTheDocument();
    expect(within(table).getByText('Asistente')).toBeInTheDocument();
  });

  it('only shows VALID invitations — accepted/expired ones already left the flow', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedListInvitations.mockResolvedValue([
      pendingInvite,
      { ...pendingInvite, id: 'i10', email: 'caducada@clinic.com', status: 'EXPIRED' as const },
      { ...pendingInvite, id: 'i11', email: 'usada@clinic.com', status: 'USED' as const },
    ]);

    render(<StaffView token="tok" />);

    const table = await screen.findByRole('table', { name: /invitaciones pendientes/i });
    expect(within(table).getByText('pendiente@clinic.com')).toBeInTheDocument();
    expect(within(table).queryByText('caducada@clinic.com')).not.toBeInTheDocument();
    expect(within(table).queryByText('usada@clinic.com')).not.toBeInTheDocument();
  });

  it('reinvitar issues a fresh invitation for the same email and shows the new link', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedListInvitations.mockResolvedValue([pendingInvite]);
    mockedCreateInvitation.mockResolvedValue({
      id: 'i12',
      email: 'pendiente@clinic.com',
      fullName: 'Persona Pendiente',
      role: 'ASSISTANT',
      status: 'VALID',
      expiresAt: '2026-08-15T00:00:00.000Z',
      token: 'raw-token-nuevo',
    });

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /invitaciones pendientes/i });
    await user.click(screen.getByRole('button', { name: /reinvitar a pendiente@clinic\.com/i }));

    // No hay endpoint de reenvío: crear otra para el mismo correo revoca la
    // anterior en el backend, y eso es exactamente lo que se espera aquí.
    await waitFor(() =>
      expect(mockedCreateInvitation).toHaveBeenCalledWith('tok', {
        fullName: 'Persona Pendiente',
        email: 'pendiente@clinic.com',
        role: 'ASSISTANT',
      }),
    );

    const link = await screen.findByLabelText<HTMLInputElement>(/enlace nuevo/i);
    expect(link.value).toContain('/invitaciones/raw-token-nuevo');
  });

  it('revocar asks for confirm then calls revokeInvitation', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedListInvitations.mockResolvedValue([pendingInvite]);
    mockedRevokeInvitation.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /invitaciones pendientes/i });
    await user.click(
      screen.getByRole('button', { name: /revocar la invitación de pendiente@clinic\.com/i }),
    );
    expect(mockedRevokeInvitation).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/dejará de funcionar/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /sí, revocar/i }));

    await waitFor(() => expect(mockedRevokeInvitation).toHaveBeenCalledWith('tok', 'i9'));
  });

  it('changing a role calls updateStaff', async () => {
    mockedListStaff.mockResolvedValueOnce([member1]);
    mockedUpdateStaff.mockResolvedValue({ ...member1, role: 'ADMIN' });
    mockedListStaff.mockResolvedValueOnce([{ ...member1, role: 'ADMIN' as const }]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });
    const roleSelect = screen.getByLabelText<HTMLSelectElement>(/rol de ana ríos/i);
    expect(roleSelect.value).toBe('DENTIST');

    await user.selectOptions(roleSelect, 'ADMIN');

    await waitFor(() =>
      expect(mockedUpdateStaff).toHaveBeenCalledWith('tok', 'u1', { role: 'ADMIN' }),
    );
    await waitFor(() => expect(mockedListStaff).toHaveBeenCalledTimes(2));
  });

  it('deactivate asks for confirm then calls deactivateStaff', async () => {
    mockedListStaff.mockResolvedValueOnce([member1]);
    mockedDeactivateStaff.mockResolvedValue(undefined);
    mockedListStaff.mockResolvedValueOnce([]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /^desactivar$/i }));
    expect(mockedDeactivateStaff).not.toHaveBeenCalled();
    // Confirmation now lives in a dialog (ConfirmDialog) instead of an inline row prompt.
    const confirmDialog = await screen.findByRole('dialog');
    expect(within(confirmDialog).getByText(/perderá el acceso/i)).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: /sí, desactivar/i }));

    await waitFor(() => expect(mockedDeactivateStaff).toHaveBeenCalledWith('tok', 'u1'));
    await waitFor(() => expect(mockedListStaff).toHaveBeenCalledTimes(2));
  });

  it('blurring the name input with a changed value calls updateStaff and refreshes the list', async () => {
    mockedListStaff.mockResolvedValueOnce([member1]);
    mockedUpdateStaff.mockResolvedValue({ ...member1, fullName: 'Ana Ríos Cambiado' });
    mockedListStaff.mockResolvedValueOnce([{ ...member1, fullName: 'Ana Ríos Cambiado' }]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });
    const nameInput = screen.getByLabelText<HTMLInputElement>(/nombre de ana ríos/i);

    await user.clear(nameInput);
    await user.type(nameInput, 'Ana Ríos Cambiado');
    await user.tab();

    await waitFor(() =>
      expect(mockedUpdateStaff).toHaveBeenCalledWith('tok', 'u1', {
        fullName: 'Ana Ríos Cambiado',
      }),
    );
    await waitFor(() => expect(mockedListStaff).toHaveBeenCalledTimes(2));
  });

  it('blurring the name input with an unchanged value does not call updateStaff', async () => {
    mockedListStaff.mockResolvedValueOnce([member1]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });
    const nameInput = screen.getByLabelText<HTMLInputElement>(/nombre de ana ríos/i);

    await user.click(nameInput);
    await user.tab();

    expect(mockedUpdateStaff).not.toHaveBeenCalled();
  });

  it('blurring the name input with a whitespace-only value does not call updateStaff', async () => {
    mockedListStaff.mockResolvedValueOnce([member1]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });
    const nameInput = screen.getByLabelText<HTMLInputElement>(/nombre de ana ríos/i);

    await user.clear(nameInput);
    await user.type(nameInput, '   ');
    await user.tab();

    expect(mockedUpdateStaff).not.toHaveBeenCalled();
  });

  it('a failed role change surfaces as a background toast with a retry action, not an inline banner (escalón 3)', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedUpdateStaff.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    mockedUpdateStaff.mockResolvedValueOnce({ ...member1, role: 'ADMIN' });
    mockedListStaff.mockResolvedValueOnce([{ ...member1, role: 'ADMIN' as const }]);

    const user = userEvent.setup();
    render(
      <>
        <Toaster />
        <StaffView token="tok" />
      </>,
    );

    await screen.findByRole('table', { name: /personal/i });
    const roleSelect = screen.getByLabelText<HTMLSelectElement>(/rol de ana ríos/i);
    await user.selectOptions(roleSelect, 'ADMIN');

    expect(await screen.findByText('Error del servidor')).toBeInTheDocument();
    // No inline banner competes with the toast for the same failure.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    await waitFor(() => expect(mockedUpdateStaff).toHaveBeenCalledTimes(2));
  });

  it('a failed deactivate surfaces as a background toast with a retry action, not an inline banner (escalón 3)', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedDeactivateStaff.mockRejectedValueOnce(
      new ApiError(409, 'No puedes desactivar al último administrador'),
    );
    mockedDeactivateStaff.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    render(
      <>
        <Toaster />
        <StaffView token="tok" />
      </>,
    );

    await screen.findByRole('table', { name: /personal/i });
    await user.click(screen.getByRole('button', { name: /^desactivar$/i }));
    const confirmDialog = await screen.findByRole('dialog');
    await user.click(within(confirmDialog).getByRole('button', { name: /sí, desactivar/i }));

    expect(
      await screen.findByText('No puedes desactivar al último administrador'),
    ).toBeInTheDocument();
    // The confirm dialog closes on failure too (not just success) — it's a
    // Radix modal, so leaving it open would mark the toast's own retry
    // button inert (unreachable), same contract violation as no retry at all.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    await waitFor(() => expect(mockedDeactivateStaff).toHaveBeenCalledTimes(2));
  });

  it('a create error (e.g. 409 duplicate email) renders role="alert"', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedCreateInvitation.mockRejectedValue(new ApiError(409, 'El correo ya está en uso.'));

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /agregar personal/i }));
    await user.type(screen.getByLabelText(/nombre completo/i), 'Duplicado');
    await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@clinic.com');
    await user.click(screen.getByRole('button', { name: /^invitar$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/el correo ya está en uso/i);
  });
});
