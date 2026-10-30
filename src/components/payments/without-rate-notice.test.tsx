import { render, screen } from '@testing-library/react';
import { tokenForRole } from '@/lib/test/data-consents';
import { clinicLocation } from '@/lib/test/locations';
import { listLocations } from '@/lib/locations/locations-api';
import { WithoutRateNotice, withoutRateCopy } from './without-rate-notice';

// DX-378: importe y día con el formato de la sede (fixture explícito es-CO).
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
const mockedLocations = jest.mocked(listLocations);

beforeEach(() => {
  mockedLocations.mockReset();
  mockedLocations.mockResolvedValue([clinicLocation()]);
});

const ONE = [{ paymentId: 'p1', amount: 50, currency: 'USD', paidOn: '2026-10-30' }];

describe('WithoutRateNotice (DX-375)', () => {
  it('sin abonos sin tasa no pinta nada', () => {
    const { container } = render(<WithoutRateNotice token={tokenForRole('ADMIN')} payments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dice cuántos abonos quedan fuera del saldo, cuáles y por qué, con el formato de la sede y el código ISO', async () => {
    render(<WithoutRateNotice token={tokenForRole('RECEPTION')} payments={ONE} />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(withoutRateCopy.title(1));
    expect(notice).toHaveTextContent(withoutRateCopy.body);
    expect(await screen.findByText('USD 50,00 del 30/10/2026')).toBeInTheDocument();
    expect(notice).not.toHaveTextContent('US$');
  });

  it('con otra sede, su formato (DX-378)', async () => {
    mockedLocations.mockResolvedValue([clinicLocation({ locale: 'de-DE', hourCycle: 'h23' })]);
    render(<WithoutRateNotice token={tokenForRole('RECEPTION')} payments={ONE} />);
    expect(await screen.findByText(/^50,00\sUSD del 30\.10\.2026$/)).toBeInTheDocument();
  });

  it('mientras carga el formato de la sede, «—» en vez de otro formato', () => {
    mockedLocations.mockReturnValue(new Promise(() => {}));
    render(<WithoutRateNotice token={tokenForRole('RECEPTION')} payments={ONE} />);
    expect(screen.getByText('— del —')).toBeInTheDocument();
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
