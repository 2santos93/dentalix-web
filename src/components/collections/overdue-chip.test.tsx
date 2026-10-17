import { render, screen } from '@testing-library/react';
import { OverdueChip } from './overdue-chip';

describe('OverdueChip (DX-150)', () => {
  it('no pinta nada sin saldo vencido', () => {
    const { container } = render(<OverdueChip balance={{ hasOverdue: false, overdueDays: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra la marca y los días; el importe solo si la API lo manda', () => {
    const { rerender } = render(<OverdueChip balance={{ hasOverdue: true, overdueDays: 12 }} />);
    expect(screen.getByTestId('overdue-chip')).toHaveTextContent('Saldo vencido · 12 días');
    rerender(
      <OverdueChip balance={{ hasOverdue: true, overdueDays: 12, amounts: [{ currency: 'COP', amount: 50000 }] }} />,
    );
    expect(screen.getByTestId('overdue-chip').textContent?.replace(/\s/g, ' ')).toMatch(/12 días · .*50\.000/);
  });
});
