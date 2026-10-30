import { render, screen, within } from '@testing-library/react';
import { ItemPaidCell, ItemPaidLine } from './item-paid-cell';
import type { PlanItemBalance } from '@/lib/payments/payments-api';
import { regionalFormat, type RegionalFormat } from '@/lib/format/regional-format';

// DX-386: con el formato de la sede y el código ISO (fixture explícito es-CO).
const ES_CO = regionalFormat({ locale: 'es-CO', hourCycle: 'h12' });

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

function renderCells(item: PlanItemBalance | undefined, currency = 'EUR', fmt: RegionalFormat | null = ES_CO) {
  render(
    <table>
      <tbody>
        <tr>
          <ItemPaidCell item={item} currency={currency} fmt={fmt} />
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
    expect(paid).toHaveTextContent('EUR 60,00');
    expect(pending).toHaveAttribute('data-label', 'Pendiente');
    expect(pending).toHaveTextContent('EUR 40,00');
  });

  it('with another sede, its separators and the ISO code, never a symbol', () => {
    const [paid] = renderCells(balanceOf({ paid: 5000 }), 'COP', regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }));
    expect(paid).toHaveTextContent(/^5\.000,00\sCOP$/);
    expect(paid).not.toHaveTextContent('$');
  });

  it('while the sede format loads, «—» instead of another format', () => {
    const [paid, pending] = renderCells(balanceOf(), 'EUR', null);
    expect(paid).toHaveTextContent('—');
    expect(pending).toHaveTextContent('—');
  });

  it('formats with the plan currency it receives', () => {
    const [paid] = renderCells(balanceOf({ paid: 1500.5 }), 'MXN');
    expect(paid).toHaveTextContent('MXN 1.500,50');
  });

  it('PROPOSED shows — with aria-label "Sin importe a cobrar"', () => {
    const cells = renderCells(balanceOf({ status: 'PROPOSED', billable: 0, paid: 0, balance: 0 }));
    for (const cell of cells) {
      expect(within(cell).getByLabelText('Sin importe a cobrar')).toHaveTextContent('—');
    }
    expect(screen.queryByText('Cubierto')).not.toBeInTheDocument();
  });

  it('pending 0 shows Cubierto badge', () => {
    const [paid, pending] = renderCells(balanceOf({ paid: 100, balance: 0 }));
    expect(paid).toHaveTextContent('EUR 100,00');
    expect(within(pending).getByText('Cubierto')).toBeInTheDocument();
  });

  it('an item the balance does not know yet shows empty cells, not a zero', () => {
    const cells = renderCells(undefined);
    expect(cells).toHaveLength(2);
    for (const cell of cells) expect(cell).toHaveTextContent('—');
  });
});

describe('ItemPaidLine', () => {
  it('reads «Cobrado {x} · Pendiente {y}» on mobile cards', () => {
    render(<ItemPaidLine item={balanceOf()} currency="EUR" fmt={ES_CO} />);
    expect(screen.getByText(/cobrado/i)).toHaveTextContent('Cobrado EUR 60,00 · Pendiente EUR 40,00');
  });

  it('pending 0 shows the Cubierto badge, PROPOSED the dash', () => {
    const { rerender } = render(<ItemPaidLine item={balanceOf({ paid: 100, balance: 0 })} currency="EUR" fmt={ES_CO} />);
    expect(screen.getByText('Cubierto')).toBeInTheDocument();
    rerender(<ItemPaidLine item={balanceOf({ status: 'PROPOSED', billable: 0, paid: 0, balance: 0 })} currency="EUR" fmt={ES_CO} />);
    expect(screen.getByLabelText('Sin importe a cobrar')).toHaveTextContent('—');
  });

  it('renders nothing without the item balance', () => {
    const { container } = render(<ItemPaidLine item={undefined} currency="EUR" fmt={ES_CO} />);
    expect(container).toBeEmptyDOMElement();
  });
});
