import { ApiError } from '@/lib/api/api-error';
import {
  bookingClock,
  classifyBookingError,
  groupSlotsByDay,
  isValidCode,
  lastBookableDay,
  modeOf,
  normalizeCode,
  providersFor,
  typesAt,
  uniqueStarts,
  waitBeforeSubmit,
} from './booking-flow';
import type { PublicBookingConfig } from './online-booking-api';

const CONFIG: PublicBookingConfig = {
  clinicName: 'Clínica Ávila',
  newPatientMode: 'DIRECT',
  existingPatientMode: 'REQUEST',
  newPatientsAllowed: true,
  minLeadMinutesNew: 120,
  minLeadMinutesExisting: 60,
  maxAdvanceDays: 30,
  locations: [
    { id: 'loc-chacao', name: 'Sede Chacao', address: 'Av. Francisco de Miranda', timeZone: 'America/Caracas' },
    { id: 'loc-valencia', name: 'Sede Valencia', address: null, timeZone: 'America/Caracas' },
  ],
  types: [
    { id: 't-limpieza', name: 'Limpieza', durationNewMinutes: 45, durationExistingMinutes: 30, locationIds: ['loc-chacao', 'loc-valencia'], providerIds: ['p-1', 'p-2'] },
    { id: 't-orto', name: 'Ortodoncia', durationNewMinutes: 60, durationExistingMinutes: 60, locationIds: ['loc-valencia'], providerIds: ['p-2'] },
  ],
  providers: [
    { id: 'p-1', name: 'Dra. María Rodríguez', locationIds: ['loc-chacao'] },
    { id: 'p-2', name: 'Dr. José Pérez', locationIds: ['loc-chacao', 'loc-valencia'] },
  ],
  privacyPolicy: null,
  formToken: 'ft',
};

describe('booking-flow (DX-016)', () => {
  it('ofrece en cada sede solo sus tipos y, por tipo, los profesionales que lo atienden ahí', () => {
    expect(typesAt(CONFIG, 'loc-chacao').map((t) => t.id)).toEqual(['t-limpieza']);
    expect(typesAt(CONFIG, 'loc-valencia').map((t) => t.id)).toEqual(['t-limpieza', 't-orto']);
    expect(typesAt(CONFIG, null)).toEqual([]);
    expect(providersFor(CONFIG, 'loc-chacao', 't-limpieza').map((p) => p.id)).toEqual(['p-1', 'p-2']);
    expect(providersFor(CONFIG, 'loc-valencia', 't-limpieza').map((p) => p.id)).toEqual(['p-2']);
    expect(providersFor(CONFIG, 'loc-valencia', null)).toEqual([]);
  });

  it('el modo depende de si es nuevo o tiene ficha', () => {
    expect(modeOf(CONFIG, 'NEW')).toBe('DIRECT');
    expect(modeOf(CONFIG, 'EXISTING')).toBe('REQUEST');
  });

  it('agrupa los huecos por el día de la SEDE (Caracas), no por el UTC', () => {
    const slots = [
      // 02:00 UTC del 2 = 22:00 del 1 en Caracas.
      { start: '2026-12-02T02:00:00.000Z', end: '2026-12-02T02:30:00.000Z', providerId: 'p-1' },
      { start: '2026-12-02T13:00:00.000Z', end: '2026-12-02T13:30:00.000Z', providerId: 'p-1' },
      { start: '2026-12-02T12:00:00.000Z', end: '2026-12-02T12:30:00.000Z', providerId: 'p-2' },
    ];
    const days = groupSlotsByDay(slots, '2026-12-01', 3, 'America/Caracas');
    expect(days.map((d) => d.day)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(days[0].slots.map((s) => s.start)).toEqual(['2026-12-02T02:00:00.000Z']);
    // Ordenados por hora.
    expect(days[1].slots.map((s) => s.start)).toEqual(['2026-12-02T12:00:00.000Z', '2026-12-02T13:00:00.000Z']);
    expect(days[2].slots).toEqual([]);
  });

  it('con «Cualquiera disponible» cada hora sale una vez', () => {
    const a = { start: '2026-12-02T13:00:00.000Z', end: '2026-12-02T13:30:00.000Z', providerId: 'p-1' };
    const b = { ...a, providerId: 'p-2' };
    expect(uniqueStarts([a, b])).toEqual([a]);
  });

  it('el último día reservable es hoy + la antelación máxima', () => {
    expect(lastBookableDay('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('sin locale ni reloj de la sede no hay reloj (nunca el del navegador)', () => {
    expect(bookingClock({ timeZone: 'America/Caracas' })).toBeNull();
    const clock = bookingClock({ timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' });
    expect(clock?.timeZone).toBe('America/Caracas');
    expect(clock?.fmt.hourCycle).toBe('h12');
  });

  it('espera lo que falte de los 4 s mínimos antes de enviar', () => {
    expect(waitBeforeSubmit(1000, 2000, 4)).toBe(3250);
    expect(waitBeforeSubmit(1000, 9000, 4)).toBe(0);
  });

  it('normaliza el código pegado con espacios o guiones', () => {
    expect(normalizeCode(' 123-456 ')).toBe('123456');
    expect(isValidCode('123456')).toBe(true);
    expect(isValidCode('12345')).toBe(false);
  });

  describe('classifyBookingError', () => {
    const conflict = (code: string, extra: Record<string, unknown> = {}) =>
      new ApiError(409, 'Ese hueco se acaba de ocupar. Elige otra hora: las demás siguen disponibles.', {
        code,
        ...extra,
      });

    it('409 TAKEN: vuelta a elegir hora, con la sesión de reintento si la trae', () => {
      expect(classifyBookingError(conflict('ONLINE_SLOT_TAKEN', { sessionToken: 'retry' }))).toEqual({
        kind: 'slot',
        text: 'Ese hueco se acaba de ocupar. Elige otra hora: las demás siguen disponibles.',
        sessionToken: 'retry',
      });
      expect(classifyBookingError(conflict('ONLINE_SLOT_GONE'))).toMatchObject({ kind: 'slot', sessionToken: null });
      expect(classifyBookingError(conflict('ONLINE_PATIENT_BUSY'))).toMatchObject({ kind: 'slot' });
    });

    it('409 sesión usada y 401: vuelta a identificarse', () => {
      expect(classifyBookingError(conflict('ONLINE_SESSION_USED'))).toMatchObject({ kind: 'session' });
      expect(
        classifyBookingError(new ApiError(401, 'Tu verificación caducó. Vuelve a identificarte para reservar.')),
      ).toEqual({ kind: 'session', text: 'Tu verificación caducó. Vuelve a identificarte para reservar.' });
    });

    it('política cambiada y formulario caducado: recargar', () => {
      expect(classifyBookingError(conflict('PRIVACY_POLICY_OUTDATED'))).toMatchObject({ kind: 'reload' });
      expect(
        classifyBookingError(new ApiError(400, 'El formulario caducó. Recarga la página y vuelve a elegir tu hora.')),
      ).toMatchObject({ kind: 'reload' });
    });

    it('404: reserva no disponible, salvo «Esa opción ya no está disponible» (recargar)', () => {
      expect(classifyBookingError(new ApiError(404, 'La reserva online no está disponible en esta clínica.'))).toEqual({
        kind: 'unavailable',
      });
      expect(
        classifyBookingError(
          new ApiError(404, 'Esa opción ya no está disponible. Vuelve a elegir sede, tratamiento y profesional.'),
        ),
      ).toMatchObject({ kind: 'reload' });
    });

    it('lo demás se queda en el paso con su mensaje', () => {
      expect(
        classifyBookingError(
          new ApiError(400, 'Has completado el formulario demasiado rápido. Espera unos segundos y vuelve a enviarlo.'),
        ),
      ).toEqual({
        kind: 'inline',
        text: 'Has completado el formulario demasiado rápido. Espera unos segundos y vuelve a enviarlo.',
      });
      expect(classifyBookingError(new Error('x'))).toMatchObject({ kind: 'inline' });
    });
  });
});
