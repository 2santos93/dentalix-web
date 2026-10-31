import { render, screen } from '@testing-library/react';
import { LandingPage } from './landing-page';

jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }),
}));

describe('LandingPage', () => {
  it('muestra el hero, los CTAs y las features clave', () => {
    render(<LandingPage />);

    // Hero
    expect(
      screen.getByRole('heading', { level: 1, name: /clínica dental al día/i }),
    ).toBeInTheDocument();

    // CTA primario a registro y secundario a login (aparecen más de una vez).
    const registerLinks = screen.getAllByRole('link', { name: /crea tu clínica/i });
    expect(registerLinks.length).toBeGreaterThanOrEqual(1);
    registerLinks.forEach((l) => expect(l).toHaveAttribute('href', '/register'));

    const loginLinks = screen.getAllByRole('link', { name: /iniciar sesión/i });
    expect(loginLinks.length).toBeGreaterThanOrEqual(1);
    loginLinks.forEach((l) => expect(l).toHaveAttribute('href', '/login'));

    // Features y diferenciadores (títulos = headings)
    expect(screen.getByRole('heading', { name: /odontograma interactivo/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /historia clínica confiable/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^con tu marca$/i })).toBeInTheDocument();
  });

  it('describe sus garantías sin nombrar leyes ni prometer que las cumple (DX-369)', () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/habeas|lgpd|gdpr|rgpd|hipaa|\bley\b|cumpl/i);
    expect(screen.getByRole('heading', { name: /^seguridad y trazabilidad$/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Registro de auditoría de accesos y cambios, historia clínica inmutable, consentimientos versionados y conexión cifrada.',
      ),
    ).toBeInTheDocument();
  });
});
