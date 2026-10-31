import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from './app-shell';
import { getInClinic } from '@/lib/appointments/patient-flow';
import { BrandingProvider } from '@/components/brand/branding-context';

let mockPathname = '/patients';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('../../lib/appointments/patient-flow', () => ({
  ...jest.requireActual('../../lib/appointments/patient-flow'),
  getInClinic: jest.fn(),
}));
jest.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }),
}));
jest.mock('../../lib/me/me-api', () => ({
  getMe: jest.fn().mockResolvedValue({
    id: 'u1',
    email: 'a@b.com',
    fullName: 'Ana Gómez',
    avatarUrl: null,
    emailVerifiedAt: null,
    memberships: [{ tenantId: 't1', clinicName: 'Sonrisa', role: 'ADMIN' }],
  }),
}));
// Token por test: el menú decide qué entradas ve cada rol leyendo el `role` del
// access token. `mock` como prefijo es lo que permite usarlo dentro de
// `jest.mock` (que se iza por encima de los imports).
let mockAccessToken: string | null = 'T';
jest.mock('../../lib/auth/use-session-bootstrap', () => ({ useSessionBootstrap: jest.fn() }));
import { useSessionBootstrap } from '../../lib/auth/use-session-bootstrap';
jest.mock('../../lib/auth/auth-store', () => ({
  useAuthStore: Object.assign(
    (selector: (s: { accessToken: string | null; clear: () => void }) => unknown) =>
      selector({ accessToken: mockAccessToken, clear: jest.fn() }),
    { getState: () => ({ clear: jest.fn() }) },
  ),
}));

function tokenForRole(role: string): string {
  const b64url = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub: 'u1', tenantId: 't1', role }))}.firma`;
}

describe('AppShell', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockAccessToken = 'T';
  });

  // La caja es dato financiero: PAYMENT_ROLES en la API (ADMIN + RECEPTION).
  it.each(['ADMIN', 'RECEPTION'])('muestra la entrada Caja a %s', async (role) => {
    mockAccessToken = tokenForRole(role);
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    const links = await screen.findAllByRole('link', { name: 'Caja' });
    links.forEach((link) => expect(link).toHaveAttribute('href', '/caja'));
  });

  it.each(['DENTIST', 'ASSISTANT'])('oculta la entrada Caja a %s', async (role) => {
    mockAccessToken = tokenForRole(role);
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    // Espera a que el resto del menú esté pintado antes de afirmar la ausencia.
    expect(await screen.findAllByRole('link', { name: /pacientes/i })).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();
  });

  // Cada entrada copia el `@Roles(...)` del endpoint de su pantalla (DX-070):
  // DASHBOARD_ROLES, CATALOG_READ_ROLES, INVENTORY_ROLES, STAFF_WRITE_ROLES,
  // AUDIT_READ_ROLES (DX-009), TREATMENT_PLAN_FOLLOW_UP_ROLES (Presupuestos, DX-040)
  // RECEIVABLES_ROLES (Cartera, DX-145) y REPORT_ROLES + PRODUCTION_REPORT_ROLES
  // (Reportes, DX-014 y DX-423).
  const ROLE_NAV: Record<string, { visible: string[]; hidden: string[] }> = {
    ADMIN: {
      visible: [
        'Inicio',
        'Pacientes',
        'Agenda',
        'Caja',
        'Cartera',
        'Gastos',
        'Presupuestos',
        'Catálogo',
        'Inventario',
        'Personal',
        'Auditoría',
        'Reportes',
      ],
      hidden: [],
    },
    DENTIST: {
      visible: ['Inicio', 'Pacientes', 'Agenda', 'Catálogo', 'Reportes'],
      hidden: ['Caja', 'Cartera', 'Gastos', 'Presupuestos', 'Inventario', 'Personal', 'Auditoría'],
    },
    ASSISTANT: {
      visible: ['Inicio', 'Pacientes', 'Agenda', 'Catálogo', 'Inventario'],
      hidden: ['Caja', 'Cartera', 'Gastos', 'Presupuestos', 'Personal', 'Auditoría', 'Reportes'],
    },
    RECEPTION: {
      visible: ['Inicio', 'Pacientes', 'Agenda', 'Caja', 'Cartera', 'Presupuestos'],
      hidden: ['Gastos', 'Catálogo', 'Inventario', 'Personal', 'Auditoría', 'Reportes'],
    },
  };
  it.each(Object.keys(ROLE_NAV))('el menú de %s solo enseña lo que su rol puede abrir', async (role) => {
    mockAccessToken = tokenForRole(role);
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    const { visible, hidden } = ROLE_NAV[role];
    for (const name of visible) {
      expect(await screen.findAllByRole('link', { name })).not.toHaveLength(0);
    }
    for (const name of hidden) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('en /caja/cartera solo «Cartera» está activa, no también «Caja» (DX-145)', async () => {
    mockAccessToken = tokenForRole('RECEPTION');
    mockPathname = '/caja/cartera';
    try {
      render(
        <AppShell>
          <p>contenido</p>
        </AppShell>,
      );
      const cartera = await screen.findAllByRole('link', { name: 'Cartera' });
      cartera.forEach((link) => {
        expect(link).toHaveAttribute('href', '/caja/cartera');
        expect(link).toHaveAttribute('aria-current', 'page');
      });
      screen.getAllByRole('link', { name: 'Caja' }).forEach((link) => {
        expect(link).not.toHaveAttribute('aria-current');
      });
    } finally {
      mockPathname = '/patients';
    }
  });

  it('arranca la sesión desde la cookie al montar (DX-062)', () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    expect(useSessionBootstrap).toHaveBeenCalled();
  });

  it('sin un token legible no enseña entradas restringidas', () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    expect(screen.queryByRole('link', { name: 'Caja' })).not.toBeInTheDocument();
  });

  it('renderiza la navegación y el menú de cuenta', async () => {
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    // Navegación (aparece en sidebar desktop + topbar móvil bajo jsdom).
    expect(screen.getAllByRole('link', { name: /pacientes/i }).length).toBeGreaterThanOrEqual(1);
    // El menú de cuenta se monta en dos ubicaciones responsivas: la tarjeta del
    // sidebar (muestra el nombre) y el avatar compacto del topbar (aria "Cuenta").
    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /ana gómez|cuenta/i }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('includes an Inventario nav link pointing to /inventory', async () => {
    mockAccessToken = tokenForRole('ADMIN');
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    // Se renderiza en dos ubicaciones responsivas (sidebar desktop + topbar
    // móvil); ambas existen en el DOM bajo jsdom.
    const links = await screen.findAllByRole('link', { name: /inventario/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    links.forEach((link) => {
      expect(link).toHaveAttribute('href', '/inventory');
    });
  });

  it('colapsa el sidebar a un rail de iconos y recuerda la preferencia', async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    // Se mira solo dentro del <aside>: la nav del topbar móvil también lista las
    // secciones con su texto y no se ve afectada por el colapso.
    const sidebar = within(document.querySelector('aside') as HTMLElement);
    expect(sidebar.getByText('Pacientes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /colapsar menú/i }));

    // El texto desaparece, pero el enlace conserva su nombre accesible vía
    // aria-label: en rail el icono solo no basta para lector de pantalla.
    expect(sidebar.queryByText('Pacientes')).not.toBeInTheDocument();
    expect(sidebar.getByRole('link', { name: 'Pacientes' })).toHaveAttribute(
      'href',
      '/patients',
    );
    expect(screen.getByRole('button', { name: /expandir menú/i })).toBeInTheDocument();
    expect(window.localStorage.getItem('dentalix.sidebarCollapsed')).toBe('1');
  });

  it('arranca en rail si la preferencia estaba guardada', async () => {
    window.localStorage.setItem('dentalix.sidebarCollapsed', '1');
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    // La preferencia se lee en un efecto (localStorage no existe en SSR), así
    // que el rail aparece en el primer commit del cliente, no en el render SSR.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /expandir menú/i })).toBeInTheDocument(),
    );
    const sidebar = within(document.querySelector('aside') as HTMLElement);
    expect(sidebar.queryByText('Dentalix')).not.toBeInTheDocument();
  });

  // A4: barra lateral agrupada (SPEC «Navegación»). Los títulos de grupo y
  // las entradas por rol; un grupo sin entradas desaparece.
  describe('A4: barra lateral agrupada', () => {
    function sidebarFor(role: string) {
      mockAccessToken = tokenForRole(role);
      render(
        <AppShell>
          <p>contenido</p>
        </AppShell>,
      );
      return within(document.querySelector('aside > nav') as HTMLElement);
    }
    const groupsOf = (nav: ReturnType<typeof sidebarFor>) =>
      nav.getAllByRole('group').map((g) => [
        g.getAttribute('aria-label'),
        within(g).getAllByRole('link').map((a) => a.getAttribute('href')),
      ]);

    it('ADMIN ve los cinco grupos en el orden de la SPEC, con Ajustes en Administración', async () => {
      const nav = sidebarFor('ADMIN');
      await nav.findByRole('link', { name: 'Inicio' });
      expect(groupsOf(nav)).toEqual([
        [null, ['/dashboard', '/agenda', '/patients']],
        ['Atención', ['/presupuestos', '/anamnesis-por-revisar']],
        ['Finanzas', ['/caja', '/caja/cartera', '/caja/gastos', '/caja/descuentos', '/reportes']],
        ['Clínica', ['/catalog', '/inventory']],
        ['Administración', ['/staff', '/settings/auditoria', '/settings']],
      ]);
      // Títulos de grupo con el estilo overline; el primero no lleva.
      expect(nav.getByText('Finanzas')).toHaveClass('t-overline');
    });

    it('RECEPTION: sin Clínica; Administración solo con Ajustes', async () => {
      const nav = sidebarFor('RECEPTION');
      await nav.findByRole('link', { name: 'Caja' });
      expect(groupsOf(nav)).toEqual([
        [null, ['/dashboard', '/agenda', '/patients']],
        ['Atención', ['/presupuestos']],
        ['Finanzas', ['/caja', '/caja/cartera']],
        ['Administración', ['/settings']],
      ]);
      expect(nav.queryByText('Clínica')).not.toBeInTheDocument();
    });

    it('DENTIST: Finanzas solo con Reportes (DX-423: su producción)', async () => {
      const nav = sidebarFor('DENTIST');
      await nav.findByRole('link', { name: 'Catálogo' });
      expect(groupsOf(nav).map(([label]) => label)).toEqual([null, 'Atención', 'Finanzas', 'Clínica', 'Administración']);
      expect(groupsOf(nav).find(([label]) => label === 'Finanzas')).toEqual(['Finanzas', ['/reportes']]);
    });

    it('«Anamnesis» se lee corta pero conserva el nombre completo', async () => {
      const nav = sidebarFor('ADMIN');
      const link = await nav.findByRole('link', { name: 'Anamnesis por revisar' });
      expect(link).toHaveTextContent(/^Anamnesis$/);
      expect(link).toHaveAttribute('title', 'Anamnesis por revisar');
    });

    it('activo con los tokens v2 y el rol bajo el nombre en gris, no en acento', async () => {
      mockPathname = '/caja';
      try {
        const nav = sidebarFor('ADMIN');
        const caja = await nav.findByRole('link', { name: 'Caja' });
        expect(caja).toHaveClass('bg-primary-subtle', 'text-primary-subtle-text', 'whitespace-nowrap');
        expect(nav.getByRole('link', { name: 'Cartera' })).toHaveClass('hover:bg-surface-sunken');
        expect(await screen.findByText('Administrador/a')).toHaveClass('text-muted');
      } finally {
        mockPathname = '/patients';
      }
    });
  });

  // A4: barra inferior del teléfono — 4 destinos según el rol + «Más».
  describe('A4: barra inferior del teléfono', () => {
    async function tabsFor(role: string) {
      mockAccessToken = tokenForRole(role);
      render(
        <AppShell>
          <p>contenido</p>
        </AppShell>,
      );
      const bar = within(screen.getByTestId('bottom-tab-bar'));
      await waitFor(() => expect(bar.getAllByRole('link')).toHaveLength(4));
      return bar;
    }

    it.each([
      ['ADMIN', ['Inicio', 'Agenda', 'Pacientes', 'Caja']],
      ['RECEPTION', ['Inicio', 'Agenda', 'Pacientes', 'Caja']],
      // I1: Inicio primero para todos; Anamnesis completa las cuatro.
      ['DENTIST', ['Inicio', 'Agenda', 'Pacientes', 'Anamnesis por revisar']],
      ['ASSISTANT', ['Inicio', 'Agenda', 'Pacientes', 'Anamnesis por revisar']],
    ])('%s: %j y «Más»', async (role, names) => {
      const bar = await tabsFor(role);
      expect(bar.getAllByRole('link').map((a) => a.getAttribute('aria-label') ?? a.textContent)).toEqual(names);
      expect(bar.getByRole('button', { name: 'Más' })).toBeInTheDocument();
    });

    it('si la sección actual vive en «Más», ninguna pestaña es la página y «Más» se marca', async () => {
      mockPathname = '/caja/cartera';
      try {
        const bar = await tabsFor('RECEPTION');
        bar.getAllByRole('link').forEach((a) => expect(a).not.toHaveAttribute('aria-current'));
        expect(bar.getByRole('button', { name: 'Más' })).toHaveClass('text-primary-text');
      } finally {
        mockPathname = '/patients';
      }
    });

    it('la pestaña de la sección actual es la página', async () => {
      const bar = await tabsFor('RECEPTION');
      expect(bar.getByRole('link', { name: 'Pacientes' })).toHaveAttribute('aria-current', 'page');
    });

    it('«Más» abre la hoja con el resto, Ajustes, Mi perfil, tema y Cerrar sesión; atrás la cierra', async () => {
      const user = userEvent.setup();
      const bar = await tabsFor('ADMIN');
      await user.click(bar.getByRole('button', { name: 'Más' }));
      const sheet = within(await screen.findByTestId('more-sheet'));
      for (const name of ['Presupuestos', 'Anamnesis por revisar', 'Cartera', 'Reportes', 'Inventario', 'Personal', 'Ajustes', 'Mi perfil']) {
        expect(sheet.getByRole('link', { name })).toBeInTheDocument();
      }
      // Lo que ya está en la barra no se repite.
      expect(sheet.queryByRole('link', { name: 'Agenda' })).not.toBeInTheDocument();
      expect(sheet.getByRole('switch', { name: 'Tema oscuro' })).toBeInTheDocument();
      expect(sheet.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
      // Android «atrás»: la hoja apiló una entrada; el popstate la cierra.
      window.dispatchEvent(new PopStateEvent('popstate'));
      await waitFor(() => expect(screen.queryByTestId('more-sheet')).not.toBeInTheDocument());
    });

    it('la barra superior lleva la marca, la búsqueda y la cuenta, no el título', async () => {
      mockAccessToken = tokenForRole('ADMIN');
      render(
        <AppShell>
          <p>contenido</p>
        </AppShell>,
      );
      const banner = within(screen.getByRole('banner'));
      expect(banner.getByRole('button', { name: 'Buscar' })).toBeInTheDocument();
      expect(banner.getByRole('button', { name: 'Cuenta' })).toBeInTheDocument();
      // Sin marca de la clínica (sin provider), la de Dentalix.
      expect(banner.getByText('Dentalix')).toBeInTheDocument();
      expect(banner.queryByTestId('topbar-title')).not.toBeInTheDocument();
    });
  });

  it('A4: con marca de la clínica, el shell enseña la clínica y no «Dentalix»', async () => {
    mockAccessToken = tokenForRole('ADMIN');
    render(
      <BrandingProvider value={{ name: 'Clínica Sonrisa Norte', logoUrl: null }}>
        <AppShell>
          <p>contenido</p>
        </AppShell>
      </BrandingProvider>,
    );
    expect(within(screen.getByRole('banner')).getByText('Clínica Sonrisa Norte')).toBeInTheDocument();
    expect(screen.queryByText('Dentalix')).not.toBeInTheDocument();
  });

  // A4: paleta de comandos.
  describe('A4: paleta de comandos', () => {
    it.each([
      ['ADMIN', ['Inicio', 'Caja', 'Personal', 'Ajustes'], [] as string[]],
      ['RECEPTION', ['Inicio', 'Agenda', 'Caja', 'Presupuestos', 'Ajustes'], ['Personal', 'Inventario', 'Auditoría']],
    ])('%s: ⌘K la abre y «Ir a» solo lista lo que su rol puede abrir', async (role, visible, hidden) => {
      const user = userEvent.setup();
      mockAccessToken = tokenForRole(role);
      render(
        <AppShell>
          <p>contenido</p>
        </AppShell>,
      );
      expect(await screen.findAllByRole('link', { name: 'Caja' })).not.toHaveLength(0);
      await user.keyboard('{Meta>}k{/Meta}');
      const palette = within(await screen.findByTestId('command-palette'));
      const input = palette.getByRole('combobox', { name: 'Buscar' });
      expect(input).toHaveFocus();
      const goTo = palette.getByRole('group', { name: 'Ir a' });
      for (const name of visible) expect(within(goTo).getByRole('option', { name })).toBeInTheDocument();
      for (const name of hidden) expect(within(goTo).queryByRole('option', { name })).not.toBeInTheDocument();
      expect(palette.getByRole('option', { name: 'Nueva cita' })).toBeInTheDocument();
      expect(palette.getByRole('option', { name: 'Nuevo paciente' })).toBeInTheDocument();
    });

    it('Ctrl+K también; las flechas mueven la opción activa y el texto filtra sin tildes', async () => {
      const user = userEvent.setup();
      mockAccessToken = tokenForRole('ADMIN');
      render(
        <AppShell>
          <p>contenido</p>
        </AppShell>,
      );
      await screen.findAllByRole('link', { name: 'Inicio' });
      await user.keyboard('{Control>}k{/Control}');
      const palette = within(await screen.findByTestId('command-palette'));
      const input = palette.getByRole('combobox');
      const options = palette.getAllByRole('option');
      expect(input).toHaveAttribute('aria-activedescendant', options[0].id);
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{ArrowDown}');
      expect(input).toHaveAttribute('aria-activedescendant', options[1].id);
      await user.keyboard('{ArrowUp}{ArrowUp}');
      expect(input).toHaveAttribute('aria-activedescendant', options.at(-1)!.id);
      await user.type(input, 'auditoria');
      expect(palette.getByRole('option', { name: /Auditoría/ })).toBeInTheDocument();
      expect(palette.queryByRole('option', { name: 'Caja' })).not.toBeInTheDocument();
    });

    it('el botón de búsqueda de la barra lateral la abre', async () => {
      const user = userEvent.setup();
      render(
        <AppShell>
          <p>contenido</p>
        </AppShell>,
      );
      const aside = within(document.querySelector('aside') as HTMLElement);
      await user.click(aside.getByRole('button', { name: 'Buscar' }));
      expect(await screen.findByTestId('command-palette')).toBeInTheDocument();
      // Esc la cierra aunque el foco esté en el combobox expandido.
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument());
    });
  });

  it('DX-200: al odontólogo la Agenda le dice cuántos pacientes suyos esperan', async () => {
    window.localStorage.setItem('dentalix.activeLocationId', 'loc-1');
    mockAccessToken = tokenForRole('DENTIST');
    const waiting = [{ appointmentId: 'a1' }, { appointmentId: 'a2' }];
    (getInClinic as jest.Mock).mockResolvedValue({
      scope: 'MINE',
      waiting,
      inChair: [],
      readyForCheckout: [],
    });
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    const links = await screen.findAllByRole('link', { name: 'Agenda · Te esperan 2 pacientes' });
    expect(links.length).toBeGreaterThan(0);
    expect(screen.getByText('Te esperan 2')).toBeInTheDocument();
  });

  it('DX-200: recepción no ve el contador ni se pide el panel', async () => {
    window.localStorage.setItem('dentalix.activeLocationId', 'loc-1');
    mockAccessToken = tokenForRole('RECEPTION');
    (getInClinic as jest.Mock).mockClear();
    render(
      <AppShell>
        <p>contenido</p>
      </AppShell>,
    );
    await screen.findAllByRole('link', { name: 'Caja' });
    expect(screen.queryByTestId('waiting-for-you-count')).not.toBeInTheDocument();
    expect(getInClinic).not.toHaveBeenCalled();
  });
});
