import { render, screen } from '@testing-library/react';
import LocationSettingsPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('../../../../lib/auth/token-role', () => ({ getTokenRole: jest.fn() }));
jest.mock('../../../../components/locations/location-reps-settings', () => ({
  LocationRepsSettings: () => null,
}));
jest.mock('../../../../components/locations/location-phone-settings', () => ({
  LocationPhoneSettings: () => null,
}));
jest.mock('../../../../components/locations/cancellation-policy-settings', () => ({
  CancellationPolicySettings: () => <section aria-label="Política de cancelación" />,
}));
const mockedRole = getTokenRole as jest.MockedFunction<typeof getTokenRole>;

describe('Ajustes → Sedes (DX-212, DX-279)', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'tok', _hasHydrated: true });
  });

  it('a ADMIN le anuncia la política de cancelación y se la muestra', () => {
    mockedRole.mockReturnValue('ADMIN');
    render(<LocationSettingsPage />);
    expect(screen.getByText(/Datos legales de cada sede y su política de cancelación\./)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Política de cancelación' })).toBeInTheDocument();
  });

  it.each(['RECEPTION', 'DENTIST', 'ASSISTANT'] as const)(
    'a %s no le promete la política que no ve (QA D4)',
    (role) => {
      mockedRole.mockReturnValue(role);
      render(<LocationSettingsPage />);
      expect(screen.getByText(/^Datos legales de cada sede\./)).toBeInTheDocument();
      expect(screen.queryByText(/política de cancelación/)).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Política de cancelación' })).not.toBeInTheDocument();
    },
  );
});
