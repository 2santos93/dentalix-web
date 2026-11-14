import { render, screen } from '@testing-library/react';
import QuoteSettingsPage from './page';
import { tokenFor } from '@/lib/test/prescriptions';
import { getQuoteSettings } from '@/lib/treatment-plans/quote-settings-api';

let mockToken: string | null = null;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings/presupuestos',
}));
jest.mock('../../../../lib/auth/auth-store', () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ accessToken: mockToken, _hasHydrated: true }),
}));
jest.mock('../../../../lib/treatment-plans/quote-settings-api', () => ({
  ...jest.requireActual('../../../../lib/treatment-plans/quote-settings-api'),
  getQuoteSettings: jest.fn(),
}));

describe('/settings/presupuestos (DX-379)', () => {
  beforeEach(() => jest.mocked(getQuoteSettings).mockResolvedValue({ validityDays: 30 }));

  it('se titula como su entrada del índice y ADMIN puede cambiar', async () => {
    mockToken = tokenFor('ADMIN');
    render(<QuoteSettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Presupuestos' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Cambiar la validez del presupuesto' })).toBeInTheDocument();
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('%s la ve en solo lectura', async (role) => {
    mockToken = tokenFor(role);
    render(<QuoteSettingsPage />);
    expect(await screen.findByTestId('quote-validity-days')).toHaveTextContent('30 días');
    expect(screen.getByText('Lo cambia administración.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cambiar/ })).not.toBeInTheDocument();
  });
});
