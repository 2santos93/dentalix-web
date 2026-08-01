import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffView } from './staff-view';
import { listStaffDirectory, type StaffDirectoryEntry } from '@/lib/staff/staff-api';
import { createInvitation, revokeInvitation } from '@/lib/staff/invitations-api';
import { ApiError } from '@/lib/api/client';
import { Toaster } from '@/components/errors/toaster';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, same convention as agenda-view.test.tsx.
jest.mock('../../lib/staff/staff-api', () => ({
  listStaffDirectory: jest.fn(),
}));
jest.mock('../../lib/staff/invitations-api', () => ({
  createInvitation: jest.fn(),
  revokeInvitation: jest.fn(),
}));

const mockedList = listStaffDirectory as jest.MockedFunction<typeof listStaffDirectory>;
const mockedCreate = createInvitation as jest.MockedFunction<typeof createInvitation>;
const mockedRevoke = revokeInvitation as jest.MockedFunction<typeof revokeInvitation>;

const miembro: StaffDirectoryEntry = {
  kind: 'MEMBER',
  id: 'u1',
  fullName: 'Ana Ríos',
  email: 'ana@clinic.com',
  role: 'DENTIST',
  status: 'ACTIVE',
  expiresAt: null,
};
const invitacion: StaffDirectoryEntry = {
  kind: 'INVITATION',
  id: 'i1',
  fullName: 'Beto Pendiente',
  email: 'beto@clinic.com',
  role: 'ASSISTANT',
  status: 'PENDING',
  expiresAt: '2026-08-08T00:00:00.000Z',
};
const inactivo: StaffDirectoryEntry = {
  kind: 'MEMBER',
  id: 'u2',
  fullName: 'Caro Inactiva',
  email: 'caro@clinic.com',
  role: 'RECEPTION',
  status: 'INACTIVE',
  expiresAt: null,
};

function page(items: StaffDirectoryEntry[], total = items.length) {
  return { items, total, page: 1, pageSize: 20 };
}

describe('StaffView', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedRevoke.mockReset();
    mockedList.mockResolvedValue(page([miembro, invitacion]));
  });

  it('lista miembros e invitaciones juntos, cada uno con su estado', async () => {
    render(<StaffView token="tok" />);

    const table = await screen.findByRole('table', { name: /personal/i });
    const filaMiembro = within(table).getByText('ana@clinic.com').closest('tr')!;
    const filaInvitacion = within(table).getByText('beto@clinic.com').closest('tr')!;

    expect(within(filaMiembro).getByText('Aceptado')).toBeInTheDocument();
    expect(within(filaInvitacion).getByText('Pendiente')).toBeInTheDocument();
  });

  it('un miembro se abre en su perfil; una invitación no tiene perfil que abrir', async () => {
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    expect(
      screen.getByRole('link', { name: /ver el perfil de ana ríos/i }),
    ).toHaveAttribute('href', '/staff/u1');
    expect(
      screen.queryByRole('link', { name: /ver el perfil de beto/i }),
    ).not.toBeInTheDocument();
  });

  it('la tabla ya no edita: ni el nombre ni el rol son campos dentro de ella', async () => {
    render(<StaffView token="tok" />);
    const table = await screen.findByRole('table', { name: /personal/i });

    // La versión anterior ponía un <input> y un <select> por fila; eso vive
    // ahora en el perfil, así que dentro de la tabla no debe quedar ninguno.
    expect(within(table).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(table).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('solo las invitaciones traen acciones en la fila', async () => {
    render(<StaffView token="tok" />);
    const table = await screen.findByRole('table', { name: /personal/i });
    const filaMiembro = within(table).getByText('ana@clinic.com').closest('tr')!;

    expect(
      screen.getByRole('button', { name: /reenviar a beto@clinic\.com/i }),
    ).toBeInTheDocument();
    expect(within(filaMiembro).queryByRole('button')).not.toBeInTheDocument();
  });

  it('un desactivado se muestra como Inactivo, no como Aceptado', async () => {
    mockedList.mockResolvedValue(page([inactivo]));
    render(<StaffView token="tok" />);

    const table = await screen.findByRole('table', { name: /personal/i });
    expect(within(table).getByText('Inactivo')).toBeInTheDocument();
    expect(within(table).queryByText('Aceptado')).not.toBeInTheDocument();
  });

  it('buscar consulta al servidor con el término', async () => {
    const user = userEvent.setup();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    await user.type(screen.getByRole('searchbox', { name: /buscar/i }), 'ana');

    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({ search: 'ana' }),
      ),
    );
  });

  it('los filtros de rol y estado se mandan al servidor', async () => {
    const user = userEvent.setup();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    await user.selectOptions(screen.getByLabelText(/filtrar por rol/i), 'DENTIST');
    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({ role: 'DENTIST' }),
      ),
    );

    await user.selectOptions(screen.getByLabelText(/filtrar por estado/i), 'INACTIVE');
    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({ status: 'INACTIVE' }),
      ),
    );
  });

  it('cambiar un filtro vuelve a la página 1', async () => {
    mockedList.mockResolvedValue(page([miembro, invitacion], 50));
    const user = userEvent.setup();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /siguiente/i }));
    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({ page: 2 }),
      ),
    );

    await user.selectOptions(screen.getByLabelText(/filtrar por rol/i), 'ADMIN');

    // Quedarse en la página 2 de un resultado que ahora puede tener una sola
    // página dejaría la tabla vacía sin motivo aparente.
    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith(
        'tok',
        expect.objectContaining({ page: 1, role: 'ADMIN' }),
      ),
    );
  });

  it('reenviar crea otra invitación para el mismo correo y muestra el enlace nuevo', async () => {
    mockedCreate.mockResolvedValue({
      id: 'i2',
      email: 'beto@clinic.com',
      fullName: 'Beto Pendiente',
      role: 'ASSISTANT',
      status: 'VALID',
      expiresAt: '2026-08-15T00:00:00.000Z',
      token: 'token-nuevo',
    });
    const user = userEvent.setup();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    await user.click(
      screen.getByRole('button', { name: /reenviar a beto@clinic\.com/i }),
    );

    // No hay endpoint de reenvío: crear otra para el mismo correo revoca la
    // anterior en el backend, así que solo vive un enlace por persona.
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        fullName: 'Beto Pendiente',
        email: 'beto@clinic.com',
        role: 'ASSISTANT',
      }),
    );
    expect(await screen.findByText(/token-nuevo/)).toBeInTheDocument();
  });

  it('revocar pide confirmación antes de llamar al servidor', async () => {
    mockedRevoke.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    await user.click(
      screen.getByRole('button', { name: /revocar la invitación de beto@clinic\.com/i }),
    );
    expect(mockedRevoke).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/dejará de funcionar/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /sí, revocar/i }));

    await waitFor(() => expect(mockedRevoke).toHaveBeenCalledWith('tok', 'i1'));
  });

  it('un fallo al revocar cierra el diálogo y ofrece reintentar en el toast', async () => {
    mockedRevoke.mockRejectedValue(new ApiError(500, 'Se cayó el servidor'));
    const user = userEvent.setup();
    render(
      <>
        <StaffView token="tok" />
        <Toaster />
      </>,
    );
    await screen.findByRole('table', { name: /personal/i });

    await user.click(
      screen.getByRole('button', { name: /revocar la invitación de beto@clinic\.com/i }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /sí, revocar/i }));

    // El diálogo tiene que cerrarse: mientras está abierto deja inerte el
    // toast, y un "Reintentar" que no se puede pulsar incumple el escalón 3.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/se cayó el servidor/i)).toBeInTheDocument();
  });

  it('un error de carga se muestra en la sección', async () => {
    mockedList.mockRejectedValue(new ApiError(500, 'No se pudo listar'));
    render(<StaffView token="tok" />);

    expect(await screen.findByText(/no se pudo listar/i)).toBeInTheDocument();
  });
});
