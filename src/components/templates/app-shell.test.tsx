import { render, screen } from '@testing-library/react';
import { AppShell } from './app-shell';

jest.mock('next/navigation', () => ({
  usePathname: () => '/patients',
  useRouter: () => ({ replace: jest.fn() }),
}));

describe('AppShell', () => {
  it('renders the account menu button in the top bar', () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    expect(screen.getByRole('button', { name: /cuenta/i })).toBeInTheDocument();
  });
});
