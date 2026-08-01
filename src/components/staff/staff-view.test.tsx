import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffView } from './staff-view';
import { listStaff, updateStaff, deactivateStaff } from '@/lib/staff/staff-api';
import { createInvitation } from '@/lib/staff/invitations-api';
import { ApiError } from '@/lib/api/client';

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
}));

const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedUpdateStaff = updateStaff as jest.MockedFunction<typeof updateStaff>;
const mockedDeactivateStaff = deactivateStaff as jest.MockedFunction<typeof deactivateStaff>;
const mockedCreateInvitation = createInvitation as jest.MockedFunction<typeof createInvitation>;

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
    mockedUpdateStaff.mockReset();
    mockedDeactivateStaff.mockReset();
    mockedCreateInvitation.mockReset();
  });

  it('renders rows from listStaff', async () => {
    mockedListStaff.mockResolvedValue([member1, member2]);

    render(<StaffView token="tok" />);

    const table = await screen.findByRole('table', { name: /personal/i });
    expect(within(table).getByText('ana@clinic.com')).toBeInTheDocument();
    expect(within(table).getByText('luis@clinic.com')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3); // header + 2 members
  });

  it('the role select offers the 4 current roles and no Propietario/a (OWNER) option', async () => {
    mockedListStaff.mockResolvedValue([member1]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });
    await user.click(screen.getByRole('button', { name: /^invitar$/i }));

    const roleSelect = screen.getByLabelText<HTMLSelectElement>(/^rol$/i);
    const options = within(roleSelect)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);

    expect(options).toEqual(['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION']);
    expect(screen.queryByText('Propietario/a')).not.toBeInTheDocument();
  });

  it('submitting the invite form calls createInvitation with no password and shows the copyable link', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedCreateInvitation.mockResolvedValue({
      id: 'inv-1',
      fullName: 'Nueva Persona',
      email: 'nueva@clinic.com',
      role: 'RECEPTION',
      expiresAt: '2026-08-08T00:00:00.000Z',
      status: 'VALID',
      token: 'tok-abc123',
    });

    const user = userEvent.setup();
    // `userEvent.setup()` attaches its own jsdom clipboard stub (jsdom itself
    // has none) — spy on its `writeText` rather than pre-defining
    // `navigator.clipboard` ourselves, which `setup()` would just overwrite.
    render(<StaffView token="tok" />);
    const writeText = jest.spyOn(navigator.clipboard, 'writeText');

    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /^invitar$/i }));
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/nombre completo/i), 'Nueva Persona');
    await user.type(screen.getByLabelText(/correo electrónico/i), 'nueva@clinic.com');
    await user.selectOptions(screen.getByLabelText(/^rol$/i), 'RECEPTION');

    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    await waitFor(() =>
      expect(mockedCreateInvitation).toHaveBeenCalledWith('tok', {
        fullName: 'Nueva Persona',
        email: 'nueva@clinic.com',
        role: 'RECEPTION',
      }),
    );

    // The modal stays open and now shows the one-time link + copy affordance
    // instead of closing/refreshing the staff table (the invitee isn't staff
    // until they accept).
    expect(
      await screen.findByText(`${window.location.origin}/invitacion/tok-abc123`),
    ).toBeInTheDocument();
    const copyButton = screen.getByRole('button', { name: /^copiar$/i });
    expect(screen.getByText(/no podrás verlo de nuevo/i)).toBeInTheDocument();
    expect(mockedListStaff).toHaveBeenCalledTimes(1);

    await user.click(copyButton);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invitacion/tok-abc123`);
    expect(await screen.findByRole('button', { name: /^copiado$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^listo$/i }));
    expect(screen.queryByText(`${window.location.origin}/invitacion/tok-abc123`)).not.toBeInTheDocument();
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

  it('an invite error (e.g. 409 duplicate email) renders role="alert"', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedCreateInvitation.mockRejectedValue(new ApiError(409, 'El correo ya está en uso.'));

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /^invitar$/i }));
    await user.type(screen.getByLabelText(/nombre completo/i), 'Duplicado');
    await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@clinic.com');
    await user.click(screen.getByRole('button', { name: /enviar invitación/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/el correo ya está en uso/i);
  });
});
