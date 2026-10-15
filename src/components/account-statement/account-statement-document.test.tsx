import { render, screen, within } from '@testing-library/react';
import { AccountStatementDocument } from './account-statement-document';
import { accountStatementFixture, emptyAccountStatementFixture } from '@/lib/test/account-statement';

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
  expect(screen.getByText('CC 1020304050')).toBeInTheDocument();
  // Sin logo configurado no se pinta una imagen rota.
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('pinta el logo de la clínica cuando existe', () => {
  render(
    <AccountStatementDocument
      statement={accountStatementFixture({
        clinic: { name: 'Clínica Sonrisas', logoUrl: 'https://cdn.example.com/logo.png' },
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
      statement={accountStatementFixture({ range: { from: '2026-09-01', to: '2026-09-30' } })}
    />,
  );
  expect(screen.getByText(/movimientos del 01\/09\/2026 al 30\/09\/2026/i)).toBeInTheDocument();
});
