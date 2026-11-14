import { EMPTY_CLINIC_FISCAL } from '@/lib/clinic/clinic-settings-api';
import { render, screen, within } from '@testing-library/react';
import { AccountStatementDocument } from './account-statement-document';
import {
  accountStatementFixture,
  emptyAccountStatementFixture,
  openingBalanceStatementFixture,
} from '@/lib/test/account-statement';
import { FORMAT_DE, FORMAT_ES, FORMAT_US } from '@/lib/test/document-regional';

function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

it('lleva cabecera de clínica, datos del paciente y fecha de emisión', () => {
  render(<AccountStatementDocument statement={accountStatementFixture()} format={FORMAT_ES} />);

  const header = screen.getByTestId('statement-header');
  expect(header).toHaveTextContent('Clínica Sonrisas');
  expect(screen.getByRole('heading', { level: 1, name: /estado de cuenta/i })).toBeInTheDocument();
  expect(header).toHaveTextContent(/fecha de emisión/i);
  expect(header).toHaveTextContent('15/10/2026');
  expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
  expect(screen.getByText('ID local DOC-0001')).toBeInTheDocument();
  // Sin logo configurado no se pinta una imagen rota.
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('prints the docTypeName of the DTO, or the generic name when it is missing', () => {
  const base = accountStatementFixture();
  const { rerender } = render(<AccountStatementDocument statement={base} format={FORMAT_ES} />);
  expect(screen.getByText('ID local DOC-0001')).toBeInTheDocument();

  // API anterior en el hueco del despliegue: sin `docTypeName`, el genérico.
  const { docTypeName: _omit, ...withoutName } = base.patient;
  void _omit;
  rerender(
    <AccountStatementDocument
      format={FORMAT_ES}
      statement={{ ...base, patient: { ...withoutName, docType: 'PASSPORT' } as typeof base.patient }}
    />,
  );
  expect(screen.getByText('Pasaporte DOC-0001')).toBeInTheDocument();
  expect(screen.queryByText(/PASSPORT/)).not.toBeInTheDocument();
});

it('pinta el logo de la clínica cuando existe', () => {
  render(
    <AccountStatementDocument
      format={FORMAT_ES}
      statement={accountStatementFixture({
        clinic: {
          name: 'Clínica Sonrisas',
          logoUrl: 'https://cdn.example.com/logo.png',
          fiscal: EMPTY_CLINIC_FISCAL,
        },
      })}
    />,
  );
  expect(screen.getByRole('img', { name: /clínica sonrisas/i })).toHaveAttribute(
    'src',
    'https://cdn.example.com/logo.png',
  );
});

it('incluye resumen por moneda, planes, movimientos y cuotas — y ningún botón', () => {
  render(<AccountStatementDocument statement={accountStatementFixture()} format={FORMAT_ES} />);

  const summary = screen.getByRole('table', { name: /resumen/i });
  const vesRow = within(summary).getByRole('row', { name: /VES/ });
  expect(money(vesRow.textContent)).toContain('1.800.000');
  expect(money(vesRow.textContent)).toContain('250.000');
  expect(vesRow).toHaveTextContent('10/11/2026');

  expect(within(screen.getByRole('table', { name: /movimientos/i })).getAllByRole('row')).toHaveLength(4);
  expect(screen.getByRole('table', { name: /movimientos/i })).toHaveTextContent(/anulado/i);
  expect(screen.getByRole('table', { name: /movimientos/i })).toHaveTextContent(
    'Anulado por Rita Recepción: Cobro duplicado',
  );
  expect(within(screen.getByRole('table', { name: /cuotas/i })).getAllByRole('row')).toHaveLength(4);
  expect(screen.getByRole('table', { name: /planes/i })).toHaveTextContent(/no suma al saldo/i);

  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('dice cuándo no hay nada que listar en vez de dejar tablas vacías', () => {
  render(<AccountStatementDocument statement={emptyAccountStatementFixture()} format={FORMAT_ES} />);
  expect(screen.getByText(/no tiene planes con valor ni abonos/i)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('indica el rango cuando los movimientos vienen filtrados', () => {
  render(
    <AccountStatementDocument
      format={FORMAT_ES}
      statement={accountStatementFixture({
        range: { from: '2026-09-01', to: '2026-09-30' },
      })}
    />,
  );
  expect(screen.getByText(/movimientos del 01\/09\/2026 al 30\/09\/2026/i)).toBeInTheDocument();
});

it('DX-262: el documento lista el saldo migrado con su fecha de corte', () => {
  render(<AccountStatementDocument statement={openingBalanceStatementFixture()} format={FORMAT_ES} />);
  const table = screen.getByRole('table', { name: 'Saldos migrados' });
  expect(table).toHaveTextContent('Ortodoncia 2025');
  expect(table).toHaveTextContent('23/10/2026 (aprox.)');
  expect(money(table.textContent)).toContain('150.000,50');
  const vesRow = within(screen.getByRole('table', { name: /resumen/i })).getByRole('row', { name: /VES/ });
  // El resumen dice que el saldo incluye el migrado (revisión M1).
  expect(money(vesRow.textContent)).toContain('200.000,50');
  expect(screen.getByText(/El saldo incluye el saldo migrado/)).toBeInTheDocument();
  const movements = screen.getByRole('table', { name: /movimientos/i });
  expect(movements).toHaveTextContent('Saldo migrado · Ortodoncia 2025');
  // QA D2: «Destino», no «Plan».
  expect(within(movements).getByRole('columnheader', { name: 'Destino' })).toBeInTheDocument();
});

it('DX-395: el impreso nombra el medio de la clínica y la referencia, no el método antiguo', () => {
  render(<AccountStatementDocument statement={accountStatementFixture()} format={FORMAT_ES} />);
  const movements = screen.getByRole('table', { name: /movimientos/i });
  const row = within(movements).getByRole('row', { name: /Pago móvil/ });
  expect(row).toHaveTextContent('Pago móvil · Ref. ABC 123');
  expect(row).not.toHaveTextContent('Transferencia');
  expect(movements).toHaveTextContent('Tarjeta');
  expect(movements).toHaveTextContent('Sin método');
});

// DX-340: el estado de cuenta pinta cada plan con los decimales de su moneda.
it.each([
  { currency: 'JPY', budgeted: 18912, paid: 5000, balance: 13912, shown: ['18.912', '13.912'], cents: false },
  { currency: 'EUR', budgeted: 189.12, paid: 50.5, balance: 138.62, shown: ['189,12', '138,62'], cents: true },
])('$currency: presupuestado y saldo con los decimales de su moneda', ({ currency, budgeted, paid, balance, shown, cents }) => {
  const base = accountStatementFixture();
  const plan = { ...base.plans[0], currency, budgeted, paid, balance };
  render(
    <AccountStatementDocument
      format={FORMAT_ES}
      statement={{
        ...base,
        summary: [
          {
            ...base.summary[1],
            currency,
            budgeted,
            paid,
            balance,
            convertedPaid: paid,
            convertedBalance: balance,
          },
        ],
        plans: [plan],
        movements: [],
        installments: [],
      }}
    />,
  );
  const row = screen.getAllByRole('row').find((r) => money(r.textContent).includes(shown[0]));
  expect(row).toBeDefined();
  const rowText = money(row?.textContent);
  for (const figure of shown) expect(rowText).toContain(figure);
  expect(/\d,\d\d\b/.test(rowText)).toBe(cents);
});

describe('DX-472: el impreso no parece definitivo', () => {
  const withoutRate = { paymentId: 'p', amount: 3600, currency: 'VES', paidOn: '2026-10-30' };

  it('un abono sin tasa se dice y se detalla', () => {
    const base = accountStatementFixture();
    render(
      <AccountStatementDocument
        format={FORMAT_ES}
        statement={{ ...base, plans: [{ ...base.plans[0], paymentsWithoutRate: [withoutRate] }] }}
      />,
    );
    const note = screen.getByTestId('statement-without-rate');
    expect(note).toHaveTextContent('Cifras incompletas: 1 abono sin tasa de cambio no cuenta en el saldo.');
    expect(note).toHaveTextContent('3600,00 VES');
    expect(note).toHaveTextContent('30/10/2026');
  });

  it('sin abonos sin tasa no dice nada', () => {
    render(<AccountStatementDocument statement={accountStatementFixture()} format={FORMAT_ES} />);
    expect(screen.queryByTestId('statement-without-rate')).not.toBeInTheDocument();
  });
});

// DX-354: fechas, horas e importes con la sede del documento.
describe('DX-354: el formato de la sede del documento', () => {
  const withRateless = () => {
    const base = accountStatementFixture();
    return { ...base, plans: [{ ...base.plans[0], paymentsWithoutRate: [{ paymentId: 'p', amount: 1234.5, currency: 'USD', paidOn: '2027-07-15' }] }] };
  };

  it('A: sede h12 en-US, la hora de la emisión en 12 h y el importe con código', () => {
    render(
      <AccountStatementDocument
        statement={{ ...withRateless(), issuedAt: '2027-05-03T19:05:00.000Z' }}
        format={FORMAT_US}
      />,
    );
    expect(screen.getByTestId('statement-header')).toHaveTextContent('05/03/2027 3:05 p. m.');
    expect(money(screen.getByTestId('statement-without-rate').textContent)).toContain('USD 1,234.50 del 07/15/2027');
  });

  it('B: sede h23 de-DE, 24 h, orden alemán e importe con código', () => {
    render(
      <AccountStatementDocument
        statement={{ ...withRateless(), issuedAt: '2027-05-03T19:05:00.000Z' }}
        format={FORMAT_DE}
      />,
    );
    expect(screen.getByTestId('statement-header')).toHaveTextContent('03.05.2027 21:05');
    expect(money(screen.getByTestId('statement-without-rate').textContent)).toContain('1.234,50 USD del 15.07.2027');
  });

  it('C: sin formato de sede, todo «—», sin símbolo ni dd/mm/yyyy', () => {
    const { container } = render(<AccountStatementDocument statement={withRateless()} format={null} />);
    expect(screen.getByTestId('statement-header')).toHaveTextContent(/emisión\s*—/i);
    expect(screen.getByTestId('statement-without-rate')).toHaveTextContent('— del —');
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(text).not.toMatch(/\d[.,]\d{2}/);
    expect(text).not.toContain('US$');
    // Los nombres de los planes dependen de la fecha: «Plan del —».
    expect(screen.getByRole('table', { name: /planes/i })).toHaveTextContent('Plan del —');
  });
});
