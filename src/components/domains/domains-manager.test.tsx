import { render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { DomainsManager } from './domains-manager';
import { normalizeHost } from './register-domain-modal';
import { clinicAddress } from './clinic-address';
import {
  deleteDomain,
  listDomains,
  registerDomain,
  verifyDomain,
  type TenantDomain,
} from '@/lib/domains/domains-api';
import { ApiError } from '@/lib/api/client';
import { notifyError } from '@/components/errors/notify';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/domains/domains-api', () => ({
  ...jest.requireActual('../../lib/domains/domains-api'),
  listDomains: jest.fn(),
  registerDomain: jest.fn(),
  verifyDomain: jest.fn(),
  deleteDomain: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), info: jest.fn() } }));

const mockedList = listDomains as jest.MockedFunction<typeof listDomains>;
const mockedRegister = registerDomain as jest.MockedFunction<typeof registerDomain>;
const mockedVerify = verifyDomain as jest.MockedFunction<typeof verifyDomain>;
const mockedDelete = deleteDomain as jest.MockedFunction<typeof deleteDomain>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

function domain(overrides: Partial<TenantDomain>): TenantDomain {
  return {
    id: 'd-1',
    host: 'citas.sonrisa.com',
    status: 'PENDING',
    verifyToken: 'dentalix-verify=abc123',
    verifiedAt: null,
    expiresAt: '2026-10-20T12:00:00.000Z',
    lastCheckedAt: null,
    failedChecks: 0,
    disabledAt: null,
    createdAt: '2026-10-17T12:00:00.000Z',
    ...overrides,
  };
}

const pending = domain({});
const verified = domain({
  id: 'd-2',
  host: 'www.sonrisa.com',
  status: 'VERIFIED',
  verifiedAt: '2026-10-01T10:00:00.000Z',
  expiresAt: null,
});
const disabled = domain({
  id: 'd-3',
  host: 'old.sonrisa.com',
  status: 'DISABLED',
  verifiedAt: '2026-09-01T10:00:00.000Z',
  disabledAt: '2026-10-16T08:00:00.000Z',
  expiresAt: null,
  failedChecks: 3,
});
const expired = domain({ id: 'd-4', host: 'viejo.sonrisa.com', status: 'EXPIRED' });

function item(host: string): HTMLElement {
  // `hidden`: con un diálogo abierto, Radix oculta el resto a la accesibilidad.
  const table = screen.getByRole('table', { name: 'Dominios propios', hidden: true });
  const row = within(table)
    .getAllByRole('row', { hidden: true })
    .find((el) => el.textContent?.includes(host));
  if (!row) throw new Error(`sin fila para ${host}`);
  return row;
}

/** Abre el «⋯» de la fila y elige una acción. */
async function rowAction(user: ReturnType<typeof setupUser>, host: string, action: string) {
  await user.click(screen.getByRole('button', { name: `Acciones de ${host}` }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

/** Toca la fila: abre el diálogo del dominio. */
async function openDomain(user: ReturnType<typeof setupUser>, host: string): Promise<HTMLElement> {
  await user.click(within(item(host)).getByRole('button', { name: host }));
  return screen.findByRole('dialog', { name: host });
}

describe('DomainsManager (SEC-009)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([pending, verified, disabled, expired]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<DomainsManager token="tok" allowed={false} />);
    expect(screen.getByText(/solo administración gestiona/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('la lista dice el estado sin jerga de DNS; el TXT está en el diálogo del dominio', async () => {
    const user = setupUser();
    render(<DomainsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Dominios propios' });
    expect(screen.getByText('4 dominios')).toBeInTheDocument();
    // Con filas, la primaria va en la barra.
    expect(screen.getByRole('button', { name: 'Añadir dominio' })).toBeInTheDocument();

    const p = item('citas.sonrisa.com');
    expect(within(p).getByText('Pendiente')).toBeInTheDocument();
    expect(within(p).queryByText(/dentalix-verify/)).not.toBeInTheDocument();
    expect(within(item('www.sonrisa.com')).getByText('Verificado')).toBeInTheDocument();
    expect(within(item('old.sonrisa.com')).getByText('Desactivado')).toBeInTheDocument();
    expect(within(item('old.sonrisa.com')).getByText(/dejó de abrir Dentalix/)).toBeInTheDocument();
    expect(within(item('viejo.sonrisa.com')).getByText('Expirado')).toBeInTheDocument();

    // Pendiente: el diálogo enseña el TXT y ofrece verificar.
    let dialog = await openDomain(user, 'citas.sonrisa.com');
    expect(within(dialog).getByText('_dentalix-verify.citas.sonrisa.com')).toBeInTheDocument();
    expect(within(dialog).getByText('dentalix-verify=abc123')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Verificar' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Verificado: ni TXT ni verificar.
    dialog = await openDomain(user, 'www.sonrisa.com');
    expect(within(dialog).queryByText(/dentalix-verify=/)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /verificar/i })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // El «⋯»: verificar solo donde se puede; eliminar siempre.
    await user.click(screen.getByRole('button', { name: 'Acciones de old.sonrisa.com' }));
    expect(await screen.findByRole('menuitem', { name: 'Verificar de nuevo' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Acciones de viejo.sonrisa.com' }));
    expect(await screen.findByRole('menuitem', { name: 'Eliminar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /verificar/i })).not.toBeInTheDocument();
  });

  it('vacío: sin recuento y con la primaria dentro del vacío', async () => {
    mockedList.mockResolvedValue([]);
    render(<DomainsManager token="tok" allowed />);
    expect(await screen.findByText('Todavía no hay dominios propios.')).toBeInTheDocument();
    expect(screen.queryByText(/0 dominios/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Añadir dominio' })).toHaveLength(1);
  });

  it('error de carga con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<DomainsManager token="tok" allowed />);
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('table', { name: 'Dominios propios' })).toBeInTheDocument();
  });

  it('añade un dominio en un modal: valida, limpia lo pegado como URL y abre su TXT', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedRegister.mockResolvedValue({
      domain: domain({ id: 'd-9', host: 'citas.nueva.com' }),
      dns: { name: '_dentalix-verify.citas.nueva.com', type: 'TXT', value: 'dentalix-verify=abc123' },
    });
    render(<DomainsManager token="tok" allowed />);
    await screen.findByText('Todavía no hay dominios propios.');

    await user.click(screen.getByRole('button', { name: 'Añadir dominio' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Dominio');
    await user.type(input, 'no-es-dominio');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir dominio' }));
    expect(await within(dialog).findByText(/Escribe un dominio válido/)).toBeInTheDocument();
    expect(mockedRegister).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, 'https://Citas.Nueva.com/login');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir dominio' }));
    await waitFor(() => expect(mockedRegister).toHaveBeenCalledWith('tok', 'citas.nueva.com'));
    const record = await screen.findByRole('dialog', { name: 'citas.nueva.com' });
    expect(within(record).getByText('_dentalix-verify.citas.nueva.com')).toBeInTheDocument();
    expect(within(item('citas.nueva.com')).getByText('Pendiente')).toBeInTheDocument();
  });

  it('el 409 de la API (verificado por otra cuenta) se ve en el modal', async () => {
    const user = setupUser();
    mockedRegister.mockRejectedValue(
      new ApiError(409, 'x', {
        messages: ['Ese dominio ya está verificado por otra cuenta.'],
      }),
    );
    render(<DomainsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Dominios propios' });
    await user.click(screen.getByRole('button', { name: 'Añadir dominio' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Dominio'), 'citas.otra.com');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir dominio' }));
    expect(
      await within(dialog).findByText('Ese dominio ya está verificado por otra cuenta.'),
    ).toBeInTheDocument();
  });

  it('verificar desde el diálogo: sin TXT avisa y sigue Pendiente; con TXT pasa a Verificado', async () => {
    const user = setupUser();
    mockedVerify.mockResolvedValueOnce({ status: 'PENDING' });
    render(<DomainsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Dominios propios' });

    const dialog = await openDomain(user, 'citas.sonrisa.com');
    await user.click(within(dialog).getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(toast.info).toHaveBeenCalled());
    expect(within(dialog).getByText('Pendiente')).toBeInTheDocument();

    mockedVerify.mockResolvedValueOnce({ status: 'VERIFIED' });
    await user.click(within(dialog).getByRole('button', { name: 'Verificar' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(within(dialog).getByText('Verificado')).toBeInTheDocument();
    expect(within(dialog).queryByText(/dentalix-verify=/)).not.toBeInTheDocument();
    expect(within(item('citas.sonrisa.com')).getByText('Verificado')).toBeInTheDocument();
    expect(mockedVerify).toHaveBeenCalledWith('tok', 'd-1');
  });

  it('verificar un PENDING que caducó (410) lo marca Expirado, sin reintento', async () => {
    const user = setupUser();
    mockedVerify.mockRejectedValue(
      new ApiError(410, 'x', { messages: ['Este dominio caducó sin verificarse (72 h).'] }),
    );
    render(<DomainsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Dominios propios' });
    await rowAction(user, 'citas.sonrisa.com', 'Verificar');
    await waitFor(() =>
      expect(mockedNotify).toHaveBeenCalledWith('Este dominio caducó sin verificarse (72 h).', {}),
    );
    expect(within(item('citas.sonrisa.com')).getByText('Expirado')).toBeInTheDocument();
  });

  it('un fallo de red al verificar ofrece reintento y no cambia el estado', async () => {
    const user = setupUser();
    mockedVerify.mockRejectedValue(new ApiError(500, 'x'));
    render(<DomainsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Dominios propios' });
    await rowAction(user, 'old.sonrisa.com', 'Verificar de nuevo');
    await waitFor(() => expect(mockedNotify).toHaveBeenCalled());
    expect(mockedNotify.mock.calls[0][1]).toEqual({ onRetry: expect.any(Function) });
    expect(within(item('old.sonrisa.com')).getByText('Desactivado')).toBeInTheDocument();
  });

  it('eliminar (desde el «⋯») pide confirmación y quita el dominio de la lista', async () => {
    const user = setupUser();
    mockedDelete.mockResolvedValue(undefined);
    render(<DomainsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Dominios propios' });

    await rowAction(user, 'www.sonrisa.com', 'Eliminar');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Deja de abrir Dentalix al momento/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar dominio' }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'd-2'));
    await waitFor(() => expect(screen.queryByText('www.sonrisa.com')).not.toBeInTheDocument());
    expect(screen.getByText('3 dominios')).toBeInTheDocument();
  });

  it('si eliminar falla, el error queda en el diálogo', async () => {
    const user = setupUser();
    mockedDelete.mockRejectedValue(new ApiError(404, 'x', { messages: ['Dominio no encontrado.'] }));
    render(<DomainsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Dominios propios' });
    await rowAction(user, 'viejo.sonrisa.com', 'Eliminar');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar dominio' }));
    expect(await within(dialog).findByText('Dominio no encontrado.')).toBeInTheDocument();
  });
});

describe('clinicAddress', () => {
  it('el subdominio de la clínica; en local, con su puerto', () => {
    expect(clinicAddress('demo.localhost:3001')).toBe('demo.localhost:3001');
    expect(clinicAddress(null)).toBeNull();
    expect(clinicAddress('localhost:3001')).toBeNull();
    // Un dominio propio no dice cuál es el subdominio: no se inventa.
    expect(clinicAddress('citas.miclinica.com')).toBeNull();
  });
});

describe('normalizeHost', () => {
  it('quita esquema, ruta, puerto, punto final y mayúsculas', () => {
    expect(normalizeHost('  HTTPS://Citas.Clinica.com:8443/login?x=1 ')).toBe('citas.clinica.com');
    expect(normalizeHost('citas.clinica.com.')).toBe('citas.clinica.com');
  });
});
