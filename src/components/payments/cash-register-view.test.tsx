import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashRegisterView } from './cash-register-view';
import { ApiError } from '@/lib/api/client';
import {
  listCashPayments,
  type CashPayment,
  type CashPaymentsResponse,
} from '@/lib/payments/payments-api';
import { presetRange } from '@/lib/payments/cash-period';

jest.mock('../../lib/payments/payments-api', () => ({
  listCashPayments: jest.fn(),
}));

const mockedList = listCashPayments as jest.MockedFunction<typeof listCashPayments>;

const anaCash: CashPayment = {
  id: 'pay-1',
  paidAt: '2026-10-15T00:00:00.000Z',
  amount: 150000.5,
  currency: 'COP',
  method: 'CASH',
  notes: null,
  location: { id: 'loc-1', name: 'Sede principal' },
  patient: { id: 'pat-1', fullName: 'Ana Gómez' },
  treatmentPlan: { id: 'plan-1', status: 'ACCEPTED', createdAt: '2026-09-01T15:00:00.000Z' },
};
const betoCard: CashPayment = {
  ...anaCash,
  id: 'pay-2',
  amount: 50.25,
  currency: 'USD',
  method: 'CARD',
  location: { id: 'loc-2', name: 'Sede Norte' },
  patient: { id: 'pat-2', fullName: 'Beto Ruiz' },
  treatmentPlan: { id: 'plan-2', status: 'DRAFT', createdAt: '2026-10-02T15:00:00.000Z' },
};

function response(overrides: Partial<CashPaymentsResponse> = {}): CashPaymentsResponse {
  const items = overrides.items ?? [anaCash, betoCard];
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    from: '2026-10-15',
    to: '2026-10-15',
    scope: { location: null },
    summary: {
      count: 2,
      byCurrency: [
        { currency: 'COP', total: 150000.5, count: 1 },
        { currency: 'USD', total: 50.25, count: 1 },
      ],
      byMethod: [
        { method: 'CASH', currency: 'COP', total: 150000.5, count: 1 },
        { method: 'CARD', currency: 'USD', total: 50.25, count: 1 },
      ],
    },
    ...overrides,
  };
}

// Normaliza los espacios duros de Intl (es: "150.000,50 COP" lleva U+00A0).
function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

beforeEach(() => {
  mockedList.mockReset();
});

it('pide el día de hoy al entrar y pinta cada abono con paciente, plan, método, sede y monto', async () => {
  mockedList.mockResolvedValue(response());
  render(<CashRegisterView token="tok" />);

  const table = await screen.findByRole('table', { name: /abonos/i });
  expect(mockedList).toHaveBeenCalledWith('tok', { ...presetRange('today'), page: 1 });

  const row = within(table).getByRole('row', { name: /ana gómez/i });
  expect(within(row).getByRole('link', { name: 'Ana Gómez' })).toHaveAttribute(
    'href',
    '/patients/pat-1',
  );
  expect(within(row).getByText('15/10/2026')).toBeInTheDocument();
  expect(within(row).getByText(/plan del 01\/09\/2026/i)).toBeInTheDocument();
  expect(within(row).getByText('Efectivo')).toBeInTheDocument();
  expect(within(row).getByText('Sede principal')).toBeInTheDocument();
  const amount = within(row).getByText(/150\.000,50/);
  expect(amount.closest('td')).toHaveClass('text-right', 'tabular-nums');
});

it('resume el período por moneda y por método en un registro, no en tarjetas', async () => {
  mockedList.mockResolvedValue(response());
  render(<CashRegisterView token="tok" />);

  const summary = await screen.findByRole('region', { name: /resumen del período/i });
  const byCurrency = within(summary).getByRole('list', { name: /por moneda/i });
  const cop = within(byCurrency).getByText('COP').closest('li');
  expect(money(cop?.textContent)).toMatch(/150\.000,50/);
  expect(money(cop?.textContent)).toMatch(/1 abono(?!s)/);

  const byMethod = within(summary).getByRole('list', { name: /por método/i });
  const card = within(byMethod).getByText('Tarjeta').closest('li');
  expect(money(card?.textContent)).toMatch(/50,25/);
  expect(money(card?.textContent)).toMatch(/USD/);
});

it('marca el alcance de sede: "Todas las sedes" sin sede activa, el nombre con una', async () => {
  mockedList.mockResolvedValueOnce(response());
  const { unmount } = render(<CashRegisterView token="tok" />);
  expect(await screen.findByText('Todas las sedes')).toBeInTheDocument();
  unmount();

  mockedList.mockResolvedValueOnce(
    response({ scope: { location: { id: 'loc-2', name: 'Sede Norte' } } }),
  );
  render(<CashRegisterView token="tok" />);
  expect(await screen.findByText(/caja de sede norte/i)).toBeInTheDocument();
});

it('muestra el estado vacío cuando el período no tiene abonos', async () => {
  mockedList.mockResolvedValue(
    response({ items: [], total: 0, summary: { count: 0, byCurrency: [], byMethod: [] } }),
  );
  render(<CashRegisterView token="tok" />);

  expect(await screen.findByText(/no hay abonos en este período/i)).toBeInTheDocument();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /resumen del período/i })).not.toBeInTheDocument();
});

it('si la carga falla, muestra el error de sección y reintenta al pulsar el botón', async () => {
  mockedList.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(response());
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/no pudimos cargar la caja/i);

  await user.click(within(alert).getByRole('button', { name: /reintentar/i }));

  expect(await screen.findByRole('table', { name: /abonos/i })).toBeInTheDocument();
  expect(mockedList).toHaveBeenCalledTimes(2);
});

it('un 403 es un aviso de acceso, sin botón de reintentar (reintentar no cambia el rol)', async () => {
  mockedList.mockRejectedValue(new ApiError(403, 'Forbidden resource'));
  render(<CashRegisterView token="tok" />);

  const text = await screen.findByText(/tu rol no tiene acceso a la caja/i);
  expect(text.closest('[role="status"]')).not.toBeNull();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: /paginación/i })).not.toBeInTheDocument();
});

it('un 400 dice cuál es el problema en vez del error genérico', async () => {
  mockedList.mockRejectedValue(new ApiError(400, 'the period cannot exceed 366 days'));
  render(<CashRegisterView token="tok" />);

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/el período o el método no son válidos/i);
  expect(alert).not.toHaveTextContent(/no pudimos cargar la caja/i);
});

it('con un error de carga no deja la paginación de la respuesta anterior', async () => {
  mockedList.mockResolvedValueOnce(response({ total: 45 })).mockRejectedValueOnce(new Error('x'));
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);
  expect(await screen.findByRole('button', { name: /siguiente/i })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Esta semana' }));

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /siguiente/i })).not.toBeInTheDocument();
});

it('la tabla lleva caption y cabeceras de columna', async () => {
  mockedList.mockResolvedValue(response());
  render(<CashRegisterView token="tok" />);

  const table = await screen.findByRole('table', { name: /abonos/i });
  expect(table.querySelector('caption')).toHaveTextContent(/abonos del período/i);
  const headers = within(table).getAllByRole('columnheader');
  expect(headers).toHaveLength(6);
  headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
});

it('cambiar de período o de método vuelve a pedir la caja con el filtro nuevo, desde la página 1', async () => {
  mockedList.mockResolvedValue(response());
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);
  await screen.findByRole('table', { name: /abonos/i });

  await user.click(screen.getByRole('button', { name: 'Esta semana' }));
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', { ...presetRange('week'), page: 1 }),
  );
  expect(screen.getByRole('button', { name: 'Esta semana' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await user.selectOptions(screen.getByRole('combobox', { name: /método/i }), 'TRANSFER');
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      ...presetRange('week'),
      method: 'TRANSFER',
      page: 1,
    }),
  );

  await user.click(screen.getByRole('button', { name: 'Este mes' }));
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      ...presetRange('month'),
      method: 'TRANSFER',
      page: 1,
    }),
  );
});

it('el rango personalizado pide las fechas elegidas y no consulta un rango invertido', async () => {
  mockedList.mockResolvedValue(response());
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);
  await screen.findByRole('table', { name: /abonos/i });

  await user.click(screen.getByRole('button', { name: 'Personalizado' }));
  const from = screen.getByLabelText('Desde');
  const to = screen.getByLabelText('Hasta');

  await user.clear(from);
  await user.type(from, '2026-09-01');
  await user.clear(to);
  await user.type(to, '2026-09-30');
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      from: '2026-09-01',
      to: '2026-09-30',
      page: 1,
    }),
  );

  await screen.findByRole('table', { name: /abonos/i });
  const calls = mockedList.mock.calls.length;
  await user.clear(from);
  await user.type(from, '2026-10-05');
  const error = await screen.findByText(/la fecha final no puede ser anterior/i);
  expect(mockedList).toHaveBeenCalledTimes(calls);

  // Los dos campos apuntan al mensaje que los explica.
  const errorId = error.closest('[id]')?.id;
  expect(errorId).toBeTruthy();
  expect(from).toHaveAttribute('aria-describedby', errorId);
  expect(to).toHaveAttribute('aria-describedby', errorId);

  // Y no se queda en pantalla el resultado de OTRO rango (el de septiembre)
  // como si respondiera al que está escrito.
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: /resumen del período/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/^\d+ abonos?$/)).not.toBeInTheDocument();

  // Al corregirlo vuelve a pedir y a pintar.
  await user.clear(from);
  await user.type(from, '2026-09-10');
  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', {
      from: '2026-09-10',
      to: '2026-09-30',
      page: 1,
    }),
  );
  expect(await screen.findByRole('table', { name: /abonos/i })).toBeInTheDocument();
});

it('pagina: "Siguiente" pide la página 2 con los mismos filtros', async () => {
  mockedList.mockResolvedValue(response({ total: 45 }));
  const user = userEvent.setup();
  render(<CashRegisterView token="tok" />);
  await screen.findByRole('table', { name: /abonos/i });

  await user.click(screen.getByRole('button', { name: /siguiente/i }));

  await waitFor(() =>
    expect(mockedList).toHaveBeenLastCalledWith('tok', { ...presetRange('today'), page: 2 }),
  );
});
