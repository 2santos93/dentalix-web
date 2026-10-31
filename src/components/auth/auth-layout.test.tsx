import { render, screen } from '@testing-library/react';
import { AuthLayout } from './auth-layout';

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }),
}));

describe('AuthLayout', () => {
  it('on a clinic host the H1 is the clinic and the task is the support line; «Dentalix» does not show', () => {
    const { container } = render(
      <AuthLayout clinic={{ name: 'Clínica Sonrisa', logoUrl: null }} task="Inicia sesión en tu cuenta">
        <form />
      </AuthLayout>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Clínica Sonrisa');
    expect(screen.getByText('Inicia sesión en tu cuenta')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Dentalix/);
  });

  it('a clinic logo goes in the header, decorative (the name is already the H1)', () => {
    const { container } = render(
      <AuthLayout clinic={{ name: 'Clínica Sonrisa', logoUrl: 'https://cdn.example.com/logo.png' }} task="Acepta tu invitación">
        <form />
      </AuthLayout>,
    );
    const logo = container.querySelector('header img');
    expect(logo).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
    expect(logo).toHaveAttribute('alt', '');
  });

  it('without a clinic (apex) the H1 is the task and «Dentalix» shows once, as the wordmark', () => {
    const { container } = render(
      <AuthLayout clinic={null} task="Inicia sesión" caption="Tu clínica, siempre al día">
        <form />
      </AuthLayout>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicia sesión');
    expect(container.textContent?.match(/Dentalix/g)).toHaveLength(1);
    // Sin fotografía: el panel lateral es tipográfico.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Tu clínica, siempre al día')).toBeInTheDocument();
  });
});
