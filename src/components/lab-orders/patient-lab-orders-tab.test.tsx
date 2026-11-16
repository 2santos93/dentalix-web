import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientLabOrdersTab } from './patient-lab-orders-tab';
import {
  cancelLabOrder,
  createLabOrder,
  listDentalLabs,
  listPatientLabOrders,
  receiveLabOrder,
  sendLabOrder,
  suggestLabOrderDueDate,
} from '@/lib/lab-orders/lab-orders-api';
import { listAppointments } from '@/lib/appointments/appointments-api';
import { listCatalogItems } from '@/lib/odontogram/catalog-api';
import { getPlan, listPlans } from '@/lib/treatment-plans/treatment-plans-api';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { tokenFor } from '@/lib/test/prescriptions';
import { labOrderPage, makeDentalLab, makeLabOrder, makeOverdueLabOrder } from '@/lib/test/lab-orders';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1' })]),
}));
jest.mock('../../lib/lab-orders/lab-orders-api', () => ({
  ...jest.requireActual('../../lib/lab-orders/lab-orders-api'),
  listPatientLabOrders: jest.fn(),
  listDentalLabs: jest.fn(),
  createLabOrder: jest.fn(),
  sendLabOrder: jest.fn(),
  receiveLabOrder: jest.fn(),
  cancelLabOrder: jest.fn(),
  suggestLabOrderDueDate: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/treatment-plans-api'),
  listPlans: jest.fn(),
  getPlan: jest.fn(),
}));
jest.mock('../../lib/odontogram/catalog-api', () => ({
  ...jest.requireActual('../../lib/odontogram/catalog-api'),
  listCatalogItems: jest.fn(),
}));
jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  listAppointments: jest.fn(),
}));

const mockedList = jest.mocked(listPatientLabOrders);
const DENTIST = tokenFor('DENTIST', 'u-dentist');
const RECEPTION = tokenFor('RECEPTION', 'u-rec');
const TABLE = 'Órdenes de laboratorio del paciente';

describe('PatientLabOrdersTab (DX-017)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
    jest.mocked(listDentalLabs).mockResolvedValue([makeDentalLab()]);
    jest.mocked(suggestLabOrderDueDate).mockResolvedValue({ dueOn: '2026-11-23', from: '2026-11-16', leadTimeBusinessDays: 5 });
    jest.mocked(listAppointments).mockResolvedValue([]);
    jest.mocked(listPlans).mockResolvedValue([{ id: 'plan1', status: 'ACCEPTED' }] as never);
    jest.mocked(getPlan).mockResolvedValue({
      id: 'plan1',
      status: 'ACCEPTED',
      items: [{ id: 'item1', toothNumber: '16', catalogItemId: 'cat-crown', cancellationFeeAppointmentId: null }],
    } as never);
    jest.mocked(listCatalogItems).mockResolvedValue([{ id: 'cat-crown', labelEs: 'Corona de zirconio' }] as never);
  });

  it('cargando: esqueleto anunciado', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    expect(screen.getByRole('status', { name: 'Cargando los trabajos de laboratorio' })).toBeInTheDocument();
  });

  it('vacío: el odontólogo ve «Nueva orden» y el enlace a «Trabajos de laboratorio»', async () => {
    mockedList.mockResolvedValue(labOrderPage([]));
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByText('Aún no hay trabajos de laboratorio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva orden' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trabajos de laboratorio' })).toHaveAttribute('href', '/laboratorio');
  });

  it.each(['RECEPTION', 'ASSISTANT'])('%s no ve «Nueva orden»', async (role) => {
    mockedList.mockResolvedValue(labOrderPage([]));
    render(<PatientLabOrdersTab token={tokenFor(role, 'u-x')} patientId="p1" />);
    await screen.findByText('Aún no hay trabajos de laboratorio');
    expect(screen.queryByRole('button', { name: 'Nueva orden' })).not.toBeInTheDocument();
  });

  it('error de carga con «Reintentar» (escalón 1)', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó')).mockResolvedValueOnce(labOrderPage([makeLabOrder()]));
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los trabajos de laboratorio.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: TABLE })).toBeInTheDocument();
  });

  it('lista el trabajo, el laboratorio, los dientes, la fecha prometida y la atrasada en rojo con los días', async () => {
    mockedList.mockResolvedValue(
      labOrderPage([
        makeOverdueLabOrder({ replacesOrder: { id: 'lo0', number: 7 } }),
        makeLabOrder({
          id: 'lo3',
          number: 4,
          status: 'CANCELLED',
          cancelledAt: '2026-11-12T10:00:00.000Z',
          cancelReason: 'El paciente pospuso el tratamiento',
        }),
      ]),
    );
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    const [, overdue, cancelled] = within(table).getAllByRole('row');
    expect(overdue).toHaveTextContent('Corona de zirconio');
    expect(overdue).toHaveTextContent('N.º 9');
    expect(overdue).toHaveTextContent('Corrige la orden N.º 7');
    expect(overdue).toHaveTextContent('Laboratorio Dental Caracas');
    expect(overdue).toHaveTextContent('16');
    expect(overdue).toHaveTextContent('Enviada');
    expect(overdue).toHaveTextContent('Atrasada · 3 días de atraso');
    await waitFor(() => expect(overdue).toHaveTextContent('10/11/2026'));
    expect(cancelled).toHaveTextContent('Anulada');
    expect(cancelled).toHaveTextContent('Motivo: El paciente pospuso el tratamiento');
  });

  it('recepción envía y recibe, pero no anula ni corrige', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue(labOrderPage([makeOverdueLabOrder()]));
    jest.mocked(receiveLabOrder).mockResolvedValue(
      makeOverdueLabOrder({ status: 'RECEIVED', overdue: false, daysOverdue: null, receivedAt: '2026-11-16T10:00:00.000Z' }),
    );
    render(<PatientLabOrdersTab token={RECEPTION} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    await user.click(screen.getByRole('button', { name: 'Acciones de Orden N.º 9 · Corona de zirconio' }));
    expect(await screen.findByRole('menuitem', { name: 'Recibir' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Anular' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Corregir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Imprimir' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Recibir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recibir la orden N.º 9' });
    await user.click(within(dialog).getByRole('button', { name: 'Marcar recibida' }));
    await waitFor(() => expect(receiveLabOrder).toHaveBeenCalledWith(RECEPTION, 'lo2'));
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Recibida'));
    expect(within(table).getAllByRole('row')[1]).not.toHaveTextContent('Atrasada');
  });

  it('«Enviar» confirma con la fecha prometida sugerida desde hoy', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue(labOrderPage([makeLabOrder()]));
    jest.mocked(sendLabOrder).mockResolvedValue(makeLabOrder({ status: 'SENT', dueOn: '2026-11-23', sentAt: '2026-11-16T10:00:00.000Z' }));
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    await screen.findByRole('table', { name: TABLE });
    await user.click(screen.getByRole('button', { name: 'Acciones de Orden N.º 12 · Corona de zirconio' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Enviar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enviar la orden N.º 12' });
    expect(await within(dialog).findByText(/Sugerida: 5 días hábiles desde hoy/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(sendLabOrder).toHaveBeenCalledWith(DENTIST, 'lo1', '2026-11-23'));
  });

  it('«Anular» exige el motivo', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue(labOrderPage([makeLabOrder()]));
    jest.mocked(cancelLabOrder).mockResolvedValue(
      makeLabOrder({ status: 'CANCELLED', cancelledAt: '2026-11-16T10:00:00.000Z', cancelReason: 'Repetida' }),
    );
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    const table = await screen.findByRole('table', { name: TABLE });
    await user.click(screen.getByRole('button', { name: 'Acciones de Orden N.º 12 · Corona de zirconio' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Anular' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular la orden N.º 12' });
    const reason = within(dialog).getByLabelText('Motivo de la anulación');
    await user.type(reason, 'no');
    await user.click(within(dialog).getByRole('button', { name: 'Anular orden' }));
    expect(await within(dialog).findByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    expect(cancelLabOrder).not.toHaveBeenCalled();
    await user.clear(reason);
    await user.type(reason, 'Repetida');
    await user.click(within(dialog).getByRole('button', { name: 'Anular orden' }));
    await waitFor(() => expect(cancelLabOrder).toHaveBeenCalledWith(DENTIST, 'lo1', 'Repetida'));
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Motivo: Repetida'));
  });

  it('desde el ítem del plan: «Nueva orden» abierta con el diente y la prestación, y la fecha sugerida', async () => {
    const user = setupUser();
    const onShortcutConsumed = jest.fn();
    mockedList.mockResolvedValue(labOrderPage([]));
    jest.mocked(createLabOrder).mockResolvedValue(makeLabOrder({ treatmentPlanItem: { id: 'item1', planId: 'plan1', toothNumber: '16', procedureName: 'Corona de zirconio' } }));
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" planItemId="item1" onShortcutConsumed={onShortcutConsumed} />);
    const dialog = await screen.findByRole('dialog', { name: 'Nueva orden de laboratorio' });
    await waitFor(() => expect(within(dialog).getByLabelText('Trabajo')).toHaveValue('Corona de zirconio'));
    expect(within(dialog).getByLabelText('Ítem del plan (opcional)')).toHaveValue('item1');
    expect(within(dialog).getByText('16')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Laboratorio'), 'lab1');
    await user.selectOptions(within(dialog).getByLabelText('Servicio (opcional)'), 'svc1');
    expect(await within(dialog).findByText(/Sugerida: 5 días hábiles/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() =>
      expect(createLabOrder).toHaveBeenCalledWith(
        DENTIST,
        'p1',
        expect.objectContaining({
          labId: 'lab1',
          serviceId: 'svc1',
          description: 'Corona de zirconio',
          toothNumbers: ['16'],
          dueOn: '2026-11-23',
          treatmentPlanItemId: 'item1',
        }),
      ),
    );
    await waitFor(() => expect(onShortcutConsumed).toHaveBeenCalled());
    expect(await screen.findByRole('table', { name: TABLE })).toHaveTextContent('Del plan: Corona de zirconio · diente 16');
  });

  it('«Nueva orden» sin laboratorios: pide el laboratorio y no deja guardar', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue(labOrderPage([]));
    jest.mocked(listDentalLabs).mockResolvedValue([]);
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: 'Nueva orden' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva orden de laboratorio' });
    expect(await within(dialog).findByText('La clínica aún no tiene laboratorios dentales')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Guardar borrador' })).toBeDisabled();
  });

  it('«Corregir» una enviada crea una orden nueva con `replacesOrderId`', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue(labOrderPage([makeOverdueLabOrder()]));
    jest.mocked(createLabOrder).mockResolvedValue(makeLabOrder({ id: 'lo9', number: 13, replacesOrder: { id: 'lo2', number: 9 } }));
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    await screen.findByRole('table', { name: TABLE });
    await user.click(screen.getByRole('button', { name: 'Acciones de Orden N.º 9 · Corona de zirconio' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Corregir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Corregir la orden N.º 9' });
    await waitFor(() => expect(within(dialog).getByLabelText('Laboratorio')).toHaveValue('lab1'));
    await user.click(within(dialog).getByRole('button', { name: 'Crear orden corregida' }));
    await waitFor(() =>
      expect(createLabOrder).toHaveBeenCalledWith(
        DENTIST,
        'p1',
        expect.objectContaining({ replacesOrderId: 'lo2', description: 'Corona de zirconio', shade: 'A2' }),
      ),
    );
  });
});
