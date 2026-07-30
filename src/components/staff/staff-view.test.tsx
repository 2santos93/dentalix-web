import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffView } from './staff-view';
import { listStaff, createStaff, updateStaff, deactivateStaff } from '@/lib/staff/staff-api';
import { ApiError } from '@/lib/api/client';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, same convention as agenda-view.test.tsx.
jest.mock('../../lib/staff/staff-api', () => ({
  listStaff: jest.fn(),
  createStaff: jest.fn(),
  updateStaff: jest.fn(),
  deactivateStaff: jest.fn(),
}));

const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedCreateStaff = createStaff as jest.MockedFunction<typeof createStaff>;
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
    mockedCreateStaff.mockReset();
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

  it('submitting the add form calls createStaff with the right payload and refreshes the list', async () => {
    mockedListStaff.mockResolvedValueOnce([member1]);
    mockedCreateStaff.mockResolvedValue({
      userId: 'u3',
      fullName: 'Nueva Persona',
      email: 'nueva@clinic.com',
      role: 'RECEPTION',
    });
    mockedListStaff.mockResolvedValueOnce([
      member1,
      { userId: 'u3', fullName: 'Nueva Persona', email: 'nueva@clinic.com', role: 'RECEPTION' as const },
    ]);

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /agregar personal/i }));
    await user.type(screen.getByLabelText(/nombre completo/i), 'Nueva Persona');
    await user.type(screen.getByLabelText(/correo electrónico/i), 'nueva@clinic.com');
    await user.selectOptions(screen.getByLabelText(/^rol$/i), 'RECEPTION');
    await user.type(screen.getByLabelText(/contraseña/i), 'S3cret!!');

    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() =>
      expect(mockedCreateStaff).toHaveBeenCalledWith('tok', {
        fullName: 'Nueva Persona',
        email: 'nueva@clinic.com',
        role: 'RECEPTION',
        password: 'S3cret!!',
      }),
    );

    await waitFor(() => expect(mockedListStaff).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('nueva@clinic.com')).toBeInTheDocument();
    // The form collapses again after a successful create.
    expect(screen.queryByRole('form', { name: /agregar personal/i })).not.toBeInTheDocument();
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

  it('a create error (e.g. 409 duplicate email) renders role="alert"', async () => {
    mockedListStaff.mockResolvedValue([member1]);
    mockedCreateStaff.mockRejectedValue(new ApiError(409, 'El correo ya está en uso.'));

    const user = userEvent.setup();
    render(<StaffView token="tok" />);

    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /agregar personal/i }));
    await user.type(screen.getByLabelText(/nombre completo/i), 'Duplicado');
    await user.type(screen.getByLabelText(/correo electrónico/i), 'ana@clinic.com');
    await user.type(screen.getByLabelText(/contraseña/i), 'S3cret!!');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/el correo ya está en uso/i);
  });
});
