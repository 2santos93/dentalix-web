import { render, screen, within } from '@testing-library/react';
import { SettingsIndex } from './settings-index';

function tokenForRole(role: string): string {
  const part = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part('{"alg":"HS256"}')}.${part(JSON.stringify({ sub: 'u1', tenantId: 't1', role }))}.sig`;
}

describe('SettingsIndex (DX-282)', () => {
  it('ADMIN: cinco secciones y las 21 pantallas como enlaces', () => {
    render(<SettingsIndex token={tokenForRole('ADMIN')} />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Clínica y sedes',
      'Agenda',
      'Cobro',
      'Historia clínica',
      'Datos y seguridad',
    ]);
    expect(screen.getAllByRole('link')).toHaveLength(21);

    // Cada sección es una lista con nombre: el lector de pantalla dice dónde está.
    const agenda = screen.getByRole('list', { name: 'Agenda' });
    expect(within(agenda).getByRole('link', { name: /^Horarios/ })).toHaveAttribute(
      'href',
      '/settings/horarios',
    );
    const clinic = screen.getByRole('list', { name: 'Clínica y sedes' });
    expect(within(clinic).getByRole('link', { name: /^Sedes/ })).toHaveAttribute(
      'href',
      '/settings/sedes',
    );
    const billing = screen.getByRole('list', { name: 'Cobro' });
    expect(within(billing).getByRole('link', { name: /^Convenios/ })).toHaveAttribute(
      'href',
      '/settings/convenios',
    );
  });

  it.each(['RECEPTION', 'DENTIST'])('%s solo ve lo que puede abrir', (role) => {
    render(<SettingsIndex token={tokenForRole(role)} />);

    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links).toEqual(['/settings/sedes', '/settings/horarios', '/settings/privacidad']);
    expect(screen.queryByRole('heading', { name: 'Cobro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Historia clínica' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Consentimientos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Accesos de soporte/ })).not.toBeInTheDocument();
  });

  it('cada entrada lleva una línea que dice para qué sirve', () => {
    render(<SettingsIndex token={tokenForRole('ADMIN')} />);
    // El nombre es la etiqueta; la línea de apoyo va como descripción, para que
    // la lista de enlaces de un lector de pantalla no lea frases enteras.
    const link = screen.getByRole('link', { name: 'Caja' });
    expect(link).toHaveAccessibleDescription('Cómo se abre y se cierra la caja por turno.');
  });
});
