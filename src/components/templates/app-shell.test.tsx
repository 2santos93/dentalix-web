import { render, screen } from '@testing-library/react';
import { AppShell } from './app-shell';

jest.mock('next/navigation', () => ({
  usePathname: () => '/patients',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }),
}));
jest.mock('../../lib/me/me-api', () => ({
  getMe: jest.fn().mockResolvedValue({
    id: 'u1',
    email: 'a@b.com',
    fullName: 'Ana Gómez',
    avatarUrl: null,
    emailVerifiedAt: null,
    memberships: [{ tenantId: 't1', clinicName: 'Sonrisa', role: 'ADMIN' }],
  }),
}));
jest.mock('../../lib/auth/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { accessToken: string | null; clear: () => void }) => unknown) =>
      selector({ accessToken: 'T', clear: jest.fn() }),
    { getState: () => ({ clear: jest.fn() }) },
  ),
}));

describe('AppShell', () => {
  it('renderiza la navegación y el menú de cuenta', async () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    // Navegación (aparece en sidebar desktop + topbar móvil bajo jsdom).
    expect(screen.getAllByRole('link', { name: /pacientes/i }).length).toBeGreaterThanOrEqual(1);
    // El menú de cuenta se monta en dos ubicaciones responsivas: la tarjeta del
    // sidebar (muestra el nombre) y el avatar compacto del topbar (aria "Cuenta").
    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /ana gómez|cuenta/i }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('includes an Inventario nav link pointing to /inventory', () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    // Se renderiza en dos ubicaciones responsivas (sidebar desktop + topbar
    // móvil); ambas existen en el DOM bajo jsdom.
    const links = screen.getAllByRole('link', { name: /inventario/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/inventory');
    });
  });
});
