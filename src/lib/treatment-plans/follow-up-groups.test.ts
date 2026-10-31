import { formatCurrency } from '@/lib/format/currency';
import { followUpAmount, groupFollowUp } from './follow-up-groups';
import type { PendingFollowUpItem } from './plan-options-api';

function item(over: Partial<PendingFollowUpItem> = {}): PendingFollowUpItem {
  return {
    planId: 'a',
    patientId: 'p1',
    patientName: 'Ana',
    patientPhone: null,
    patientWhatsApp: null,
    optionGroupId: 'a',
    optionLabel: 'Opción A',
    presentedAt: '2026-10-10T00:00:00.000Z',
    presentedLocationId: 'l1',
    daysSincePresented: 10,
    currency: 'COP',
    total: 100,
    itemCount: 1,
    ...over,
  };
}

describe('groupFollowUp (D2)', () => {
  it('junta las opciones de un grupo y deja los planes sueltos solos, en orden de aparición', () => {
    const groups = groupFollowUp([
      item(),
      item({ planId: 'x', optionGroupId: null, patientId: 'p2' }),
      item({ planId: 'b', presentedAt: '2026-10-05T00:00:00.000Z', daysSincePresented: 15 }),
    ]);
    expect(groups.map((g) => [g.key, g.options.map((o) => o.planId)])).toEqual([
      ['a', ['a', 'b']],
      ['x', ['x']],
    ]);
    // La antigüedad del grupo es la de su opción más antigua.
    expect(groups[0]).toMatchObject({ presentedAt: '2026-10-05T00:00:00.000Z', daysSincePresented: 15 });
  });
});

describe('followUpAmount (D2)', () => {
  it('una opción: su monto; varias: el rango; monedas distintas: cada una aparte', () => {
    expect(followUpAmount([item()])).toBe(formatCurrency(100, 'COP'));
    expect(followUpAmount([item({ total: 300 }), item({ total: 100 })])).toBe(
      `${formatCurrency(100, 'COP')} – ${formatCurrency(300, 'COP')}`,
    );
    expect(followUpAmount([item({ total: 100 }), item({ total: 100 })])).toBe(formatCurrency(100, 'COP'));
    expect(followUpAmount([item(), item({ currency: 'USD', total: 50 })])).toBe(
      `${formatCurrency(100, 'COP')} · ${formatCurrency(50, 'USD')}`,
    );
  });
});
