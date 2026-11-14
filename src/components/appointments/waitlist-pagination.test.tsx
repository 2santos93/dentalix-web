import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WaitlistPanel } from './waitlist-panel';
import { useWaitlist } from './use-waitlist';
import { listWaitlist, type WaitlistEntry } from '@/lib/appointments/waitlist-api';
import { ApiError } from '@/lib/api/client';
import { testAgendaClock } from '@/lib/test/sede-clock';

jest.mock('../../lib/appointments/waitlist-api', () => ({
  listWaitlist: jest.fn(),
  dismissWaitlistEntry: jest.fn(),
  findOpenings: jest.fn(),
  scheduleFromWaitlist: jest.fn(),
}));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const mockedList = listWaitlist as jest.MockedFunction<typeof listWaitlist>;
const CLOCK = testAgendaClock();
const TOTAL = 120;

function entry(n: number): WaitlistEntry {
  return {
    id: `wl-${n}`,
    tenantId: 't1',
    locationId: 'loc-1',
    patientId: `pat-${n}`,
    patientFirstName: `Paciente${n}`,
    patientLastName: 'Prueba',
    patientPhone: null,
    sourceAppointmentId: null,
    sourceAppointment: null,
    providerId: null,
    appointmentTypeId: null,
    appointmentType: null,
    durationMinutes: 30,
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
  } as WaitlistEntry;
}

/** API simulada con 120 pendientes, paginada como la real. */
let all: WaitlistEntry[] = [];
function fakeApi() {
  all = Array.from({ length: TOTAL }, (_, i) => entry(i + 1));
  mockedList.mockImplementation(async (_token, params = {}) => {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 50;
    return { items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize };
  });
}

function Harness({ reloadKey = 0 }: { reloadKey?: number }) {
  const waitlist = useWaitlist('tok', reloadKey);
  return (
    <>
      <button type="button" onClick={() => waitlist.remove('wl-3')}>
        resolver 3
      </button>
      <WaitlistPanel clock={CLOCK} token="tok" staff={[]} waitlist={waitlist} />
    </>
  );
}

describe('«Cargar más» en pendientes (DX-181, FE-046)', () => {
  beforeEach(() => mockedList.mockReset());

  it('con 120 pendientes: 3 pasos; al final el botón desaparece y dice «Se muestran 120 de 120»', async () => {
    fakeApi();
    render(<Harness />);
    expect(await screen.findAllByTestId('waitlist-entry')).toHaveLength(50);
    expect(screen.getByText('Se muestran 50 de 120.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(100));
    expect(screen.getByText('Se muestran 100 de 120.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(120));
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.getByText('Se muestran 120 de 120.')).toBeInTheDocument();
    expect(mockedList.mock.calls.map(([, p]) => p?.page)).toEqual([1, 2, 3]);
  });

  it('tras cargar, el foco va al primer pendiente nuevo y un role="status" anuncia cuántos se añadieron', async () => {
    fakeApi();
    render(<Harness />);
    await screen.findAllByTestId('waitlist-entry');
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(100));
    const items = screen.getAllByTestId('waitlist-entry');
    expect(items[50]).toHaveFocus();
    expect(items[50]).toHaveTextContent('Paciente51');
    expect(screen.getByText('Se añadieron 50 pacientes a la lista.').closest('[role="status"]')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(120));
    expect(screen.getAllByTestId('waitlist-entry')[100]).toHaveFocus();
    expect(screen.getByText('Se añadieron 20 pacientes a la lista.')).toBeInTheDocument();
  });

  it('si falla la siguiente página, avisa y conserva lo ya cargado y el botón', async () => {
    fakeApi();
    render(<Harness />);
    await screen.findAllByTestId('waitlist-entry');
    mockedList.mockRejectedValueOnce(new ApiError(500, 'x', {}));
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(50);
    expect(screen.getByRole('button', { name: 'Cargar más' })).toBeEnabled();
  });
  it('resolver uno y luego «Cargar más» no salta a nadie y los totales cuadran (119 de 119)', async () => {
    fakeApi();
    render(<Harness />);
    await screen.findAllByTestId('waitlist-entry');
    // Se agenda el #3 aquí: el servidor ya no lo cuenta y las páginas se corren.
    await userEvent.click(screen.getByRole('button', { name: 'resolver 3' }));
    all = all.filter((e) => e.id !== 'wl-3');
    expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(49);
    expect(screen.getByText('Se muestran 49 de 119.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(100));
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(119));
    const names = screen.getAllByTestId('waitlist-entry').map((li) => li.getAttribute('data-entry-id'));
    expect(names).toEqual(all.map((e) => e.id)); // ninguno saltado, ninguno repetido, en orden
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    expect(screen.getByText('Se muestran 119 de 119.')).toBeInTheDocument();
    expect(screen.getByText('119 pacientes')).toBeInTheDocument();
  });

  it('una respuesta de «Cargar más» que llega tras recargar la lista se descarta', async () => {
    fakeApi();
    const { rerender } = render(<Harness />);
    await screen.findAllByTestId('waitlist-entry');
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const impl = mockedList.getMockImplementation()!;
    mockedList.mockImplementationOnce(async (t, p) => {
      await gate;
      return impl(t, p);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    rerender(<Harness reloadKey={1} />); // recarga la lista mientras la página 2 sigue en vuelo
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(3));
    await screen.findAllByTestId('waitlist-entry');
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getAllByTestId('waitlist-entry')).toHaveLength(50);
    expect(screen.getByText('Se muestran 50 de 120.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cargar más' })).toHaveAttribute('aria-disabled', 'false');
  });
});
