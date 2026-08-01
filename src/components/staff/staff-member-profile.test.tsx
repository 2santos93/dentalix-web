import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffMemberProfile } from './staff-member-profile';
import {
  getStaffMember,
  updateStaff,
  deactivateStaff,
  reactivateStaff,
} from '@/lib/staff/staff-api';
import { ApiError } from '@/lib/api/client';
import { Toaster } from '@/components/errors/toaster';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, same convention as agenda-view.test.tsx.
jest.mock('../../lib/staff/staff-api', () => ({
  getStaffMember: jest.fn(),
  updateStaff: jest.fn(),
  deactivateStaff: jest.fn(),
  reactivateStaff: jest.fn(),
}));

const mockedGet = getStaffMember as jest.MockedFunction<typeof getStaffMember>;
const mockedUpdate = updateStaff as jest.MockedFunction<typeof updateStaff>;
const mockedDeactivate = deactivateStaff as jest.MockedFunction<typeof deactivateStaff>;
const mockedReactivate = reactivateStaff as jest.MockedFunction<typeof reactivateStaff>;

const activo = {
  userId: 'u1',
  fullName: 'Ana Ríos',
  email: 'ana@clinic.com',
  role: 'DENTIST' as const,
  status: 'ACTIVE' as const,
};

describe('StaffMemberProfile', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedDeactivate.mockReset();
    mockedReactivate.mockReset();
    mockedGet.mockResolvedValue(activo);
  });

  it('muestra los datos del miembro y su estado', async () => {
    render(<StaffMemberProfile token="tok" userId="u1" />);

    expect(await screen.findByText('Ana Ríos')).toBeInTheDocument();
    expect(screen.getByText('Aceptado')).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre completo/i)).toHaveValue('Ana Ríos');
  });

  it('el correo se ve pero no se edita: identifica la cuenta', async () => {
    render(<StaffMemberProfile token="tok" userId="u1" />);

    const email = await screen.findByLabelText(/correo electrónico/i);
    expect(email).toHaveValue('ana@clinic.com');
    expect(email).toHaveAttribute('readonly');
  });

  it('guardar solo manda lo que cambió', async () => {
    mockedUpdate.mockResolvedValue({ ...activo, fullName: 'Ana Ríos Gómez' });
    const user = userEvent.setup();
    render(<StaffMemberProfile token="tok" userId="u1" />);
    await screen.findByText('Ana Ríos');

    const nombre = screen.getByLabelText(/nombre completo/i);
    await user.clear(nombre);
    await user.type(nombre, 'Ana Ríos Gómez');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    // Sin `role`: mandarlo sin haberlo tocado dispararía la guardia de
    // "último admin" del backend sin que el usuario haya cambiado el rol.
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'u1', {
        fullName: 'Ana Ríos Gómez',
      }),
    );
  });

  it('el botón de guardar está inhabilitado si no se cambió nada', async () => {
    render(<StaffMemberProfile token="tok" userId="u1" />);
    await screen.findByText('Ana Ríos');

    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeDisabled();
  });

  it('un fallo al guardar se muestra junto al formulario', async () => {
    mockedUpdate.mockRejectedValue(new ApiError(409, 'No puedes quitar el último admin'));
    const user = userEvent.setup();
    render(<StaffMemberProfile token="tok" userId="u1" />);
    await screen.findByText('Ana Ríos');

    await user.selectOptions(screen.getByLabelText(/^rol$/i), 'ASSISTANT');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/último admin/i);
  });

  it('desactivar pide confirmación y recarga el perfil', async () => {
    mockedDeactivate.mockResolvedValue(undefined);
    mockedGet
      .mockResolvedValueOnce(activo)
      .mockResolvedValueOnce({ ...activo, status: 'INACTIVE' });
    const user = userEvent.setup();
    render(<StaffMemberProfile token="tok" userId="u1" />);
    await screen.findByText('Ana Ríos');

    await user.click(screen.getByRole('button', { name: /desactivar acceso/i }));
    expect(mockedDeactivate).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /sí, desactivar/i }));

    await waitFor(() => expect(mockedDeactivate).toHaveBeenCalledWith('tok', 'u1'));
    expect(await screen.findByText('Inactivo')).toBeInTheDocument();
  });

  it('un inactivo ofrece reactivar en vez de desactivar', async () => {
    mockedGet.mockResolvedValue({ ...activo, status: 'INACTIVE' });
    mockedReactivate.mockResolvedValue(activo);
    mockedGet
      .mockResolvedValueOnce({ ...activo, status: 'INACTIVE' })
      .mockResolvedValueOnce(activo);
    const user = userEvent.setup();
    render(<StaffMemberProfile token="tok" userId="u1" />);
    await screen.findByText('Inactivo');

    expect(
      screen.queryByRole('button', { name: /desactivar acceso/i }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reactivar acceso/i }));

    await waitFor(() => expect(mockedReactivate).toHaveBeenCalledWith('tok', 'u1'));
    expect(await screen.findByText('Aceptado')).toBeInTheDocument();
  });

  it('un fallo al desactivar cierra el diálogo y ofrece reintentar en el toast', async () => {
    mockedDeactivate.mockRejectedValue(new ApiError(500, 'Se cayó el servidor'));
    const user = userEvent.setup();
    render(
      <>
        <StaffMemberProfile token="tok" userId="u1" />
        <Toaster />
      </>,
    );
    await screen.findByText('Ana Ríos');

    await user.click(screen.getByRole('button', { name: /desactivar acceso/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /sí, desactivar/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(/se cayó el servidor/i)).toBeInTheDocument();
  });

  it('un error de carga se muestra con opción de reintentar', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'No existe esa persona'));
    render(<StaffMemberProfile token="tok" userId="u1" />);

    expect(await screen.findByText(/no existe esa persona/i)).toBeInTheDocument();
  });

  it('siempre hay salida de vuelta a la lista', async () => {
    render(<StaffMemberProfile token="tok" userId="u1" />);
    await screen.findByText('Ana Ríos');

    expect(screen.getByRole('link', { name: /volver a personal/i })).toHaveAttribute(
      'href',
      '/staff',
    );
  });
});
