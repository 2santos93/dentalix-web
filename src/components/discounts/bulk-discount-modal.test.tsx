import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkDiscountModal, bulkDiscountCopy } from './bulk-discount-modal';
import { applyBulkDiscount } from '@/lib/discounts/discounts-api';
import type { TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { ApiError } from '@/lib/api/client';
import { ITEM_WITHOUT_DISCOUNT } from '@/components/treatment-plans/plan-fixture';

jest.mock('../../lib/discounts/discounts-api', () => ({ applyBulkDiscount: jest.fn() }));
const mockedApply = applyBulkDiscount as jest.MockedFunction<typeof applyBulkDiscount>;

const RULES = {
  maxPercentByRole: { ADMIN: 100, DENTIST: 10, ASSISTANT: 0, RECEPTION: 0 },
  reasonRequiredAbovePercent: 10,
};

function item(id: string, tooth: string, price: number): TreatmentPlanItem {
  return {
    id,
    tenantId: 't1',
    planId: 'plan-1',
    toothNumber: tooth,
    surfaces: [],
    catalogItemId: 'cat-1',
    price,
    discount: 0,
    visit: 1,
    ...ITEM_WITHOUT_DISCOUNT,
    status: 'PROPOSED',
    notes: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

const ITEMS = [item('i1', '11', 85000), item('i2', '21', 123457), item('i3', '36', 1005)];

function renderModal(role: 'DENTIST' | 'ADMIN', currency = 'COP', items = ITEMS) {
  const onApplied = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <BulkDiscountModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      planId="plan-1"
      currency={currency}
      items={items}
      procedureOf={() => 'Corona'}
      rules={RULES}
      role={role}
      onApplied={onApplied}
    />,
  );
  return { onApplied, onOpenChange };
}

const percentInput = () => screen.getByLabelText('Porcentaje de descuento');
const previews = () => screen.getAllByTestId('bulk-discount-preview').map((el) => el.textContent ?? '');

describe('BulkDiscountModal (DX-204)', () => {
  beforeEach(() => mockedApply.mockReset());

  it('la vista previa redondea COP sin decimales y respeta el tope ítem a ítem', async () => {
    renderModal('DENTIST');
    await userEvent.type(percentInput(), '10');
    const texts = previews();
    // 8.500; 12.345,7 → 12.346 superaría el 10 %: 12.345; 100,5 → 100.
    expect(texts[0]).toMatch(/−8\.?500,00/);
    expect(texts[1]).toMatch(/−12\.345,00/);
    expect(texts[2]).toMatch(/−100,00/);
  });

  it('en EUR redondea a céntimos', async () => {
    renderModal('ADMIN', 'EUR', [item('i1', '11', 85.55), item('i2', '21', 123.45)]);
    await userEvent.type(percentInput(), '7,5');
    const texts = previews();
    expect(texts[0]).toMatch(/6,42/);
    expect(texts[1]).toMatch(/9,26/);
  });

  it('DX-241: el porcentaje sigue la regla decimal de los importes («7.5» = «7,5»; lo ambiguo no se envía)', async () => {
    renderModal('ADMIN', 'EUR', [item('i1', '11', 85.55)]);
    await userEvent.type(percentInput(), '7.5');
    expect(previews()[0]).toMatch(/6,42/);
    await userEvent.clear(percentInput());
    await userEvent.type(percentInput(), '7.5.0');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar descuento' }));
    expect(await screen.findByText('Escribe un porcentaje entre 0 y 100, con hasta 2 decimales.')).toBeInTheDocument();
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it('un DENTIST que pide un 15 % ve el tope de su rol y no se envía nada', async () => {
    renderModal('DENTIST');
    await userEvent.type(percentInput(), '15');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar descuento' }));
    expect(await screen.findByText('Tu rol permite hasta un 10 % de descuento por ítem.')).toBeInTheDocument();
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it('por encima del umbral exige el motivo; con él, envía y avisa', async () => {
    mockedApply.mockResolvedValue({ items: ITEMS, skippedNoDiscount: 0 });
    const { onApplied, onOpenChange } = renderModal('ADMIN');
    await userEvent.type(percentInput(), '20');
    expect(screen.getByText('Por encima del 10 % el motivo es obligatorio.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar descuento' }));
    expect(await screen.findByText('Elige el motivo del descuento.')).toBeInTheDocument();
    expect(mockedApply).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText('Motivo del descuento'), 'PROMOTION');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar descuento' }));
    await waitFor(() =>
      expect(mockedApply).toHaveBeenCalledWith('tok', 'plan-1', {
        itemIds: ['i1', 'i2', 'i3'],
        percent: 20,
        discountReason: 'PROMOTION',
      }),
    );
    expect(onApplied).toHaveBeenCalledWith(ITEMS, 0);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('pasa al padre cuántas prestaciones no admiten descuento y se dejaron igual (DX-105)', async () => {
    mockedApply.mockResolvedValue({ items: ITEMS.slice(0, 1), skippedNoDiscount: 2 });
    const { onApplied } = renderModal('ADMIN');
    await userEvent.type(percentInput(), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar descuento' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(ITEMS.slice(0, 1), 2));
    expect(bulkDiscountCopy.skipped(2)).toBe('2 prestaciones no admiten descuento y se dejaron igual.');
    expect(bulkDiscountCopy.skipped(1)).toBe('1 prestación no admite descuento y se dejó igual.');
  });

  it('«Otro» exige la nota', async () => {
    renderModal('ADMIN');
    await userEvent.type(percentInput(), '20');
    await userEvent.selectOptions(screen.getByLabelText('Motivo del descuento'), 'OTHER');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar descuento' }));
    expect(await screen.findByText(/Con el motivo «Otro», escribe una nota/)).toBeInTheDocument();
    expect(mockedApply).not.toHaveBeenCalled();
  });

  it('el error de la API (en español) se queda en el formulario', async () => {
    mockedApply.mockRejectedValue(
      new ApiError(409, 'El presupuesto ya está aceptado: sus descuentos no se pueden cambiar.'),
    );
    renderModal('ADMIN');
    await userEvent.type(percentInput(), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar descuento' }));
    const dialog = screen.getByRole('dialog');
    expect(
      await within(dialog).findByText('El presupuesto ya está aceptado: sus descuentos no se pueden cambiar.'),
    ).toBeInTheDocument();
  });
});
