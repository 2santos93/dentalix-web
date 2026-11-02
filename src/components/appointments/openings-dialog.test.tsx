import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpeningsDialog } from './openings-dialog';
import { ApiError } from '@/lib/api/client';
import {
  findOpenings,
  scheduleFromWaitlist,
  type WaitlistEntry,
} from '@/lib/appointments/waitlist-api';
import { listChairs, type Chair } from '@/lib/chairs/chairs-api';
import { testAgendaClock } from '@/lib/test/sede-clock';

/** Reloj de la sede de pruebas (UTC, 24 h): estas pruebas no tratan del reloj. */
const CLOCK = testAgendaClock();

jest.mock('../../lib/appointments/waitlist-api', () => ({
  findOpenings: jest.fn(),
  scheduleFromWaitlist: jest.fn(),
}));
jest.mock('../../lib/chairs/chairs-api', () => ({ listChairs: jest.fn() }));
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
const mockedOpenings = findOpenings as jest.MockedFunction<typeof findOpenings>;
const mockedSchedule = scheduleFromWaitlist as jest.MockedFunction<typeof scheduleFromWaitlist>;
const mockedChairs = listChairs as jest.MockedFunction<typeof listChairs>;

const entry = {
  id: 'wl-1',
  locationId: 'loc-1',
  patientId: 'pat-1',
  patientFirstName: 'Berta',
  patientLastName: 'Gil',
  providerId: 'prov-2',
  durationMinutes: 30,
} as WaitlistEntry;
const providers = [
  { userId: 'prov-1', fullName: 'Dra. Ana Ríos', role: 'DENTIST' as const, locationIds: null },
  { userId: 'prov-2', fullName: 'Dr. Luis Gómez', role: 'DENTIST' as const, locationIds: null },
];
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();

const onEntryGone = jest.fn();

function renderDialog() {
  const onScheduled = jest.fn();
  render(
    <OpeningsDialog clock={CLOCK}
      open
      onOpenChange={jest.fn()}
      token="tok"
      entry={entry}
      providers={providers}
      onScheduled={onScheduled}
      onEntryGone={onEntryGone}
    />,
  );
  return onScheduled;
}

describe('OpeningsDialog (DX-122)', () => {
  beforeEach(() => {
    mockedOpenings.mockReset();
    mockedSchedule.mockReset();
    onEntryGone.mockReset();
    mockedChairs.mockReset();
    mockedChairs.mockResolvedValue([]);
  });

  describe('con sillón (DX-492)', () => {
    const chairs = [
      { id: 'c1', name: 'Sillón 1', active: true },
      { id: 'c2', name: 'Sillón 2', active: true },
    ] as Chair[];
    const opening = {
      start: at('2031-03-10', '09:00'),
      end: at('2031-03-10', '10:00'),
      chair: { id: 'c2', name: 'Sillón 2', active: true },
    };
    const result = { timeZone: 'UTC', durationMinutes: 30, truncated: false, openings: [opening] };

    it('un sillón filtra la búsqueda; el hueco dice el libre y «Agendar aquí» lo guarda', async () => {
      mockedChairs.mockResolvedValue(chairs);
      mockedOpenings.mockResolvedValue(result);
      mockedSchedule.mockResolvedValue({
        id: 'a1',
        start: opening.start,
        end: opening.end,
      } as never);
      renderDialog();
      const select = await screen.findByLabelText('Sillón');
      await userEvent.selectOptions(select, 'c2');
      await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
      await waitFor(() => expect(mockedOpenings).toHaveBeenCalledTimes(2));
      expect(mockedOpenings.mock.calls[1][1]).toMatchObject({ chairIds: ['c2'] });
      expect(await screen.findByTestId('opening-chair')).toHaveTextContent('Sillón 2');
      await userEvent.click(screen.getByRole('button', { name: /^Agendar aquí/ }));
      await waitFor(() => expect(mockedSchedule).toHaveBeenCalledTimes(1));
      expect(mockedSchedule.mock.calls[0][2]).toMatchObject({ chairId: 'c2' });
    });

    it('«Cualquier sillón libre» pide todos los de la sede', async () => {
      mockedChairs.mockResolvedValue(chairs);
      mockedOpenings.mockResolvedValue(result);
      renderDialog();
      await userEvent.selectOptions(await screen.findByLabelText('Sillón'), 'any');
      await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
      await waitFor(() => expect(mockedOpenings).toHaveBeenCalledTimes(2));
      expect(mockedOpenings.mock.calls[1][1]).toMatchObject({ chairIds: ['c1', 'c2'] });
    });

    it('sin sillones en la sede no sale el campo', async () => {
      mockedOpenings.mockResolvedValue({ ...result, openings: [] });
      renderDialog();
      await waitFor(() => expect(mockedChairs).toHaveBeenCalled());
      expect(screen.queryByLabelText('Sillón')).not.toBeInTheDocument();
    });
  });

  it('busca con el profesional de la entrada y agrupa los huecos por día', async () => {
    mockedOpenings.mockResolvedValue({
      timeZone: 'America/Caracas',
      durationMinutes: 30,
      truncated: true,
      openings: [
        { start: at('2031-03-10', '09:00'), end: at('2031-03-10', '12:00') },
        { start: at('2031-03-10', '15:00'), end: at('2031-03-10', '19:00') },
        { start: at('2031-03-11', '09:00'), end: at('2031-03-11', '10:00') },
      ],
    });
    renderDialog();
    expect(screen.getByRole('status')).toHaveTextContent('Buscando huecos…');
    expect(await screen.findAllByTestId('opening')).toHaveLength(3);
    expect(screen.getByText('09:00–12:00')).toBeInTheDocument();
    expect(screen.getByText(/acota las fechas/)).toBeInTheDocument();
    expect(mockedOpenings.mock.calls[0][1]).toMatchObject({ providerId: 'prov-2', durationMinutes: 30 });

    await userEvent.selectOptions(screen.getByLabelText('Profesional'), 'prov-1');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(mockedOpenings).toHaveBeenCalledTimes(2));
    expect(mockedOpenings.mock.calls[1][1]).toMatchObject({ providerId: 'prov-1' });
  });

  it('vacío: lo dice y sugiere otra búsqueda', async () => {
    mockedOpenings.mockResolvedValue({ timeZone: 'UTC', durationMinutes: 30, truncated: false, openings: [] });
    renderDialog();
    expect(await screen.findByText('No hay huecos libres en estas fechas')).toBeInTheDocument();
  });

  it('error con Reintentar', async () => {
    mockedOpenings
      .mockRejectedValueOnce(new ApiError(500, 'boom'))
      .mockResolvedValueOnce({ timeZone: 'UTC', durationMinutes: 30, truncated: false, openings: [] });
    renderDialog();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos buscar huecos.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No hay huecos libres en estas fechas')).toBeInTheDocument();
  });

  it('si agendar falla (409), lo dice junto a los huecos y no cierra', async () => {
    mockedOpenings.mockResolvedValue({
      timeZone: 'UTC',
      durationMinutes: 30,
      truncated: false,
      openings: [{ start: at('2031-03-10', '09:00'), end: at('2031-03-10', '12:00') }],
    });
    mockedSchedule.mockRejectedValue(
      new ApiError(409, 'x', { messages: ['El profesional ya tiene una cita en ese horario'] }),
    );
    const onScheduled = renderDialog();
    await userEvent.click(await screen.findByRole('button', { name: /^Agendar aquí el / }));
    expect(await screen.findByText('El profesional ya tiene una cita en ese horario')).toBeInTheDocument();
    expect(onScheduled).not.toHaveBeenCalled();
    // El hueco se ocupó: se vuelven a pedir los huecos.
    await waitFor(() => expect(mockedOpenings).toHaveBeenCalledTimes(2));
    expect(onEntryGone).not.toHaveBeenCalled();
  });
});
