import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeriesPreviewStep } from './series-preview-step';
import {
  createAppointmentSeries,
  previewAppointmentSeries,
  type SeriesPreview,
} from '@/lib/appointments/appointment-series-api';
import { apiErrorFromBody } from '@/lib/api/client';
import { testAgendaClock, caracasSede } from '@/lib/test/sede-clock';

jest.mock('../../lib/appointments/appointment-series-api', () => ({
  ...jest.requireActual('../../lib/appointments/appointment-series-api'),
  previewAppointmentSeries: jest.fn(),
  createAppointmentSeries: jest.fn(),
}));

const mockedPreview = jest.mocked(previewAppointmentSeries);
const mockedCreate = jest.mocked(createAppointmentSeries);

// Caracas (UTC−4): las 9:00 de la sede son las 13:00 UTC.
const clock = testAgendaClock([caracasSede()]);
const request = {
  patientId: 'pat-1',
  providerId: 'staff-1',
  start: '2027-01-11T13:00:00.000Z',
  end: '2027-01-11T13:30:00.000Z',
  intervalWeeks: 4,
  count: 6,
};

const days = ['2027-01-11', '2027-02-08', '2027-03-08', '2027-04-05', '2027-05-03', '2027-05-31'];

function preview(overrides: Partial<Record<number, Partial<SeriesPreview['occurrences'][number]>>> = {}): SeriesPreview {
  return {
    timeZone: 'America/Caracas',
    durationMinutes: 30,
    occurrences: days.map((day, i) => ({
      index: i + 1,
      start: `${day}T13:00:00.000Z`,
      end: `${day}T13:30:00.000Z`,
      status: 'OK' as const,
      reasons: [],
      warnings: [],
      warningCodes: [],
      alternative: null,
      ...overrides[i + 1],
    })),
  };
}

const holidayOn2 = {
  2: {
    status: 'CONFLICT' as const,
    reasons: [
      {
        code: 'LOCATION_HOLIDAY' as const,
        message: 'Ese día la sede está cerrada por festivo («Carnaval»): elige otro día.',
        holiday: { date: '2027-02-08', name: 'Carnaval' },
      },
    ],
  },
};

function renderStep(onCreated = jest.fn(), onBack = jest.fn()) {
  render(
    <SeriesPreviewStep token="tok" request={request} clock={clock} onBack={onBack} onCreated={onCreated} />,
  );
  return { onCreated, onBack };
}

const created = {
  seriesId: 's-1',
  intervalWeeks: 4,
  appointments: [],
  patientNotified: true,
  notifyReason: null,
};

describe('SeriesPreviewStep (DX-562)', () => {
  beforeEach(() => {
    mockedPreview.mockReset();
    mockedCreate.mockReset();
  });

  it('marca la fecha del festivo con su razón y no deja crear hasta resolverla; «Omitir» → «Crear 5 citas»', async () => {
    mockedPreview.mockResolvedValue(preview(holidayOn2));
    mockedCreate.mockResolvedValue(created);
    const user = userEvent.setup();
    const { onCreated } = renderStep();

    const row = await screen.findByTestId('series-occurrence-2');
    expect(within(row).getByText('Choca')).toBeInTheDocument();
    expect(within(row).getByText(/cerrada por festivo/)).toBeInTheDocument();
    // Festivo: sin alternativa del mismo día.
    expect(within(row).queryByRole('button', { name: /^Usar/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('series-pending')).toHaveTextContent('Queda 1 fecha que choca');
    expect(screen.getByRole('button', { name: 'Crear 6 citas' })).toBeDisabled();
    // Las horas en el reloj de la sede (9:00 a. m. en Caracas), no en UTC.
    expect(within(screen.getByTestId('series-occurrence-1')).getByText(/9:00/)).toBeInTheDocument();

    await user.click(within(row).getByRole('button', { name: 'Omitir' }));
    expect(within(row).getByText('Omitida')).toBeInTheDocument();
    expect(screen.getByTestId('series-count')).toHaveTextContent('5 citas');
    await user.click(screen.getByRole('button', { name: 'Crear 5 citas' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    const sent = mockedCreate.mock.calls[0][1];
    expect(sent).toMatchObject({ ...request, notifyPatient: true });
    expect(sent.occurrences.map((o) => o.start)).toEqual(
      [1, 3, 4, 5, 6].map((i) => `${days[i - 1]}T13:00:00.000Z`),
    );
  });

  it('«Usar 9:30» envía la alternativa; desmarcar el aviso manda notifyPatient: false', async () => {
    mockedPreview.mockResolvedValue(
      preview({
        3: {
          status: 'CONFLICT',
          reasons: [{ code: 'PROVIDER_OVERLAP', message: 'El profesional ya tiene una cita en ese horario' }],
          alternative: { start: '2027-03-08T13:30:00.000Z', end: '2027-03-08T14:00:00.000Z' },
        },
      }),
    );
    mockedCreate.mockResolvedValue(created);
    const user = userEvent.setup();
    renderStep();

    const row = await screen.findByTestId('series-occurrence-3');
    await user.click(within(row).getByRole('button', { name: /^Usar 9:30/ }));
    expect(within(row).getByText('Otra hora')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /avisar al paciente por email/i }));
    await user.click(screen.getByRole('button', { name: 'Crear 6 citas' }));

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled());
    const sent = mockedCreate.mock.calls[0][1];
    expect(sent.notifyPatient).toBe(false);
    expect(sent.occurrences[2]).toEqual({ start: '2027-03-08T13:30:00.000Z' });
  });

  it('«Elegir otra hora» compone el inicio de ese día en la zona de la sede', async () => {
    mockedPreview.mockResolvedValue(preview(holidayOn2));
    renderStep();
    const user = userEvent.setup();
    const row = await screen.findByTestId('series-occurrence-2');
    await user.click(within(row).getByRole('button', { name: 'Elegir otra hora' }));
    // Abre con la hora propuesta: ya no queda nada pendiente.
    expect(within(row).getByRole('group', { name: /otra hora para el/i })).toBeInTheDocument();
    expect(screen.queryByTestId('series-pending')).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Deshacer' }));
    expect(screen.getByTestId('series-pending')).toBeInTheDocument();
  });

  it('un 409 al crear vuelve a revisar las fechas y marca la que ya no estaba libre', async () => {
    mockedPreview
      .mockResolvedValueOnce(preview())
      .mockResolvedValueOnce(
        preview({
          4: {
            status: 'CONFLICT',
            reasons: [{ code: 'CHAIR_OVERLAP', message: 'El sillón Sillón 1 ya está ocupado de 9:00 a. m. a 9:30 a. m.' }],
          },
        }),
      );
    mockedCreate.mockRejectedValue(
      apiErrorFromBody(
        409,
        {
          code: 'APPOINTMENT_SERIES_CONFLICT',
          message: 'Algunas fechas de la serie ya no están libres. Revisa la vista previa y ajústalas u omítelas.',
          conflicts: [
            {
              index: 4,
              start: '2027-04-05T13:00:00.000Z',
              end: '2027-04-05T13:30:00.000Z',
              reasons: [{ code: 'CHAIR_OVERLAP', message: 'El sillón Sillón 1 ya está ocupado de 9:00 a. m. a 9:30 a. m.' }],
            },
          ],
        },
        null,
      ),
    );
    const user = userEvent.setup();
    const { onCreated } = renderStep();
    await user.click(await screen.findByRole('button', { name: 'Crear 6 citas' }));

    const row = await screen.findByText('Choca');
    expect(row.closest('li')).toHaveAttribute('data-testid', 'series-occurrence-4');
    expect(screen.getByText(/ya no están libres/)).toBeInTheDocument();
    expect(mockedPreview).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Crear 6 citas' })).toBeDisabled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('un 400 de la vista previa se dice en español y deja volver al paso 1', async () => {
    mockedPreview.mockRejectedValue(
      apiErrorFromBody(400, { message: 'Hasta esa fecha la serie pasaría de 26 citas: acorta la fecha final o espacia más las citas.' }, null),
    );
    const user = userEvent.setup();
    const { onBack } = renderStep();
    expect(await screen.findByText(/pasaría de 26 citas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalled();
  });
});
