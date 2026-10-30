import { render, screen } from '@testing-library/react';
import { tokenForRole } from '@/lib/test/data-consents';
import { WithoutRateNotice, withoutRateCopy } from './without-rate-notice';

const ONE = [{ paymentId: 'p1', amount: 50, currency: 'USD', paidOn: '2026-10-30' }];

describe('WithoutRateNotice (DX-375)', () => {
  it('sin abonos sin tasa no pinta nada', () => {
    const { container } = render(<WithoutRateNotice token={tokenForRole('ADMIN')} payments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dice cuántos abonos quedan fuera del saldo, cuáles y por qué', () => {
    render(<WithoutRateNotice token={tokenForRole('RECEPTION')} payments={ONE} />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(withoutRateCopy.title(1));
    expect(notice).toHaveTextContent(withoutRateCopy.body);
    expect(notice).toHaveTextContent('30/10/2026');
    expect(notice).toHaveTextContent('50,00 US$');
  });

  it('al ADMIN le enlaza a Ajustes › Tasa de cambio', () => {
    render(<WithoutRateNotice token={tokenForRole('ADMIN')} payments={ONE} />);
    expect(screen.getByRole('link', { name: withoutRateCopy.adminLink })).toHaveAttribute(
      'href',
      '/settings/tasa-de-cambio',
    );
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'] as const)(
    '%s no ve el enlace: se le pide que avise a un administrador',
    (role) => {
      render(<WithoutRateNotice token={tokenForRole(role)} payments={ONE} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText(withoutRateCopy.otherRoles)).toBeInTheDocument();
    },
  );

  it('en plural y sin nombrar un país ni un banco central', () => {
    render(
      <WithoutRateNotice
        token={tokenForRole('ADMIN')}
        payments={[
          ...ONE,
          {
            paymentId: 'p2',
            amount: 150000,
            currency: 'COP',
            paidOn: '2026-10-29',
          },
        ]}
      />,
    );
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain(withoutRateCopy.title(2));
    expect(text).not.toMatch(/venezuela|colombia|españa|méxico|banco central|bcv|banrep/i);
  });
});
