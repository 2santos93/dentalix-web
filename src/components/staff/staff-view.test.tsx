import { act, render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { DELIVERY_POLL_MS, StaffView } from './staff-view';
import { listStaffDirectory, type StaffDirectoryEntry } from '@/lib/staff/staff-api';
import {
  createInvitation,
  resendInvitation,
  revokeInvitation,
} from '@/lib/staff/invitations-api';
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
  resendInvitation: jest.fn(),
  revokeInvitation: jest.fn(),
}));

const mockedList = listStaffDirectory as jest.MockedFunction<typeof listStaffDirectory>;
const mockedCreate = createInvitation as jest.MockedFunction<typeof createInvitation>;
const mockedRevoke = revokeInvitation as jest.MockedFunction<typeof revokeInvitation>;
const mockedResend = resendInvitation as jest.MockedFunction<typeof resendInvitation>;

const miembro: StaffDirectoryEntry = {
  kind: 'MEMBER',
  id: 'u1',
  fullName: 'Ana Ríos',
  email: 'ana@clinic.com',
  role: 'DENTIST',
  status: 'ACTIVE',
  expiresAt: null,
  emailDelivery: null,
};
const invitacion: StaffDirectoryEntry = {
  kind: 'INVITATION',
  id: 'i1',
  fullName: 'Beto Pendiente',
  email: 'beto@clinic.com',
  role: 'ASSISTANT',
  status: 'PENDING',
  expiresAt: '2026-08-08T00:00:00.000Z',
  emailDelivery: 'SENT',
};
const inactivo: StaffDirectoryEntry = {
  kind: 'MEMBER',
  id: 'u2',
  fullName: 'Caro Inactiva',
  email: 'caro@clinic.com',
  role: 'RECEPTION',
  status: 'INACTIVE',
  expiresAt: null,
  emailDelivery: null,
};

function page(items: StaffDirectoryEntry[], total = items.length) {
  return { items, total, page: 1, pageSize: 20 };
}

describe('StaffView', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedRevoke.mockReset();
    mockedResend.mockReset();
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

    // La invitación tiene disparador de acciones; el miembro no, porque su
    // fila entera ya enlaza a su perfil y ahí se gestiona.
    expect(
      screen.getByRole('button', { name: /acciones de Beto/i }),
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
    const user = setupUser();
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
    const user = setupUser();
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
    const user = setupUser();
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

  const reenviada = {
    id: 'i1',
    email: 'beto@clinic.com',
    fullName: 'Beto Pendiente',
    role: 'ASSISTANT' as const,
    status: 'VALID' as const,
    expiresAt: '2026-08-15T00:00:00.000Z',
    token: 'token-nuevo',
    emailDelivery: 'PENDING' as const,
  };

  async function abrirReenviar(user: ReturnType<typeof setupUser>) {
    await user.click(screen.getByRole('button', { name: /acciones de Beto/i }));
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: /reenviar invitación/i,
      }),
    );
    return screen.findByRole('dialog', { name: /reenviar la invitación/i });
  }

  it('cada invitación muestra el estado de su correo', async () => {
    mockedList.mockResolvedValue(
      page([
        miembro,
        invitacion,
        { ...invitacion, id: 'i2', fullName: 'Ceci', email: 'ceci@clinic.com', emailDelivery: 'FAILED' },
        { ...invitacion, id: 'i3', fullName: 'Dani', email: 'dani@clinic.com', emailDelivery: 'PENDING' },
      ]),
    );
    render(<StaffView token="tok" />);
    const table = await screen.findByRole('table', { name: /personal/i });

    const fila = (email: string) => within(table).getByText(email).closest('tr')!;
    expect(within(fila('beto@clinic.com')).getByText('Correo: Enviado')).toBeInTheDocument();
    expect(within(fila('ceci@clinic.com')).getByText('Correo: Falló')).toBeInTheDocument();
    expect(within(fila('dani@clinic.com')).getByText('Correo: Pendiente')).toBeInTheDocument();
    // Un miembro no tiene correo de invitación que mostrar.
    expect(within(fila('ana@clinic.com')).queryByText(/correo:/i)).not.toBeInTheDocument();
  });

  it('reenviar pide confirmación, llama al endpoint de reenvío y avisa con un toast', async () => {
    mockedResend.mockResolvedValue(reenviada);
    const user = setupUser();
    render(
      <>
        <StaffView token="tok" />
        <Toaster />
      </>,
    );
    await screen.findByRole('table', { name: /personal/i });

    const dialog = await abrirReenviar(user);
    expect(mockedResend).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/el enlace anterior dejará de funcionar/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/beto@clinic\.com/)).toBeInTheDocument();
    mockedList.mockClear();
    await user.click(within(dialog).getByRole('button', { name: /sí, reenviar/i }));

    await waitFor(() => expect(mockedResend).toHaveBeenCalledWith('tok', 'i1'));
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(await screen.findByText('Invitación reenviada')).toBeInTheDocument();
    expect(screen.getByText('Enviamos un correo nuevo a beto@clinic.com.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // La lista se recarga para mostrar el nuevo estado del correo.
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
  });

  it('si el correo no se pudo programar, muestra el enlace nuevo para compartirlo', async () => {
    mockedResend.mockResolvedValue({ ...reenviada, emailDelivery: null });
    const user = setupUser();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    const dialog = await abrirReenviar(user);
    await user.click(within(dialog).getByRole('button', { name: /sí, reenviar/i }));

    const created = await screen.findByRole('dialog', { name: 'Invitación reenviada' });
    expect(within(created).getByText(/token-nuevo/)).toBeInTheDocument();
    expect(within(created).getByText(/no pudimos programar el correo/i)).toBeInTheDocument();
  });

  it('un 404 al reenviar avisa sin «Reintentar» (no serviría) y recarga la lista', async () => {
    mockedResend.mockRejectedValue(
      new ApiError(404, 'No encontramos una invitación pendiente con ese id.'),
    );
    const user = setupUser();
    render(
      <>
        <StaffView token="tok" />
        <Toaster />
      </>,
    );
    await screen.findByRole('table', { name: /personal/i });
    mockedList.mockClear();

    const dialog = await abrirReenviar(user);
    await user.click(within(dialog).getByRole('button', { name: /sí, reenviar/i }));

    expect(
      await screen.findByText('No encontramos una invitación pendiente con ese id.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
  });

  it('un 429 (tope de envíos) muestra el mensaje de la API sin «Reintentar»', async () => {
    mockedResend.mockRejectedValue(
      new ApiError(429, 'Ya enviamos un correo a esta persona hace un momento. Espera 42 segundos antes de volver a enviarlo.'),
    );
    const user = setupUser();
    render(
      <>
        <StaffView token="tok" />
        <Toaster />
      </>,
    );
    await screen.findByRole('table', { name: /personal/i });
    const dialog = await abrirReenviar(user);
    await user.click(within(dialog).getByRole('button', { name: /sí, reenviar/i }));
    expect(await screen.findByText(/espera 42 segundos/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('un fallo al reenviar cierra el diálogo y ofrece reintentar en el toast', async () => {
    mockedResend.mockRejectedValue(new ApiError(500, 'Se cayó el servidor al reenviar.'));
    const user = setupUser();
    render(
      <>
        <StaffView token="tok" />
        <Toaster />
      </>,
    );
    await screen.findByRole('table', { name: /personal/i });

    const dialog = await abrirReenviar(user);
    await user.click(within(dialog).getByRole('button', { name: /sí, reenviar/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Un 5xx no muestra el mensaje interno del servidor (apiErrorMessage, DX-063).
    expect(await screen.findByText('No pudimos reenviar la invitación.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('el botón de confirmar muestra el estado de carga mientras reenvía', async () => {
    let resolve: (v: typeof reenviada) => void = () => undefined;
    mockedResend.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const user = setupUser();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    const dialog = await abrirReenviar(user);
    await user.click(within(dialog).getByRole('button', { name: /sí, reenviar/i }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: /cancelar/i })).toBeDisabled(),
    );
    await act(async () => {
      resolve(reenviada);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('con un correo pendiente vuelve a pedir la lista en silencio hasta que sale', async () => {
    jest.useFakeTimers();
    try {
      const pendiente = { ...invitacion, emailDelivery: 'PENDING' as const };
      mockedList
        .mockResolvedValueOnce(page([pendiente]))
        .mockResolvedValueOnce(page([invitacion]));
      render(<StaffView token="tok" />);
      expect(await screen.findByText('Correo: Pendiente')).toBeInTheDocument();
      expect(mockedList).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(DELIVERY_POLL_MS);
      });
      expect(await screen.findByText('Correo: Enviado')).toBeInTheDocument();
      expect(mockedList).toHaveBeenCalledTimes(2);
      // Se anuncia a los lectores de pantalla (región aria-live).
      expect(
        screen.getByText('Correo de invitación enviado a beto@clinic.com.'),
      ).toHaveAttribute('aria-live', 'polite');
      // Sin skeleton: la tabla siguió en pantalla durante el sondeo.
      expect(screen.getByRole('table', { name: /personal/i })).toBeInTheDocument();

      // Ya no queda nada pendiente: no hay más sondeos.
      await act(async () => {
        jest.advanceTimersByTime(DELIVERY_POLL_MS * 3);
      });
      expect(mockedList).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('revocar pide confirmación antes de llamar al servidor', async () => {
    mockedRevoke.mockResolvedValue(undefined);
    const user = setupUser();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /acciones de Beto/i }));
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: /revocar/i,
      }),
    );
    expect(mockedRevoke).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/dejará de funcionar/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /sí, revocar/i }));

    await waitFor(() => expect(mockedRevoke).toHaveBeenCalledWith('tok', 'i1'));
  });

  it('un fallo al revocar cierra el diálogo y ofrece reintentar en el toast', async () => {
    mockedRevoke.mockRejectedValue(new ApiError(500, 'Se cayó el servidor'));
    const user = setupUser();
    render(
      <>
        <StaffView token="tok" />
        <Toaster />
      </>,
    );
    await screen.findByRole('table', { name: /personal/i });

    await user.click(screen.getByRole('button', { name: /acciones de Beto/i }));
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: /revocar/i,
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /sí, revocar/i }));

    // El diálogo tiene que cerrarse: mientras está abierto deja inerte el
    // toast, y un "Reintentar" que no se puede pulsar incumple el escalón 3.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('No pudimos revocar la invitación.')).toBeInTheDocument();
  });

  it('un error de carga se muestra en la sección', async () => {
    mockedList.mockRejectedValue(new ApiError(500, 'No se pudo listar'));
    render(<StaffView token="tok" />);

    expect(await screen.findByText('No pudimos cargar el personal.')).toBeInTheDocument();
  });
});

describe('contrato de vista de listado', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedList.mockResolvedValue(page([miembro]));
  });

  it('la accion primaria vive en la barra de filtros, no colgada del titulo', async () => {
    render(<StaffView token="tok" />);

    const heading = await screen.findByRole('heading', {
      name: 'Personal',
      level: 1,
    });

    // La cabecera es identidad: titulo y linea de apoyo, nada mas.
    const header = heading.closest('div')?.parentElement as HTMLElement;
    expect(
      within(header).queryByRole('button', { name: /invitar/i }),
    ).not.toBeInTheDocument();

    // El boton esta en la misma barra que el buscador, que es con lo que se usa.
    const toolbar = screen.getByRole('searchbox').closest('div')?.parentElement
      ?.parentElement as HTMLElement;
    expect(
      within(toolbar).getByRole('button', { name: /invitar/i }),
    ).toBeInTheDocument();
  });

  it('sin nadie dado de alta invita a crear, en vez de hablar de busquedas', async () => {
    // El bug que arregla: `emptyTitle` era siempre el texto de búsqueda, así que
    // una clínica recién creada leía "No hay nadie que coincida" sin haber
    // buscado nada.
    mockedList.mockResolvedValue(page([]));
    render(<StaffView token="tok" />);

    expect(
      await screen.findByText('Todavía no hay nadie en el equipo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/coincida/i)).not.toBeInTheDocument();
  });

  it('cuando hay filtros y no encuentra, lo dice como busqueda', async () => {
    const user = setupUser();
    render(<StaffView token="tok" />);
    await screen.findByRole('table', { name: /personal/i });

    mockedList.mockResolvedValue(page([]));
    await user.selectOptions(
      screen.getByLabelText('Filtrar por rol'),
      'DENTIST',
    );

    expect(
      await screen.findByText('No hay nadie que coincida.'),
    ).toBeInTheDocument();
  });
});
