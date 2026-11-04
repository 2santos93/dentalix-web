import { render, screen } from '@testing-library/react';
import { AgingSummary } from './aging-summary';
import type { AgingTotal } from '@/lib/receivables/receivables-api';
import { moneyWithCode } from '@/lib/format/sede-number';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock } from '@/lib/test/sede-clock';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

const norm = (text: string | null) => (text ?? '').replace(/\s/g, ' ');
const BUCKETS = { current: 0, days0to30: 100, days31to60: 0, days61to90: 0, over90: 1234.5 };

// Dos monedas en la misma cartera: la de referencia de la pantalla pone el formato de las dos.
const TOTALS: AgingTotal[] = [
  { currency: 'USD', patients: 2, debt: 1334.5, credit: 50, buckets: BUCKETS } as AgingTotal,
  { currency: 'VES', patients: 1, debt: 45000, credit: 0, buckets: { ...BUCKETS, over90: 45000, days0to30: 0 } } as AgingTotal,
];

describe('AgingSummary (DX-145, DX-354b)', () => {
  it('con la sede de referencia de Caracas (es-VE): «USD 1.334,50» y «VES 45.000,00»', () => {
    const stamp = stampPainters(testAgendaClock([STAMP_SEDES.caracas, STAMP_SEDES.berlin]));
    render(<AgingSummary totals={TOTALS} stamp={stamp} />);
    expect(norm(screen.getByTestId('aging-total-USD').textContent)).toContain(norm(moneyWithCode(1334.5, 'USD', STAMP_FORMATS.caracas)));
    expect(norm(screen.getByTestId('aging-total-USD').textContent)).toContain('USD 1.334,50');
    expect(norm(screen.getByTestId('aging-total-VES').textContent)).toContain('VES 45.000,00');
    expect(norm(screen.getByTestId('aging-total-USD').textContent)).toContain('Saldo a favor USD 50,00');
  });

  it('con la sede de referencia de Miami (en-US): «USD 1,334.50» y «VES 45,000.00»', () => {
    const stamp = stampPainters(testAgendaClock([STAMP_SEDES.miami, STAMP_SEDES.caracas]));
    render(<AgingSummary totals={TOTALS} stamp={stamp} />);
    expect(norm(screen.getByTestId('aging-total-USD').textContent)).toContain('USD 1,334.50');
    expect(norm(screen.getByTestId('aging-total-VES').textContent)).toContain('VES 45,000.00');
  });

  it('con la sede de referencia de Berlín (de-DE): «1.334,50 USD» y «45.000,00 VES»', () => {
    const stamp = stampPainters(testAgendaClock([STAMP_SEDES.berlin, STAMP_SEDES.caracas]));
    render(<AgingSummary totals={TOTALS} stamp={stamp} />);
    expect(norm(screen.getByTestId('aging-total-USD').textContent)).toContain('1.334,50 USD');
    expect(norm(screen.getByTestId('aging-total-VES').textContent)).toContain('45.000,00 VES');
  });

  it('sin formato de sede (cargando o sin datos): «—» en cada importe, nunca otro formato', () => {
    render(<AgingSummary totals={TOTALS} stamp={stampPainters(null)} />);
    const usd = norm(screen.getByTestId('aging-total-USD').textContent);
    expect(usd).toContain('Por cobrar —');
    expect(usd).not.toMatch(/1[.,]334/);
  });
});
