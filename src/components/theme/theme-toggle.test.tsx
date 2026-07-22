import { render, screen } from '@testing-library/react';
import { ThemeToggle } from './theme-toggle';

jest.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: jest.fn() }),
}));

describe('ThemeToggle', () => {
  it('renders a toggle button with an accessible label', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: /tema|theme/i })).toBeInTheDocument();
  });
});
