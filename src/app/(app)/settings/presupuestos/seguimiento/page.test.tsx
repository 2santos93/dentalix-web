import { render, screen } from '@testing-library/react';
import QuoteFollowUpSettingsPage from './page';
import { tokenFor } from '@/lib/test/prescriptions';
import { listQuoteFollowUpSettings } from '@/lib/treatment-plans/quote-follow-up-api';

let mockToken: string | null = null;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings/presupuestos/seguimiento',
}));
jest.mock('../../../../../lib/auth/auth-store', () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ accessToken: mockToken, _hasHydrated: true }),
}));
jest.mock('../../../../../lib/treatment-plans/quote-follow-up-api', () => ({
  ...jest.requireActual('../../../../../lib/treatment-plans/quote-follow-up-api'),
  listQuoteFollowUpSettings: jest.fn(),
}));
jest.mock('../../../../../lib/locations/use-locations-state', () => ({
  useLocationsState: () => ({ status: 'loading', retry: () => undefined }),
}));

describe('/settings/presupuestos/seguimiento (DX-561)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listQuoteFollowUpSettings).mockResolvedValue([]);
  });

  it('ADMIN: título, «Por sede» y la vuelta a Presupuestos', async () => {
    mockToken = tokenFor('ADMIN');
    render(<QuoteFollowUpSettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Seguimiento automático' })).toBeInTheDocument();
    expect(screen.getByTestId('settings-scope')).toHaveTextContent('Por sede');
    expect(screen.getByRole('link', { name: 'Presupuestos' })).toHaveAttribute('href', '/settings/presupuestos');
    expect(await screen.findByText('Todavía no hay sedes.')).toBeInTheDocument();
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('%s ve el aviso y no se pide nada', (role) => {
    mockToken = tokenFor(role);
    render(<QuoteFollowUpSettingsPage />);
    expect(screen.getByText('Solo administración configura el seguimiento automático.')).toBeInTheDocument();
    expect(listQuoteFollowUpSettings).not.toHaveBeenCalled();
  });
});
