import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './theme-toggle';

const mockSetTheme = jest.fn();
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: mockSetTheme }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => mockSetTheme.mockClear());

  it('renders a switch with an accessible label, unchecked in light mode', () => {
    render(<ThemeToggle />);
    const sw = screen.getByRole('switch', { name: /tema|theme/i });
    expect(sw).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('switches to dark when toggled from light', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole('switch', { name: /tema|theme/i }));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });
});
