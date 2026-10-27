import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { InClinicPanel } from './in-clinic-panel';
import { PatientFlowActions, usePatientFlow } from './patient-flow-actions';
import { useInClinic, type InClinicState } from './use-in-clinic';
import { getInClinic, undoArrival, type InClinicItem, type InClinicView } from '@/lib/appointments/patient-flow';
import { updateAppointment } from '@/lib/appointments/appointments-api';
import { ApiError } from '@/lib/api/client';
import { setActiveLocationId } from '@/lib/locations/location-store';
import type { ClinicRole } from '@/lib/me/me-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

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
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn(), dismiss: jest.fn() },
}));
const mockedGet = getInClinic as jest.MockedFunction<typeof getInClinic>;
const mockedUndo = undoArrival as jest.MockedFunction<typeof undoArrival>;
const mockedUpdate = updateAppointment as jest.MockedFunction<typeof updateAppointment>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const sede = (id: string): ClinicLocation => clinicLocation({ id, name: id });

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
    medicalAlerts: {
      hasCriticalAlert: false,
      requiresPremedication: false,
      anamnesisStatus: 'CURRENT',
      alerts: [],
      anamnesisReviewedAt: '2026-09-01T00:00:00.000Z',
    },
    planItemsReservedElsewhere: [],
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Listo para cobrar' })).toHaveFocus());
    await waitFor(() =>
      expect(within(screen.getByTestId('in-clinic-group-inChair')).getAllByTestId('in-clinic-item')).toHaveLength(1),
    );
  });

  it('DX-242 I1: un sondeo anterior al PATCH no consume el foco del siguiente paso', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      let resolvePoll!: (value: InClinicView) => void;
      let resolvePatch!: () => void;
      mockedGet
        .mockResolvedValueOnce(view({ waiting: [item({ appointmentId: 'race' })] }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolvePoll = resolve; }))
        .mockResolvedValue(view({ inChair: [item({ appointmentId: 'race', status: 'IN_CHAIR' })] }));
      mockedUpdate.mockImplementationOnce(() => new Promise((resolve) => {
        resolvePatch = () => resolve({} as never);
      }));
      render(<Harness role="ASSISTANT" />);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(45_000); });
      expect(mockedGet).toHaveBeenCalledTimes(2);
      await user.click(screen.getByRole('button', { name: 'En sillón' }));
      await act(async () => {
        resolvePoll(view({ waiting: [item({ appointmentId: 'race', minutesInStatus: 13 })] }));
      });
      await act(async () => { resolvePatch(); });
      expect(mockedGet).toHaveBeenCalledTimes(3);
      expect(screen.getByRole('button', { name: 'Listo para cobrar' })).toHaveFocus();
      expect(document.body).not.toHaveFocus();
    } finally {
      jest.useRealTimers();
    }
  });

  it('DX-242 I1: conserva el foco si el GET antiguo llega después del PATCH y antes de la relectura', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      let resolvePoll!: (value: InClinicView) => void;
      let resolveFresh!: (value: InClinicView) => void;
      let resolvePatch!: () => void;
      mockedGet
        .mockResolvedValueOnce(view({ waiting: [item({ appointmentId: 'late' })] }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolvePoll = resolve; }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFresh = resolve; }));
      mockedUpdate.mockImplementationOnce(() => new Promise((resolve) => {
        resolvePatch = () => resolve({} as never);
      }));
      render(<Harness role="ASSISTANT" />);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(45_000); });
      await user.click(screen.getByRole('button', { name: 'En sillón' }));
      await act(async () => { resolvePatch(); });
      expect(mockedGet).toHaveBeenCalledTimes(2);
      await act(async () => {
        resolvePoll(view({ waiting: [item({ appointmentId: 'late', minutesInStatus: 13 })] }));
      });
      expect(mockedGet).toHaveBeenCalledTimes(3);
      await act(async () => {
        resolveFresh(view({ inChair: [item({ appointmentId: 'late', status: 'IN_CHAIR' })] }));
      });
      expect(screen.getByRole('button', { name: 'Listo para cobrar' })).toHaveFocus();
    } finally {
      jest.useRealTimers();
    }
  });

  it('DX-242 I1: si el PATCH falla tras aquel sondeo, restaura su botón y descarta la intención', async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      let resolvePoll!: (value: InClinicView) => void;
      let rejectPatch!: (error: Error) => void;
      mockedGet
        .mockResolvedValueOnce(view({ waiting: [item({ appointmentId: 'failed' })] }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolvePoll = resolve; }))
        .mockResolvedValue(view({ waiting: [item({ appointmentId: 'failed' })] }));
      mockedUpdate.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectPatch = reject; }));
      render(<Harness role="ASSISTANT" />);
      await act(async () => { await Promise.resolve(); });
      await act(async () => { jest.advanceTimersByTime(45_000); });
      await user.click(screen.getByRole('button', { name: 'En sillón' }));
      await act(async () => {
        resolvePoll(view({ waiting: [item({ appointmentId: 'failed', minutesInStatus: 13 })] }));
      });
      await act(async () => { rejectPatch(new Error('sin conexión')); });
      expect(screen.getByRole('button', { name: 'En sillón' })).toHaveFocus();
      expect(toast.error).toHaveBeenCalled();
      // Un cambio posterior de otra persona no reutiliza la intención fallida.
      const external = document.createElement('button');
      document.body.append(external);
      external.focus();
      mockedGet.mockResolvedValue(view({ inChair: [item({ appointmentId: 'failed', status: 'IN_CHAIR' })] }));
      await act(async () => { jest.advanceTimersByTime(45_000); });
      expect(external).toHaveFocus();
      external.remove();
    } finally {
      jest.useRealTimers();
    }
  });

  it('DX-242: completar la última cita lleva foco al encabezado de su grupo', async () => {
    mockedGet.mockResolvedValueOnce(view({ readyForCheckout: [item({ appointmentId:'last', status:'READY_FOR_CHECKOUT' })] })).mockResolvedValueOnce(view());
    mockedUpdate.mockResolvedValue({} as never);
    render(<Harness role="RECEPTION"/>);
    await userEvent.click(await screen.findByRole('button', {name:'Completar'}));
    await waitFor(() => expect(within(screen.getByTestId('in-clinic-group-readyForCheckout')).getByRole('heading')).toHaveFocus());
    expect(document.body).not.toHaveFocus();
  });

  it('DX-242: abre pantalla completa y nunca muestra UUID como nombre', () => {
    render(<InClinicPanel state={staticState({view:view({waiting:[item({appointmentId:'anon', patientFirstName:null, patientLastName:null, patientId:'uuid-clinico'})]})})} role="RECEPTION" runner={noRunner}/>);
    expect(screen.getByText('Paciente sin nombre')).toBeInTheDocument();
    expect(screen.queryByText('uuid-clinico')).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name:'Abrir a pantalla completa'})).toHaveAttribute('href','/agenda/en-clinica');
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
  it('el total del panel se anuncia en una región viva (aria-live polite)', () => {
    const { rerender } = render(
      <InClinicPanel state={staticState({ view: view() })} role="ADMIN" runner={noRunner} />,
    );
    const live = screen.getByTestId('in-clinic-count');
    expect(live).toHaveAttribute('aria-live', 'polite');
    rerender(
      <InClinicPanel
        state={staticState({ view: view({ waiting: [item({ appointmentId: 'a1' })] }) })}
        role="ADMIN"
        runner={noRunner}
      />,
    );
    expect(screen.getByTestId('in-clinic-count')).toHaveTextContent('1 paciente');
  });

  it('sondea cada 45 s; un refresco fallido conserva los datos y al desmontar no queda intervalo', async () => {
    jest.useFakeTimers();
    try {
      mockedGet
        .mockResolvedValueOnce(view({ waiting: [item({ appointmentId: 'a1' })] }))
        .mockRejectedValueOnce(new Error('caído'));
      const { unmount } = render(<Harness role="ADMIN" />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(await screen.findAllByTestId('in-clinic-item')).toHaveLength(1);
      expect(mockedGet).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(45_000);
      });
      expect(mockedGet).toHaveBeenCalledTimes(2);
      // El refresco falló: los datos siguen y avisa en segundo plano.
      expect(screen.getAllByTestId('in-clinic-item')).toHaveLength(1);
      expect(toast.error).toHaveBeenCalledWith(
        'No pudimos actualizar el panel «En clínica».',
        expect.anything(),
      );
      unmount();
      await act(async () => {
        jest.advanceTimersByTime(5 * 45_000);
      });
      expect(mockedGet).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('tras dar un paso el foco no se pierde: pasa al botón siguiente del grupo', async () => {
    const runner = { pendingId: null, run: jest.fn().mockResolvedValue(undefined) };
    const props = { appointmentId: 'a1', role: 'RECEPTION' as const, isToday: true, patientName: 'Ana', runner };
    const { rerender } = render(<PatientFlowActions {...props} status="SCHEDULED" />);
    const arrive = screen.getByRole('button', { name: 'Llegó' });
    await userEvent.click(arrive);
    expect(arrive).toHaveFocus();
    rerender(<PatientFlowActions {...props} status="ARRIVED" />);
    expect(screen.getByRole('button', { name: 'Deshacer llegada' })).toHaveFocus();
  });

  it('el contador de la cabecera (followChanges) relee en cuanto se da un paso en la pestaña, sin esperar al sondeo', async () => {
    mockedGet
      .mockResolvedValueOnce(view({ scope: 'MINE', waiting: [item({ appointmentId: 'a1' })] }))
      .mockResolvedValueOnce(view({ scope: 'MINE', waiting: [item({ appointmentId: 'a1' })] }))
      .mockResolvedValue(view({ scope: 'MINE', inChair: [item({ appointmentId: 'a1', status: 'IN_CHAIR' })] }));
    mockedUpdate.mockResolvedValue({} as never);
    function Counter() {
      const { view: v } = useInClinic('T', { silent: true, followChanges: true });
      return <p data-testid="counter">{v ? v.waiting.length : '-'}</p>;
    }
    render(
      <>
        <Counter />
        <Harness role="DENTIST" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId('counter')).toHaveTextContent('1'));
    await userEvent.click(await screen.findByRole('button', { name: 'En sillón' }));
    await waitFor(() => expect(screen.getByTestId('counter')).toHaveTextContent('0'));
  });
});

describe('InClinicPanel: alertas médicas (DX-247)', () => {
  it('muestra la misma alerta que la agenda junto al paciente; sin alertas, nada', async () => {
    const user = userEvent.setup();
    render(
      <InClinicPanel
        state={staticState({
          view: view({
            waiting: [
              item({
                appointmentId: 'a1',
                patientFirstName: 'Jorge',
                medicalAlerts: {
                  hasCriticalAlert: true,
                  requiresPremedication: true,
                  anamnesisStatus: 'CURRENT',
                  alerts: ['profilaxisAntibiotica'],
                  anamnesisReviewedAt: '2026-09-01T00:00:00.000Z',
                },
              }),
              item({ appointmentId: 'a2', patientFirstName: 'Lucía' }),
            ],
          }),
        })}
        role="RECEPTION"
        runner={noRunner}
      />,
    );
    const indicators = screen.getAllByTestId('medical-alert-indicator');
    expect(indicators).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Alertas médicas de Jorge Ríos' }));
    expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent('Requiere premedicación');
    expect(screen.getByTestId('medical-alert-popover')).toHaveTextContent('Requiere profilaxis antibiótica');
  });
});
