import { render, screen, waitFor, within } from '@testing-library/react';
import { LabOrdersView } from './lab-orders-view';
import { listDentalLabs, listLabOrders } from '@/lib/lab-orders/lab-orders-api';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { labOrderPage, makeDentalLab, makeLabOrder, makeOverdueLabOrder } from '@/lib/test/lab-orders';

jest.mock('../../lib/locations/locations-api', () => {
  const { utcSede } = jest.requireActual('../../lib/test/sede-clock');
  return {
    listLocations: jest.fn().mockResolvedValue([
      utcSede({ id: 'loc1', name: 'Sede Centro' }),
      utcSede({ id: 'loc2', name: 'Sede Este' }),
    ]),
  };
});
jest.mock('../../lib/lab-orders/lab-orders-api', () => ({
  ...jest.requireActual('../../lib/lab-orders/lab-orders-api'),
  listLabOrders: jest.fn(),
  listDentalLabs: jest.fn(),
}));

const mockedList = jest.mocked(listLabOrders);
const TOKEN = 'tok';
const TABLE = 'Trabajos de laboratorio de la sede, los atrasados primero';
const OPEN = ['DRAFT', 'SENT', 'RECEIVED'];

describe('LabOrdersView (DX-017)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
    setActiveLocationId(null);
    jest.mocked(listDentalLabs).mockResolvedValue([
      makeDentalLab(),
      makeDentalLab({ id: 'lab2', name: 'ProtoLab Valencia', services: [] }),
    ]);
  });

  it('la sede activa: pendientes por defecto, la atrasada en rojo con sus días y la fila a la ficha', async () => {
    setActiveLocationId('loc2');
    mockedList.mockResolvedValue(labOrderPage([makeOverdueLabOrder(), makeLabOrder()]));
    render(<LabOrdersView token={TOKEN} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Trabajos de laboratorio' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: TABLE });
    expect(mockedList).toHaveBeenCalledWith(TOKEN, {
      locationId: 'loc2',
      statuses: OPEN,
      labId: null,
      overdue: false,
      page: 1,
      pageSize: 50,
    });
    const [, overdue, draft] = within(table).getAllByRole('row');
    expect(within(overdue).getByRole('link', { name: /Ana Pérez/ })).toHaveAttribute('href', '/patients/p1?tab=lab-orders');
    expect(overdue).toHaveTextContent('Corona de zirconio');
    expect(overdue).toHaveTextContent('N.º 9');
    expect(overdue).toHaveTextContent('Atrasada · 3 días de atraso');
    await waitFor(() => expect(overdue).toHaveTextContent('10/11/2026'));
    expect(draft).toHaveTextContent('Borrador');
    expect(draft).not.toHaveTextContent('Atrasada');
    expect(screen.getByText('2 trabajos')).toBeInTheDocument();
  });

  it('filtros: estado, laboratorio y «Solo atrasados» van a la API', async () => {
    const user = setupUser();
    setActiveLocationId('loc1');
    mockedList.mockResolvedValue(labOrderPage([makeOverdueLabOrder()]));
    render(<LabOrdersView token={TOKEN} />);
    await screen.findByRole('table', { name: TABLE });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'SENT');
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(TOKEN, expect.objectContaining({ statuses: ['SENT'] })));
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Laboratorio' })).toBeEnabled());
    await user.selectOptions(screen.getByRole('combobox', { name: 'Laboratorio' }), 'lab2');
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(TOKEN, expect.objectContaining({ labId: 'lab2' })));
    await user.click(screen.getByRole('checkbox', { name: 'Solo atrasados' }));
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith(TOKEN, {
        locationId: 'loc1',
        statuses: ['SENT'],
        labId: 'lab2',
        overdue: true,
        page: 1,
        pageSize: 50,
      }),
    );
  });

  it('vacío: «Aún no hay trabajos de laboratorio» con el camino a Pacientes; con «Todas las sedes» se elige una', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue(labOrderPage([]));
    render(<LabOrdersView token={TOKEN} />);
    const select = await screen.findByRole('combobox', { name: 'Sede' });
    expect(await screen.findByText('Aún no hay trabajos de laboratorio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Pacientes' })).toHaveAttribute('href', '/patients');
    await user.selectOptions(select, 'loc2');
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith(TOKEN, expect.objectContaining({ locationId: 'loc2' })));
  });

  it('«Solo atrasados» sin resultados lo dice', async () => {
    const user = setupUser();
    setActiveLocationId('loc1');
    mockedList.mockResolvedValue(labOrderPage([]));
    render(<LabOrdersView token={TOKEN} />);
    await screen.findByText('Aún no hay trabajos de laboratorio');
    await user.click(screen.getByRole('checkbox', { name: 'Solo atrasados' }));
    expect(await screen.findByText('No hay trabajos atrasados en esta sede')).toBeInTheDocument();
  });

  it('error de carga con «Reintentar» (escalón 1)', async () => {
    const user = setupUser();
    setActiveLocationId('loc1');
    mockedList.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(labOrderPage([makeLabOrder()]));
    render(<LabOrdersView token={TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los trabajos de laboratorio.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: TABLE })).toBeInTheDocument();
  });

  it('si los laboratorios no cargan, el filtro se queda en su sitio con su reintento (escalón 2)', async () => {
    setActiveLocationId('loc1');
    jest.mocked(listDentalLabs).mockRejectedValueOnce(new Error('x'));
    mockedList.mockResolvedValue(labOrderPage([makeLabOrder()]));
    render(<LabOrdersView token={TOKEN} />);
    expect(await screen.findByText('Laboratorios sin cargar')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: TABLE })).toBeInTheDocument();
  });
});
