import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { InClinicPanel } from './in-clinic-panel';
import { PatientFlowActions, dismissReservedToasts, usePatientFlow } from './patient-flow-actions';
import { useInClinic } from './use-in-clinic';
import { getInClinic, type InClinicItem, type InClinicView } from '@/lib/appointments/patient-flow';
import { updateAppointment } from '@/lib/appointments/appointments-api';
import { claimPlanItem } from '@/lib/appointments/plan-item-reservations';
import { ApiError } from '@/lib/api/client';
import { setActiveLocationId } from '@/lib/locations/location-store';

jest.mock('../../lib/appointments/patient-flow', () => ({
  ...jest.requireActual('../../lib/appointments/patient-flow'),
  getInClinic: jest.fn(),
}));
jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  updateAppointment: jest.fn(),
}));
jest.mock('../../lib/appointments/plan-item-reservations', () => ({
  ...jest.requireActual('../../lib/appointments/plan-item-reservations'),
  claimPlanItem: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn(), dismiss: jest.fn() },
}));
const mockedGet = getInClinic as jest.MockedFunction<typeof getInClinic>;
const mockedUpdate = updateAppointment as jest.MockedFunction<typeof updateAppointment>;
const mockedClaim = claimPlanItem as jest.MockedFunction<typeof claimPlanItem>;

const reserved = {
  planItemId: 'i1',
  name: 'Implante',
  toothNumber: '36',
  appointmentId: 'future-1',
  start: '2026-10-30T14:00:00.000Z',
  locationId: 'loc-1',
  locationName: 'Sede Norte',
  timeZone: 'America/Bogota',
};
const MESSAGE = 'Este tratamiento está reservado en la cita del 30/10/2026 a las 09:00 (Sede Norte).';

function item(overrides: Partial<InClinicItem> = {}): InClinicItem {
  return {
    appointmentId: 'a1',
    patientId: 'p1',
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
    planItemsReservedElsewhere: [reserved],
    ...overrides,
  };
}

function view(waiting: InClinicItem[]): InClinicView {
  return {
    date: '2026-10-19',
    locationId: 'loc-1',
    timeZone: 'America/Bogota',
    now: '2026-10-19T14:02:00.000Z',
    scope: 'LOCATION',
    waiting,
    inChair: [],
    readyForCheckout: [],
  };
}

function Harness() {
  const state = useInClinic('T');
  const runner = usePatientFlow('T', state.reload);
  return <InClinicPanel state={state} role="RECEPTION" runner={runner} />;
}

describe('Tratamiento reservado en otra cita (DX-273)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setActiveLocationId('loc-1');
  });

  it('el panel «En clínica» avisa con la fecha de la otra cita y ofrece «Traer a esta cita»', async () => {
    mockedGet.mockResolvedValue(view([item()]));
    render(<Harness />);
    const row = await screen.findByTestId('in-clinic-item');
    const notice = within(row).getByRole('group', { name: 'Tratamiento reservado en otra cita' });
    expect(within(notice).getByText('Implante · diente 36')).toBeInTheDocument();
    expect(within(notice).getByText(MESSAGE)).toBeInTheDocument();
    expect(within(notice).getByRole('button', { name: 'Traer a esta cita: Implante · diente 36' })).toBeInTheDocument();
  });

  it('sin reservas en otra cita no hay aviso', async () => {
    mockedGet.mockResolvedValue(view([item({ planItemsReservedElsewhere: [] })]));
    render(<Harness />);
    await screen.findByTestId('in-clinic-item');
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument();
  });

  it('«Traer a esta cita» mueve la reserva, lo confirma y vuelve a leer el panel', async () => {
    mockedGet.mockResolvedValueOnce(view([item()])).mockResolvedValue(view([item({ planItemsReservedElsewhere: [] })]));
    mockedClaim.mockResolvedValue({} as never);
    render(<Harness />);
    await userEvent.click(await screen.findByRole('button', { name: /Traer a esta cita/ }));
    expect(mockedClaim).toHaveBeenCalledWith('T', 'a1', 'i1');
    expect(toast.success).toHaveBeenCalledWith('Implante · diente 36 quedó reservado en esta cita.');
    // El aviso de «Llegó» de ese tratamiento se cierra (revisión M4).
    expect(toast.dismiss).toHaveBeenCalledWith('reserved:a1:i1');
    await waitFor(() => expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument());
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('si falla, aviso en español con Reintentar y el aviso sigue', async () => {
    mockedGet.mockResolvedValue(view([item()]));
    mockedClaim.mockRejectedValue(
      new ApiError(409, 'Solo se trae un tratamiento a una cita con el paciente en la clínica (llegó, en sillón o listo para cobrar).', undefined),
    );
    render(<Harness />);
    await userEvent.click(await screen.findByRole('button', { name: /Traer a esta cita/ }));
    expect(toast.error).toHaveBeenCalledWith(
      'Solo se trae un tratamiento a una cita con el paciente en la clínica (llegó, en sillón o listo para cobrar).',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reintentar' }) }),
    );
    expect(screen.getByText(MESSAGE)).toBeInTheDocument();
  });

  it('mientras se trae, el botón queda ocupado (no se repite)', async () => {
    mockedGet.mockResolvedValue(view([item()]));
    let resolve: (v: never) => void = () => undefined;
    mockedClaim.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness />);
    const button = await screen.findByRole('button', { name: /Traer a esta cita/ });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    resolve({} as never);
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('doble clic en «Traer a esta cita»: una sola petición, el botón deshabilitado mientras está en vuelo y ningún error (DX-288)', async () => {
    mockedGet.mockResolvedValue(view([item()]));
    let resolve: (v: never) => void = () => undefined;
    mockedClaim.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<Harness />);
    const button = await screen.findByRole('button', { name: /Traer a esta cita/ });
    await userEvent.dblClick(button);
    expect(mockedClaim).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(mockedClaim).toHaveBeenCalledTimes(1);
    resolve({} as never);
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockedClaim).toHaveBeenCalledTimes(1);
  });

  it('«Llegó» con un tratamiento reservado en otra cita: aviso no bloqueante con «Traer a esta cita»', async () => {
    mockedUpdate.mockResolvedValue({ id: 'a1', planItemsReservedElsewhere: [reserved] } as never);
    mockedClaim.mockResolvedValue({} as never);
    function Arrive() {
      const runner = usePatientFlow('T', () => undefined);
      return (
        <PatientFlowActions appointmentId="a1" status="SCHEDULED" role="RECEPTION" isToday patientName="Ana" runner={runner} />
      );
    }
    render(<Arrive />);
    await userEvent.click(screen.getByRole('button', { name: 'Llegó' }));
    expect(toast.success).toHaveBeenCalledWith('Ana llegó.');
    expect(toast.warning).toHaveBeenCalledWith(
      'Implante · diente 36',
      expect.objectContaining({
        description: MESSAGE,
        action: expect.objectContaining({ label: 'Traer a esta cita' }),
      }),
    );
    const { action } = (toast.warning as jest.Mock).mock.calls[0][1] as { action: { onClick: () => void } };
    action.onClick();
    await waitFor(() => expect(mockedClaim).toHaveBeenCalledWith('T', 'a1', 'i1'));
  });

  describe('QA a 390 px (D1, D2)', () => {
    function Arrive() {
      const runner = usePatientFlow('T', () => undefined);
      return (
        <PatientFlowActions appointmentId="a1" status="SCHEDULED" role="RECEPTION" isToday patientName="Ana" runner={runner} />
      );
    }

    it('el botón del aviso mide 44 px en móvil (D2)', async () => {
      mockedUpdate.mockResolvedValue({ id: 'a1', planItemsReservedElsewhere: [reserved] } as never);
      render(<Arrive />);
      await userEvent.click(screen.getByRole('button', { name: 'Llegó' }));
      const options = (toast.warning as jest.Mock).mock.calls[0][1] as { classNames: { actionButton: string } };
      expect(options.classNames.actionButton).toMatch(/!min-h-11/);
      expect(options.classNames.actionButton).toMatch(/!min-w-11/);
    });

    it('al abrir «En clínica» se cierran los avisos abiertos (D1)', async () => {
      mockedUpdate.mockResolvedValue({ id: 'a1', planItemsReservedElsewhere: [reserved] } as never);
      render(<Arrive />);
      await userEvent.click(screen.getByRole('button', { name: 'Llegó' }));
      dismissReservedToasts();
      expect(toast.dismiss).toHaveBeenCalledWith('reserved:a1:i1');
      (toast.dismiss as jest.Mock).mockClear();
      dismissReservedToasts();
      expect(toast.dismiss).not.toHaveBeenCalled();
    });

    it('con un diálogo modal abierto, el aviso solo informa y remite a «En clínica» (D1)', async () => {
      mockedUpdate.mockResolvedValue({ id: 'a1', planItemsReservedElsewhere: [reserved] } as never);
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('data-state', 'open');
      document.body.appendChild(modal);
      try {
        render(<Arrive />);
        await userEvent.click(screen.getByRole('button', { name: 'Llegó' }));
        const options = (toast.warning as jest.Mock).mock.calls[0][1] as { action?: unknown; description: string };
        expect(options.action).toBeUndefined();
        expect(options.description).toBe(`${MESSAGE} Puedes traerlo a esta cita desde «En clínica».`);
      } finally {
        modal.remove();
      }
    });
  });
});
