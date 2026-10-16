import { render, screen, within } from '@testing-library/react';
import { PerioTab } from './perio-tab';
import { getPerioExam, listPerioExams } from '@/lib/perio/perio-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/perio/perio-api', () => ({
  ...jest.requireActual('../../lib/perio/perio-api'),
  listPerioExams: jest.fn(),
  getPerioExam: jest.fn(),
}));

const mockedList = listPerioExams as jest.MockedFunction<typeof listPerioExams>;
const mockedGet = getPerioExam as jest.MockedFunction<typeof getPerioExam>;

function summary(id: string, examDate: string, status: 'DRAFT' | 'FINAL', bop: number) {
  return {
    id,
    tenantId: 't1',
    patientId: 'p1',
    providerId: 'u1',
    providerName: 'Dra. Laura Gómez',
    examDate,
    notes: null,
    status,
    finalizedAt: status === 'FINAL' ? '2026-10-01T15:00:00.000Z' : null,
    createdAt: '2026-10-01T15:00:00.000Z',
    updatedAt: '2026-10-01T15:00:00.000Z',
    indices: {
      sitesExamined: 120,
      bopPercent: bop,
      plaquePercent: 12.5,
      sites4mmOrMore: 18,
      sites6mmOrMore: 4,
    },
  };
}

describe('PerioTab', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedGet.mockReset();
  });

  it('carga con esqueleto', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<PerioTab token="tok" patientId="p1" />);
    expect(
      screen.getByRole('status', { name: /cargando exámenes periodontales/i }),
    ).toBeInTheDocument();
  });

  it('estado vacío que enseña qué hacer', async () => {
    mockedList.mockResolvedValue([]);
    render(<PerioTab token="tok" patientId="p1" />);
    expect(
      await screen.findByText('Este paciente no tiene exámenes periodontales.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo examen/i })).toBeInTheDocument();
  });

  it('error con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedList.mockResolvedValueOnce([]);
    render(<PerioTab token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Se cayó');
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(
      await screen.findByText('Este paciente no tiene exámenes periodontales.'),
    ).toBeInTheDocument();
  });

  it('lista el histórico con fecha, profesional, estado, BOP%, placa% y ≥4/≥6', async () => {
    mockedList.mockResolvedValue([
      summary('e2', '2026-10-04', 'DRAFT', 10),
      summary('e1', '2026-04-15', 'FINAL', 62.5),
    ]);
    render(<PerioTab token="tok" patientId="p1" />);
    const table = await screen.findByRole('table', { name: /histórico/i });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('04/10/2026');
    expect(rows[1]).toHaveTextContent('Borrador');
    expect(rows[2]).toHaveTextContent('15/04/2026');
    expect(rows[2]).toHaveTextContent('Dra. Laura Gómez');
    expect(rows[2]).toHaveTextContent('Finalizado');
    expect(rows[2]).toHaveTextContent('62,5 %');
    expect(rows[2]).toHaveTextContent('12,5 %');
    expect(rows[2]).toHaveTextContent('18 / 4');
  });

  it('compara con el FINAL anterior, saltando borradores intermedios', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([
      summary('e3', '2026-10-10', 'DRAFT', 10),
      summary('e2', '2026-09-01', 'DRAFT', 20),
      summary('e1', '2026-04-15', 'FINAL', 62.5),
    ]);
    mockedGet.mockImplementation((_t, _p, id) =>
      Promise.resolve({ ...summary(id, '2026-10-10', 'DRAFT', 10), sites: [], teeth: [] }),
    );
    render(<PerioTab token="tok" patientId="p1" />);
    const table = await screen.findByRole('table', { name: /histórico/i });
    await user.click(within(table).getByRole('button', { name: 'Abrir examen del 10/10/2026' }));
    expect(
      await screen.findByRole('checkbox', {
        name: /comparar con el examen anterior \(15\/04\/2026\)/i,
      }),
    ).toBeInTheDocument();
  });

  it('«Abrir» muestra el editor del examen', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([summary('e1', '2026-04-15', 'FINAL', 62.5)]);
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(<PerioTab token="tok" patientId="p1" />);
    const table = await screen.findByRole('table', { name: /histórico/i });
    await user.click(
      within(table).getByRole('button', {
        name: 'Abrir examen del 15/04/2026',
      }),
    );
    expect(mockedGet).toHaveBeenCalledWith('tok', 'p1', 'e1');
    expect(screen.getByRole('button', { name: /volver al histórico/i })).toBeInTheDocument();
  });
});
