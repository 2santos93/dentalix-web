import { render, screen, within } from '@testing-library/react';
import { ItemPaidCell, ItemPaidLine } from './item-paid-cell';
import type { PlanItemBalance } from '@/lib/payments/payments-api';
import { formatCurrency } from '@/lib/format/currency';

function balanceOf(overrides: Partial<PlanItemBalance> = {}): PlanItemBalance {
  return {
    itemId: 'item-1',
    toothNumber: '11',
    procedureName: 'Resina',
    status: 'ACCEPTED',
    billable: 100,
    paid: 60,
    balance: 40,
    ...overrides,
  };
}

/** Intl separa importe y símbolo con un espacio duro; el DOM se compara normalizado. */
function money(amount: number, currency: string): string {
  return formatCurrency(amount, currency).replace(/ /g, ' ');
}

function renderCells(item: PlanItemBalance | undefined, currency = 'EUR') {
  render(
    <table>
      <tbody>
        <tr>
          <ItemPaidCell item={item} currency={currency} />
        </tr>
      </tbody>
    </table>,
  );
  return screen.getAllByRole('cell');
}

describe('ItemPaidCell', () => {
  it('shows Cobrado and Pendiente', () => {
    const [paid, pending] = renderCells(balanceOf());
    expect(paid).toHaveAttribute('data-label', 'Cobrado');
    expect(paid).toHaveTextContent(money(60, 'EUR'));
    expect(pending).toHaveAttribute('data-label', 'Pendiente');
    expect(pending).toHaveTextContent(money(40, 'EUR'));
  });

  it('formats with the plan currency it receives', () => {
    const [paid] = renderCells(balanceOf({ paid: 1500.5 }), 'MXN');
    expect(paid).toHaveTextContent(money(1500.5, 'MXN'));
  });

  it('PROPOSED shows — with aria-label "Sin importe a cobrar"', () => {
    const cells = renderCells(balanceOf({ status: 'PROPOSED', billable: 0, paid: 0, balance: 0 }));
    for (const cell of cells) {
      expect(within(cell).getByLabelText('Sin importe a cobrar')).toHaveTextContent('—');
    }
    expect(screen.queryByText('Pagado')).not.toBeInTheDocument();
  });

  it('pending 0 shows Pagado badge', () => {
    const [paid, pending] = renderCells(balanceOf({ paid: 100, balance: 0 }));
    expect(paid).toHaveTextContent(money(100, 'EUR'));
    expect(within(pending).getByText('Pagado')).toBeInTheDocument();
  });

  it('an item the balance does not know yet shows empty cells, not a zero', () => {
    const cells = renderCells(undefined);
    expect(cells).toHaveLength(2);
    for (const cell of cells) expect(cell).toHaveTextContent('—');
  });
});

describe('ItemPaidLine', () => {
  it('reads «Cobrado {x} · Pendiente {y}» on mobile cards', () => {
    render(<ItemPaidLine item={balanceOf()} currency="EUR" />);
    expect(screen.getByText(/cobrado/i)).toHaveTextContent(
      `Cobrado ${money(60, 'EUR')} · Pendiente ${money(40, 'EUR')}`,
    );
  });

  it('pending 0 shows the Pagado badge, PROPOSED the dash', () => {
    const { rerender } = render(<ItemPaidLine item={balanceOf({ paid: 100, balance: 0 })} currency="EUR" />);
    expect(screen.getByText('Pagado')).toBeInTheDocument();
    rerender(<ItemPaidLine item={balanceOf({ status: 'PROPOSED', billable: 0, paid: 0, balance: 0 })} currency="EUR" />);
    expect(screen.getByLabelText('Sin importe a cobrar')).toHaveTextContent('—');
  });

  it('renders nothing without the item balance', () => {
    const { container } = render(<ItemPaidLine item={undefined} currency="EUR" />);
    expect(container).toBeEmptyDOMElement();
  });
});
