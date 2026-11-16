import { render, screen, waitFor, within } from '@testing-library/react';
import { PendingExternalOrdersView } from './pending-external-orders-view';
import { listPendingExternalOrders, type PendingExternalOrdersPage } from '@/lib/external-orders/external-orders-api';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { makeExternalOrder, makePendingExternalOrder } from '@/lib/test/external-orders';

jest.mock('../../lib/locations/locations-api', () => {
  const { utcSede } = jest.requireActual('../../lib/test/sede-clock');
  return {
    listLocations: jest.fn().mockResolvedValue([
      utcSede({ id: 'loc1', name: 'Sede Centro' }),
      utcSede({ id: 'loc2', name: 'Sede Este' }),
    ]),
  };
});
jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  listPendingExternalOrders: jest.fn(),
}));

const mockedPending = jest.mocked(listPendingExternalOrders);
const TOKEN = 'tok';

function page(overrides: Partial<PendingExternalOrdersPage> = {}): PendingExternalOrdersPage {
  return {
    overdueDays: 15,
    total: 2,
    page: 1,
    pageSize: 50,
    items: [
      makePendingExternalOrder({ ageDays: 20, overdue: true }),
      makePendingExternalOrder({
        order: makeExternalOrder({ id: 'eo2', numberLabel: '000008', kind: 'LAB', recipient: 'Laboratorio Altamira' }),
        patient: { id: 'p2', firstName: 'Luis', lastName: 'Mendoza' },
        ageDays: 0,
        overdue: false,
      }),
    ],
    ...overrides,
  };
}

describe('PendingExternalOrdersView (DX-572)', () => {
  beforeEach(() => {
    mockedPending.mockReset();
    clearSessionStore();
    setActiveLocationId(null);
  });

  it('con la sede activa: paciente con enlace a la ficha, nº, tipo, destinatario, antigüedad y «Vencida»', async () => {
    setActiveLocationId('loc2');
    mockedPending.mockResolvedValue(page());
    render(<PendingExternalOrdersView token={TOKEN} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Órdenes sin resultado' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Órdenes sin resultado, las más antiguas primero' });
    expect(mockedPending).toHaveBeenCalledWith(TOKEN, { locationId: 'loc2', overdueOnly: false, page: 1, pageSize: 50 });
    const [, first, second] = within(table).getAllByRole('row');
    expect(within(first).getByRole('link', { name: /Ana Pérez/ })).toHaveAttribute('href', '/patients/p1?tab=external-orders');
    expect(first).toHaveTextContent('Imagen');
    expect(first).toHaveTextContent('nº 000007');
    expect(first).toHaveTextContent('Centro de Imagen Norte');
    expect(first).toHaveTextContent('20 días');
    expect(first).toHaveTextContent('Vencida');
    expect(second).toHaveTextContent('Hoy');
    expect(second).not.toHaveTextContent('Vencida');
    await waitFor(() => expect(first).toHaveTextContent('10/11/2026'));
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument();
  });

  it('«Solo vencidas (más de N días)» filtra en la API', async () => {
    const user = setupUser();
    setActiveLocationId('loc1');
    mockedPending.mockResolvedValue(page());
    render(<PendingExternalOrdersView token={TOKEN} />);
    const filter = await screen.findByRole('checkbox', { name: 'Solo vencidas (más de 15 días)' });
    await user.click(filter);
    await waitFor(() =>
      expect(mockedPending).toHaveBeenLastCalledWith(TOKEN, { locationId: 'loc1', overdueOnly: true, page: 1, pageSize: 50 }),
    );
  });

  it('con «Todas las sedes» se elige una sede aquí (la API la exige)', async () => {
    const user = setupUser();
    mockedPending.mockResolvedValue(page({ items: [], total: 0 }));
    render(<PendingExternalOrdersView token={TOKEN} />);
    const select = await screen.findByRole('combobox', { name: 'Sede' });
    await waitFor(() =>
      expect(mockedPending).toHaveBeenCalledWith(TOKEN, { locationId: 'loc1', overdueOnly: false, page: 1, pageSize: 50 }),
    );
    expect(await screen.findByText('No hay órdenes sin resultado en esta sede')).toBeInTheDocument();
    await user.selectOptions(select, 'loc2');
    await waitFor(() =>
      expect(mockedPending).toHaveBeenLastCalledWith(TOKEN, { locationId: 'loc2', overdueOnly: false, page: 1, pageSize: 50 }),
    );
  });

  it('error de carga con reintento (escalón 1)', async () => {
    const user = setupUser();
    setActiveLocationId('loc1');
    mockedPending.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(page());
    render(<PendingExternalOrdersView token={TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las órdenes sin resultado.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
