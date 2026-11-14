import { render, screen } from '@testing-library/react';
import SlotOfferSettingsPage from './page';
import { tokenFor } from '@/lib/test/prescriptions';
import { getSlotOfferSettings } from '@/lib/appointments/slot-offer-settings-api';

let mockToken: string | null = null;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings/ofertas-de-hueco',
}));
jest.mock('../../../../lib/auth/auth-store', () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ accessToken: mockToken, _hasHydrated: true }),
}));
jest.mock('../../../../lib/appointments/slot-offer-settings-api', () => ({
  ...jest.requireActual('../../../../lib/appointments/slot-offer-settings-api'),
  getSlotOfferSettings: jest.fn(),
}));

describe('/settings/ofertas-de-hueco (DX-448)', () => {
  beforeEach(() =>
    jest.mocked(getSlotOfferSettings).mockResolvedValue({
      expiryLeadMinutes: 0,
      minLeadMinutes: 20,
      defaultExpiryLeadMinutes: 0,
      defaultMinLeadMinutes: 20,
    }),
  );

  it('se titula como su entrada del índice y ADMIN puede cambiar', async () => {
    mockToken = tokenFor('ADMIN');
    render(<SlotOfferSettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ofertas de hueco' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Cambiar la caducidad del enlace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cambiar la antelación mínima' })).toBeInTheDocument();
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('%s la ve en solo lectura', async (role) => {
    mockToken = tokenFor(role);
    render(<SlotOfferSettingsPage />);
    expect(await screen.findByTestId('slot-offer-expiryLeadMinutes')).toHaveTextContent('Al empezar el hueco');
    expect(screen.getByTestId('slot-offer-minLeadMinutes')).toHaveTextContent('20 minutos');
    expect(screen.getAllByText('Lo cambia administración.')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Cambiar/ })).not.toBeInTheDocument();
  });
});
