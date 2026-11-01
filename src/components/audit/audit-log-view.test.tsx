import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogView } from './audit-log-view';
import { ApiError } from '@/lib/api/client';
import { listAuditEvents, type AuditEvent, type AuditEventsPage } from '@/lib/audit/audit-api';
import { listStaff } from '@/lib/staff/staff-api';
import { listLocations } from '@/lib/locations/locations-api';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/audit/audit-api', () => ({
  ...jest.requireActual('../../lib/audit/audit-api'),
  listAuditEvents: jest.fn(),
}));
jest.mock('../../lib/staff/staff-api', () => ({
  listStaff: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));

const mockedList = listAuditEvents as jest.MockedFunction<typeof listAuditEvents>;
const mockedStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

// DX-362: una clínica con sedes en tres zonas. Jest corre con TZ=UTC, que no es
// la de ninguna: una hora con la zona del navegador no pasaría.
const bogota = clinicLocation({
  id: 'bogota',
  name: 'Bogotá',
  timeZone: 'America/Bogota',
  locale: 'es-CO',
  hourCycle: 'h12',
});
const berlin = clinicLocation({
  id: 'berlin',
  name: 'Berlín',
  timeZone: 'Europe/Berlin',
  locale: 'es-ES',
  hourCycle: 'h23',
});
const newYork = clinicLocation({
  id: 'nueva-york',
  name: 'Nueva York',
  timeZone: 'America/New_York',
  locale: 'en-US',
  hourCycle: 'h12',
});
const SEDES = [bogota, berlin, newYork];

const view: AuditEvent = {
  id: 'ev-1',
  // 22:30 del 15/10 en Bogotá; 05:30 del 16/10 en Berlín; 23:30 en Nueva York.
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
  // Un inicio de sesión no tiene sede: la API manda la zona de la principal.
  timeZone: 'America/Bogota',
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
  mockedLocations.mockReset();
  mockedLocations.mockResolvedValue(SEDES);
  setActiveLocationId(null);
  mockedStaff.mockResolvedValue([
    { userId: 'u-dent', fullName: 'Dra. Laura Gómez', email: 'l@x.co', role: 'DENTIST', locationIds: null },
    { userId: 'u-rec', fullName: 'Rosa Recepción', email: 'r@x.co', role: 'RECEPTION', locationIds: null },
  ]);
});

/** Escribe un extremo del periodo («Desde» o «Hasta») segmento a segmento, como en e2e. */
async function typeRangeEnd(end: 'Desde' | 'Hasta', iso: string) {
  const [year, month, day] = iso.split('-');
  const values: Record<string, string> = { day, month, year };
  const group = screen.getByRole('group', { name: 'Período' });
  for (const segment of within(group).getAllByRole('spinbutton', { name: new RegExp(end) })) {
    await userEvent.click(segment);
    await userEvent.keyboard(values[segment.getAttribute('data-type') ?? '']);
  }
}

async function typeRange(from: string, to: string) {
  await typeRangeEnd('Desde', from);
  await typeRangeEnd('Hasta', to);
}

describe('AuditLogView', () => {
  it('pinta cada evento con su hora y su zona, usuario, rol, acción, recurso, paciente e IP', async () => {
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);

    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, first, second] = within(table).getAllByRole('row');
    expect(within(first).getByText('15/10/2026 10:30 p. m.')).toBeInTheDocument();
    expect(within(first).getByText('UTC−5')).toBeInTheDocument();
    expect(within(first).getByText('Dra. Laura Gómez')).toBeInTheDocument();
    expect(within(first).getByText('Odontólogo/a')).toBeInTheDocument();
    expect(within(first).getByText('Consulta')).toBeInTheDocument();
    expect(within(first).getByText('Historia clínica')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Ana Gómez' })).toHaveAttribute(
      'href',
      '/patients/pat-1',
    );
    expect(within(first).getByText('203.0.113.7')).toBeInTheDocument();
    // El User-Agent se lee como dispositivo; el crudo queda para el tooltip.
    expect(within(first).getByText('iPad')).toBeInTheDocument();
    expect(first).not.toHaveTextContent('Mozilla');
    // Lecturas en neutro; el login fallido, en peligro.
    expect(within(first).getByText('Consulta')).toHaveClass('bg-surface-active');
    expect(within(second).getByText('Inicio de sesión fallido')).toHaveClass('bg-danger-subtle');
    // Sin sede (un inicio de sesión): la misma hora y la misma zona, sin otra hora.
    expect(within(second).getByText('15/10/2026 10:30 p. m.')).toBeInTheDocument();
    expect(within(second).queryByText(/^En /)).not.toBeInTheDocument();
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
    // Las sedes (el reloj de la pantalla) se piden una sola vez.
    expect(mockedLocations).toHaveBeenCalledTimes(1);
  });

  const CENTRO = '3f1c2a10-0000-4000-8000-000000000001';
  const BORRADA = '3f1c2a10-0000-4000-8000-0000000000ff';
  const accepted: AuditEvent = {
    ...view,
    id: 'ev-12',
    action: 'CREATE',
    resourceType: 'STAFF_MEMBER',
    resourceId: 'user-3',
    patient: null,
    metadata: {
      reason: 'INVITATION_ACCEPTED',
      staffAccess: { after: { role: 'ASSISTANT', locationIds: [CENTRO, BORRADA] } },
    },
  };

  it('DX-359: las sedes de los accesos van por su nombre; una borrada se cuenta, sin su id', async () => {
    mockedLocations.mockResolvedValue([clinicLocation({ id: CENTRO, name: 'Centro' })]);
    mockedList.mockResolvedValue(page({ items: [accepted] }));
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    expect(
      await within(table).findByText(
        'Invitación aceptada · Rol: Asistente · Sedes: Centro, 1 sede que ya no existe',
      ),
    ).toBeInTheDocument();
    expect(table).not.toHaveTextContent(CENTRO);
    expect(table).not.toHaveTextContent(BORRADA);
    expect(mockedLocations).toHaveBeenCalledTimes(1);
  });

  it('DX-362: si las sedes no cargan, «Falta un dato de la sede» con reintento: nunca otra zona ni otro formato', async () => {
    mockedLocations.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValue(SEDES);
    mockedList.mockResolvedValue(page({ items: [accepted] }));
    render(<AuditLogView token="tok" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Falta un dato de la sede');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Sin reloj no se pide nada: no se puede pintar.
    expect(mockedList).not.toHaveBeenCalled();
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    expect(
      within(table).getByText('Invitación aceptada · Rol: Asistente · Sedes: 2 sedes que ya no existen'),
    ).toBeInTheDocument();
    expect(table).not.toHaveTextContent(CENTRO);
  });

  it('DX-362: a la sede de la pantalla le falta el formato: aviso de la sede, sin ninguna hora', async () => {
    mockedLocations.mockResolvedValue([clinicLocation({ id: 'bogota', hourCycle: null })]);
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falta un dato de la sede');
    expect(screen.queryByText(/UTC/)).not.toBeInTheDocument();
  });

  it('DX-362: mientras carga el reloj de la sede, esqueleto y ninguna consulta', async () => {
    mockedLocations.mockReturnValue(new Promise(() => {}));
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);
    await waitFor(() => expect(mockedLocations).toHaveBeenCalled());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('DX-362: el mismo instante en tres sedes se lee igual; la hora de su sede, debajo', async () => {
    mockedList.mockResolvedValue(
      page({
        items: [
          { ...view, id: 'ev-bog', locationId: 'bogota', timeZone: 'America/Bogota' },
          { ...view, id: 'ev-ber', locationId: 'berlin', timeZone: 'Europe/Berlin' },
          { ...view, id: 'ev-ny', locationId: 'nueva-york', timeZone: 'America/New_York' },
        ],
      }),
    );
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const [, bog, ber, ny] = within(table).getAllByRole('row');
    for (const row of [bog, ber, ny]) {
      const time = within(row).getByText('15/10/2026 10:30 p. m.');
      expect(time.closest('time')).toHaveAttribute('dateTime', '2026-10-16T03:30:00.000Z');
      expect(within(row).getByText('UTC−5')).toBeInTheDocument();
    }
    expect(within(bog).queryByText(/^En /)).not.toBeInTheDocument();
    expect(within(ber).getByText('En Berlín: 16/10/2026 05:30 UTC+2')).toBeInTheDocument();
    expect(within(ny).getByText('En Nueva York: 10/15/2026 11:30 p. m. UTC−4')).toBeInTheDocument();
  });

  it('DX-362: el orden visible es el de la API (por instante), cronológico en la hora de la pantalla', async () => {
    mockedList.mockResolvedValue(
      page({
        items: [
          // Más reciente primero; en su propia zona Berlín parecería «la más tarde».
          { ...view, id: 'a', occurredAt: '2026-10-16T05:00:00.000Z', locationId: 'nueva-york', timeZone: 'America/New_York' },
          { ...view, id: 'b', occurredAt: '2026-10-16T04:00:00.000Z', locationId: 'bogota', timeZone: 'America/Bogota' },
          { ...view, id: 'c', occurredAt: '2026-10-16T03:00:00.000Z', locationId: 'berlin', timeZone: 'Europe/Berlin' },
        ],
      }),
    );
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    const times = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('time')?.textContent);
    expect(times).toEqual(['16/10/2026 12:00 a. m.', '15/10/2026 11:00 p. m.', '15/10/2026 10:00 p. m.']);
  });

  it('DX-362: junto a los filtros dice con qué zona se leen las horas y los días, y el orden', async () => {
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);
    await screen.findByRole('table');
    const hint = screen.getByText(/^Horas y días en la hora de Bogotá \(America\/Bogota, UTC−5\)\. Lo más reciente, arriba\.$/);
    // El campo del periodo (el grupo de react-aria) lleva la descripción.
    expect(screen.getByRole('group', { name: 'Período' }).getAttribute('aria-describedby')).toContain(hint.id);
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

  it('las fechas se interpretan en la zona de la pantalla (días completos, ambos incluidos)', async () => {
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);
    await screen.findByRole('table');
    await typeRange('2026-10-01', '2026-10-16');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', {
        limit: 50,
        from: '2026-10-01T05:00:00.000Z',
        to: '2026-10-17T05:00:00.000Z',
      }),
    );
  });

  it('DX-362: con otra sede activa, las horas y los días van en su zona (Berlín)', async () => {
    setActiveLocationId('berlin');
    mockedList.mockResolvedValue(page({ items: [{ ...view, locationId: 'bogota' }] }));
    render(<AuditLogView token="tok" />);
    const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
    expect(within(table).getByText('16/10/2026 05:30')).toBeInTheDocument();
    expect(within(table).getByText('UTC+2')).toBeInTheDocument();
    expect(within(table).getByText('En Bogotá: 15/10/2026 10:30 p. m. UTC−5')).toBeInTheDocument();
    expect(screen.getByText(/^Horas y días en la hora de Berlín \(Europe\/Berlin, UTC[+−]\d\)/)).toBeInTheDocument();

    // Berlín pasa a UTC+1 el 25/10: cada día se cuenta con su propio desfase.
    await typeRange('2026-10-24', '2026-10-25');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', {
        limit: 50,
        from: '2026-10-23T22:00:00.000Z',
        to: '2026-10-25T23:00:00.000Z',
      }),
    );
    // Nunca con otra zona: ninguna consulta con el día contado en Bogotá.
    expect(mockedList).not.toHaveBeenCalledWith('tok', expect.objectContaining({ from: '2026-10-24T05:00:00.000Z' }));
  });

  it('DX-362: al cambiar de sede activa sigue su zona y vuelve a la primera página', async () => {
    mockedList.mockResolvedValue(page({ nextCursor: 'c-2' }));
    render(<AuditLogView token="tok" />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', { limit: 50, cursor: 'c-2' }));

    act(() => setActiveLocationId('berlin'));
    expect(await screen.findByText(/^Horas y días en la hora de Berlín/)).toBeInTheDocument();
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', { limit: 50 }));
    expect(await screen.findAllByText('16/10/2026 05:30')).not.toHaveLength(0);
  });

  it('un rango invertido se explica junto a las fechas y no se consulta', async () => {
    mockedList.mockResolvedValue(page());
    render(<AuditLogView token="tok" />);
    await screen.findByRole('table');
    const calls = mockedList.mock.calls.length;
    await typeRangeEnd('Hasta', '2026-10-01');
    await typeRangeEnd('Desde', '2026-10-10');
    expect(
      await screen.findByText('La fecha final no puede ser anterior a la inicial.'),
    ).toBeInTheDocument();
    // DX-362: con el error, las fechas siguen diciendo en qué zona se cuentan los días.
    const error = screen.getByText('La fecha final no puede ser anterior a la inicial.');
    const hint = screen.getByText(/^Horas y días en la hora de Bogotá/);
    const ids = screen.getByRole('group', { name: 'Período' }).getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(ids).toEqual(expect.arrayContaining([error.closest('[id]')!.id, hint.id]));
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
    expect(await screen.findByRole('combobox', { name: 'Usuario' })).toBeInTheDocument();
  });
  describe('DX-360: qué cambió en la configuración', () => {
    const typeEdit: AuditEvent = {
      ...view,
      id: 'ev-cfg-1',
      action: 'UPDATE',
      resourceType: 'APPOINTMENT_TYPE',
      resourceId: 'at-1',
      patient: null,
      metadata: {
        reason: 'APPOINTMENT_TYPE_UPDATED',
        changedFields: ['color', 'durationMinutes'],
        configChange: {
          before: { color: '#0E7490', durationMinutes: 60 },
          after: { color: '#B45309', durationMinutes: 75 },
        },
      },
    };
    const payerCreate: AuditEvent = {
      ...typeEdit,
      id: 'ev-cfg-2',
      action: 'CREATE',
      resourceType: 'PAYER',
      metadata: { reason: 'PAYER_CREATED', configChange: { after: { name: 'Sanitas', active: true } } },
    };
    const itemDelete: AuditEvent = {
      ...typeEdit,
      id: 'ev-cfg-3',
      action: 'DELETE',
      resourceType: 'INVENTORY_ITEM',
      metadata: { reason: 'INVENTORY_ITEM_DELETED', configChange: { before: { name: 'Guantes', sku: null } } },
    };

    /** Los pares término → definición de la lista del cambio de una fila. */
    function pairs(row: HTMLElement): [string, string][] {
      const list = row.querySelector('dl');
      if (!list) throw new Error('sin lista de cambios');
      return within(list as HTMLElement)
        .getAllByRole('term')
        .map((term) => [term.textContent ?? '', visibleText(term.nextElementSibling)]);
    }

    /** El texto que se ve (sin el «a» solo para el lector), con los espacios normalizados. */
    function visibleText(node: Element | null): string {
      const clone = node?.cloneNode(true) as HTMLElement | undefined;
      clone?.querySelectorAll('.sr-only').forEach((n) => n.remove());
      return (clone?.textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    it('edición: el recurso y cada campo con su antes y su después, en una lista de definición', async () => {
      mockedList.mockResolvedValue(page({ items: [typeEdit] }));
      render(<AuditLogView token="tok" />);
      const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
      const [, row] = within(table).getAllByRole('row');
      expect(within(row).getByText('Tipo de cita')).toBeInTheDocument();
      expect(pairs(row)).toEqual([
        ['Duración:', '60 → 75 min'],
        ['Color:', '#0E7490 → #B45309'],
      ]);
      // La flecha no se lee como «flecha»: el lector dice «de 60 a 75 min».
      const dd = within(row).getAllByRole('definition')[0];
      expect(within(dd).getByText('→')).toHaveAttribute('aria-hidden');
      expect(dd.querySelector('.sr-only')?.textContent).toBe(' a ');
      // Sin depender del color: el valor no va pintado de un tono semántico.
      expect(dd.className).not.toMatch(/success|danger|warning/);
    });

    it('alta: solo los valores nuevos; retiro: los anteriores; null como «—»', async () => {
      mockedList.mockResolvedValue(page({ items: [payerCreate, itemDelete] }));
      render(<AuditLogView token="tok" />);
      const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
      const [, created, deleted] = within(table).getAllByRole('row');
      expect(pairs(created)).toEqual([
        ['Nombre:', 'Sanitas'],
        ['Activo:', 'Sí'],
      ]);
      expect(created).not.toHaveTextContent('→');
      expect(pairs(deleted)).toEqual([
        ['Nombre:', 'Guantes'],
        ['SKU:', '—'],
      ]);
    });

    it('un evento sin cambio de configuración no añade lista', async () => {
      mockedList.mockResolvedValue(page());
      render(<AuditLogView token="tok" />);
      const table = await screen.findByRole('table', { name: 'Registro de auditoría' });
      expect(table.querySelector('dl')).toBeNull();
      expect(within(table).queryByRole('term')).not.toBeInTheDocument();
    });

    it('en el teléfono, la misma lista en la tarjeta, que se parte en vez de desbordar', async () => {
      const original = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
      try {
        mockedList.mockResolvedValue(page({ items: [typeEdit] }));
        render(<AuditLogView token="tok" />);
        const cards = await screen.findByRole('list', { name: 'Registro de auditoría' });
        const [card] = within(cards).getAllByRole('listitem');
        expect(pairs(card)).toEqual([
          ['Duración:', '60 → 75 min'],
          ['Color:', '#0E7490 → #B45309'],
        ]);
        expect(card.querySelector('dl')?.className).toMatch(/overflow-wrap:anywhere/);
      } finally {
        window.matchMedia = original;
      }
    });
  });
});
