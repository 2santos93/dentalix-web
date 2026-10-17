import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientCollectionsSection } from './patient-collections-section';
import { getPatientCollections } from '@/lib/collections/collections-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/collections/collections-api', () => ({
  getPatientCollections: jest.fn(),
  createCollectionNote: jest.fn(),
  createPaymentPromise: jest.fn(),
}));
const mockedGet = getPatientCollections as jest.MockedFunction<typeof getPatientCollections>;

const patient = { id: 'pat-1', fullName: 'Ana Pérez' };

describe('PatientCollectionsSection (DX-150)', () => {
  beforeEach(() => mockedGet.mockReset());

  it('vacío: lo dice y ofrece registrar gestión y compromiso', async () => {
    mockedGet.mockResolvedValue({ notes: [], promises: [] });
    render(<PatientCollectionsSection token="tok" patient={patient} />);
    expect(await screen.findByText('Sin gestiones de cobro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar gestión' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compromiso de pago' })).toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a cargar', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce({ notes: [], promises: [] });
    render(<PatientCollectionsSection token="tok" patient={patient} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin gestiones de cobro')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('lista gestiones y compromisos con su estado y lo abonado; con uno abierto no ofrece otro', async () => {
    mockedGet.mockResolvedValue({
      notes: [
        {
          id: 'n1',
          patientId: 'pat-1',
          locationId: null,
          channel: 'CALL',
          outcome: 'PROMISED_PAYMENT',
          text: 'Paga el viernes',
          author: { id: 'u1', fullName: 'Rita' },
          createdAt: '2026-10-16T15:00:00.000Z',
        },
      ],
      promises: [
        {
          id: 'pp1',
          patientId: 'pat-1',
          locationId: 'loc-1',
          amount: 200000,
          currency: 'COP',
          dueDate: '2026-11-15',
          status: 'OPEN',
          createdBy: { id: 'u1', fullName: 'Rita' },
          createdAt: '2026-10-16T15:00:00.000Z',
          settledAt: null,
          covered: 120000,
        },
      ],
    });
    render(<PatientCollectionsSection token="tok" patient={patient} />);
    expect(await screen.findByText('Llamada · Promete pago')).toBeInTheDocument();
    expect(screen.getByText('Paga el viernes')).toBeInTheDocument();
    expect(screen.getByText('Abierto')).toBeInTheDocument();
    expect(screen.getByTestId('promise-row').textContent?.replace(/\s/g, ' ')).toMatch(/Abonado: .*120\.000/);
    expect(screen.queryByRole('button', { name: 'Compromiso de pago' })).toBeNull();
  });

  it('revisión: mientras carga (o si falla) no ofrece un compromiso que podría chocar con uno abierto', async () => {
    let resolve: (v: { notes: []; promises: [] }) => void = () => {};
    mockedGet.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<PatientCollectionsSection token="tok" patient={patient} />);
    expect(screen.getByRole('button', { name: 'Registrar gestión' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compromiso de pago' })).toBeNull();
    resolve({ notes: [], promises: [] });
    expect(await screen.findByRole('button', { name: 'Compromiso de pago' })).toBeInTheDocument();
  });

  it('revisión: con compromisos y sin gestiones, lo dice en vez de pintar una lista vacía', async () => {
    mockedGet.mockResolvedValue({
      notes: [],
      promises: [
        {
          id: 'pp1',
          patientId: 'pat-1',
          locationId: 'loc-1',
          amount: 200000,
          currency: 'COP',
          dueDate: '2026-11-15',
          status: 'KEPT',
          createdBy: { id: 'u1', fullName: 'Rita' },
          createdAt: '2026-10-16T15:00:00.000Z',
          settledAt: '2026-10-17T15:00:00.000Z',
          covered: 200000,
        },
      ],
    });
    render(<PatientCollectionsSection token="tok" patient={patient} />);
    expect(await screen.findByText('Cumplido')).toBeInTheDocument();
    expect(screen.getByText('Sin gestiones.')).toBeInTheDocument();
    expect(screen.queryAllByRole('list')).toHaveLength(1);
  });
});
