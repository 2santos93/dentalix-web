import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { listLocations } from '@/lib/locations/locations-api';
import {
  getMajorityReview,
  listComingOfAge,
  type ComingOfAgeItem,
  type ComingOfAgeList,
} from '@/lib/patients/majority-review-api';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';
import { ComingOfAgeView, comingOfAgeCopy as copy } from './coming-of-age-view';
import { majorityReviewCopy } from './majority-review-dialog';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() } }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/patients/majority-review-api', () => ({
  ...jest.requireActual('../../lib/patients/majority-review-api'),
  listComingOfAge: jest.fn(),
  getMajorityReview: jest.fn(),
  submitMajorityReview: jest.fn(),
}));
const mockedList = listComingOfAge as jest.MockedFunction<typeof listComingOfAge>;
const mockedGet = getMajorityReview as jest.MockedFunction<typeof getMajorityReview>;

const item = (over: Partial<ComingOfAgeItem> = {}): ComingOfAgeItem => ({
  patientId: 'p1',
  fullName: 'Lucía Mora',
  patientCode: 'P-0001',
  birthDate: '2008-11-20',
  majorityDate: '2026-11-20',
  majorityAge: 18,
  status: 'PENDING',
  overdue: false,
  responsiblesCount: 1,
  ...over,
});
const list = (items: ComingOfAgeItem[], over: Partial<ComingOfAgeList> = {}): ComingOfAgeList => ({
  from: '2026-11-01',
  to: '2026-11-30',
  majorityAge: 18,
  restrictedToLocations: false,
  items,
  ...over,
});

describe('ComingOfAgeView (DX-342)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-11T15:00:00.000Z'), doNotFake: ['setTimeout', 'setInterval', 'queueMicrotask'] });
    mockedList.mockReset();
    mockedGet.mockReset();
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([STAMP_SEDES.caracas]);
  });
  afterEach(() => jest.useRealTimers());

  it('pide el mes de la sede y, con «Mes siguiente», el siguiente', async () => {
    mockedList.mockResolvedValue(list([]));
    render(<ComingOfAgeView token="tok" />);
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith('tok', { from: '2026-11-01', to: '2026-11-30' }));
    await userEvent.click(screen.getByRole('radio', { name: copy.nextMonth }));
    await waitFor(() => expect(mockedList).toHaveBeenLastCalledWith('tok', { from: '2026-12-01', to: '2026-12-31' }));
  });

  it('el «este mes» sale del día de la sede, no del navegador', async () => {
    // 1 dic 02:00 UTC = 30 nov 22:00 en Caracas.
    jest.setSystemTime(new Date('2026-12-01T02:00:00.000Z'));
    mockedList.mockResolvedValue(list([]));
    render(<ComingOfAgeView token="tok" />);
    await waitFor(() => expect(mockedList).toHaveBeenCalledWith('tok', { from: '2026-11-01', to: '2026-11-30' }));
  });

  it('las pendientes vencidas van primero, con su chip; fechas con el formato de la sede', async () => {
    mockedList.mockResolvedValue(
      list([
        item({ patientId: 'a', fullName: 'Ana Ruiz', majorityDate: '2026-11-02', status: 'REVIEWED' }),
        item({ patientId: 'b', fullName: 'Beto Gil', majorityDate: '2026-11-25', status: 'PENDING' }),
        item({ patientId: 'c', fullName: 'Carla Paz', majorityDate: '2026-09-15', birthDate: '2008-09-15', status: 'PENDING', overdue: true, responsiblesCount: 2 }),
      ]),
    );
    render(<ComingOfAgeView token="tok" />);
    const table = await screen.findByRole('table', { name: copy.listLabel });
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(4));
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringContaining('Carla Paz'),
      expect.stringContaining('Ana Ruiz'),
      expect.stringContaining('Beto Gil'),
    ]);
    expect(rows[0]).toHaveTextContent('Pendiente');
    expect(rows[0]).toHaveTextContent('Vencida');
    expect(rows[0]).toHaveTextContent('2 responsables');
    await waitFor(() => expect(rows[0]).toHaveTextContent(STAMP_FORMATS.caracas.civilDate('2026-09-15')));
    expect(rows[0]).toHaveTextContent(STAMP_FORMATS.caracas.civilDate('2008-09-15'));
    expect(rows[1]).toHaveTextContent('Revisado');
    expect(rows[1]).not.toHaveTextContent('Vencida');
    expect(within(rows[0]).getByRole('link', { name: /Carla Paz/ })).toHaveAttribute('href', '/patients/c');
  });

  it('«Revisar» abre el modal de revisión del paciente', async () => {
    mockedList.mockResolvedValue(list([item()]));
    mockedGet.mockResolvedValue({
      status: 'PENDING',
      majorityDate: '2026-11-20',
      majorityAge: 18,
      decision: null,
      reviewedAt: null,
      reviewedByName: null,
      responsibles: [{ id: 'r1', name: 'Marta Mora', relationship: 'MOTHER', receivesNotices: true, isPayer: true }],
    });
    render(<ComingOfAgeView token="tok" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Acciones de Lucía Mora' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: copy.review }));
    const dialog = await screen.findByRole('dialog', { name: majorityReviewCopy.title });
    expect(await within(dialog).findByText('Marta Mora')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok', 'p1');
  });

  it('vacío: «Nadie cumple la mayoría de edad este mes»', async () => {
    mockedList.mockResolvedValue(list([]));
    render(<ComingOfAgeView token="tok" />);
    expect(await screen.findByText(copy.emptyTitle(true))).toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a cargar', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce(list([item()]));
    render(<ComingOfAgeView token="tok" />);
    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Lucía Mora')).toBeInTheDocument();
  });

  it('un 403 enseña el aviso del rol sin los filtros', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'Prohibido'));
    render(<ComingOfAgeView token="tok" />);
    expect(await screen.findByText(copy.forbiddenTitle)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: copy.thisMonth })).not.toBeInTheDocument();
  });

  it('con sedes restringidas lo dice', async () => {
    mockedList.mockResolvedValue(list([item()], { restrictedToLocations: true }));
    render(<ComingOfAgeView token="tok" />);
    expect(await screen.findByText(copy.restricted)).toBeInTheDocument();
  });
});
