import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import {
  createDefaultPatientRecall,
  listRecallDue,
  listRecallTypes,
  listRecallUnconfigured,
  type RecallUnconfiguredItem,
  type RecallDueItem,
  type RecallDuePage,
  type RecallType,
} from '@/lib/recall/recall-api';
import { overdueLabel, recallMessage } from '@/lib/recall/presentation';
import { RecallView, recallCopy } from './recall-view';
import { recallUnconfiguredCopy } from './recall-unconfigured-list';
import { recallDefaultCopy } from './recall-default-dialog';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn().mockResolvedValue('Clínica Sol') }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
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
  ...over,
});
const page = (items: RecallDueItem[]): RecallDuePage => ({ items, total: items.length, page: 1, pageSize: 20 });

describe('RecallView (DX-015)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedTypes.mockReset();
    mockedTypes.mockResolvedValue(TYPES);
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([clinicLocation({ id: 'l1' })]);
  });

  it('DX-354b: el vencimiento y el último contacto de cada fila salen con el formato y el reloj de SU sede', async () => {
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([
      { ...STAMP_SEDES.caracas, id: 'l1' },
      STAMP_SEDES.berlin,
      STAMP_SEDES.miami,
    ]);
    const contact = { channel: 'CALL', outcome: 'NO_ANSWER', createdAt: '2026-10-20T15:00:00.000Z' } as const;
    mockedList.mockResolvedValue(
      page([
        item({ recallId: 'r1', patientName: 'Ana Pérez', locationId: 'l1', lastContact: contact }),
        item({ recallId: 'r2', patientName: 'Luis Gómez', locationId: STAMP_SEDES.berlin.id, lastContact: contact }),
        item({ recallId: 'r3', patientName: 'Eva Ruiz', locationId: STAMP_SEDES.miami.id, lastContact: contact }),
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
        item({ lastContact: { channel: 'CALL', outcome: 'NO_ANSWER', createdAt: '2026-10-20T15:00:00.000Z' } }),
      ]),
    );
    render(<RecallView token="tok" />);
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(row).getByText('Hace 22 días')).toBeInTheDocument();
    expect(within(row).getByText('Llamada · No contesta')).toBeInTheDocument();
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
    mockedCreate.mockResolvedValue({ recalls: [], contacts: [], recallUpdates: [] });
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
    expect(await within(dialog).findByText(recallDefaultCopy.alreadySet)).toBeInTheDocument();
  });
});
