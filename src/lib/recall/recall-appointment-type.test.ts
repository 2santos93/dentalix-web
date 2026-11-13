import {
  bookedContactInput,
  linkedAppointmentType,
  prefillAppointmentTypeId,
  recallAppointmentTypeId,
} from './recall-appointment-type';
import type { AppointmentType } from '@/lib/appointments/appointment-types-api';

const appt = (id: string, name: string, active = true): AppointmentType => ({
  id,
  tenantId: 't1',
  name,
  durationMinutes: 45,
  color: '#0E7490',
  active,
  isUrgent: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});
const APPT = [appt('a-lim', 'Limpieza'), appt('a-old', 'Blanqueamiento', false)];

describe('recall-appointment-type (DX-015-bis-4)', () => {
  it('linkedAppointmentType: ninguno, activo, inactivo y retirado o sin leer', () => {
    expect(linkedAppointmentType(null, APPT)).toEqual({ kind: 'none' });
    expect(linkedAppointmentType('a-lim', APPT)).toEqual({ kind: 'active', name: 'Limpieza' });
    expect(linkedAppointmentType('a-old', APPT)).toEqual({ kind: 'inactive', name: 'Blanqueamiento' });
    expect(linkedAppointmentType('a-gone', APPT)).toEqual({ kind: 'missing' });
    expect(linkedAppointmentType('a-lim', null)).toEqual({ kind: 'missing' });
  });

  it('prefillAppointmentTypeId: solo si está entre los activos (D21)', () => {
    expect(prefillAppointmentTypeId('a-lim', APPT)).toBe('a-lim');
    expect(prefillAppointmentTypeId('a-old', APPT)).toBeNull();
    expect(prefillAppointmentTypeId('a-gone', APPT)).toBeNull();
    expect(prefillAppointmentTypeId(null, APPT)).toBeNull();
    expect(prefillAppointmentTypeId(undefined, APPT)).toBeNull();
  });

  it('recallAppointmentTypeId: el del tipo de recall de la fila, o null', () => {
    const types = [
      { id: 't-hyg', appointmentTypeId: 'a-lim' },
      { id: 't-ctl', appointmentTypeId: null },
    ];
    expect(recallAppointmentTypeId('t-hyg', types)).toBe('a-lim');
    expect(recallAppointmentTypeId('t-ctl', types)).toBeNull();
    expect(recallAppointmentTypeId('t-x', types)).toBeNull();
    expect(recallAppointmentTypeId('t-hyg', null)).toBeNull();
  });

  it('bookedContactInput: BOOKED con la cita y el canal; la nota vacía no viaja (D22)', () => {
    expect(bookedContactInput('CALL', 'ap-1')).toEqual({ channel: 'CALL', outcome: 'BOOKED', appointmentId: 'ap-1' });
    expect(bookedContactInput('WHATSAPP_LINK', 'ap-1', '  ')).toEqual({
      channel: 'WHATSAPP_LINK',
      outcome: 'BOOKED',
      appointmentId: 'ap-1',
    });
    expect(bookedContactInput('IN_PERSON', 'ap-1', ' Prefiere la tarde ')).toEqual({
      channel: 'IN_PERSON',
      outcome: 'BOOKED',
      appointmentId: 'ap-1',
      note: 'Prefiere la tarde',
    });
  });
});
