import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpensePaymentModal } from './expense-payment-modal';
import { addExpensePayment } from '@/lib/expenses/expenses-api';
import { listLocations } from '@/lib/locations/locations-api';
import { moneyWithCode } from '@/lib/format/sede-number';
import { expenseDetailFixture } from '@/lib/test/expenses';
import { clinicLocation } from '@/lib/test/locations';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/expenses/expenses-api', () => ({
  ...jest.requireActual('../../lib/expenses/expenses-api'),
  addExpensePayment: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([{ code: 'EUR', name: 'Euro', symbol: '€' }]),
}));

const mockedLocations = jest.mocked(listLocations);
const mockedPay = jest.mocked(addExpensePayment);
const norm = (text: string | null) => (text ?? '').replace(/\s/g, ' ');

// Un gasto de 1.234,50 EUR pendiente en la sede de Berlín.
const EXPENSE = expenseDetailFixture({
  locationId: 'sede-berlin',
  currency: 'EUR',
  amount: 1234.5,
  paidAmount: 0,
  pendingAmount: 1234.5,
});

function renderModal(onSaved = jest.fn()) {
  render(<ExpensePaymentModal open onOpenChange={jest.fn()} token="tok" expense={EXPENSE} today="2026-11-03" onSaved={onSaved} />);
  return { onSaved };
}

describe('ExpensePaymentModal con el formato de la sede del gasto (DX-354b)', () => {
  beforeEach(() => {
    mockedPay.mockReset();
    mockedLocations.mockReset().mockResolvedValue([STAMP_SEDES.caracas, STAMP_SEDES.berlin, STAMP_SEDES.miami]);
  });

  it('lo pendiente sale «1.234,50 EUR» (la sede del gasto es Berlín), no «EUR 1.234,50» de la sede de la pantalla', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(norm(dialog.textContent)).toContain(norm(moneyWithCode(1234.5, 'EUR', STAMP_FORMATS.berlin))));
    expect(norm(dialog.textContent)).toContain('Pendiente: 1.234,50 EUR');
    expect(norm(dialog.textContent)).not.toContain('EUR 1.234,50');
  });

  it('el aviso de éxito usa el mismo formato: «Pago de 1.234,50 EUR registrado.»', async () => {
    const user = userEvent.setup();
    mockedPay.mockResolvedValue(EXPENSE);
    const { onSaved } = renderModal();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(norm(dialog.textContent)).toContain('Pendiente: 1.234,50 EUR'));
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pago' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(norm(onSaved.mock.calls[0][1])).toBe('Pago de 1.234,50 EUR registrado.');
  });

  it('con la sede del gasto de Miami (en-US) sale «EUR 1,234.50»', async () => {
    mockedLocations.mockResolvedValue([STAMP_SEDES.caracas, { ...STAMP_SEDES.miami, id: 'sede-berlin' }]);
    renderModal();
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(norm(dialog.textContent)).toContain('Pendiente: EUR 1,234.50'));
  });

  it('sin formato de la sede: lo pendiente «—», un solo aviso con Reintentar y no se envía a ciegas', async () => {
    mockedLocations.mockResolvedValue([clinicLocation({ id: 'sede-berlin', locale: null, hourCycle: null })]);
    renderModal();
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
    expect(norm(dialog.textContent)).toContain('Pendiente: —');
    expect(within(dialog).getByRole('button', { name: 'Registrar pago' })).toBeDisabled();
  });

  it('mientras cargan las sedes no hay aviso', async () => {
    mockedLocations.mockReturnValue(new Promise(() => undefined));
    renderModal();
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });
});
