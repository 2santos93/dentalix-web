import { ApiError } from '@/lib/api/api-error';
import { findOpenings } from '@/lib/appointments/waitlist-api';
import { APPOINTMENT_OVERLAP, canOfferNextOpening, findNextOpening } from './next-opening';

jest.mock('./waitlist-api', () => ({ findOpenings: jest.fn() }));
const mocked = findOpenings as jest.MockedFunction<typeof findOpenings>;

const appointment = {
  id: 'apt-1',
  patientId: 'pat-1',
  locationId: 'loc-1',
  start: '2026-11-10T13:00:00.000Z',
  end: '2026-11-10T13:30:00.000Z',
};
const openings = (list: [string, string][]) => ({
  timeZone: 'America/Caracas',
  durationMinutes: 30,
  truncated: false,
  openings: list.map(([start, end]) => ({ start, end })),
});

describe('next-opening (DX-509-bis)', () => {
  beforeEach(() => mocked.mockReset());

  it('solo un sobrecupo con el 409 de solape', () => {
    const overlap = new ApiError(409, 'x', { code: APPOINTMENT_OVERLAP });
    expect(canOfferNextOpening({ overbooked: true }, overlap)).toBe(true);
    expect(canOfferNextOpening({ overbooked: false }, overlap)).toBe(false);
    expect(canOfferNextOpening({}, overlap)).toBe(false);
    expect(canOfferNextOpening({ overbooked: true }, new ApiError(409, 'x'))).toBe(false);
    expect(canOfferNextOpening({ overbooked: true }, new ApiError(422, 'x', { code: APPOINTMENT_OVERLAP }))).toBe(true);
    expect(canOfferNextOpening({ overbooked: true }, new Error('x'))).toBe(false);
  });

  it('pide 14 días desde el día del destino (en la zona de la sede), sin la propia cita, y toma el primero que cabe desde la hora pedida', async () => {
    mocked.mockResolvedValue(
      openings([
        ['2026-11-11T12:00:00.000Z', '2026-11-11T14:00:00.000Z'],
        ['2026-11-11T15:00:00.000Z', '2026-11-11T15:20:00.000Z'],
        ['2026-11-11T16:05:00.000Z', '2026-11-11T18:00:00.000Z'],
      ]),
    );
    // Destino 11/11 15:10 UTC (11:10 en Caracas).
    const target = { start: '2026-11-11T15:10:00.000Z', end: '2026-11-11T15:40:00.000Z', providerId: 'prov-2' };
    await expect(findNextOpening('tok', appointment, target, 'America/Caracas')).resolves.toEqual({
      start: '2026-11-11T16:05:00.000Z',
      end: '2026-11-11T16:35:00.000Z',
      providerId: 'prov-2',
    });
    expect(mocked).toHaveBeenCalledWith('tok', {
      providerId: 'prov-2',
      locationId: 'loc-1',
      from: '2026-11-11',
      to: '2026-11-24',
      durationMinutes: 30,
      patientId: 'pat-1',
      excludeAppointmentId: 'apt-1',
    });
  });

  it('un hueco que empieza antes pero sigue libre a la hora pedida vale desde esa hora; sin nada, null', async () => {
    mocked.mockResolvedValueOnce(openings([['2026-11-11T14:00:00.000Z', '2026-11-11T17:00:00.000Z']]));
    const target = { start: '2026-11-11T15:10:00.000Z', end: '2026-11-11T15:40:00.000Z', providerId: 'p' };
    await expect(findNextOpening('tok', appointment, target, 'UTC')).resolves.toMatchObject({
      start: '2026-11-11T15:10:00.000Z',
    });
    mocked.mockResolvedValueOnce(openings([]));
    await expect(findNextOpening('tok', appointment, target, 'UTC')).resolves.toBeNull();
  });
});
