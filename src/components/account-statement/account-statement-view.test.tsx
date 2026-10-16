import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountStatementView } from './account-statement-view';
import { ApiError } from '@/lib/api/client';
import { getAccountStatement } from '@/lib/account-statement/account-statement-api';
import {
  accountStatementFixture,
  emptyAccountStatementFixture,
} from '@/lib/test/account-statement';

jest.mock('../../lib/account-statement/account-statement-api', () => ({
  ...jest.requireActual('../../lib/account-statement/account-statement-api'),
  getAccountStatement: jest.fn(),
}));

const mockedGet = getAccountStatement as jest.MockedFunction<typeof getAccountStatement>;

// Normaliza los espacios duros de Intl (es: "1.800.000,00 COP" lleva U+00A0).
function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

beforeEach(() => {
  mockedGet.mockReset();
});

it('pide el estado de cuenta del paciente y pinta el resumen por moneda', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  expect(screen.getByRole('status', { name: /cargando/i })).toBeInTheDocument();

  const cop = await screen.findByRole('region', { name: /resumen en COP/i });
  expect(mockedGet).toHaveBeenCalledWith('tok', 'pat-1');
  expect(money(within(cop).getByTestId('budgeted').textContent)).toContain('3.000.000');
  expect(money(within(cop).getByTestId('paid').textContent)).toContain('1.200.000');
  expect(money(within(cop).getByTestId('balance').textContent)).toContain('1.800.000');

  // Vencido destacado: importe y número de cuotas, en tono de peligro.
  const overdue = within(cop).getByTestId('overdue');
  expect(money(overdue.textContent)).toContain('250.000');
  expect(overdue).toHaveTextContent(/1 cuota vencida/i);
  expect(overdue.className).toMatch(/danger/);
  expect(within(cop).getByText(/próxima cuota/i).parentElement).toHaveTextContent('10/11/2026');

  // Saldo negativo = a favor del paciente; sin vencidas, sin tono de alerta.
  const usd = screen.getByRole('region', { name: /resumen en USD/i });
  expect(within(usd).getByTestId('balance')).toHaveTextContent(/a favor/i);
  expect(within(usd).getByTestId('overdue')).toHaveTextContent(/sin cuotas vencidas/i);
  expect(within(usd).getByTestId('overdue').className).not.toMatch(/danger/);
});

it('lista movimientos con método y sede, marcando los anulados', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /movimientos/i });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('20/09/2026');
  expect(rows[0]).toHaveTextContent(/anulado/i);
  expect(rows[0]).toHaveTextContent('Anulado por Rita Recepción: Cobro duplicado');
  expect(rows[0]).toHaveTextContent('Sede Norte');
  expect(rows[0]).toHaveTextContent('Tarjeta');
  expect(rows[1]).toHaveTextContent('Transferencia');
  expect(rows[1]).not.toHaveTextContent(/anulado/i);
  expect(rows[1]).toHaveTextContent('Plan del');
  expect(rows[2]).toHaveTextContent(/sin método/i);
});

it('lista las cuotas con su estado: pagada, vencida, pendiente', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /cuotas/i });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.map((r) => within(r).getByTestId('installment-status').textContent)).toEqual([
    'Pagada',
    'Vencida',
    'Pendiente',
  ]);
  expect(rows[0]).toHaveTextContent(/inicial/i);
  expect(rows[1]).toHaveTextContent('2');
});

it('muestra los planes con su saldo y señala el cancelado como fuera del saldo', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const table = await screen.findByRole('table', { name: /planes/i });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows[0]).toHaveTextContent('Aceptado');
  expect(money(rows[0].textContent)).toContain('1.800.000');
  expect(rows[1]).toHaveTextContent('Cancelado');
  expect(rows[1]).toHaveTextContent(/no suma al saldo/i);
});

it('ofrece imprimir en una vista aparte, en otra pestaña', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const print = await screen.findByRole('link', { name: /imprimir/i });
  expect(print).toHaveAttribute('href', '/print/patients/pat-1/account-statement');
  expect(print).toHaveAttribute('target', '_blank');
});

it('estado vacío claro para un paciente sin planes ni abonos, sin botón de imprimir', async () => {
  mockedGet.mockResolvedValue(emptyAccountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  expect(await screen.findByText(/sin movimientos financieros/i)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /imprimir/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});

it('error de red: estado de error con reintento que vuelve a pedir', async () => {
  mockedGet.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  mockedGet.mockResolvedValueOnce(accountStatementFixture());
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/no pudimos cargar el estado de cuenta/i);

  await userEvent.click(within(alert).getByRole('button', { name: /reintentar/i }));
  expect(await screen.findByRole('region', { name: /resumen en COP/i })).toBeInTheDocument();
  expect(mockedGet).toHaveBeenCalledTimes(2);
});

it('un 403 explica que el rol no tiene acceso, sin reintento', async () => {
  mockedGet.mockRejectedValue(new ApiError(403, 'Forbidden'));
  render(<AccountStatementView token="tok" patientId="pat-1" />);

  expect(await screen.findByText(/tu rol no tiene acceso al estado de cuenta/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
});
