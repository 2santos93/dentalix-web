import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import {
  createDefaultPatientRecall,
  createRecallContact,
  listRecallDue,
  listRecallTypes,
  listRecallUnconfigured,
  type RecallUnconfiguredItem,
  type RecallDueItem,
  type RecallDuePage,
  type RecallType,
} from '@/lib/recall/recall-api';
import { overdueLabel, recallMessage } from '@/lib/recall/presentation';
import { callbackCopy, recallWriteBusyMessage } from '@/lib/recall/attempts-presentation';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { addCivilDays } from '@/lib/time/wall-clock';
import { typeDate } from '@/components/patients/date-test-utils';
import { selectionBarCopy } from './recall-selection-bar';
import { batchContactCopy } from './recall-batch-contact-dialog';
import { createRecallContactsBatch } from '@/lib/recall/recall-attempts-api';
import { WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';
import { RecallView, recallCopy } from './recall-view';
import { recallUnconfiguredCopy } from './recall-unconfigured-list';
import { recallDefaultCopy } from './recall-default-dialog';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn().mockResolvedValue('Clínica Sol') }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
// «Agendar» tiene sus tests (recall-schedule-dialog.test.tsx): aquí, qué le llega.
jest.mock('./recall-schedule-dialog', () => ({
  RecallScheduleDialog: (props: {
    appointmentTypeId?: string | null;
    defaultChannel?: string;
    note?: string;
    onCreated: (a: { id: string }) => void;
  }) => (
    <div
      role="dialog"
      aria-label="Agendar cita"
      data-type={props.appointmentTypeId ?? ''}
      data-channel={props.defaultChannel ?? ''}
      data-note={props.note ?? ''}
    >
      <button type="button" onClick={() => props.onCreated({ id: 'ap-1' })}>
        Crear cita
      </button>
    </div>
  ),
}));
jest.mock('../../lib/recall/recall-attempts-api', () => ({ createRecallContactsBatch: jest.fn() }));
jest.mock('../../lib/recall/recall-api', () => ({
  listRecallDue: jest.fn(),
  listRecallTypes: jest.fn(),
  createRecallContact: jest.fn(),
  listRecallUnconfigured: jest.fn(),
  createDefaultPatientRecall: jest.fn(),
  announceRecallChanged: jest.fn(),
  isRecallAlreadySet: jest.requireActual('../../lib/recall/recall-api').isRecallAlreadySet,
}));
const mockedList = listRecallDue as jest.MockedFunction<typeof listRecallDue>;
const mockedTypes = jest.mocked(listRecallTypes);
const TYPES: RecallType[] = [
  ['t-hyg', 'Higiene', 'HYGIENE', 10, 6],
  ['t-ctl', 'Control', 'CHECKUP', 20, 12],
  ['t-perio', 'Mantenimiento periodontal', null, 30, 3],
  ['t-old', 'Ortodoncia retenida', null, 40, 12],
].map(([id, name, systemKey, sortOrder, months]) => ({
  id: id as string,
  name: name as string,
  systemKey: systemKey as RecallType['systemKey'],
  sortOrder: sortOrder as number,
  defaultIntervalMonths: months as number,
  active: id !== 't-old',
  exclusionGroup: null,
  appointmentTypeId: id === 't-ctl' ? 'a-val' : null,
  triggerCatalogItemIds: [],
  triggers: [],
}));

const item = (over: Partial<RecallDueItem> = {}): RecallDueItem => ({
  recallId: 'r1',
  patientId: 'p1',
  patientName: 'Ana Pérez',
  patientPhone: '+58 412 555 0101',
  patientWhatsApp: '584125550101',
  reminderOptedOut: false,
  kind: 'CHECKUP',
  recallTypeId: 't-ctl',
  recallTypeName: 'Control',
  intervalMonths: 6,
  baseDate: '2026-04-10',
  dueAt: '2026-10-10',
  daysOverdue: 22,
  locationId: 'l1',
  lastContact: null,
  lastAttempt: null,
  attempts: 0,
  maxAttempts: 3,
  exhausted: false,
  hiddenUntil: null,
  callbackOn: null,
  phoneReview: false,
  ...over,
});
const page = (items: RecallDueItem[]): RecallDuePage => ({ items, total: items.length, page: 1, pageSize: 20 });


const afterTestCleanups: Array<() => void> = [];
afterEach(() => {
  while (afterTestCleanups.length) afterTestCleanups.pop()!();
});

describe('RecallView (DX-015)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedTypes.mockReset();
    mockedTypes.mockResolvedValue(TYPES);
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([clinicLocation({ id: 'l1' })]);
    // DX-465: los filtros viven en la URL; cada test empieza sin ellos.
    window.history.replaceState(null, '', '/recall');
  });

  it('DX-354b: el vencimiento y el último contacto de cada fila salen con el formato y el reloj de SU sede', async () => {
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([
      { ...STAMP_SEDES.caracas, id: 'l1' },
      STAMP_SEDES.berlin,
      STAMP_SEDES.miami,
    ]);
    const contact = { channel: 'CALL', outcome: 'NO_ANSWER', createdAt: '2026-10-20T15:00:00.000Z' } as const;
    const attempt = { channel: 'CALL', outcome: 'NO_ANSWER', at: contact.createdAt } as const;
    const last = { lastContact: contact, lastAttempt: attempt };
    mockedList.mockResolvedValue(
      page([
        item({ recallId: 'r1', patientName: 'Ana Pérez', locationId: 'l1', ...last }),
        item({ recallId: 'r2', patientName: 'Luis Gómez', locationId: STAMP_SEDES.berlin.id, ...last }),
        item({ recallId: 'r3', patientName: 'Eva Ruiz', locationId: STAMP_SEDES.miami.id, ...last }),
      ]),
    );
    render(<RecallView token="tok" />);
    const expected = (key: 'caracas' | 'berlin' | 'miami') => ({
      due: STAMP_FORMATS[key].civilDate('2026-10-10'),
      last: STAMP_FORMATS[key].dateTime(new Date(contact.createdAt), STAMP_SEDES[key].timeZone!),
    });
    for (const [name, key] of [['Ana Pérez', 'caracas'], ['Luis Gómez', 'berlin'], ['Eva Ruiz', 'miami']] as const) {
      const row = (await screen.findByText(name)).closest('tr')!;
      await waitFor(() => expect(row).toHaveTextContent(expected(key).due));
      expect(row).toHaveTextContent(expected(key).last);
    }
  });

  it('vacío: «Nadie pendiente de control»', async () => {
    mockedList.mockResolvedValue(page([]));
    render(<RecallView token="tok" />);
    expect(await screen.findByText(recallCopy.emptyTitle)).toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a cargar', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce(page([item()]));
    render(<RecallView token="tok" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });

  it('403: el aviso en español, sin filtros', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'no'));
    render(<RecallView token="tok" />);
    expect(await screen.findByText(recallCopy.forbiddenTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText(recallCopy.kindLabel)).not.toBeInTheDocument();
  });

  it('pinta la fila con llamar, WhatsApp sin datos clínicos, vencimiento y último contacto', async () => {
    mockedList.mockResolvedValue(
      page([
        item({
          lastContact: { channel: 'CALL', outcome: 'NO_ANSWER', createdAt: '2026-10-20T15:00:00.000Z' },
          lastAttempt: { channel: 'CALL', outcome: 'NO_ANSWER', at: '2026-10-20T15:00:00.000Z' },
          attempts: 1,
        }),
      ]),
    );
    render(<RecallView token="tok" />);
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(row).getByText('Hace 22 días')).toBeInTheDocument();
    expect(within(row).getByText('No contesta · Llamada')).toBeInTheDocument();
    expect(within(row).getByText('1 de 3')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /^Llamar a Ana Pérez/ })).toHaveAttribute('href', 'tel:+584125550101');
    await waitFor(() =>
      expect(within(row).getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toContain('Cl%C3%ADnica%20Sol'),
    );
  });

  it('con baja de avisos no ofrece llamar ni WhatsApp, pero sí agendar', async () => {
    mockedList.mockResolvedValue(page([item({ reminderOptedOut: true, patientPhone: null, patientWhatsApp: null })]));
    render(<RecallView token="tok" />);
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(row).getByText(recallCopy.optedOut)).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: /Llamar|WhatsApp/ })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Acciones de Ana Pérez' }));
    expect(await screen.findByRole('menuitem', { name: recallCopy.schedule })).toBeInTheDocument();
  });

  describe('«Agendó» (DX-015-bis-4, D21–D23)', () => {
    async function openMenu(name: string) {
      const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
      await userEvent.click(within(row).getByRole('button', { name: 'Acciones de Ana Pérez' }));
      await userEvent.click(await screen.findByRole('menuitem', { name }));
    }

    it('«Agendar» pasa el tipo de cita del tipo de recall de la fila (una sola lectura de tipos)', async () => {
      mockedList.mockResolvedValue(page([item(), item({ recallId: 'r2', patientName: 'Luis Gómez', recallTypeId: 't-hyg' })]));
      render(<RecallView token="tok" />);
      await waitFor(() => expect(mockedTypes).toHaveBeenCalledTimes(1));
      await openMenu(recallCopy.schedule);
      const dialog = await screen.findByRole('dialog', { name: 'Agendar cita' });
      expect(dialog).toHaveAttribute('data-type', 'a-val');
      expect(dialog).toHaveAttribute('data-channel', '');
      expect(mockedTypes).toHaveBeenCalledTimes(1);
    });

    it('«Registrar intento» con «Agendó» no guarda: abre «Agendar» con el canal y la nota', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValue(page([item()]));
      render(<RecallView token="tok" />);
      await openMenu(recallCopy.register);
      const contact = await screen.findByRole('dialog', { name: 'Registrar intento' });
      await user.selectOptions(within(contact).getByLabelText('Canal'), 'WHATSAPP_LINK');
      await user.selectOptions(within(contact).getByLabelText('Resultado'), 'BOOKED');
      expect(within(contact).queryByRole('button', { name: 'Guardar intento' })).not.toBeInTheDocument();
      await user.type(within(contact).getByLabelText('Nota (opcional)'), 'Prefiere la tarde');
      await user.click(within(contact).getByRole('button', { name: 'Agendar cita…' }));

      const schedule = await screen.findByRole('dialog', { name: 'Agendar cita' });
      expect(schedule).toHaveAttribute('data-channel', 'WHATSAPP_LINK');
      expect(schedule).toHaveAttribute('data-note', 'Prefiere la tarde');
      expect(schedule).toHaveAttribute('data-type', 'a-val');
      expect(createRecallContact).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar intento' })).not.toBeInTheDocument());

      const calls = mockedList.mock.calls.length;
      await user.click(within(schedule).getByRole('button', { name: 'Crear cita' }));
      expect(await screen.findByText(recallCopy.scheduled('Ana Pérez'))).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Agendar cita' })).not.toBeInTheDocument();
      await waitFor(() => expect(mockedList.mock.calls.length).toBeGreaterThan(calls));
    });
  });

  it('filtra por tipo (los de la clínica), ventana y orden, volviendo a la página 1', async () => {
    mockedList.mockResolvedValue(page([item()]));
    render(<RecallView token="tok" />);
    await screen.findByText('Ana Pérez');
    const filter = screen.getByLabelText(recallCopy.kindLabel);
    await waitFor(() => expect(within(filter).getByRole('option', { name: 'Mantenimiento periodontal' })).toBeInTheDocument());
    // Un tipo desactivado no se ofrece.
    expect(within(filter).queryByRole('option', { name: 'Ortodoncia retenida' })).not.toBeInTheDocument();
    expect(within(filter).getAllByRole('option').map((o) => o.textContent)).toEqual([
      recallCopy.kindAll,
      'Higiene',
      'Control',
      'Mantenimiento periodontal',
    ]);
    await userEvent.selectOptions(filter, 't-perio');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.windowLabel), 'soon');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.sortLabel), 'LEAST_OVERDUE');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', {
        recallTypeId: 't-perio',
        withinDays: 30,
        sort: 'LEAST_OVERDUE',
        page: 1,
      }),
    );
  });

  it('mientras llegan los tipos el filtro solo ofrece «Todos» y está deshabilitado (revisión 1, MINOR-2)', async () => {
    let resolveTypes: (t: RecallType[]) => void = () => undefined;
    mockedTypes.mockReturnValue(new Promise<RecallType[]>((r) => (resolveTypes = r)));
    mockedList.mockResolvedValue(page([item()]));
    render(<RecallView token="tok" />);
    await screen.findByText('Ana Pérez');
    const filter = screen.getByLabelText(recallCopy.kindLabel);
    expect(filter).toBeDisabled();
    expect(within(filter).getAllByRole('option').map((o) => o.textContent)).toEqual([recallCopy.kindAll]);
    resolveTypes(TYPES);
    await waitFor(() => expect(filter).not.toBeDisabled());
    expect(within(filter).getByRole('option', { name: 'Higiene' })).toHaveValue('t-hyg');
  });

  it('DX-015-bis: la columna «Tipo» dice el nombre del tipo, también sin clave', async () => {
    mockedList.mockResolvedValue(
      page([item({ kind: null, recallTypeId: 't-perio', recallTypeName: 'Mantenimiento periodontal', intervalMonths: 3 })]),
    );
    render(<RecallView token="tok" />);
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(row).getByText('Mantenimiento periodontal')).toBeInTheDocument();
    expect(within(row).getByText('Cada 3 meses')).toBeInTheDocument();
  });

  it('si GET /recall-types falla, filtra por la clave (respaldo Higiene y Control)', async () => {
    mockedTypes.mockRejectedValue(new ApiError(500, 'boom'));
    mockedList.mockResolvedValue(page([item()]));
    render(<RecallView token="tok" />);
    await screen.findByText('Ana Pérez');
    const filter = screen.getByLabelText(recallCopy.kindLabel);
    expect(within(filter).getAllByRole('option').map((o) => o.textContent)).toEqual([
      recallCopy.kindAll,
      'Higiene',
      'Control',
    ]);
    await userEvent.selectOptions(filter, 'HYGIENE');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.windowLabel), 'soon');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.sortLabel), 'LEAST_OVERDUE');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', {
        kind: 'HYGIENE',
        withinDays: 30,
        sort: 'LEAST_OVERDUE',
        page: 1,
      }),
    );
  });
});

describe('presentación del recall', () => {
  it('días de vencido en palabras', () => {
    expect(overdueLabel(0)).toBe('Vence hoy');
    expect(overdueLabel(1)).toBe('Hace 1 día');
    expect(overdueLabel(-5)).toBe('Vence en 5 días');
  });
  it('el mensaje no lleva datos clínicos y cae en «la clínica»', () => {
    expect(recallMessage('Ana Pérez', null)).toBe(
      'Hola Ana, te escribimos de la clínica. Ya te toca tu control. ¿Te ayudamos a agendar tu cita?',
    );
  });
});

describe('RecallView · «Sin recall configurado» (DX-015-bis D17)', () => {
  const mockedUnconfigured = jest.mocked(listRecallUnconfigured);
  const mockedCreate = jest.mocked(createDefaultPatientRecall);
  const row = (over: Partial<RecallUnconfiguredItem> = {}): RecallUnconfiguredItem => ({
    patientId: 'p9',
    patientName: 'María Rondón',
    patientPhone: '+58 414 555 0199',
    patientWhatsApp: '584145550199',
    reminderOptedOut: false,
    lastVisitAt: '2026-09-15',
    lastVisitLocationId: 'l1',
    ...over,
  });

  beforeEach(() => {
    mockedList.mockReset();
    mockedList.mockResolvedValue(page([]));
    mockedTypes.mockReset();
    mockedTypes.mockResolvedValue(TYPES);
    mockedUnconfigured.mockReset();
    mockedCreate.mockReset();
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([
      { ...STAMP_SEDES.caracas, id: 'l1', name: 'Sede Chacao' },
    ]);
  });

  async function openUnconfigured() {
    render(<RecallView token="tok" />);
    await userEvent.click(await screen.findByRole('radio', { name: recallCopy.viewUnconfigured }));
  }

  it('lista paciente, teléfono, última visita con su sede y la baja de avisos', async () => {
    mockedUnconfigured.mockResolvedValue({
      items: [row(), row({ patientId: 'p8', patientName: 'Pedro Silva', patientPhone: null, reminderOptedOut: true })],
      total: 2,
      page: 1,
      pageSize: 20,
    });
    await openUnconfigured();
    const first = (await screen.findByText('María Rondón')).closest('tr')!;
    expect(within(first).getByText('+58 414 555 0199')).toBeInTheDocument();
    expect(within(first).getByText(STAMP_FORMATS.caracas.civilDate('2026-09-15'))).toBeInTheDocument();
    expect(within(first).getByText('Sede Chacao')).toBeInTheDocument();
    const second = screen.getByText('Pedro Silva').closest('tr')!;
    expect(within(second).getByText(recallUnconfiguredCopy.optedOut)).toBeInTheDocument();
    expect(within(second).getByText(recallUnconfiguredCopy.noPhone)).toBeInTheDocument();
    expect(mockedUnconfigured).toHaveBeenCalledWith('tok', { page: 1 });
    // Los filtros de «Vencidos» no aplican aquí.
    expect(screen.queryByLabelText(recallCopy.kindLabel)).toBeNull();
  });

  it('vacío propio', async () => {
    mockedUnconfigured.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    await openUnconfigured();
    expect(await screen.findByText(recallUnconfiguredCopy.emptyTitle)).toBeInTheDocument();
  });

  it('«Programar recall» elige un tipo activo (con su intervalo), llama a D15 y relee la lista', async () => {
    mockedUnconfigured
      .mockResolvedValueOnce({ items: [row()], total: 1, page: 1, pageSize: 20 })
      .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    mockedCreate.mockResolvedValue({ recalls: [], contacts: [], phoneReview: null, recallUpdates: [] });
    await openUnconfigured();
    const tr = (await screen.findByText('María Rondón')).closest('tr')!;
    await userEvent.click(within(tr).getByRole('button', { name: 'Acciones de María Rondón' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: recallUnconfiguredCopy.schedule }));
    const dialog = await screen.findByRole('dialog');
    const select = await within(dialog).findByLabelText(recallDefaultCopy.type);
    // Solo los activos, con su intervalo.
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Higiene · cada 6 meses',
      'Control · cada 12 meses',
      'Mantenimiento periodontal · cada 3 meses',
    ]);
    await userEvent.selectOptions(select, 't-perio');
    await userEvent.click(within(dialog).getByRole('button', { name: recallDefaultCopy.submit }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'p9', 't-perio');
    // Desde esta lista no va la cita: la base es la última visita atendida.
    expect(mockedCreate.mock.calls[0]).toHaveLength(3);
    expect(
      await screen.findByText(recallUnconfiguredCopy.scheduled('Mantenimiento periodontal', 'María Rondón')),
    ).toBeInTheDocument();
    expect(await screen.findByText(recallUnconfiguredCopy.emptyTitle)).toBeInTheDocument();
  });

  it('un 409 deja el diálogo abierto con el motivo', async () => {
    mockedUnconfigured.mockResolvedValue({ items: [row()], total: 1, page: 1, pageSize: 20 });
    mockedCreate.mockRejectedValue(new ApiError(409, 'Ya tiene un recall de ese tipo.'));
    await openUnconfigured();
    const tr = (await screen.findByText('María Rondón')).closest('tr')!;
    await userEvent.click(within(tr).getByRole('button', { name: 'Acciones de María Rondón' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: recallUnconfiguredCopy.schedule }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByLabelText(recallDefaultCopy.type);
    await userEvent.click(within(dialog).getByRole('button', { name: recallDefaultCopy.submit }));
    expect(await within(dialog).findByText(recallDefaultCopy.alreadySet('Higiene'))).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: recallDefaultCopy.openRecord })).toHaveAttribute('href', '/patients/p9');
  });
});

describe('RecallView · intentos (DX-465)', () => {
  const mockedContact = jest.mocked(createRecallContact);
  const mockedBatch = jest.mocked(createRecallContactsBatch);
  const today = sedeToday('America/Caracas');

  beforeEach(() => {
    mockedList.mockReset();
    mockedTypes.mockReset();
    mockedTypes.mockResolvedValue(TYPES);
    mockedContact.mockReset();
    mockedBatch.mockReset();
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([clinicLocation({ id: 'l1' })]);
    window.history.replaceState(null, '', '/recall');
  });

  it('pinta intentos y tope, «Llamar el», agotados y el teléfono por revisar', async () => {
    mockedList.mockResolvedValue(
      page([
        item({ attempts: 2, maxAttempts: 3, callbackOn: '2026-12-12', hiddenUntil: '2026-12-12' }),
        item({ recallId: 'r2', patientName: 'Luis Gómez', attempts: 3, exhausted: true, phoneReview: true }),
      ]),
    );
    render(<RecallView token="tok" />);
    const ana = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(ana).getByText('2 de 3')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(ana).getByText(recallCopy.callbackOn(STAMP_FORMATS.caracas.civilDate('2026-12-12')))).toBeInTheDocument(),
    );
    const luis = screen.getByText('Luis Gómez').closest('tr')!;
    expect(within(luis).getByText('3 de 3')).toBeInTheDocument();
    expect(within(luis).getByText(recallCopy.exhausted)).toBeInTheDocument();
    expect(within(luis).getByText(recallCopy.phoneReview)).toBeInTheDocument();
  });

  it('«Incluir contactados» e «Intentos agotados» van a la API y a la URL; la URL los trae al volver', async () => {
    mockedList.mockResolvedValue(page([item()]));
    const { unmount } = render(<RecallView token="tok" />);
    await screen.findByText('Ana Pérez');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.attemptsLabel), 'contacted');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', { includeContacted: true, sort: 'MOST_OVERDUE', page: 1 }),
    );
    expect(window.location.search).toBe('?intentos=contactados');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.attemptsLabel), 'exhausted');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', { exhausted: true, sort: 'MOST_OVERDUE', page: 1 }),
    );
    expect(window.location.search).toBe('?intentos=agotados');
    unmount();

    mockedList.mockClear();
    render(<RecallView token="tok" />);
    await screen.findByText('Ana Pérez');
    expect(screen.getByLabelText(recallCopy.attemptsLabel)).toHaveValue('exhausted');
    expect(mockedList).toHaveBeenCalledWith('tok', { exhausted: true, sort: 'MOST_OVERDUE', page: 1 });
  });

  it('vacío propio de «Intentos agotados»', async () => {
    window.history.replaceState(null, '', '/recall?intentos=agotados');
    mockedList.mockResolvedValue(page([]));
    render(<RecallView token="tok" />);
    expect(await screen.findByText(recallCopy.emptyExhaustedTitle)).toBeInTheDocument();
  });

  it('«Llamar luego» desde la fila pide el día y lo manda; sin él no guarda', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(page([item()]));
    mockedContact.mockResolvedValue({ outcome: 'CALL_BACK' } as never);
    render(<RecallView token="tok" />);
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Acciones de Ana Pérez' }));
    await user.click(await screen.findByRole('menuitem', { name: recallCopy.register }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar intento' });
    await user.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
    await user.selectOptions(within(dialog).getByLabelText('Resultado'), 'CALL_BACK');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar intento' }));
    expect(await within(dialog).findByText(callbackCopy.required)).toBeInTheDocument();
    expect(mockedContact).not.toHaveBeenCalled();

    const day = addCivilDays(today, 5);
    await typeDate(user, within(dialog).getByRole('group', { name: callbackCopy.label }), day);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar intento' }));
    await waitFor(() =>
      expect(mockedContact).toHaveBeenCalledWith('tok', 'r1', { channel: 'CALL', outcome: 'CALL_BACK', callbackOn: day }),
    );
    expect(await screen.findByText(recallCopy.contactSavedHidden('Ana Pérez'))).toBeInTheDocument();
  });

  it('DX-298: guardar un intento avisa a las listas del menú (WORK_QUEUES_CHANGED_EVENT)', async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    window.addEventListener(WORK_QUEUES_CHANGED_EVENT, changed);
    try {
      mockedList.mockResolvedValue(page([item()]));
      mockedContact.mockResolvedValue({ outcome: 'NO_ANSWER' } as never);
      render(<RecallView token="tok" />);
      const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
      await user.click(within(row).getByRole('button', { name: 'Acciones de Ana Pérez' }));
      await user.click(await screen.findByRole('menuitem', { name: recallCopy.register }));
      const dialog = await screen.findByRole('dialog', { name: 'Registrar intento' });
      await user.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
      await user.selectOptions(within(dialog).getByLabelText('Resultado'), 'NO_ANSWER');
      expect(changed).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Guardar intento' }));
      await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    } finally {
      window.removeEventListener(WORK_QUEUES_CHANGED_EVENT, changed);
    }
  });

  it('«Llamar luego» más allá de 90 días: el error junto al campo', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(page([item()]));
    render(<RecallView token="tok" />);
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    await user.click(within(row).getByRole('button', { name: 'Acciones de Ana Pérez' }));
    await user.click(await screen.findByRole('menuitem', { name: recallCopy.register }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar intento' });
    await user.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
    await user.selectOptions(within(dialog).getByLabelText('Resultado'), 'CALL_BACK');
    await typeDate(user, within(dialog).getByRole('group', { name: callbackCopy.label }), addCivilDays(today, 91));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar intento' }));
    expect(await within(dialog).findByText(callbackCopy.tooFar)).toBeInTheDocument();
    expect(mockedContact).not.toHaveBeenCalled();
  });

  describe('selección múltiple y lote', () => {
    const two = () =>
      page([item(), item({ recallId: 'r2', patientId: 'p2', patientName: 'Luis Gómez' })]);

    it('las casillas por fila y «Seleccionar todo» (accesibles por su nombre) muestran la barra', async () => {
      mockedList.mockResolvedValue(two());
      render(<RecallView token="tok" />);
      await screen.findByText('Ana Pérez');
      expect(screen.queryByRole('region', { name: selectionBarCopy.region })).toBeNull();
      await userEvent.click(screen.getByRole('checkbox', { name: recallCopy.selectRow('Ana Pérez') }));
      const bar = screen.getByRole('region', { name: selectionBarCopy.region });
      expect(within(bar).getByRole('button', { name: selectionBarCopy.register(1) })).toBeInTheDocument();
      const all = screen.getByRole('checkbox', { name: recallCopy.selectAll });
      expect(all).toBePartiallyChecked();
      await userEvent.click(all);
      expect(screen.getByRole('checkbox', { name: recallCopy.selectRow('Luis Gómez') })).toBeChecked();
      expect(within(bar).getByRole('button', { name: selectionBarCopy.register(2) })).toBeInTheDocument();
      await userEvent.click(all);
      expect(screen.queryByRole('region', { name: selectionBarCopy.region })).toBeNull();
    });

    it('registra el mismo intento para los marcados, recarga, limpia la selección y avisa a las listas del menú', async () => {
      const user = userEvent.setup();
      const changed = jest.fn();
      window.addEventListener(WORK_QUEUES_CHANGED_EVENT, changed);
      afterTestCleanups.push(() => window.removeEventListener(WORK_QUEUES_CHANGED_EVENT, changed));
      mockedList.mockResolvedValue(two());
      mockedBatch.mockResolvedValue({ contacts: [{}, {}] } as never);
      render(<RecallView token="tok" />);
      await screen.findByText('Ana Pérez');
      await user.click(screen.getByRole('checkbox', { name: recallCopy.selectAll }));
      await user.click(screen.getByRole('button', { name: selectionBarCopy.register(2) }));
      const dialog = await screen.findByRole('dialog', { name: batchContactCopy.title(2) });
      expect(within(dialog).getByText('Luis Gómez')).toBeInTheDocument();
      // Sin «Agendó» en el lote.
      expect(within(within(dialog).getByLabelText('Resultado')).queryByRole('option', { name: 'Agendó' })).toBeNull();
      await user.selectOptions(within(dialog).getByLabelText('Canal'), 'WHATSAPP_LINK');
      await user.selectOptions(within(dialog).getByLabelText('Resultado'), 'LEFT_MESSAGE');
      await user.type(within(dialog).getByLabelText('Nota (opcional)'), 'Mensaje de control');
      const calls = mockedList.mock.calls.length;
      await user.click(within(dialog).getByRole('button', { name: batchContactCopy.submit(2) }));
      expect(mockedBatch).toHaveBeenCalledWith('tok', {
        items: [{ recallId: 'r1' }, { recallId: 'r2' }],
        channel: 'WHATSAPP_LINK',
        outcome: 'LEFT_MESSAGE',
        note: 'Mensaje de control',
      });
      expect(await screen.findByText(recallCopy.batchSaved(2))).toBeInTheDocument();
      expect(changed).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(mockedList.mock.calls.length).toBeGreaterThan(calls));
      expect(screen.queryByRole('region', { name: selectionBarCopy.region })).toBeNull();
    });

    it('«Llamar luego» en lote exige el día y lo manda', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValue(two());
      mockedBatch.mockResolvedValue({ contacts: [{}, {}] } as never);
      render(<RecallView token="tok" />);
      await screen.findByText('Ana Pérez');
      await user.click(screen.getByRole('checkbox', { name: recallCopy.selectAll }));
      await user.click(screen.getByRole('button', { name: selectionBarCopy.register(2) }));
      const dialog = await screen.findByRole('dialog', { name: batchContactCopy.title(2) });
      await user.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
      await user.selectOptions(within(dialog).getByLabelText('Resultado'), 'CALL_BACK');
      await user.click(within(dialog).getByRole('button', { name: batchContactCopy.submit(2) }));
      expect(await within(dialog).findByText(callbackCopy.required)).toBeInTheDocument();
      const day = addCivilDays(today, 10);
      await typeDate(user, within(dialog).getByRole('group', { name: callbackCopy.label }), day);
      await user.click(within(dialog).getByRole('button', { name: batchContactCopy.submit(2) }));
      await waitFor(() =>
        expect(mockedBatch).toHaveBeenCalledWith('tok', {
          items: [{ recallId: 'r1' }, { recallId: 'r2' }],
          channel: 'CALL',
          outcome: 'CALL_BACK',
          callbackOn: day,
        }),
      );
    });

    it('404 con `recallIds`: dice quién ya no está, lo quita de la selección y no guarda nada', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValue(two());
      mockedBatch.mockRejectedValue(
        new ApiError(404, 'Algún recall de la lista no existe en esta clínica.', { recallIds: ['r2'] }),
      );
      render(<RecallView token="tok" />);
      await screen.findByText('Ana Pérez');
      await user.click(screen.getByRole('checkbox', { name: recallCopy.selectAll }));
      await user.click(screen.getByRole('button', { name: selectionBarCopy.register(2) }));
      const dialog = await screen.findByRole('dialog', { name: batchContactCopy.title(2) });
      await user.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
      await user.selectOptions(within(dialog).getByLabelText('Resultado'), 'NO_ANSWER');
      await user.click(within(dialog).getByRole('button', { name: batchContactCopy.submit(2) }));
      expect(await screen.findByText(batchContactCopy.missing(['Luis Gómez']))).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: batchContactCopy.title(1) })).toBeInTheDocument();
      // El diálogo sigue abierto (el resto de la pantalla queda inerte para el lector).
      expect(screen.getByRole('checkbox', { name: recallCopy.selectRow('Luis Gómez'), hidden: true })).not.toBeChecked();
    });

    it('409 RECALL_WRITE_BUSY: pide reintentar, sin cerrar', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValue(two());
      mockedBatch.mockRejectedValueOnce(new ApiError(409, 'busy', { code: 'RECALL_WRITE_BUSY' }));
      render(<RecallView token="tok" />);
      await screen.findByText('Ana Pérez');
      await user.click(screen.getByRole('checkbox', { name: recallCopy.selectRow('Ana Pérez') }));
      await user.click(screen.getByRole('button', { name: selectionBarCopy.register(1) }));
      const dialog = await screen.findByRole('dialog', { name: batchContactCopy.title(1) });
      await user.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
      await user.selectOptions(within(dialog).getByLabelText('Resultado'), 'NO_ANSWER');
      await user.click(within(dialog).getByRole('button', { name: batchContactCopy.submit(1) }));
      expect(await within(dialog).findByText(recallWriteBusyMessage)).toBeInTheDocument();
    });

    it('429 y 403: el motivo en el diálogo, sin cerrarlo', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValue(two());
      mockedBatch
        .mockRejectedValueOnce(new ApiError(429, 'Too Many Requests', { retryAfterSeconds: 30 }))
        .mockRejectedValueOnce(new ApiError(403, 'Forbidden', { code: 'LOCATION_NOT_ALLOWED' }));
      render(<RecallView token="tok" />);
      await screen.findByText('Ana Pérez');
      await user.click(screen.getByRole('checkbox', { name: recallCopy.selectRow('Ana Pérez') }));
      await user.click(screen.getByRole('button', { name: selectionBarCopy.register(1) }));
      const dialog = await screen.findByRole('dialog', { name: batchContactCopy.title(1) });
      await user.selectOptions(within(dialog).getByLabelText('Canal'), 'CALL');
      await user.selectOptions(within(dialog).getByLabelText('Resultado'), 'NO_ANSWER');
      await user.click(within(dialog).getByRole('button', { name: batchContactCopy.submit(1) }));
      expect(await within(dialog).findByText(/30 segundos/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: batchContactCopy.submit(1) }));
      expect(await within(dialog).findByText(batchContactCopy.forbidden)).toBeInTheDocument();
    });
  });
});
