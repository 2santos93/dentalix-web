import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogView } from './audit-log-view';
import { ApiError } from '@/lib/api/client';
import { listAuditEvents, type AuditEvent, type AuditEventsPage } from '@/lib/audit/audit-api';
import { listStaff } from '@/lib/staff/staff-api';

jest.mock('../../lib/audit/audit-api', () => ({
  ...jest.requireActual('../../lib/audit/audit-api'),
  listAuditEvents: jest.fn(),
}));
jest.mock('../../lib/staff/staff-api', () => ({
  listStaff: jest.fn(),
}));

const mockedList = listAuditEvents as jest.MockedFunction<typeof listAuditEvents>;
const mockedStaff = listStaff as jest.MockedFunction<typeof listStaff>;

const view: AuditEvent = {
  id: 'ev-1',
  // 22:30 del 15/10 en Bogotá; 05:30 del 16/10 en Madrid.
  occurredAt: '2026-10-16T03:30:00.000Z',
  action: 'VIEW',
  resourceType: 'MEDICAL_HISTORY',
  resourceId: null,
  locationId: null,
  timeZone: 'America/Bogota',
  actor: { id: 'u-dent', fullName: 'Dra. Laura Gómez', role: 'DENTIST' },
  patient: { id: 'pat-1', fullName: 'Ana Gómez' },
  requestId: 'req-1',
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (iPad)',
  metadata: {},
};
const failedLogin: AuditEvent = {
  ...view,
  id: 'ev-2',
  occurredAt: '2026-10-16T03:30:00.000Z',
  action: 'LOGIN_FAILED',
  resourceType: 'SESSION',
  timeZone: 'Europe/Madrid',
  actor: null,
  patient: null,
};

function page(overrides: Partial<AuditEventsPage> = {}): AuditEventsPage {
  return {
    items: [view, failedLogin],
    nextCursor: null,
    timeZone: 'America/Bogota',
    ...overrides,
  };
}

beforeEach(() => {
  mockedList.mockReset();
  mockedStaff.mockReset();
  mockedStaff.mockResolvedValue([
    { userId: 'u-dent', fullName: 'Dra. Laura Gómez', email: 'l@x.co', role: 'DENTIST', locationIds: null },
    { userId: 'u-rec', fullName: 'Rosa Recepción', email: 'r@x.co', role: 'RECEPTION', locationIds: null },
  ]);
});

describe('AuditLogView', () => {
  it('pinta cada evento con la hora en la zona de su sede, usuario, rol, acción, recurso, paciente e IP', async () => {
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);

    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, first, second] = within(table).getAllByRole('row');
    expect(within(first).getByText('15/10/2026 22:30')).toBeInTheDocument();
    expect(within(first).getByText('Dra. Laura Gómez')).toBeInTheDocument();
    expect(within(first).getByText('Odontólogo/a')).toBeInTheDocument();
    expect(within(first).getByText('Consulta')).toBeInTheDocument();
    expect(within(first).getByText('Historia clínica')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Ana Gómez' })).toHaveAttribute(
      'href',
      '/patients/pat-1',
    );
    expect(within(first).getByText('203.0.113.7')).toBeInTheDocument();
    // Otra sede, otra zona.
    expect(within(second).getByText('16/10/2026 05:30')).toBeInTheDocument();
    expect(within(second).getByText('Inicio de sesión fallido')).toBeInTheDocument();
    expect(within(second).getByText('Usuario no identificado')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { limit: 50 });
  });

  // DX-128: cambios de comunicación con su origen; la baja por enlace no
  // tiene usuario: la hizo el propio paciente.
  it('muestra el origen de los cambios de comunicación y al paciente como autor de su baja', async () => {
    mockedList.mockResolvedValue(
      page({
        items: [
          {
            ...view,
            id: 'ev-3',
            action: 'UPDATE',
            resourceType: 'PATIENT',
            actor: { id: 'u-rec', fullName: 'Rosa Recepción', role: 'RECEPTION' },
            metadata: { reason: 'COMMUNICATION_PREFERENCES_CHANGED', origin: 'IN_PERSON' },
          },
          {
            ...view,
            id: 'ev-4',
            action: 'UPDATE',
            resourceType: 'PATIENT',
            actor: null,
            ip: null,
            metadata: { reason: 'REMINDER_OPT_OUT', origin: 'LINK' },
          },
        ],
      }),
    );
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, staff, patient] = within(table).getAllByRole('row');
    expect(within(staff).getByText('Comunicaciones · en persona')).toBeInTheDocument();
    expect(within(patient).getByText('El propio paciente')).toBeInTheDocument();
    expect(
      within(patient).getByText('Baja de recordatorios · con el enlace del email'),
    ).toBeInTheDocument();
  });

  // DX-213: un desbloqueo rechazado no se confunde con uno hecho.
  it('distingue el desbloqueo del login de su rechazo', async () => {
    const admin = { id: 'u-admin', fullName: 'Ana Admin', role: 'ADMIN' as const };
    mockedList.mockResolvedValue(
      page({
        items: [
          {
            ...view,
            id: 'ev-5',
            action: 'UPDATE',
            resourceType: 'STAFF_MEMBER',
            actor: admin,
            metadata: { reason: 'LOGIN_UNLOCKED' },
          },
          {
            ...view,
            id: 'ev-6',
            action: 'UPDATE',
            resourceType: 'STAFF_MEMBER',
            actor: admin,
            metadata: { reason: 'LOGIN_UNLOCK_REFUSED' },
          },
        ],
      }),
    );
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, unlocked, refused] = within(table).getAllByRole('row');
    expect(within(unlocked).getByText('Desbloqueo del inicio de sesión')).toBeInTheDocument();
    expect(
      within(refused).getByText('Desbloqueo del inicio de sesión rechazado (sin cambios)'),
    ).toBeInTheDocument();
  });

  // DX-050: la corrección de quién realizó un ítem del plan se distingue del
  // cambio genérico del ítem.
  it('dice que un ADMIN corrigió quién realizó un ítem del plan', async () => {
    const side = {
      performedById: '11111111-1111-4111-8111-111111111111',
      locationId: null,
      completedAt: '2026-10-20T15:00:00.000Z',
    };
    mockedList.mockResolvedValue(
      page({
        items: [
          {
            ...view,
            id: 'ev-7',
            action: 'UPDATE',
            resourceType: 'TREATMENT_PLAN_ITEM',
            metadata: {
              reason: 'PLAN_ITEM_ATTRIBUTION_CORRECTED',
              attribution: { before: side, after: { ...side, performedById: '22222222-2222-4222-8222-222222222222' } },
            },
          },
        ],
      }),
    );
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, corrected] = within(table).getAllByRole('row');
    expect(within(corrected).getByText('Corrección de quién lo realizó · Otro profesional')).toBeInTheDocument();
  });

  it('DX-328: el cambio de la mayoría de edad dice la edad antes y después', async () => {
    mockedList.mockResolvedValue(
      page({
        items: [
          {
            ...view,
            id: 'ev-8',
            action: 'UPDATE',
            resourceType: 'CLINIC_SETTINGS',
            patient: null,
            metadata: {
              reason: 'MAJORITY_AGE_SETTINGS',
              statusChange: { from: 'AGE_18', to: 'AGE_16' },
            },
          },
        ],
      }),
    );
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, changed] = within(table).getAllByRole('row');
    expect(within(changed).getByText('Ajustes de la clínica')).toBeInTheDocument();
    expect(within(changed).getByText('Mayoría de edad: 18 → 16 años')).toBeInTheDocument();
  });

  it('DX-316: un cambio del calendario de la sede dice el recurso y el motivo', async () => {
    mockedList.mockResolvedValue(
      page({
        items: [
          {
            ...view,
            id: 'ev-9',
            action: 'CREATE',
            resourceType: 'LOCATION_CALENDAR',
            resourceId: 'loc-1',
            patient: null,
            metadata: { reason: 'HOLIDAYS_IMPORTED' },
          },
        ],
      }),
    );
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, imported] = within(table).getAllByRole('row');
    expect(within(imported).getByText('Calendario de la sede')).toBeInTheDocument();
    expect(within(imported).getByText('Festivos importados')).toBeInTheDocument();
  });

  it('DX-359: el cambio de un miembro dice qué accesos cambiaron y el cambio de contraseña su acción', async () => {
    mockedList.mockResolvedValue(
      page({
        items: [
          {
            ...view,
            id: 'ev-10',
            action: 'UPDATE',
            resourceType: 'STAFF_MEMBER',
            resourceId: 'user-2',
            patient: null,
            metadata: {
              reason: 'STAFF_UPDATED',
              changedFields: ['role'],
              staffAccess: { before: { role: 'ASSISTANT' }, after: { role: 'DENTIST' } },
            },
          },
          {
            ...view,
            id: 'ev-11',
            action: 'PASSWORD_CHANGE',
            resourceType: 'SESSION',
            resourceId: 'user-1',
            patient: null,
            metadata: { reason: 'SESSIONS_REVOKED' },
          },
        ],
      }),
    );
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, updated, password] = within(table).getAllByRole('row');
    expect(within(updated).getByText('Miembro del personal')).toBeInTheDocument();
    expect(
      within(updated).getByText('Datos del miembro cambiados · Rol: Asistente → Odontólogo/a'),
    ).toBeInTheDocument();
    expect(within(password).getByText('Contraseña cambiada')).toBeInTheDocument();
    expect(
      within(password).getByText('Cambió su contraseña y cerró sus demás sesiones'),
    ).toBeInTheDocument();
  });

  it('vacío: lo dice y sugiere cambiar los filtros', async () => {
    mockedList.mockResolvedValue(page({ items: [] }));
    render(<AuditLogView token="tok" />);
    expect(await screen.findByText('No hay eventos con estos filtros.')).toBeInTheDocument();
  });

  it('error: SectionError con reintento que vuelve a cargar', async () => {
    mockedList.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(page());
    render(<AuditLogView token="tok" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar la auditoría.');
    await userEvent.click(within(alert).getByRole('button'));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('403: aviso sin reintento (no es un fallo que se arregle reintentando)', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'Insufficient role'));
    render(<AuditLogView token="tok" />);
    expect(
      await screen.findByText('Solo la administración de la clínica puede ver la auditoría.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('filtrar por acción, recurso y usuario vuelve a pedir desde la primera página', async () => {
    mockedList.mockResolvedValue(page({ nextCursor: 'c-2' }));
    render(<AuditLogView token="tok" />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', { limit: 50, cursor: 'c-2' }),
    );

    await userEvent.selectOptions(screen.getByLabelText('Acción'), 'SIGN');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', { limit: 50, action: 'SIGN' }),
    );
    await userEvent.selectOptions(screen.getByLabelText('Recurso'), 'PAYMENT');
    await userEvent.selectOptions(await screen.findByLabelText('Usuario'), 'u-rec');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', {
        limit: 50,
        action: 'SIGN',
        resourceType: 'PAYMENT',
        actorUserId: 'u-rec',
      }),
    );
  });

  it('las fechas se interpretan en la zona de la clínica (días completos, ambos incluidos)', async () => {
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);
    await screen.findByRole('table');
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-16');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', {
        limit: 50,
        from: '2026-10-01T05:00:00.000Z',
        to: '2026-10-17T05:00:00.000Z',
      }),
    );
  });

  it('audit view waits for the zone', async () => {
    // La primera página tarda: las fechas se escriben antes de saber la zona.
    let resolveFirst: (value: AuditEventsPage) => void = () => {};
    mockedList.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    mockedList.mockResolvedValue(page({ timeZone: 'Asia/Tokyo' }));
    render(<AuditLogView token="tok" />);
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-01');

    // Se pide solo la zona y luego la consulta con fechas en la zona de la API
    // (Tokio, UTC+9: el día empieza a las 15:00 UTC del anterior).
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', { limit: 50, from: '2026-09-30T15:00:00.000Z' }),
    );
    expect(mockedList).toHaveBeenCalledWith('tok', { limit: 1 });
    // Nunca con otra zona: ninguna consulta con el día contado en Bogotá.
    expect(mockedList).not.toHaveBeenCalledWith('tok', expect.objectContaining({ from: '2026-10-01T05:00:00.000Z' }));
    resolveFirst(page());
  });

  it('un rango invertido se explica junto a las fechas y no se consulta', async () => {
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);
    await screen.findByRole('table');
    const calls = mockedList.mock.calls.length;
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-10-01');
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-10');
    expect(
      await screen.findByText('La fecha final no puede ser anterior a la inicial.'),
    ).toBeInTheDocument();
    expect(mockedList.mock.calls.length).toBeLessThanOrEqual(calls + 1);
    expect(mockedList).not.toHaveBeenLastCalledWith(
      'tok',
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    );
  });

  it('paginación por cursor: Siguiente y Anterior', async () => {
    mockedList
      .mockResolvedValueOnce(page({ nextCursor: 'c-2' }))
      .mockResolvedValueOnce(page({ items: [failedLogin], nextCursor: null }))
      .mockResolvedValueOnce(page({ nextCursor: 'c-2' }));
    render(<AuditLogView token="tok" />);
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(screen.getByText('Página 2')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', { limit: 50 }),
    );
  });

  it('en la ficha: fija el paciente y no repite su columna ni su filtro', async () => {
    mockedList.mockResolvedValue(page({ items: [view] }));
    render(<AuditLogView token="tok" patientId="pat-1" />);
    const table = await screen.findByRole('table', { name: 'Accesos a la ficha' });
    expect(within(table).queryByRole('columnheader', { name: 'Paciente' })).not.toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { limit: 50, patientId: 'pat-1' });
  });

  it('si el personal no carga, el filtro de usuario se sustituye por un error con reintento', async () => {
    mockedList.mockResolvedValue(page());
    mockedStaff.mockReset();
    mockedStaff
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce([
        { userId: 'u-rec', fullName: 'Rosa Recepción', email: 'r@x.co', role: 'RECEPTION', locationIds: null },
      ]);
    render(<AuditLogView token="tok" />);
    const status = await screen.findByText('Usuarios no disponibles');
    await userEvent.click(within(status.closest('[role="status"]') as HTMLElement).getByRole('button'));
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument();
  });
});
