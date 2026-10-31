import { countToday } from './today-section';
import { gmtOffsetLabel, sedeTimeLabel } from './zone-label';
import { canSeeBlock } from './inicio-roles';
import { overdueOf } from './inicio-api';
import { cashValue, receivablesValue } from './pending-section';
import type { ListAppointment } from '@/lib/appointments/appointments-api';
import { cashSessionFixture } from '@/lib/test/cash-session';
import type { CurrentCashSession } from '@/lib/cash-sessions/cash-sessions-api';

const at = (start: string, status: ListAppointment['status']) => ({ start, status }) as ListAppointment;

describe('countToday', () => {
  it('«Por confirmar» son las agendadas que aún no empiezan; las canceladas van aparte', () => {
    const now = new Date('2026-08-15T15:00:00.000Z');
    const counts = countToday(
      [
        at('2026-08-15T13:00:00.000Z', 'SCHEDULED'), // ya pasó: se cierra, no se confirma
        at('2026-08-15T16:00:00.000Z', 'SCHEDULED'),
        at('2026-08-15T16:30:00.000Z', 'CONFIRMED'),
        at('2026-08-15T14:00:00.000Z', 'IN_CHAIR'),
        at('2026-08-15T14:00:00.000Z', 'READY_FOR_CHECKOUT'),
        at('2026-08-15T12:00:00.000Z', 'NO_SHOW'),
        at('2026-08-15T17:00:00.000Z', 'CANCELLED'),
      ],
      now,
    );
    expect(counts).toEqual({ total: 6, toConfirm: 1, confirmed: 1, inClinic: 2, completed: 0, noShow: 1, cancelled: 1 });
  });
});

describe('zona de la sede', () => {
  it('GMT con signo menos tipográfico, medias horas y cero', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    expect(gmtOffsetLabel('America/Caracas', now)).toBe('GMT−4');
    expect(gmtOffsetLabel('Asia/Kolkata', now)).toBe('GMT+5:30');
    expect(gmtOffsetLabel('UTC', now)).toBe('GMT');
    expect(sedeTimeLabel('Sede Norte', 'America/Caracas', now)).toBe('Hora de Sede Norte (GMT−4)');
  });
  it('una zona inválida no inventa desfase', () => {
    expect(gmtOffsetLabel('No/Existe')).toBeNull();
    expect(sedeTimeLabel('Norte', 'No/Existe')).toBe('Hora de Norte');
  });
});

describe('acceso por rol (copia de los @Roles de la API)', () => {
  it.each([
    ['periodResults', ['ADMIN']],
    ['receivables', ['ADMIN', 'RECEPTION']],
    ['anamnesis', ['ADMIN', 'DENTIST', 'ASSISTANT']],
    ['closingQueue', ['ADMIN', 'DENTIST', 'RECEPTION']],
    ['lowStock', ['ADMIN', 'ASSISTANT']],
    ['myProduction', ['DENTIST']],
  ] as const)('%s → %j', (block, roles) => {
    for (const role of ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
      expect(canSeeBlock(block, role)).toBe((roles as readonly string[]).includes(role));
    }
    expect(canSeeBlock(block, null)).toBe(false);
  });
});

describe('valores de pendientes', () => {
  it('lo vencido es la deuda menos lo que aún no vence', () => {
    expect(
      overdueOf({ buckets: { current: 100, days0to30: 10.1, days31to60: 20.2, days61to90: 0, over90: 5 } }),
    ).toBe(35.3);
  });
  it('cartera: nunca suma pacientes de monedas distintas', () => {
    const value = receivablesValue(
      {
        asOf: '2026-08-15',
        scope: { location: null },
        totals: [
          { currency: 'USD', patients: 3, balance: 0, debt: 0, credit: 0, buckets: { current: 0, days0to30: 50, days31to60: 0, days61to90: 0, over90: 0 } },
          { currency: 'VES', patients: 2, balance: 0, debt: 0, credit: 0, buckets: { current: 10, days0to30: 0, days31to60: 0, days61to90: 0, over90: 0 } },
        ],
      },
      null,
    );
    expect(value).toEqual({ value: '3 pacientes', pending: true, hint: 'Vencido: USD 50' });
  });
  it('caja sin abrir pide acción; abierta dice desde cuándo y cuántos cobros', () => {
    const closed = { locationId: 'l', settings: { requireOpenSession: false, blindClose: false }, session: null } as CurrentCashSession;
    expect(cashValue(closed, 'America/Bogota', null)).toEqual({ value: 'Sin abrir', pending: true, tone: 'warning' });
    const open = { ...closed, session: cashSessionFixture() } as CurrentCashSession;
    expect(cashValue(open, 'America/Bogota', null).value).toMatch(/^Abierta desde/);
  });
});
