import { render, screen } from '@testing-library/react';
import { IncompleteBalanceChip, OverdueChip } from './overdue-chip';
import { FORMAT_ES, FORMAT_US } from '@/lib/test/document-regional';

const FMT = FORMAT_ES.fmt;

describe('OverdueChip (DX-150)', () => {
  it('no pinta nada sin saldo vencido', () => {
    const { container } = render(<OverdueChip fmt={FMT} balance={{ hasOverdue: false, overdueDays: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('muestra la marca y los días; el importe solo si la API lo manda', () => {
    const { rerender } = render(<OverdueChip fmt={FMT} balance={{ hasOverdue: true, overdueDays: 12 }} />);
    expect(screen.getByTestId('overdue-chip')).toHaveTextContent('Saldo vencido · 12 días');
    rerender(
      <OverdueChip fmt={FMT} balance={{ hasOverdue: true, overdueDays: 12, amounts: [{ currency: 'USD', amount: 50000 }] }} />,
    );
    expect(screen.getByTestId('overdue-chip').textContent?.replace(/\s/g, ' ')).toMatch(/12 días · 50\.000,00 USD/);
  });
});

describe('DX-354: el importe del chip sigue el formato de la sede', () => {
  const balance = { hasOverdue: true, overdueDays: 12, amounts: [{ currency: 'USD', amount: 50000 }] };

  it('con el orden de la sede y el código ISO', () => {
    render(<OverdueChip balance={balance} fmt={FORMAT_US.fmt} />);
    expect(screen.getByTestId('overdue-chip').textContent?.replace(/\s/g, ' ')).toBe('Saldo vencido · 12 días · USD 50,000.00');
  });

  it('sin formato de la sede, «—», nunca otro formato', () => {
    render(<OverdueChip balance={balance} fmt={null} />);
    expect(screen.getByTestId('overdue-chip')).toHaveTextContent('Saldo vencido · 12 días · —');
  });
});

describe('cifras incompletas (DX-472-bis)', () => {
  it('con saldo vencido, el chip lo añade', () => {
    render(<OverdueChip fmt={FMT} balance={{ hasOverdue: true, overdueDays: 12, incomplete: true }} />);
    expect(screen.getByTestId('overdue-chip')).toHaveTextContent('Saldo vencido · 12 días · cifras incompletas');
  });

  it('sin saldo vencido, la ficha lo dice aparte', () => {
    render(<IncompleteBalanceChip balance={{ hasOverdue: false, overdueDays: null, incomplete: true }} />);
    expect(screen.getByTestId('incomplete-balance-chip')).toHaveTextContent('Saldo con cifras incompletas');
  });

  it('sin la marca, nada', () => {
    const { container } = render(<IncompleteBalanceChip balance={{ hasOverdue: false, overdueDays: null }} />);
    expect(container).toBeEmptyDOMElement();
    const { container: withOverdue } = render(
      <IncompleteBalanceChip balance={{ hasOverdue: true, overdueDays: 3, incomplete: true }} />,
    );
    expect(withOverdue).toBeEmptyDOMElement();
  });
});
