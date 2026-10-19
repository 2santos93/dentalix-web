import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from './app-shell';
import { getInClinic } from '@/lib/appointments/patient-flow';

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
  // y RECEIVABLES_ROLES (Cartera, DX-145).
  const ROLE_NAV: Record<string, { visible: string[]; hidden: string[] }> = {
    ADMIN: {
      visible: [
        'Dashboard',
        'Pacientes',
        'Agenda',
        'Caja',
        'Cartera',
        'Presupuestos',
        'Catálogo',
        'Inventario',
        'Personal',
        'Auditoría',
      ],
      hidden: [],
    },
    DENTIST: {
      visible: ['Pacientes', 'Agenda', 'Catálogo'],
      hidden: ['Dashboard', 'Caja', 'Cartera', 'Presupuestos', 'Inventario', 'Personal', 'Auditoría'],
    },
    ASSISTANT: {
      visible: ['Pacientes', 'Agenda', 'Catálogo', 'Inventario'],
      hidden: ['Dashboard', 'Caja', 'Cartera', 'Presupuestos', 'Personal', 'Auditoría'],
    },
    RECEPTION: {
      visible: ['Pacientes', 'Agenda', 'Caja', 'Cartera', 'Presupuestos'],
      hidden: ['Dashboard', 'Catálogo', 'Inventario', 'Personal', 'Auditoría'],
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
