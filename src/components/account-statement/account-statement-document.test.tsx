import { render, screen, within } from '@testing-library/react';
import { AccountStatementDocument } from './account-statement-document';
import {
  accountStatementFixture,
  emptyAccountStatementFixture,
  openingBalanceStatementFixture,
} from '@/lib/test/account-statement';

function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

it('lleva cabecera de clínica, datos del paciente y fecha de emisión', () => {
  render(<AccountStatementDocument statement={accountStatementFixture()} />);

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
  const { rerender } = render(<AccountStatementDocument statement={base} />);
  expect(screen.getByText('ID local DOC-0001')).toBeInTheDocument();

  // API anterior en el hueco del despliegue: sin `docTypeName`, el genérico.
  const { docTypeName: _omit, ...withoutName } = base.patient;
  void _omit;
  rerender(
    <AccountStatementDocument
      statement={{ ...base, patient: { ...withoutName, docType: 'PASSPORT' } as typeof base.patient }}
    />,
  );
  expect(screen.getByText('Pasaporte DOC-0001')).toBeInTheDocument();
  expect(screen.queryByText(/PASSPORT/)).not.toBeInTheDocument();
});

it('pinta el logo de la clínica cuando existe', () => {
  render(
    <AccountStatementDocument
      statement={accountStatementFixture({
        clinic: {
          name: 'Clínica Sonrisas',
          logoUrl: 'https://cdn.example.com/logo.png',
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
  render(<AccountStatementDocument statement={accountStatementFixture()} />);

  const summary = screen.getByRole('table', { name: /resumen/i });
  const copRow = within(summary).getByRole('row', { name: /COP/ });
  expect(money(copRow.textContent)).toContain('1.800.000');
  expect(money(copRow.textContent)).toContain('250.000');
  expect(copRow).toHaveTextContent('10/11/2026');

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
  render(<AccountStatementDocument statement={emptyAccountStatementFixture()} />);
  expect(screen.getByText(/no tiene planes con valor ni abonos/i)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('indica el rango cuando los movimientos vienen filtrados', () => {
  render(
    <AccountStatementDocument
      statement={accountStatementFixture({
        range: { from: '2026-09-01', to: '2026-09-30' },
      })}
    />,
  );
  expect(screen.getByText(/movimientos del 01\/09\/2026 al 30\/09\/2026/i)).toBeInTheDocument();
});

it('DX-262: el documento lista el saldo migrado con su fecha de corte', () => {
  render(<AccountStatementDocument statement={openingBalanceStatementFixture()} />);
  const table = screen.getByRole('table', { name: 'Saldos migrados' });
  expect(table).toHaveTextContent('Ortodoncia 2025');
  expect(table).toHaveTextContent('23/10/2026 (aprox.)');
  expect(money(table.textContent)).toContain('150.000,50');
  const copRow = within(screen.getByRole('table', { name: /resumen/i })).getByRole('row', { name: /COP/ });
  // El resumen dice que el saldo incluye el migrado (revisión M1).
  expect(money(copRow.textContent)).toContain('200.000,50');
  expect(screen.getByText(/El saldo incluye el saldo migrado/)).toBeInTheDocument();
  const movements = screen.getByRole('table', { name: /movimientos/i });
  expect(movements).toHaveTextContent('Saldo migrado · Ortodoncia 2025');
  // QA D2: «Destino», no «Plan».
  expect(within(movements).getByRole('columnheader', { name: 'Destino' })).toBeInTheDocument();
});

it('DX-395: el impreso nombra el medio de la clínica y la referencia, no el método antiguo', () => {
  render(<AccountStatementDocument statement={accountStatementFixture()} />);
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
      statement={{
        ...base,
        summary: [
          {
            ...base.summary[1],
            currency,
            budgeted,
            paid,
            balance,
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
