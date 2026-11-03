import { render, screen } from '@testing-library/react';
import { BucketList, CollectionCell, DebtCell, LastPayment, NextInstallment } from './debtor-parts';
import type { AgingRow } from '@/lib/receivables/receivables-api';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock } from '@/lib/test/sede-clock';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

const norm = (text: string | null) => (text ?? '').replace(/\s/g, ' ');
const BUCKETS = { current: 0, days0to30: 0, days31to60: 0, days61to90: 0, over90: 0 };

// Un mismo deudor con una deuda en USD y otra en VES.
const CURRENCIES = [
  { currency: 'USD', balance: 1184.5, debt: 1234.5, credit: 50, buckets: { ...BUCKETS, over90: 1234.5 }, oldestAgeDays: 100, ageApproximate: false, nextInstallment: null },
  { currency: 'VES', balance: 45000, debt: 45000, credit: 0, buckets: { ...BUCKETS, days0to30: 45000 }, oldestAgeDays: 10, ageApproximate: false, nextInstallment: null },
] as unknown as AgingRow['currencies'];

const ROW = {
  patient: { id: 'p1', fullName: 'Ana Pérez', phone: null, whatsApp: null },
  currencies: CURRENCIES,
  lastPayment: { paidOn: '2026-10-20', amount: 1234.5, currency: 'USD' },
  nextInstallment: { dueDate: '2026-11-05', amount: 45000, currency: 'VES' },
  lastNote: null,
  promise: { id: 'pr', status: 'OPEN', amount: 1234.5, currency: 'USD', dueDate: '2026-11-05', reopenedAt: null },
} as unknown as AgingRow;

const SEDES = {
  caracas: stampPainters(testAgendaClock([STAMP_SEDES.caracas, STAMP_SEDES.berlin])),
  berlin: stampPainters(testAgendaClock([STAMP_SEDES.berlin, STAMP_SEDES.caracas])),
  miami: stampPainters(testAgendaClock([STAMP_SEDES.miami, STAMP_SEDES.caracas])),
};

describe('piezas del deudor (DX-145, DX-354b)', () => {
  it.each([
    ['caracas', 'USD 1.234,50', 'VES 45.000,00', '20/10/2026', '05/11/2026'],
    ['berlin', '1.234,50 USD', '45.000,00 VES', '20.10.2026', '05.11.2026'],
    ['miami', 'USD 1,234.50', 'VES 45,000.00', '10/20/2026', '11/05/2026'],
  ] as const)('con la sede de referencia %s, la deuda en USD y en VES y las fechas salen con su formato', (key, usd, ves, paid, due) => {
    const stamp = SEDES[key];
    const { container } = render(
      <div>
        <DebtCell currencies={ROW.currencies} stamp={stamp} />
        <BucketList currencies={ROW.currencies} stamp={stamp} />
        <LastPayment row={ROW} stamp={stamp} />
        <NextInstallment row={ROW} stamp={stamp} />
        <CollectionCell row={ROW} stamp={stamp} />
      </div>,
    );
    const text = norm(container.textContent);
    expect(text).toContain(usd);
    expect(text).toContain(ves);
    expect(text).toContain(paid);
    expect(text).toContain(due);
    // Coherente con regionalFormat (nunca cadenas a ojo).
    expect(text).toContain(STAMP_FORMATS[key].civilDate('2026-10-20'));
  });

  it('sin formato de sede, «—» en importes y fechas', () => {
    const { container } = render(
      <div>
        <DebtCell currencies={ROW.currencies} stamp={stampPainters(null)} />
        <LastPayment row={ROW} stamp={stampPainters(null)} />
      </div>,
    );
    expect(norm(container.textContent)).not.toMatch(/1[.,]234/);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
