import { render, screen } from '@testing-library/react';
import CertificateSettingsPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { tokenFor } from '@/lib/test/prescriptions';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));
const formRendered = jest.fn();
jest.mock('../../../../components/certificates/certificate-settings-form', () => ({
  CertificateSettingsForm: ({ token }: { token: string }) => {
    formRendered(token);
    return <section aria-label="Ajustes de certificados (form)" data-token={token} />;
  },
}));

describe('Ajustes › Certificados (DX-306)', () => {
  beforeEach(() => formRendered.mockReset());

  it('ADMIN edita el reposo, con el alcance de toda la clínica', () => {
    const tok = tokenFor('ADMIN', 'u-admin');
    useAuthStore.setState({ accessToken: tok, _hasHydrated: true });
    render(<CertificateSettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Certificados' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Certificado de reposo' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Ajustes de certificados (form)' })).toHaveAttribute('data-token', tok);
    expect(screen.getByTestId('settings-scope')).toHaveTextContent('Aplica a toda la clínica');
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('%s ve un único aviso y no se pide nada', (role) => {
    useAuthStore.setState({ accessToken: tokenFor(role), _hasHydrated: true });
    render(<CertificateSettingsPage />);
    expect(screen.getAllByText('Solo administración cambia los ajustes de los certificados.')).toHaveLength(1);
    expect(formRendered).not.toHaveBeenCalled();
  });
});
