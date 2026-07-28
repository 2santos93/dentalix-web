import { render, screen } from '@testing-library/react';
import { AppShell } from './app-shell';

jest.mock('next/navigation', () => ({
  usePathname: () => '/patients',
  useRouter: () => ({ replace: jest.fn() }),
}));

describe('AppShell', () => {
  it('renders logout and theme controls in the chrome (sidebar + mobile topbar)', () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    // Se renderizan en dos ubicaciones responsivas (footer del sidebar en
    // desktop, topbar en móvil); ambas existen en el DOM bajo jsdom.
    expect(
      screen.getAllByRole('button', { name: /cerrar sesión/i }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole('switch', { name: /cambiar tema/i }).length,
    ).toBeGreaterThanOrEqual(1);
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
