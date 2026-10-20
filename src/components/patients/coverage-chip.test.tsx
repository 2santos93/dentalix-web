import { render, screen } from '@testing-library/react';
import { COVERAGE_EXPIRED_LABEL, CoverageChip } from './coverage-chip';

const summary = (status: 'NONE' | 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED') => ({
  status,
  payerName: 'Sanitas',
  planName: null,
  validTo: '2026-01-31',
});

describe('CoverageChip (DX-153)', () => {
  it('con cobertura vencida muestra «Cobertura vencida»', () => {
    render(<CoverageChip coverage={summary('EXPIRED')} />);
    expect(screen.getByTestId('coverage-chip')).toHaveTextContent(COVERAGE_EXPIRED_LABEL);
    expect(COVERAGE_EXPIRED_LABEL).toBe('Cobertura vencida');
  });

  it.each(['NONE', 'ACTIVE', 'NOT_STARTED'] as const)('no pinta nada con %s', (status) => {
    const { container } = render(<CoverageChip coverage={summary(status)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no pinta nada sin resumen', () => {
    const { container } = render(<CoverageChip coverage={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
