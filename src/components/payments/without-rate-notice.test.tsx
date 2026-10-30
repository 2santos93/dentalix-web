import { render, screen } from '@testing-library/react';
import { tokenForRole } from '@/lib/test/data-consents';
import { clinicLocation } from '@/lib/test/locations';
import { listLocations } from '@/lib/locations/locations-api';
import { getExchangeRateSettings } from '@/lib/exchange/exchange-settings-api';
import { WithoutRateNotice, withoutRateCopy } from './without-rate-notice';

// DX-378: importe y día con el formato de la sede (fixture explícito es-CO).
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
const mockedLocations = jest.mocked(listLocations);
// DX-386: la fuente de la clínica (solo ADMIN puede leerla).
jest.mock('../../lib/exchange/exchange-settings-api', () => ({
  ...jest.requireActual('../../lib/exchange/exchange-settings-api'),
  getExchangeRateSettings: jest.fn(),
}));
const mockedSettings = jest.mocked(getExchangeRateSettings);
const MANUAL = { source: 'MANUAL' as const, manualSince: '2026-10-01', baseCurrency: 'USD' };
const AUTOMATIC = { source: 'AUTOMATIC' as const, manualSince: null, baseCurrency: 'USD' };

beforeEach(() => {
  mockedLocations.mockReset();
  mockedLocations.mockResolvedValue([clinicLocation()]);
  mockedSettings.mockReset();
  mockedSettings.mockResolvedValue(MANUAL);
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

  it('con fuente manual, al ADMIN le enlaza a Ajustes › Tasa de cambio para registrarla', async () => {
    render(<WithoutRateNotice token={tokenForRole('ADMIN')} payments={ONE} />);
    expect(await screen.findByRole('link', { name: withoutRateCopy.adminLink })).toHaveAttribute(
      'href',
      '/settings/tasa-de-cambio',
    );
    expect(screen.getByText(withoutRateCopy.adminHint)).toBeInTheDocument();
    expect(screen.queryByText(withoutRateCopy.automatic)).not.toBeInTheDocument();
    expect(mockedSettings).toHaveBeenCalledWith(tokenForRole('ADMIN'));
  });

  it('con fuente automática no invita a registrar una tasa: el proveedor aún no la da y, para el ADMIN, explica pasar a manual', async () => {
    mockedSettings.mockResolvedValue(AUTOMATIC);
    render(<WithoutRateNotice token={tokenForRole('ADMIN')} payments={ONE} />);
    expect(await screen.findByText(withoutRateCopy.automatic)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: withoutRateCopy.switchToManualLink })).toHaveAttribute(
      'href',
      '/settings/tasa-de-cambio',
    );
    expect(screen.getByText(withoutRateCopy.switchToManualHint)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: withoutRateCopy.adminLink })).not.toBeInTheDocument();
    expect(screen.queryByText(withoutRateCopy.adminHint)).not.toBeInTheDocument();
  });

  it('con fuente manual, un abono de antes del paso a manual sigue esperando al proveedor', async () => {
    render(
      <WithoutRateNotice
        token={tokenForRole('ADMIN')}
        payments={[{ paymentId: 'p0', amount: 20, currency: 'USD', paidOn: '2026-09-30' }]}
      />,
    );
    expect(await screen.findByText(withoutRateCopy.automatic)).toBeInTheDocument();
    // Ya es manual: no hay a qué cambiar, y registrar una tasa de ese día no serviría.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('con fuente manual y abonos de antes y después del cambio, dice las dos cosas', async () => {
    render(
      <WithoutRateNotice
        token={tokenForRole('ADMIN')}
        payments={[...ONE, { paymentId: 'p0', amount: 20, currency: 'USD', paidOn: '2026-09-30' }]}
      />,
    );
    expect(await screen.findByRole('link', { name: withoutRateCopy.adminLink })).toBeInTheDocument();
    expect(screen.getByText(withoutRateCopy.automatic)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: withoutRateCopy.switchToManualLink })).not.toBeInTheDocument();
  });

  it('mientras lee la fuente no propone nada todavía', () => {
    mockedSettings.mockReturnValue(new Promise(() => {}));
    render(<WithoutRateNotice token={tokenForRole('ADMIN')} payments={ONE} />);
    expect(screen.getByRole('status')).toHaveTextContent(withoutRateCopy.body);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('si no se puede leer la fuente, al ADMIN le enlaza a revisar la tasa sin dar por hecha ninguna fuente', async () => {
    mockedSettings.mockRejectedValue(new Error('red'));
    render(<WithoutRateNotice token={tokenForRole('ADMIN')} payments={ONE} />);
    expect(await screen.findByRole('link', { name: withoutRateCopy.settingsLink })).toHaveAttribute(
      'href',
      '/settings/tasa-de-cambio',
    );
    expect(screen.queryByText(withoutRateCopy.adminHint)).not.toBeInTheDocument();
    expect(screen.queryByText(withoutRateCopy.automatic)).not.toBeInTheDocument();
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'] as const)(
    '%s no ve el enlace ni pide la fuente (sería un 403): texto genérico para avisar a un administrador',
    (role) => {
      render(<WithoutRateNotice token={tokenForRole(role)} payments={ONE} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText(withoutRateCopy.otherRoles)).toBeInTheDocument();
      expect(mockedSettings).not.toHaveBeenCalled();
    },
  );

  it('en plural y sin nombrar un país ni un banco central', async () => {
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
    await screen.findByRole('link', { name: withoutRateCopy.adminLink });
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain(withoutRateCopy.title(2));
    expect(JSON.stringify(withoutRateCopy)).not.toMatch(/venezuela|colombia|españa|méxico|banco central|bcv|banrep/i);
    expect(text).not.toMatch(/venezuela|colombia|españa|méxico|banco central|bcv|banrep/i);
  });
});
