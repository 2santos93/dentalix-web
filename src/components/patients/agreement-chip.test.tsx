import { render, screen } from '@testing-library/react';
import { AgreementChip } from './agreement-chip';

const summary = (status: 'NONE' | 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED' | 'INACTIVE') => ({
  status,
  agreementName: 'Sanitas 2026',
  payerName: 'Sanitas',
});

describe('AgreementChip (DX-105)', () => {
  it('con convenio vigente muestra «Convenio: nombre»', () => {
    render(<AgreementChip agreement={summary('ACTIVE')} />);
    expect(screen.getByTestId('agreement-chip')).toHaveTextContent('Convenio: Sanitas 2026');
  });

  it.each(['NONE', 'EXPIRED', 'NOT_STARTED', 'INACTIVE'] as const)(
    'no pinta nada con %s',
    (status) => {
      const { container } = render(<AgreementChip agreement={summary(status)} />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it('no pinta nada sin resumen', () => {
    const { container } = render(<AgreementChip agreement={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
