import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { InClinicPanel } from './in-clinic-panel';
import { usePatientFlow } from './patient-flow-actions';
import { useInClinic, type InClinicState } from './use-in-clinic';
import { getInClinic, undoArrival, type InClinicItem, type InClinicView } from '@/lib/appointments/patient-flow';
import { updateAppointment } from '@/lib/appointments/appointments-api';
import { ApiError } from '@/lib/api/client';
import { setActiveLocationId } from '@/lib/locations/location-store';
import type { ClinicRole } from '@/lib/me/me-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';

jest.mock('../../lib/appointments/patient-flow', () => ({
  ...jest.requireActual('../../lib/appointments/patient-flow'),
  getInClinic: jest.fn(),
  undoArrival: jest.fn(),
}));
jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  updateAppointment: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn(),
}));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const mockedGet = getInClinic as jest.MockedFunction<typeof getInClinic>;
const mockedUndo = undoArrival as jest.MockedFunction<typeof undoArrival>;
const mockedUpdate = updateAppointment as jest.MockedFunction<typeof updateAppointment>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const sede = (id: string) => ({ id, name: id, isActive: true }) as ClinicLocation;

function item(overrides: Partial<InClinicItem> & { appointmentId: string }): InClinicItem {
  return {
    patientId: `p-${overrides.appointmentId}`,
    patientFirstName: 'Ana',
    patientLastName: 'Ríos',
    providerId: 'dent-1',
    providerName: 'Dra. Lina',
    start: '2026-10-19T14:00:00.000Z',
    end: '2026-10-19T14:30:00.000Z',
    status: 'ARRIVED',
    arrivedAt: '2026-10-19T13:50:00.000Z',
    seatedAt: null,
    readyForCheckoutAt: null,
    minutesInStatus: 12,
    waitedMinutes: 12,
    punctuality: 'ON_TIME',
    ...overrides,
  };
}

function view(overrides: Partial<InClinicView> = {}): InClinicView {
  return {
    date: '2026-10-19',
    locationId: 'loc-1',
    timeZone: 'America/Bogota',
    now: '2026-10-19T14:02:00.000Z',
    scope: 'LOCATION',
    waiting: [],
    inChair: [],
    readyForCheckout: [],
    ...overrides,
  };
}

/** El panel con el hook real de datos y del flujo, como en la agenda. */
function Harness({ role }: { role: ClinicRole }) {
  const state = useInClinic('T');
  const runner = usePatientFlow('T', state.reload);
  return <InClinicPanel state={state} role={role} runner={runner} />;
}

function staticState(overrides: Partial<InClinicState>): InClinicState {
  return { view: null, loading: false, error: null, noLocation: false, reload: jest.fn(), ...overrides };
}
const noRunner = { pendingId: null, run: jest.fn() };

describe('InClinicPanel (DX-200)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocationId('loc-1');
  });

  it('agrupa en espera / en sillón / listo para cobrar, con minutos y color por puntualidad', async () => {
    mockedGet.mockResolvedValue(
      view({
        waiting: [
          item({ appointmentId: 'a1' }),
          item({
            appointmentId: 'a2',
            patientFirstName: 'Berta',
            punctuality: 'LATE',
            minutesInStatus: 4,
            arrivedAt: '2026-10-19T14:03:00.000Z',
          }),
        ],
        inChair: [item({ appointmentId: 'a3', status: 'IN_CHAIR', punctuality: 'VERY_LATE', minutesInStatus: 2 })],
        readyForCheckout: [item({ appointmentId: 'a4', status: 'READY_FOR_CHECKOUT', minutesInStatus: 7 })],
      }),
    );
    render(<Harness role="RECEPTION" />);

    const waiting = await screen.findByTestId('in-clinic-group-waiting');
    expect(within(waiting).getByRole('heading', { name: /En espera/ })).toBeInTheDocument();
    const rows = within(waiting).getAllByTestId('in-clinic-item');
    expect(rows.map((r) => r.getAttribute('data-punctuality'))).toEqual(['ON_TIME', 'LATE']);
    expect(within(rows[0]).getByText('Espera 12 min')).toBeInTheDocument();
    // La hora de la cita y de la llegada, en la zona de la sede; la
    // puntualidad también en texto (no solo color).
    expect(within(rows[0]).getByText('Cita 09:00 · Dra. Lina')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Llegó 09:03 · hasta 5 min tarde')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('in-clinic-group-inChair')).getByText('En sillón 2 min'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('in-clinic-group-readyForCheckout')).getByText('Por cobrar 7 min'),
    ).toBeInTheDocument();
    expect(screen.getByText('4 pacientes')).toBeInTheDocument();
  });

  it('vacío: «Nadie en espera»', async () => {
    mockedGet.mockResolvedValue(view());
    render(<Harness role="ADMIN" />);
    expect(await screen.findByText('Nadie en espera')).toBeInTheDocument();
  });

  it('carga: esqueleto; error sin datos: reintentar en la sección', async () => {
    mockedGet.mockRejectedValueOnce(new Error('caído')).mockResolvedValueOnce(view());
    render(<Harness role="ADMIN" />);
    expect(screen.getByTestId('in-clinic-loading')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar quién está en la clínica.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Nadie en espera')).toBeInTheDocument();
  });

  it('en «Todas las sedes» con varias sedes pide elegir una y no pide el panel', async () => {
    setActiveLocationId(null);
    mockedLocations.mockResolvedValue([sede('loc-1'), sede('loc-2')]);
    render(<Harness role="ADMIN" />);
    expect(await screen.findByText('Elige una sede')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('una clínica de una sede no elige sede: el panel es el de esa sede', async () => {
    setActiveLocationId(null);
    mockedLocations.mockResolvedValue([sede('unica')]);
    mockedGet.mockResolvedValue(view());
    render(<Harness role="RECEPTION" />);
    expect(await screen.findByText('Nadie en espera')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('T', 'unica');
  });

  it('el odontólogo ve «Te esperan» y solo «En sillón» como acción', async () => {
    mockedGet.mockResolvedValue(view({ scope: 'MINE', waiting: [item({ appointmentId: 'a1' })] }));
    render(<Harness role="DENTIST" />);
    const waiting = await screen.findByTestId('in-clinic-group-waiting');
    expect(within(waiting).getByRole('heading', { name: /Te esperan/ })).toBeInTheDocument();
    expect(within(waiting).getByRole('button', { name: 'En sillón' })).toBeInTheDocument();
    expect(within(waiting).queryByRole('button', { name: 'Deshacer llegada' })).not.toBeInTheDocument();
  });

  it('«En sillón» cambia el estado y vuelve a leer el panel', async () => {
    mockedGet
      .mockResolvedValueOnce(view({ waiting: [item({ appointmentId: 'a1' })] }))
      .mockResolvedValueOnce(view({ inChair: [item({ appointmentId: 'a1', status: 'IN_CHAIR' })] }));
    mockedUpdate.mockResolvedValue({} as never);
    render(<Harness role="ASSISTANT" />);
    await userEvent.click(await screen.findByRole('button', { name: 'En sillón' }));
    expect(mockedUpdate).toHaveBeenCalledWith('T', 'a1', { status: 'IN_CHAIR' });
    expect(toast.success).toHaveBeenCalledWith('Ana Ríos pasó al sillón.');
    await waitFor(() =>
      expect(within(screen.getByTestId('in-clinic-group-inChair')).getAllByTestId('in-clinic-item')).toHaveLength(1),
    );
  });

  it('«Deshacer llegada» usa su ruta; un 409 avisa con Reintentar y relee', async () => {
    mockedGet.mockResolvedValue(view({ waiting: [item({ appointmentId: 'a1' })] }));
    mockedUndo.mockRejectedValue(
      new ApiError(409, 'Solo se deshace la llegada de un paciente en espera.', undefined),
    );
    render(<Harness role="RECEPTION" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer llegada' }));
    expect(mockedUndo).toHaveBeenCalledWith('T', 'a1');
    expect(toast.error).toHaveBeenCalledWith(
      'Solo se deshace la llegada de un paciente en espera.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
    );
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  });

  it('un refresco que falla con datos en pantalla los conserva (aviso en segundo plano)', () => {
    render(
      <InClinicPanel
        state={staticState({ view: view({ waiting: [item({ appointmentId: 'a1' })] }), error: null })}
        role="ADMIN"
        runner={noRunner}
      />,
    );
    expect(screen.getAllByTestId('in-clinic-item')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('los botones miden 44 px en móvil', async () => {
    mockedGet.mockResolvedValue(view({ waiting: [item({ appointmentId: 'a1' })] }));
    render(<Harness role="ADMIN" />);
    for (const button of await screen.findAllByRole('button', { name: /En sillón|Deshacer llegada/ })) {
      expect(button.className).toMatch(/\bh-11\b/);
    }
  });
});
