import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientLabOrdersTab } from './patient-lab-orders-tab';
import { listPatientLabOrders, setLabOrderCost } from '@/lib/lab-orders/lab-orders-api';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { tokenFor } from '@/lib/test/prescriptions';
import { labOrderPage, makeLabOrder } from '@/lib/test/lab-orders';
import { labOrderCostCopy } from './lab-order-cost-dialog';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest
    .fn()
    .mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1', currency: 'USD' })]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'USD', name: 'Dólar estadounidense', digits: 2 },
    { code: 'VES', name: 'Bolívar', digits: 2 },
  ]),
}));
jest.mock('../../lib/lab-orders/lab-orders-api', () => ({
  ...jest.requireActual('../../lib/lab-orders/lab-orders-api'),
  listPatientLabOrders: jest.fn(),
  setLabOrderCost: jest.fn(),
}));

const ADMIN = tokenFor('ADMIN', 'u-admin');
const DENTIST = tokenFor('DENTIST', 'u-dentist');
const ACTIONS = 'Acciones de Orden N.º 12 · Corona de zirconio';
const PLAN_ITEM = { id: 'item1', planId: 'plan1', toothNumber: '16', procedureName: 'Corona de zirconio', planCurrency: 'USD' };

describe('Costo del laboratorio de una orden (DX-018-bis)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
  });

  it('ADMIN pone el costo en la moneda del plan y lo ve en la fila', async () => {
    const user = setupUser();
    const order = makeLabOrder({ status: 'SENT', treatmentPlanItem: PLAN_ITEM });
    jest.mocked(listPatientLabOrders).mockResolvedValue(labOrderPage([order]));
    jest.mocked(setLabOrderCost).mockResolvedValue({ ...order, cost: { amount: '120.00', currency: 'USD' } });
    render(<PatientLabOrdersTab token={ADMIN} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Órdenes de laboratorio del paciente' });
    await user.click(screen.getByRole('button', { name: ACTIONS }));
    await user.click(await screen.findByRole('menuitem', { name: 'Costo del laboratorio' }));
    const dialog = await screen.findByRole('dialog', { name: labOrderCostCopy.title('N.º 12') });
    await user.type(within(dialog).getByLabelText(labOrderCostCopy.amount), '120');
    await user.click(within(dialog).getByRole('button', { name: labOrderCostCopy.submit }));
    await waitFor(() =>
      expect(setLabOrderCost).toHaveBeenCalledWith(ADMIN, order.id, { amount: '120.00', currency: 'USD' }),
    );
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent(/Costo .*120,00/));
  });

  it('en otra moneda que el plan avisa de que no se descuenta de los honorarios', async () => {
    const user = setupUser();
    const order = makeLabOrder({ treatmentPlanItem: PLAN_ITEM, cost: { amount: '3650.00', currency: 'VES' } });
    jest.mocked(listPatientLabOrders).mockResolvedValue(labOrderPage([order]));
    render(<PatientLabOrdersTab token={ADMIN} patientId="p1" />);
    const table = await screen.findByRole('table', { name: 'Órdenes de laboratorio del paciente' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(
      'En otra moneda que el plan: no se descuenta de los honorarios',
    );
    await user.click(screen.getByRole('button', { name: ACTIONS }));
    await user.click(await screen.findByRole('menuitem', { name: 'Costo del laboratorio' }));
    const dialog = await screen.findByRole('dialog', { name: labOrderCostCopy.title('N.º 12') });
    expect(await within(dialog).findByText(labOrderCostCopy.otherCurrency('USD'))).toBeInTheDocument();
  });

  it('vacío quita el costo (null)', async () => {
    const user = setupUser();
    const order = makeLabOrder({ treatmentPlanItem: PLAN_ITEM, cost: { amount: '120.00', currency: 'USD' } });
    jest.mocked(listPatientLabOrders).mockResolvedValue(labOrderPage([order]));
    jest.mocked(setLabOrderCost).mockResolvedValue({ ...order, cost: null });
    render(<PatientLabOrdersTab token={ADMIN} patientId="p1" />);
    await screen.findByRole('table', { name: 'Órdenes de laboratorio del paciente' });
    await user.click(screen.getByRole('button', { name: ACTIONS }));
    await user.click(await screen.findByRole('menuitem', { name: 'Costo del laboratorio' }));
    const dialog = await screen.findByRole('dialog', { name: labOrderCostCopy.title('N.º 12') });
    await user.clear(within(dialog).getByLabelText(labOrderCostCopy.amount));
    await user.click(within(dialog).getByRole('button', { name: labOrderCostCopy.submit }));
    await waitFor(() => expect(setLabOrderCost).toHaveBeenCalledWith(ADMIN, order.id, null));
  });

  it('el odontólogo no tiene la acción', async () => {
    const user = setupUser();
    jest.mocked(listPatientLabOrders).mockResolvedValue(labOrderPage([makeLabOrder()]));
    render(<PatientLabOrdersTab token={DENTIST} patientId="p1" />);
    await screen.findByRole('table', { name: 'Órdenes de laboratorio del paciente' });
    await user.click(screen.getByRole('button', { name: ACTIONS }));
    await screen.findAllByRole('menuitem');
    expect(screen.queryByRole('menuitem', { name: 'Costo del laboratorio' })).not.toBeInTheDocument();
  });
});
