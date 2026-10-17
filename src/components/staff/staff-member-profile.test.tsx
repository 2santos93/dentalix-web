import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffMemberProfile } from './staff-member-profile';
import {
  getStaffMember,
  updateStaff,
  deactivateStaff,
  reactivateStaff,
  unlockStaffLogin,
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
  unlockStaffLogin: jest.fn(),
}));

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([]),
}));

const mockedGet = getStaffMember as jest.MockedFunction<typeof getStaffMember>;
const mockedUpdate = updateStaff as jest.MockedFunction<typeof updateStaff>;
const mockedDeactivate = deactivateStaff as jest.MockedFunction<typeof deactivateStaff>;
const mockedReactivate = reactivateStaff as jest.MockedFunction<typeof reactivateStaff>;
const mockedUnlock = unlockStaffLogin as jest.MockedFunction<typeof unlockStaffLogin>;

const activo = {
  userId: 'u1',
  fullName: 'Ana Ríos',
  email: 'ana@clinic.com',
  role: 'DENTIST' as const,
  status: 'ACTIVE' as const,
  loginBlockedUntil: null,
};

describe('StaffMemberProfile', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
    mockedDeactivate.mockReset();
    mockedReactivate.mockReset();
    mockedUnlock.mockReset();
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

  it('edita el registro profesional / nº de colegiado (DX-013) y solo manda ese campo', async () => {
    mockedGet.mockResolvedValue({ ...activo, professionalLicense: null });
    mockedUpdate.mockResolvedValue({ ...activo, professionalLicense: 'RM-77' });
    const user = userEvent.setup();
    render(<StaffMemberProfile token="tok" userId="u1" />);
    const license = await screen.findByLabelText(/registro profesional/i);
    expect(license).toHaveValue('');
    await user.type(license, 'RM-77');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'u1', { professionalLicense: 'RM-77' }),
    );
    expect(await screen.findByLabelText(/registro profesional/i)).toHaveValue('RM-77');
  });

  it('borrar el registro profesional lo deja vacío (la API responde null)', async () => {
    mockedGet.mockResolvedValue({ ...activo, professionalLicense: 'RM-77' });
    mockedUpdate.mockResolvedValue({ ...activo, professionalLicense: null });
    const user = userEvent.setup();
    render(<StaffMemberProfile token="tok" userId="u1" />);
    const license = await screen.findByLabelText(/registro profesional/i);
    expect(license).toHaveValue('RM-77');
    await user.clear(license);
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'u1', { professionalLicense: '' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeDisabled(),
    );
    expect(screen.getByLabelText(/registro profesional/i)).toHaveValue('');
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
    expect(await screen.findByText('No pudimos desactivar el acceso.')).toBeInTheDocument();
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

  it('DX-122: quien puede bloquear agendas lo hace desde el perfil; sin rol legible, no', async () => {
    const { unmount } = render(<StaffMemberProfile token="tok" userId="u1" />);
    await screen.findByText('Ana Ríos');
    expect(screen.queryByRole('button', { name: 'Bloquear agenda' })).not.toBeInTheDocument();
    unmount();

    const admin = `h.${btoa(JSON.stringify({ sub: 'adm', tenantId: 't1', role: 'ADMIN' }))}.s`;
    render(<StaffMemberProfile token={admin} userId="u1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Bloquear agenda' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bloquear horario' });
    expect(within(dialog).getByLabelText('Profesional')).toHaveValue('u1');
    expect(within(dialog).getByLabelText('Profesional')).toBeDisabled();
  });

  it('DX-122: a un miembro no clínico no se le ofrece bloquear la agenda', async () => {
    mockedGet.mockResolvedValue({ ...activo, role: 'RECEPTION' as const });
    const admin = `h.${btoa(JSON.stringify({ sub: 'adm', tenantId: 't1', role: 'ADMIN' }))}.s`;
    render(<StaffMemberProfile token={admin} userId="u1" />);
    await screen.findByText('Ana Ríos');
    expect(screen.queryByRole('button', { name: 'Bloquear agenda' })).not.toBeInTheDocument();
  });

  describe('inicio de sesión bloqueado (DX-048)', () => {
    const bloqueada = {
      ...activo,
      loginBlockedUntil: new Date(Date.now() + 4 * 60_000).toISOString(),
    };

    it('sin bloqueo no ofrece desbloquear', async () => {
      render(<StaffMemberProfile token="tok" userId="u1" />);
      await screen.findByText('Ana Ríos');
      expect(
        screen.queryByRole('button', { name: /desbloquear inicio de sesión/i }),
      ).not.toBeInTheDocument();
    });

    it('bloqueada: lo explica y desbloquea tras confirmar; luego recarga el perfil', async () => {
      mockedGet.mockResolvedValueOnce(bloqueada).mockResolvedValueOnce(activo);
      mockedUnlock.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<StaffMemberProfile token="tok" userId="u1" />);

      expect(
        await screen.findByText(/inicio de sesión bloqueado por intentos fallidos/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/puede volver a intentarlo en 4 min/i)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /desbloquear inicio de sesión/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/Ana Ríos podrá volver a iniciar sesión/i)).toBeInTheDocument();
      expect(mockedUnlock).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: /sí, desbloquear/i }));

      await waitFor(() => expect(mockedUnlock).toHaveBeenCalledWith('tok', 'u1'));
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: /desbloquear inicio de sesión/i }),
        ).not.toBeInTheDocument(),
      );
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });

    it('si falla, avisa con un toast que permite reintentar', async () => {
      mockedGet.mockResolvedValue(bloqueada);
      mockedUnlock.mockRejectedValueOnce(new ApiError(500, 'boom'));
      const user = userEvent.setup();
      render(
        <>
          <StaffMemberProfile token="tok" userId="u1" />
          <Toaster />
        </>,
      );
      await user.click(
        await screen.findByRole('button', { name: /desbloquear inicio de sesión/i }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /sí, desbloquear/i }));
      expect(await screen.findByText(/no pudimos desbloquear el inicio de sesión/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
    });
  });
});
