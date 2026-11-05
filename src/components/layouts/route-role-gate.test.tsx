import { render, screen } from '@testing-library/react';
import { tokenForRole } from '@/lib/test/data-consents';
import { RouteRoleGate, routeRoleGateCopy } from './route-role-gate';

const screenFor = (href: string, token: string) =>
  render(
    <RouteRoleGate href={href} token={token}>
      <button type="button">Añadir</button>
    </RouteRoleGate>,
  );

describe('RouteRoleGate (DX-096)', () => {
  it.each([
    ['/catalog', 'RECEPTION'],
    ['/inventory', 'RECEPTION'],
    ['/inventory', 'DENTIST'],
    ['/staff', 'RECEPTION'],
    ['/staff', 'DENTIST'],
    ['/staff', 'ASSISTANT'],
  ] as const)('%s con %s: lo dice en español, con salida y sin botones de la pantalla', (href, role) => {
    screenFor(href, tokenForRole(role));
    expect(screen.getByText(routeRoleGateCopy.title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: routeRoleGateCopy.home })).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('button', { name: 'Añadir' })).not.toBeInTheDocument();
  });

  it.each([
    ['/catalog', 'ADMIN'],
    ['/catalog', 'DENTIST'],
    ['/inventory', 'ASSISTANT'],
    ['/staff', 'ADMIN'],
  ] as const)('%s con %s: la pantalla, igual que en el menú', (href, role) => {
    screenFor(href, tokenForRole(role));
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeInTheDocument();
    expect(screen.queryByText(routeRoleGateCopy.title)).not.toBeInTheDocument();
  });

  it('con un rol que no se puede leer decide la API: no bloquea', () => {
    screenFor('/staff', 'no-es-un-jwt');
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeInTheDocument();
  });
});
