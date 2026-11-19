import {
  cancelAppointmentSeries,
  createAppointmentSeries,
  isSeriesStale,
  moveAppointmentSeries,
  previewAppointmentSeries,
  previewMoveAppointmentSeries,
  SERIES_NOTIFY_REASON_LABELS,
  seriesConflictsOf,
  seriesLabel,
} from './appointment-series-api';
import { apiFetch, apiErrorFromBody } from '@/lib/api/client';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));

const mockedFetch = jest.mocked(apiFetch);

const base = {
  patientId: 'pat-1',
  providerId: 'staff-1',
  start: '2027-01-11T13:00:00.000Z',
  end: '2027-01-11T13:30:00.000Z',
  intervalWeeks: 4,
  count: 6,
};

describe('appointment-series-api (DX-562)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('vista previa y crear: POST con la sede en la cabecera si se indica', () => {
    void previewAppointmentSeries('t', base);
    expect(mockedFetch).toHaveBeenLastCalledWith('/appointments/series/preview', {
      method: 'POST',
      body: base,
      token: 't',
    });
    const input = { ...base, occurrences: [{ start: base.start }, { start: '2027-02-08T13:00:00.000Z' }], notifyPatient: false };
    void createAppointmentSeries('t', input, 'loc-1');
    expect(mockedFetch).toHaveBeenLastCalledWith('/appointments/series', {
      method: 'POST',
      body: input,
      token: 't',
      headers: { 'X-Location-Id': 'loc-1' },
    });
  });

  it('cancelar y mover: el id de la serie va codificado en la ruta', () => {
    const cancel = { fromAppointmentId: 'apt-4', cancelledByKind: 'CLINIC' as const, cancelReasonCode: 'CLINIC_RESCHEDULE' as const };
    void cancelAppointmentSeries('t', '../x', cancel);
    expect(mockedFetch).toHaveBeenLastCalledWith('/appointments/series/..%2Fx/cancel', {
      method: 'POST',
      body: cancel,
      token: 't',
    });
    const move = { fromAppointmentId: 'apt-2', start: '2027-02-09T14:00:00.000Z' };
    void previewMoveAppointmentSeries('t', 's-1', move);
    expect(mockedFetch.mock.calls.at(-1)?.[0]).toBe('/appointments/series/s-1/move/preview');
    void moveAppointmentSeries('t', 's-1', move);
    expect(mockedFetch.mock.calls.at(-1)?.[0]).toBe('/appointments/series/s-1/move');
  });

  it('el 409 APPOINTMENT_SERIES_CONFLICT trae las fechas que chocan, con su índice y razones', () => {
    const err = apiErrorFromBody(
      409,
      {
        statusCode: 409,
        code: 'APPOINTMENT_SERIES_CONFLICT',
        message: 'Algunas fechas de la serie ya no están libres. Revisa la vista previa y ajústalas u omítelas.',
        conflicts: [
          {
            index: 3,
            start: '2027-03-08T13:00:00.000Z',
            end: '2027-03-08T13:30:00.000Z',
            reasons: [{ code: 'PROVIDER_OVERLAP', message: 'El profesional ya tiene una cita en ese horario' }],
          },
          { index: 'x', start: 1 },
        ],
      },
      null,
    );
    expect(seriesConflictsOf(err)).toEqual([
      {
        index: 3,
        start: '2027-03-08T13:00:00.000Z',
        end: '2027-03-08T13:30:00.000Z',
        reasons: [{ code: 'PROVIDER_OVERLAP', message: 'El profesional ya tiene una cita en ese horario' }],
      },
    ]);
    // Una carrera sin fecha concreta: lista vacía, pero sigue siendo el 409 de la serie.
    expect(seriesConflictsOf(apiErrorFromBody(409, { code: 'APPOINTMENT_SERIES_CONFLICT', conflicts: [] }, null))).toEqual([]);
    expect(seriesConflictsOf(new ApiError(409, 'x', { code: 'RESERVED_SLOT' }))).toBeNull();
    expect(seriesConflictsOf(new Error('x'))).toBeNull();
  });

  it('el 409 APPOINTMENT_SERIES_STALE se reconoce y trae las citas que cambiaron', () => {
    const err = apiErrorFromBody(409, { code: 'APPOINTMENT_SERIES_STALE', appointmentIds: ['apt-5', 7] }, null);
    expect(isSeriesStale(err)).toBe(true);
    expect(err.appointmentIds).toEqual(['apt-5']);
    expect(isSeriesStale(new ApiError(409, 'x', { code: 'APPOINTMENT_SERIES_CONFLICT' }))).toBe(false);
  });

  it('«Serie · 3 de 6» y los motivos del aviso, en español', () => {
    expect(seriesLabel({ id: 's', index: 3, total: 6 })).toBe('Serie · 3 de 6');
    expect(seriesLabel({ id: 's', index: 3, total: null })).toBe('Serie · 3');
    expect(SERIES_NOTIFY_REASON_LABELS.DISABLED).toBeNull();
    expect(SERIES_NOTIFY_REASON_LABELS.QUOTA).toMatch(/límite de emails/);
    expect(SERIES_NOTIFY_REASON_LABELS.OPTED_OUT).toMatch(/baja/);
  });
});
