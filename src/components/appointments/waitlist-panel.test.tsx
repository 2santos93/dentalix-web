import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WaitlistPanel } from './waitlist-panel';
import { ApiError } from '@/lib/api/client';
import {
  dismissWaitlistEntry,
  findOpenings,
  listWaitlist,
  scheduleFromWaitlist,
  type AppointmentWrite,
  type WaitlistEntry,
} from '@/lib/appointments/waitlist-api';

jest.mock('../../lib/appointments/waitlist-api', () => ({
  listWaitlist: jest.fn(),
  dismissWaitlistEntry: jest.fn(),
  findOpenings: jest.fn(),
  scheduleFromWaitlist: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));
const mockedList = listWaitlist as jest.MockedFunction<typeof listWaitlist>;
const mockedDismiss = dismissWaitlistEntry as jest.MockedFunction<typeof dismissWaitlistEntry>;
const mockedOpenings = findOpenings as jest.MockedFunction<typeof findOpenings>;
const mockedSchedule = scheduleFromWaitlist as jest.MockedFunction<typeof scheduleFromWaitlist>;

const staff = [
  { userId: 'rec-1', fullName: 'Laura Recepción', role: 'RECEPTION' as const },
  { userId: 'prov-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST' as const },
];

function entry(overrides: Partial<WaitlistEntry> & { id: string }): WaitlistEntry {
  return {
    tenantId: 't1',
    locationId: 'loc-1',
    patientId: 'pat-1',
    patientFirstName: 'Berta',
    patientLastName: 'Gil',
    patientPhone: '3105550101',
    sourceAppointmentId: 'apt-1',
    sourceAppointment: {
      start: new Date('2031-03-03T10:00:00').toISOString(),
      end: new Date('2031-03-03T10:45:00').toISOString(),
      status: 'CANCELLED',
    },
    providerId: null,
    appointmentTypeId: null,
    appointmentType: null,
    durationMinutes: 45,
    priority: 'NORMAL',
    preferredWindow: null,
    note: null,
    status: 'OPEN',
    resolvedAppointmentId: null,
    dismissReason: null,
    createdById: null,
    resolvedById: null,
    resolvedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const berta = entry({ id: 'wl-1' });
const carla = entry({
  id: 'wl-2',
  patientFirstName: 'Carla',
  patientLastName: 'Ruiz',
  priority: 'URGENT',
  sourceAppointmentId: null,
  sourceAppointment: null,
  preferredWindow: 'Mañanas',
  patientPhone: null,
});

function page(items: WaitlistEntry[]) {
  return { items, total: items.length, page: 1, pageSize: 50 };
}

describe('WaitlistPanel (DX-122)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedDismiss.mockReset();
    mockedOpenings.mockReset();
    mockedSchedule.mockReset();
  });

  it('carga y lista con prioridad, origen, antigüedad y teléfono', async () => {
    mockedList.mockResolvedValue(page([carla, berta]));
    const onCountChange = jest.fn();
    render(<WaitlistPanel token="tok" staff={staff} onCountChange={onCountChange} />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando pendientes…');
    const items = await screen.findAllByTestId('waitlist-entry');
    expect(within(items[0]).getByText('Carla Ruiz')).toBeInTheDocument();
    expect(within(items[0]).getByText('Urgente')).toBeInTheDocument();
    expect(within(items[0]).getByText('Alta manual')).toBeInTheDocument();
    expect(within(items[0]).getByText('Prefiere: Mañanas')).toBeInTheDocument();
    expect(within(items[1]).getByText(/^Canceló la cita del/)).toBeInTheDocument();
    expect(within(items[1]).getByText('Desde hoy · 45 min')).toBeInTheDocument();
    expect(within(items[1]).getByRole('link', { name: 'Llamar al 3105550101' })).toHaveAttribute(
      'href',
      'tel:3105550101',
    );
    expect(screen.getByText('2 pacientes')).toBeInTheDocument();
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(2));
  });

  it('vacío: «No hay pacientes pendientes por agendar»', async () => {
    mockedList.mockResolvedValue(page([]));
    render(<WaitlistPanel token="tok" staff={staff} />);
    expect(await screen.findByText('No hay pacientes pendientes por agendar')).toBeInTheDocument();
  });

  it('error con Reintentar (escalón 1) y vuelve a cargar', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce(page([berta]));
    render(<WaitlistPanel token="tok" staff={staff} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar los pendientes.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Berta Gil')).toBeInTheDocument();
  });

  it('descartar pide motivo, lo manda y saca al paciente de la lista', async () => {
    mockedList.mockResolvedValue(page([berta]));
    mockedDismiss.mockResolvedValue({ ...berta, status: 'DISMISSED' });
    const onCountChange = jest.fn();
    render(<WaitlistPanel token="tok" staff={staff} onCountChange={onCountChange} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar a Berta Gil' }));

    const dialog = await screen.findByRole('dialog', { name: 'Descartar a Berta Gil' });
    await userEvent.type(within(dialog).getByLabelText('Motivo'), '  No contesta  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(mockedDismiss).toHaveBeenCalledWith('tok', 'wl-1', 'No contesta'));
    expect(await screen.findByText('No hay pacientes pendientes por agendar')).toBeInTheDocument();
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(0));
  });

  it('«Buscar hueco» → «Agendar aquí»: crea la cita y saca la entrada', async () => {
    mockedList.mockResolvedValue(page([berta]));
    const opening = {
      start: new Date('2031-03-10T09:00:00').toISOString(),
      end: new Date('2031-03-10T12:00:00').toISOString(),
    };
    mockedOpenings.mockResolvedValue({
      timeZone: 'America/Bogota',
      durationMinutes: 45,
      openings: [opening],
      truncated: false,
    });
    const created = {
      id: 'apt-9',
      start: opening.start,
      end: new Date('2031-03-10T09:45:00').toISOString(),
      warnings: [],
    } as unknown as AppointmentWrite;
    mockedSchedule.mockResolvedValue(created);
    const onScheduled = jest.fn();
    render(<WaitlistPanel token="tok" staff={staff} onScheduled={onScheduled} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Buscar hueco para Berta Gil' }));
    const dialog = await screen.findByRole('dialog', { name: 'Buscar hueco para Berta Gil' });
    // Por defecto, quien atiende (la odontóloga), no recepción.
    expect(within(dialog).getByLabelText('Profesional')).toHaveValue('prov-1');
    await waitFor(() =>
      expect(mockedOpenings).toHaveBeenCalledWith('tok', expect.objectContaining({
        providerId: 'prov-1',
        locationId: 'loc-1',
        durationMinutes: 45,
        patientId: 'pat-1',
      })),
    );
    await userEvent.click(await within(dialog).findByRole('button', { name: /^Agendar aquí el / }));

    await waitFor(() => expect(onScheduled).toHaveBeenCalledWith(created));
    expect(mockedSchedule).toHaveBeenCalledWith('tok', 'wl-1', { providerId: 'prov-1', start: opening.start });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Berta Gil')).not.toBeInTheDocument();
  });
});
