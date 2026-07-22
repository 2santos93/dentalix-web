import { render, screen } from '@testing-library/react';
import { LoginForm } from './login-form';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('LoginForm', () => {
  it('renders email and password fields and a submit button', () => {
    render(<LoginForm tenant="sonrisa" />);
    expect(screen.getByLabelText(/email|correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password|contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar|entrar|login/i })).toBeInTheDocument();
  });

  it('renders a subdomain field when tenant is null', () => {
    render(<LoginForm tenant={null} />);
    expect(screen.getByLabelText(/subdominio|subdomain|clínica|clinic/i)).toBeInTheDocument();
  });

  it('does not render a subdomain field when tenant is present', () => {
    render(<LoginForm tenant="sonrisa" />);
    expect(screen.queryByLabelText(/subdominio|subdomain|clínica|clinic/i)).not.toBeInTheDocument();
  });
});
