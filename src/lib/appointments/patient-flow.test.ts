import {
  FLOW_ACTION_LABELS,
  flowActions,
  inClinicCount,
  isInClinic,
  punctualityLabel,
  statusOptionsFor,
  timeInZone,
  waitingForYouLabel,
} from './patient-flow';

describe('patient-flow (DX-200)', () => {
  it('los tres estados del flujo son «en clínica»', () => {
    expect(isInClinic('ARRIVED')).toBe(true);
    expect(isInClinic('IN_CHAIR')).toBe(true);
    expect(isInClinic('READY_FOR_CHECKOUT')).toBe(true);
    expect(isInClinic('NO_SHOW')).toBe(false);
  });

  describe('botones rápidos según estado y rol (copian los permisos de la API)', () => {
    it('recepción marca «Llegó» solo el día de la cita', () => {
      expect(flowActions('CONFIRMED', 'RECEPTION', true)).toEqual(['ARRIVE']);
      expect(flowActions('SCHEDULED', 'RECEPTION', false)).toEqual([]);
      expect(flowActions('SCHEDULED', 'DENTIST', true)).toEqual([]);
    });

    it('con el paciente en espera: el odontólogo lo sienta, recepción puede deshacer', () => {
      expect(flowActions('ARRIVED', 'DENTIST', true)).toEqual(['SEAT']);
      expect(flowActions('ARRIVED', 'RECEPTION', true)).toEqual(['UNDO_ARRIVAL']);
      expect(flowActions('ARRIVED', 'ASSISTANT', true)).toEqual(['SEAT', 'UNDO_ARRIVAL']);
    });

    it('en el sillón: listo para cobrar (quien atiende) y salida (mostrador)', () => {
      expect(flowActions('IN_CHAIR', 'DENTIST', true)).toEqual(['READY']);
      expect(flowActions('IN_CHAIR', 'RECEPTION', true)).toEqual(['CHECKOUT']);
      expect(flowActions('IN_CHAIR', 'ADMIN', true)).toEqual(['READY', 'CHECKOUT']);
      expect(flowActions('READY_FOR_CHECKOUT', 'RECEPTION', true)).toEqual(['CHECKOUT']);
      expect(flowActions('READY_FOR_CHECKOUT', 'DENTIST', true)).toEqual([]);
    });

    it('nada en las citas cerradas ni sin rol', () => {
      expect(flowActions('COMPLETED', 'ADMIN', true)).toEqual([]);
      expect(flowActions('CANCELLED', 'ADMIN', true)).toEqual([]);
      expect(flowActions('CONFIRMED', null, true)).toEqual([]);
    });

    it('etiquetas en español', () => {
      expect(FLOW_ACTION_LABELS).toEqual({
        ARRIVE: 'Llegó',
        SEAT: 'En sillón',
        READY: 'Listo para cobrar',
        CHECKOUT: 'Completar',
        UNDO_ARRIVAL: 'Deshacer llegada',
      });
    });
  });

  it('el selector de estado no ofrece saltos: en el flujo, solo su estado y la salida', () => {
    expect(statusOptionsFor('SCHEDULED')).toEqual([
      'SCHEDULED',
      'CONFIRMED',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ]);
    expect(statusOptionsFor('ARRIVED')).toEqual(['ARRIVED', 'COMPLETED', 'CANCELLED']);
    expect(statusOptionsFor('IN_CHAIR')).toEqual(['IN_CHAIR', 'COMPLETED']);
    expect(statusOptionsFor('READY_FOR_CHECKOUT')).toEqual(['READY_FOR_CHECKOUT', 'COMPLETED']);
  });

  it('la puntualidad se lee sin depender del color', () => {
    expect(punctualityLabel('ON_TIME')).toBe('a tiempo');
    expect(punctualityLabel('LATE')).toBe('hasta 5 min tarde');
    expect(punctualityLabel('VERY_LATE')).toBe('más de 5 min tarde');
  });

  it('cuenta a quien está en la clínica y el «Te esperan»', () => {
    const item = { appointmentId: 'x' } as never;
    expect(inClinicCount({ waiting: [item], inChair: [item, item], readyForCheckout: [] })).toBe(3);
    expect(waitingForYouLabel(1)).toBe('Te espera 1 paciente');
    expect(waitingForYouLabel(3)).toBe('Te esperan 3 pacientes');
  });

  it('la hora se muestra en la zona de la sede', () => {
    expect(timeInZone('2026-10-19T14:05:00.000Z', 'America/Bogota')).toBe('09:05');
    expect(timeInZone('2026-10-19T14:05:00.000Z', 'Europe/Madrid')).toBe('16:05');
  });
});
