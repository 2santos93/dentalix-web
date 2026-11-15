import { render, screen } from '@testing-library/react';
import DuplicatesPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { tokenFor } from '@/lib/test/prescriptions';
import { routeRoleGateCopy } from '@/components/layouts/route-role-gate';

const viewRendered = jest.fn();
jest.mock('../../../../components/patients/duplicates-view', () => ({
  DuplicatesView: ({ token }: { token: string }) => {
    viewRendered(token);
    return <section aria-label="Posibles duplicados (vista)" />;
  },
}));

describe('Pacientes › Posibles duplicados (DX-266)', () => {
  beforeEach(() => viewRendered.mockReset());

  it('ADMIN ve la pantalla', () => {
    const tok = tokenFor('ADMIN', 'u-admin');
    useAuthStore.setState({ accessToken: tok, _hasHydrated: true });
    render(<DuplicatesPage />);
    expect(screen.getByRole('region', { name: 'Posibles duplicados (vista)' })).toBeInTheDocument();
    expect(viewRendered).toHaveBeenCalledWith(tok);
  });

  it.each(['RECEPTION', 'DENTIST', 'ASSISTANT'])('%s por URL ve el aviso sin permiso y no se pide nada', (role) => {
    useAuthStore.setState({ accessToken: tokenFor(role), _hasHydrated: true });
    render(<DuplicatesPage />);
    expect(screen.getByText(routeRoleGateCopy.title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: routeRoleGateCopy.home })).toHaveAttribute('href', '/dashboard');
    expect(viewRendered).not.toHaveBeenCalled();
  });
});
