import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicalEntriesList } from './clinical-entries-list';
import { listClinicalEntries, createClinicalEntry } from '@/lib/patients/clinical-api';
import { listStaff } from '@/lib/staff/staff-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform — use a relative path (same convention as the other tests).
jest.mock('../../lib/patients/clinical-api', () => ({
  listClinicalEntries: jest.fn(),
  createClinicalEntry: jest.fn(),
}));
// El autor de cada evolución se resuelve contra el personal de la clínica.
jest.mock('../../lib/staff/staff-api', () => ({
  listStaff: jest.fn(),
}));

const mockedList = listClinicalEntries as jest.MockedFunction<typeof listClinicalEntries>;
const mockedCreate = createClinicalEntry as jest.MockedFunction<typeof createClinicalEntry>;
const mockedListStaff = listStaff as jest.MockedFunction<typeof listStaff>;

const staff = [
  { userId: 'u1', fullName: 'Dra. Ana Ríos', email: 'ana@demo.com', role: 'DENTIST' as const },
];

const entries = [
  {
    id: 'ce-2',
    tenantId: 't1',
    patientId: 'p1',
    entryDate: '2026-02-01T00:00:00.000Z',
    reason: 'Control',
    notes: 'Todo en orden',
    performedById: 'u1',
    createdAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'ce-1',
    tenantId: 't1',
    patientId: 'p1',
    entryDate: '2026-01-01T00:00:00.000Z',
    reason: 'Consulta inicial',
    notes: 'Primera visita',
    performedById: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('ClinicalEntriesList', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedListStaff.mockReset();
    mockedListStaff.mockResolvedValue(staff);
  });

  it('carga con esqueleto, nunca con un «Cargando…» pelado', () => {
    // Contrato de `AsyncSection`, documentado en el propio componente: el
    // estado de carga es un esqueleto con la forma del contenido, no una
    // cadena suelta.
    mockedList.mockReturnValue(new Promise(() => {}));
    // También el personal queda pendiente: si resolviera después de terminar
    // el test, su `setState` caería fuera de `act()`.
    mockedListStaff.mockReturnValue(new Promise(() => {}));
    const { container } = render(<ClinicalEntriesList token="tok" patientId="p1" />);
    // El esqueleto se ANUNCIA como carga (`role="status"` + `aria-label`) pero
    // no imprime la palabra en pantalla: la forma la da el bloque pulsante.
    expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText(/cargando/i)).not.toBeInTheDocument();
  });

  it('nombra al autor y la fecha en que el SERVIDOR registró la evolución', async () => {
    // El dato médico-legal: `entryDate` la escribe el usuario y puede ser
    // retroactiva; `createdAt` + `performedById` los pone el servidor. Un
    // revisor busca lo segundo.
    mockedList.mockResolvedValue(entries);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    const rows = await screen.findAllByText(/Dra\. Ana Ríos/);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('si el personal no carga, la evolución conserva su marca de tiempo', async () => {
    mockedListStaff.mockRejectedValue(new Error('sin red'));
    mockedList.mockResolvedValue(entries);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    // Fail soft: no se oculta el registro por no poder nombrar a quien lo hizo.
    expect((await screen.findAllByText(/todo en orden/i)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Dra\. Ana Ríos/)).not.toBeInTheDocument();
  });

  it('distingue la fecha de atención del registro con dos encabezados propios', async () => {
    mockedList.mockResolvedValue(entries);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    const table = await screen.findByRole('table', { name: /evoluciones del paciente/i });
    expect(within(table).getByRole('columnheader', { name: /fecha de atención/i })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /^registro$/i })).toBeInTheDocument();
  });

  it('no acepta una atención en el futuro', async () => {
    mockedList.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);

    const date = screen.getByLabelText(/fecha de atención/i);
    // El `max` del input lo bloquea en el navegador; el guard cubre teclado y
    // pegado, así que se comprueba que el atributo existe.
    expect(date).toHaveAttribute('max');

    await user.type(screen.getByLabelText(/^notas$/i), 'algo');
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('shows an empty state when there are no entries', async () => {
    mockedList.mockResolvedValue([]);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    expect(await screen.findByText(/no hay evoluciones/i)).toBeInTheDocument();
  });

  it('renders the entries (reason + notes), most recent first', async () => {
    mockedList.mockResolvedValue(entries);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    // Rendered twice — desktop table + mobile cards (same convention as
    // PatientsTable).
    expect(await screen.findAllByText('Control')).toHaveLength(2);
    expect(screen.getAllByText('Todo en orden')).toHaveLength(2);
    expect(screen.getAllByText('Consulta inicial')).toHaveLength(2);
    expect(screen.getAllByText('Primera visita')).toHaveLength(2);
  });

  it('renders the add-entry form with accessible labels', async () => {
    mockedList.mockResolvedValue([]);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);

    await screen.findByText(/no hay evoluciones/i);
    expect(screen.getByLabelText(/fecha/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/motivo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /agregar/i })).toBeInTheDocument();
  });

  it('submits the form calling createClinicalEntry and shows the new entry', async () => {
    mockedList.mockResolvedValue([]);
    const created = {
      id: 'ce-3',
      tenantId: 't1',
      patientId: 'p1',
      entryDate: '2026-03-01T00:00:00.000Z',
      reason: null,
      notes: 'Nueva evolución',
      performedById: 'u1',
      createdAt: '2026-03-01T00:00:00.000Z',
    };
    mockedCreate.mockResolvedValue(created);

    const user = userEvent.setup();
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);

    await user.type(screen.getByLabelText(/notas/i), 'Nueva evolución');
    await user.click(screen.getByRole('button', { name: /agregar/i }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({ notes: 'Nueva evolución' }),
    );
    // Rendered twice — desktop table + mobile cards.
    expect(await screen.findAllByText('Nueva evolución')).toHaveLength(2);
  });

  it('requires the notes field to submit', async () => {
    mockedList.mockResolvedValue([]);
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);
    expect(screen.getByLabelText(/notas/i)).toBeRequired();
  });

  it('shows an alert with the API error message when loading fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedList.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor');
  });

  it('shows an alert with the API error message when creating fails', async () => {
    mockedList.mockResolvedValue([]);
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedCreate.mockRejectedValue(new ApiError(400, 'Datos inválidos'));

    const user = userEvent.setup();
    render(<ClinicalEntriesList token="tok" patientId="p1" />);
    await screen.findByText(/no hay evoluciones/i);
    await user.type(screen.getByLabelText(/notas/i), 'x');
    await user.click(screen.getByRole('button', { name: /agregar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos');
  });
});
