import { auditRenderedControls } from '@/lib/test/rendered-a11y';
import { SETTINGS_SECTIONS } from './settings-sections';
import { render, screen, within } from '@testing-library/react';
import { SettingsIndex, splitSettingsColumns } from './settings-index';
import { visibleSettingsSections } from './settings-sections';

function tokenForRole(role: string): string {
  const part = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part('{"alg":"HS256"}')}.${part(JSON.stringify({ sub: 'u1', tenantId: 't1', role }))}.sig`;
}

describe('SettingsIndex (DX-282)', () => {
  it('ADMIN: siete secciones y las 26 pantallas como enlaces', () => {
    render(<SettingsIndex token={tokenForRole('ADMIN')} />);

    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Tu cuenta',
      'Clínica y sedes',
      'Agenda',
      'Cobro',
      'Historia clínica',
      'Datos y seguridad',
      'Herramientas y registros',
    ]);
    expect(screen.getAllByRole('link')).toHaveLength(26);
    expect(
      within(screen.getByRole('list', { name: 'Tu cuenta' })).getByRole('link', { name: /^Mi perfil Tu nombre/ }),
    ).toHaveAttribute('href', '/settings/profile');

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
    expect(links).toEqual(['/settings/profile', '/settings/sedes', '/settings/horarios', '/settings/privacidad']);
    expect(screen.queryByRole('heading', { name: 'Cobro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Historia clínica' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Consentimientos/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Accesos de soporte/ })).not.toBeInTheDocument();
  });

  it('cada entrada incluye título y apoyo visible en el nombre, con límite de palabra real', () => {
    render(<SettingsIndex token={tokenForRole('ADMIN')} />);
    for (const { entries } of SETTINGS_SECTIONS) for (const { label, description } of entries) {
      const link = screen.getByRole('link', { name: `${label} ${description}` });
      expect(link.textContent).toBe(`${label} ${description}`);
    }
  });

  it('las entradas reales pasan axe con su CSS a ancho móvil y escritorio', () => {
    const view = render(<SettingsIndex token={tokenForRole('ADMIN')} />);
    auditRenderedControls([390, 1440].flatMap(width => ['light', 'dark'].map(theme => ({
      html: `<div class="${theme}" style="width:${width}px">${view.container.innerHTML}</div>`, selector: 'a',
      viewport: { width, height: 900 },
    }))));
  });
});

describe('splitSettingsColumns', () => {
  it('reparte los grupos de ADMIN en dos columnas de alto parecido sin cambiar el orden', () => {
    const sections = visibleSettingsSections('ADMIN');
    const [left, right] = splitSettingsColumns(sections);
    expect([...left, ...right]).toEqual(sections);
    const rows = (column: typeof sections) => column.reduce((n, s) => n + s.entries.length + 1.5, 0);
    expect(Math.abs(rows(left) - rows(right))).toBeLessThanOrEqual(8);
    expect(left.length).toBeGreaterThan(0);
    expect(right.length).toBeGreaterThan(0);
  });
});
