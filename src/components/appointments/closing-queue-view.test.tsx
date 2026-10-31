import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ClosingQueueView, closingQueueCopy } from './closing-queue-view';
import { dismissClosingCopy } from './dismiss-closing-dialog';
import { NetworkError } from '@/lib/api/api-error';
import {
  dismissClosingItem,
  getClosingQueue,
  type ClosingAppointment,
  type ClosingQueue,
} from '@/lib/appointments/closing-queue-api';
import { updateAppointment } from '@/lib/appointments/appointments-api';

jest.mock('../../lib/appointments/closing-queue-api', () => ({
  ...jest.requireActual('../../lib/appointments/closing-queue-api'),
  getClosingQueue: jest.fn(),
  dismissClosingItem: jest.fn(),
}));
jest.mock('../../lib/appointments/appointments-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointments-api'),
  updateAppointment: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(() =>
    Promise.resolve([jest.requireActual('../../lib/test/locations').clinicLocation({ hourCycle: 'h23' })]),
  ),
}));

const load = getClosingQueue as jest.MockedFunction<typeof getClosingQueue>;
const dismiss = dismissClosingItem as jest.MockedFunction<typeof dismissClosingItem>;
const update = updateAppointment as jest.MockedFunction<typeof updateAppointment>;

function appointment(over: Partial<ClosingAppointment> = {}): ClosingAppointment {
  return {
    appointmentId: 'a1',
    patientId: 'p1',
    patientName: 'Ana Pérez',
    // 30/10 23:00 UTC = 30/10 19:00 en Caracas (UTC−4).
    start: '2026-10-30T23:00:00.000Z',
    end: '2026-10-30T23:30:00.000Z',
    status: 'CONFIRMED',
    locationId: 'l1',
    locationName: 'Sede Caracas',
    timeZone: 'America/Caracas',
    professionalId: 'd1',
    professionalName: 'Dra. Uno',
    ...over,
  };
}

function queue(over: Partial<ClosingQueue> = {}): ClosingQueue {
  return {
    from: null,
    to: null,
    defaultDays: 14,
    sections: ['OUTCOME', 'EVOLUTION', 'TREATMENT'],
    outcome: { total: 1, items: [appointment()] },
    evolution: {
      total: 1,
      items: [appointment({ appointmentId: 'a2', patientName: 'Luis Gómez', status: 'COMPLETED' })],
    },
    treatment: {
      total: 1,
      items: [
        {
          ...appointment({ appointmentId: 'a3', patientName: 'Marta Ruiz', status: 'COMPLETED' }),
          planId: 'plan1',
          planItemId: 'item1',
          procedureCode: 'RES-1',
          procedureLabel: 'Resina',
          toothNumber: '16',
          surfaces: [],
        },
      ],
    },
    staleInClinic: 0,
    total: 3,
    locations: [{ id: 'l1', name: 'Sede Caracas' }],
    ...over,
  };
}

const empty = (over: Partial<ClosingQueue> = {}) =>
  queue({
    outcome: { total: 0, items: [] },
    evolution: { total: 0, items: [] },
    treatment: { total: 0, items: [] },
    total: 0,
    ...over,
  });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ClosingQueueView (DX-439)', () => {
  it('pinta el contador de cada sección y las filas con la hora de la sede', async () => {
    load.mockResolvedValue(queue());
    render(<ClosingQueueView token="t" />);
    expect(await screen.findByRole('heading', { name: /Citas sin desenlace/ })).toBeInTheDocument();
    expect(screen.getByTestId('closing-count-OUTCOME')).toHaveTextContent('1');
    expect(screen.getByTestId('closing-count-EVOLUTION')).toHaveTextContent('1');
    expect(screen.getByTestId('closing-count-TREATMENT')).toHaveTextContent('1');
    const outcome = screen.getByRole('table', { name: 'Citas sin desenlace' });
    expect(within(outcome).getByText('30/10/2026 19:00')).toBeInTheDocument();
    expect(screen.getByText('Resina · diente 16')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: closingQueueCopy.writeEvolution })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: closingQueueCopy.markDone })).toBeInTheDocument();
  });

  it('solo pinta las secciones que la API devuelve para el rol', async () => {
    load.mockResolvedValue(queue({ sections: ['OUTCOME'], evolution: null, treatment: null, total: 1 }));
    render(<ClosingQueueView token="t" />);
    expect(await screen.findByRole('heading', { name: /Citas sin desenlace/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Atendidas sin evolución/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('closing-count-TREATMENT')).not.toBeInTheDocument();
  });

  it('sin nada pendiente: «Todo cerrado»', async () => {
    load.mockResolvedValue(empty());
    render(<ClosingQueueView token="t" />);
    expect(await screen.findByText(closingQueueCopy.empty)).toBeInTheDocument();
  });

  it('error al cargar: sección de error con «Reintentar» que vuelve a pedir la lista', async () => {
    load.mockRejectedValueOnce(new NetworkError(new TypeError('Failed to fetch'))).mockResolvedValueOnce(empty());
    render(<ClosingQueueView token="t" />);
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button'));
    expect(await screen.findByText(closingQueueCopy.empty)).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('«No asistió» cambia el estado con el endpoint de la cita y relee la lista', async () => {
    load.mockResolvedValueOnce(queue()).mockResolvedValueOnce(
      queue({ outcome: { total: 0, items: [] }, total: 2 }),
    );
    update.mockResolvedValue({} as Awaited<ReturnType<typeof updateAppointment>>);
    render(<ClosingQueueView token="t" />);
    fireEvent.click(await screen.findByRole('button', { name: closingQueueCopy.noShow }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('t', 'a1', { status: 'NO_SHOW' }));
    await waitFor(() => expect(screen.getByTestId('closing-count-OUTCOME')).toHaveTextContent('0'));
  });

  it('descartar pide un motivo de la lista y, con «Otro», el texto', async () => {
    load.mockResolvedValue(queue());
    dismiss.mockResolvedValue({
      id: 'd1',
      section: 'EVOLUTION',
      appointmentId: 'a2',
      planItemId: null,
      reasonCode: 'OTHER',
      createdAt: '2026-10-31T12:00:00.000Z',
    });
    render(<ClosingQueueView token="t" />);
    const evolution = await screen.findByRole('table', { name: 'Atendidas sin evolución' });
    fireEvent.click(within(evolution).getByRole('button', { name: closingQueueCopy.dismiss }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: dismissClosingCopy.submit }));
    expect(await within(dialog).findByText(dismissClosingCopy.reasonRequired)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('Otro'));
    fireEvent.click(within(dialog).getByRole('button', { name: dismissClosingCopy.submit }));
    expect(await within(dialog).findByText(dismissClosingCopy.otherRequired)).toBeInTheDocument();
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(dismissClosingCopy.other), {
      target: { value: '  Está en la ficha en papel ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: dismissClosingCopy.submit }));
    await waitFor(() =>
      expect(dismiss).toHaveBeenCalledWith('t', {
        section: 'EVOLUTION',
        appointmentId: 'a2',
        reasonCode: 'OTHER',
        reasonText: 'Está en la ficha en papel',
      }),
    );
  });

  it('avisa de las citas de días anteriores que siguen «en la clínica» y enlaza al panel', async () => {
    load.mockResolvedValue(queue({ staleInClinic: 2 }));
    render(<ClosingQueueView token="t" />);
    expect(await screen.findByText(/2 citas de días anteriores siguen/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: closingQueueCopy.staleInClinicLink })).toHaveAttribute(
      'href',
      '/agenda/en-clinica',
    );
  });
});
