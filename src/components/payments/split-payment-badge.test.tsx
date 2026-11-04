import { render, screen } from '@testing-library/react';
import { SplitPaymentBadge, splitPaymentLabel } from './split-payment-badge';

describe('splitPaymentLabel (DX-414)', () => {
  it('«Cobro dividido · 3 formas · PRI-000007» con el recibo único', () => {
    expect(splitPaymentLabel({ splitLines: 3, receiptNumber: 'PRI-000007' })).toBe(
      'Cobro dividido · 3 formas · PRI-000007',
    );
  });

  it('sin recibo (anterior a la numeración) omite ese tramo', () => {
    expect(splitPaymentLabel({ splitLines: 2, receiptNumber: null })).toBe('Cobro dividido · 2 formas');
  });

  it('un abono suelto, o de una sola línea, no tiene etiqueta', () => {
    expect(splitPaymentLabel({ splitLines: null, receiptNumber: 'PRI-000001' })).toBeNull();
    expect(splitPaymentLabel({ splitLines: 1, receiptNumber: 'PRI-000001' })).toBeNull();
    expect(splitPaymentLabel({ splitLines: 0, receiptNumber: null })).toBeNull();
  });
});

describe('SplitPaymentBadge (DX-414)', () => {
  it('pinta el distintivo con la etiqueta', () => {
    render(<SplitPaymentBadge splitLines={3} receiptNumber="PRI-000007" />);
    expect(screen.getByText('Cobro dividido · 3 formas · PRI-000007')).toBeInTheDocument();
  });

  it('no pinta nada en un abono suelto', () => {
    const { container } = render(<SplitPaymentBadge splitLines={null} receiptNumber="PRI-000001" />);
    expect(container).toBeEmptyDOMElement();
  });
});
