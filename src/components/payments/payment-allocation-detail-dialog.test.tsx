import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { moneyWithCode } from '@/lib/format/sede-number';
import { listLocations } from '@/lib/locations/locations-api';
import { STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';
import { getPaymentAllocations, type PaymentAllocations } from '@/lib/payments/payment-allocations-api';
import { PaymentAllocationDetailDialog, allocationRows } from './payment-allocation-detail-dialog';

jest.mock('../../lib/payments/payment-allocations-api', () => ({
  getPaymentAllocations: jest.fn(),
  replacePaymentAllocations: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedGet = jest.mocked(getPaymentAllocations);

/** El importe tal como lo pinta el diálogo: código ISO y formato de la sede del abono (espacio duro como normal). */
const money = (amount: number, currency: string, sede: 'caracas' | 'berlin' = 'caracas') =>
  moneyWithCode(amount, currency, STAMP_FORMATS[sede]).replace(/ /g, ' ');
const flat = (text: string | null | undefined) => (text ?? '').replace(/ /g, ' ');

const item = (id: string, procedureName: string, toothNumber: string) => ({
  itemId: id,
  toothNumber,
  procedureName,
  status: 'ACCEPTED' as const,
  billable: 100,
  paidByOthers: 0,
  free: 100,
});

// Abono de 130 USD a un plan en USD: 100 a «Resina» y 30 a cuenta.
const AUTO: PaymentAllocations = {
  paymentId: 'pay-1',
  receiptNumber: 'NOR-000123',
  locationId: STAMP_SEDES.caracas.id,
  treatmentPlanId: 'plan-1',
  paymentAmount: 130,
  paymentCurrency: 'USD',
  paidOn: '2026-10-20',
  planCurrency: 'USD',
  planStatus: 'ACCEPTED',
  planAmount: 130,
  manual: false,
  allocated: 100,
  unallocated: 30,
  creditOut: 0,
  onAccount: 30,
  version: 'a'.repeat(64),
  allocations: [{ treatmentPlanItemId: 'item-1', amount: 100, source: 'AUTO' }],
  items: [item('item-1', 'Resina', '11'), item('item-2', 'Limpieza', '26')],
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof PaymentAllocationDetailDialog>> = {}) {
  const props: React.ComponentProps<typeof PaymentAllocationDetailDialog> = {
    token: 'tok',
    paymentId: 'pay-1',
    onOpenChange: jest.fn(),
    ...overrides,
  };
  render(<PaymentAllocationDetailDialog {...props} />);
  return props;
}

describe('PaymentAllocationDetailDialog (DX-399)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listLocations).mockResolvedValue([STAMP_SEDES.caracas, STAMP_SEDES.berlin]);
    mockedGet.mockResolvedValue(AUTO);
  });

  it('cerrado (sin abono) no pide nada', () => {
    renderDialog({ paymentId: null });
    expect(mockedGet).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra el ítem imputado con su importe, la regla automática y lo que queda «A cuenta»', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    expect(await within(dialog).findByText('Automática (más antiguo primero)')).toBeInTheDocument();
    const list = within(dialog).getByRole('table', { name: 'Ítems a los que se imputó el abono' });
    const resina = within(list).getByRole('row', { name: /Resina/ });
    expect(flat(resina.textContent)).toContain(money(100, 'USD'));
    expect(within(resina).getByText('11')).toBeInTheDocument();
    const onAccount = within(list).getByRole('row', { name: /A cuenta/ });
    expect(flat(onAccount.textContent)).toContain(money(30, 'USD'));
    // El pie: abono, imputado y a cuenta.
    const summary = within(dialog).getByLabelText('Resumen de la imputación');
    expect(flat(summary.textContent)).toContain(money(130, 'USD'));
    expect(flat(summary.textContent)).toContain(money(100, 'USD'));
    expect(flat(summary.textContent)).toContain(money(30, 'USD'));
    // El subtítulo: recibo · importe · día, con el formato de la sede del abono.
    expect(within(dialog).getByText(`NOR-000123 · ${money(130, 'USD')} · ${STAMP_FORMATS.caracas.civilDate('2026-10-20')}`)).toBeInTheDocument();
  });

  it('con una devolución: sin imputar a ítems, de ello devuelto y a cuenta neto (la cifra del informe)', async () => {
    mockedGet.mockResolvedValue({ ...AUTO, creditOut: 20, onAccount: 10 });
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    const list = await within(dialog).findByRole('table', { name: 'Ítems a los que se imputó el abono' });
    expect(flat(within(list).getByRole('row', { name: /A cuenta/ }).textContent)).toContain(money(10, 'USD'));
    const summary = within(dialog).getByLabelText('Resumen de la imputación');
    expect(flat(summary.textContent)).toContain(money(30, 'USD'));
    expect(within(summary).getByText('De ello, devuelto o traspasado')).toBeInTheDocument();
    expect(flat(summary.textContent)).toContain(money(20, 'USD'));
  });

  it('sin devolución no hay línea «devuelto o traspasado»', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    await within(dialog).findByText('Automática (más antiguo primero)');
    expect(within(dialog).queryByText('De ello, devuelto o traspasado')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Sin imputar a ítems')).toBeInTheDocument();
  });

  it('devuelto del todo: no queda fila «A cuenta»', async () => {
    mockedGet.mockResolvedValue({ ...AUTO, creditOut: 30, onAccount: 0 });
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    const list = await within(dialog).findByRole('table', { name: 'Ítems a los que se imputó el abono' });
    expect(within(list).queryByRole('row', { name: /A cuenta/ })).not.toBeInTheDocument();
  });

  it('un abono fijado a mano dice «Manual»', async () => {
    mockedGet.mockResolvedValue({ ...AUTO, manual: true });
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    expect(await within(dialog).findByText('Manual')).toBeInTheDocument();
    expect(within(dialog).queryByText('Automática (más antiguo primero)')).not.toBeInTheDocument();
  });

  it('totalmente imputado: sin fila «A cuenta», con A cuenta en 0', async () => {
    mockedGet.mockResolvedValue({ ...AUTO, paymentAmount: 100, planAmount: 100, allocated: 100, unallocated: 0, onAccount: 0 });
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    const list = await within(dialog).findByRole('table', { name: 'Ítems a los que se imputó el abono' });
    expect(within(list).queryByRole('row', { name: /A cuenta/ })).not.toBeInTheDocument();
    expect(flat(within(dialog).getByLabelText('Resumen de la imputación').textContent)).toContain(money(0, 'USD'));
  });

  it('sin ninguna línea: todo queda «A cuenta»', async () => {
    mockedGet.mockResolvedValue({ ...AUTO, allocations: [], allocated: 0, unallocated: 130, onAccount: 130 });
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    const list = await within(dialog).findByRole('table', { name: 'Ítems a los que se imputó el abono' });
    expect(within(list).getAllByRole('row', { name: /A cuenta/ })).toHaveLength(1);
  });

  it('un abono en otra moneda dice con qué tasa se convirtió y pinta cada importe en su moneda', async () => {
    mockedGet.mockResolvedValue({
      ...AUTO,
      paymentAmount: 120,
      paymentCurrency: 'VES',
      planCurrency: 'USD',
      planAmount: 3.3,
      allocated: 3.3,
      unallocated: 0,
      creditOut: 0,
      onAccount: 0,
    });
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    expect(
      await within(dialog).findByText(
        `Convertido de ${money(120, 'VES')} con la tasa del ${STAMP_FORMATS.caracas.civilDate('2026-10-20')}.`,
      ),
    ).toBeInTheDocument();
  });

  it('con la sede del abono en Berlín el importe sale con su formato, no con el de Caracas', async () => {
    mockedGet.mockResolvedValue({ ...AUTO, locationId: STAMP_SEDES.berlin.id, paymentAmount: 1234.5, planAmount: 1234.5, allocated: 1234.5, unallocated: 0, onAccount: 0, allocations: [{ treatmentPlanItemId: 'item-1', amount: 1234.5, source: 'AUTO' }] });
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Imputación del abono' });
    const list = await within(dialog).findByRole('table', { name: 'Ítems a los que se imputó el abono' });
    expect(flat(within(list).getByRole('row', { name: /Resina/ }).textContent)).toContain('1.234,50 USD');
  });

  it('sin tasa para el día: lo dice y no inventa un reparto', async () => {
    mockedGet.mockResolvedValue({ ...AUTO, planAmount: null, allocated: 0, unallocated: null, onAccount: null, allocations: [] });
    renderDialog();
    expect(
      await screen.findByText('No hay tasa de cambio para la fecha de este abono: todavía no se imputa a ningún ítem.'),
    ).toBeInTheDocument();
  });

  it('plan cancelado: explica que sus abonos no se imputan', async () => {
    mockedGet.mockResolvedValue({ ...AUTO, planStatus: 'CANCELLED', allocations: [], items: [], allocated: 0, unallocated: 130, onAccount: 130 });
    renderDialog();
    expect(await screen.findByText(/El plan está «Cancelado»: sus abonos no se imputan a ítems\./)).toBeInTheDocument();
  });

  it('saldo migrado (409): un dato, sin «Reintentar»', async () => {
    mockedGet.mockRejectedValue(new ApiError(409, 'Este abono es de un saldo migrado.'));
    renderDialog();
    expect(await screen.findByText('Este abono no se imputa a ítems')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('error de carga con «Reintentar» que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(AUTO);
    const user = userEvent.setup();
    renderDialog();
    expect(await screen.findByText('No pudimos cargar la imputación del abono.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Automática (más antiguo primero)')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('«Cambiar imputación» solo aparece si quien lo abre puede (ADMIN) y cierra para abrir el modal de edición', async () => {
    const onChange = jest.fn();
    const props = renderDialog({ onChange });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cambiar imputación' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledWith('pay-1');
  });

  it('sin permiso de cambiar no ofrece «Cambiar imputación»', async () => {
    renderDialog();
    await screen.findByText('Automática (más antiguo primero)');
    expect(screen.queryByRole('button', { name: 'Cambiar imputación' })).not.toBeInTheDocument();
  });
});

describe('allocationRows', () => {
  it('pone las líneas en el orden del servidor y «A cuenta» al final solo si queda algo', () => {
    expect(allocationRows(AUTO).map((r) => [r.procedure, r.amount])).toEqual([
      ['Resina', 100],
      ['A cuenta', 30],
    ]);
    expect(allocationRows({ ...AUTO, unallocated: 0, onAccount: 0 }).map((r) => r.procedure)).toEqual(['Resina']);
    expect(allocationRows({ ...AUTO, unallocated: null, onAccount: null }).map((r) => r.procedure)).toEqual(['Resina']);
  });

  it('una línea en un ítem que ya no es imputable conserva su importe', () => {
    const rows = allocationRows({
      ...AUTO,
      allocations: [{ treatmentPlanItemId: 'gone', amount: 10, source: 'AUTO' }],
    });
    expect(rows[0]).toMatchObject({ procedure: 'Ítem del plan', amount: 10 });
  });
});
