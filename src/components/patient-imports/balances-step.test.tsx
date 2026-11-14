import { render, screen, within } from '@testing-library/react';
import { CurrencyTotalsTable } from './balances-step';
import { moneyWithCode } from '@/lib/format/sede-number';
import { balancesFixture } from '@/lib/test/patient-imports';
import { STAMP_FORMATS } from '@/lib/test/stamp';

const norm = (text: string | null) => (text ?? '').replace(/\s/g, ' ');
// Dos monedas de apertura: 201.000,50 VES (de 201.100,50 en el archivo) y 40,00 USD.
const sheet = balancesFixture();

describe('CurrencyTotalsTable: saldos de apertura con dos monedas (DX-354b)', () => {
  it.each([
    ['caracas', 'VES 201.000,50', 'VES 100,00', 'USD 40,00'],
    ['berlin', '201.000,50 VES', '100,00 VES', '40,00 USD'],
    ['miami', 'VES 201,000.50', 'VES 100.00', 'USD 40.00'],
  ] as const)('con la sede de %s el total a importar y el de las filas con error salen con su formato', (key, imported, errors, usd) => {
    render(<CurrencyTotalsTable fileTotals={sheet.fileTotals} validTotals={sheet.validTotals} fmt={STAMP_FORMATS[key]} />);
    const table = screen.getByRole('table', { name: 'Totales por moneda' });
    const ves = norm(within(table).getByRole('row', { name: /VES/ }).textContent);
    const usdRow = norm(within(table).getByRole('row', { name: /USD/ }).textContent);
    expect(ves).toContain(norm(moneyWithCode(201000.5, 'VES', STAMP_FORMATS[key])));
    expect(ves).toContain(imported);
    expect(ves).toContain(errors);
    expect(usdRow).toContain(usd);
  });

  it('sin formato de sede (cargando o con error) cada importe sale «—», nunca con otro formato', () => {
    render(<CurrencyTotalsTable fileTotals={sheet.fileTotals} validTotals={sheet.validTotals} fmt={null} />);
    const table = screen.getByRole('table', { name: 'Totales por moneda' });
    expect(norm(table.textContent)).not.toMatch(/201[.,]000/);
    expect(within(table).getAllByText('—').length).toBe(4);
  });
});
