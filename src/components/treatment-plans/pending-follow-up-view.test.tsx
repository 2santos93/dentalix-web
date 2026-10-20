import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingFollowUpView } from './pending-follow-up-view';
import {
  listPendingFollowUp,
  rejectPlan,
  type PendingFollowUpItem,
} from '@/lib/treatment-plans/plan-options-api';
import { listLocations } from '@/lib/locations/locations-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { fetchClinicName } from '@/lib/clinic-branding';
import { ApiError } from '@/lib/api/client';
import { formatCurrency } from '@/lib/format/currency';

jest.mock('../../lib/treatment-plans/plan-options-api', () => ({
  listPendingFollowUp: jest.fn(),
  rejectPlan: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/locations/location-store', () => ({ getActiveLocationId: jest.fn() }));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn() }));

const mockedList = listPendingFollowUp as jest.MockedFunction<typeof listPendingFollowUp>;
const mockedReject = rejectPlan as jest.MockedFunction<typeof rejectPlan>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedActive = getActiveLocationId as jest.MockedFunction<typeof getActiveLocationId>;
const mockedClinic = fetchClinicName as jest.MockedFunction<typeof fetchClinicName>;

function item(overrides: Partial<PendingFollowUpItem> = {}): PendingFollowUpItem {
  return {
    planId: 'plan-a',
    patientId: 'pat-1',
    patientName: 'Carolina Ruiz',
    patientPhone: '300 111 2222',
    patientWhatsApp: '573001112222',
    optionGroupId: 'plan-a',
    optionLabel: 'Opción A: implante',
    presentedAt: '2026-10-07T15:00:00.000Z',
    presentedLocationId: 'loc-1',
    daysSincePresented: 9,
    currency: 'COP',
    total: 5300000,
    itemCount: 2,
    ...overrides,
  };
}

function page(items: PendingFollowUpItem[], total = items.length) {
  return { items, total, page: 1, pageSize: 20 };
}

// Normaliza los espacios duros de Intl (es: "150.000,50 COP" lleva U+00A0).
function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

describe('PendingFollowUpView (DX-040)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedReject.mockReset();
    mockedLocations.mockResolvedValue([
      { id: 'loc-1', name: 'Sede principal' },
      { id: 'loc-2', name: 'Sede Norte' },
    ] as never);
    mockedActive.mockReturnValue(null);
    mockedClinic.mockResolvedValue('Clínica Demo');
  });

  it('lista paciente, opción, monto en su moneda, días, teléfono y WhatsApp prellenado', async () => {
    mockedList.mockResolvedValue(page([item()]));
    render(<PendingFollowUpView token="tok" />);
    const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
    expect(within(row).getByRole('link', { name: 'Carolina Ruiz' })).toHaveAttribute(
      'href',
      '/patients/pat-1',
    );
    expect(within(row).getByText('Opción A: implante')).toBeInTheDocument();
    expect(money(row.textContent)).toContain(money(formatCurrency(5300000, 'COP')));
    expect(within(row).getByText('hace 9 días')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Llamar a Carolina Ruiz: 300 111 2222' })).toHaveAttribute(
      'href',
      'tel:3001112222',
    );
    const whatsapp = within(row).getByRole('link', { name: 'WhatsApp a Carolina Ruiz' });
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/573001112222\?text=Hola%20Carolina/);
    await waitFor(() => expect(whatsapp.getAttribute('href')).toContain('Cl%C3%ADnica%20Demo'));
    expect(screen.getByText('1 presupuesto')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { olderThanDays: 7, page: 1 });
  });

  it('alcance: «Todas las sedes» sin restricción, «Mis sedes» con claim acotado (DX-089)', async () => {
    mockedList.mockResolvedValue(page([item()]));
    const { unmount } = render(<PendingFollowUpView token="tok" />);
    expect(await screen.findByText('Todas las sedes')).toBeInTheDocument();
    unmount();
    const b64 = (v: string) => btoa(v).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const restricted = `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify({ sub: 'u1', loc: ['loc-1'] }))}.firma`;
    render(<PendingFollowUpView token={restricted} />);
    expect(await screen.findByText('Mis sedes')).toBeInTheDocument();
  });

  it('sin número utilizable no ofrece WhatsApp y lo explica', async () => {
    mockedList.mockResolvedValue(page([item({ patientPhone: null, patientWhatsApp: null })]));
    render(<PendingFollowUpView token="tok" />);
    const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
    expect(within(row).queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(within(row).getByText('Sin teléfono')).toBeInTheDocument();
  });

  it('cambiar la antigüedad vuelve a pedir la lista desde la página 1', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue(page([item()]));
    render(<PendingFollowUpView token="tok" />);
    await screen.findByRole('row', { name: /Carolina Ruiz/ });
    await user.selectOptions(screen.getByLabelText('Presentados hace más de'), '30');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', { olderThanDays: 30, page: 1 }),
    );
  });

  it('vacío: lo dice', async () => {
    mockedList.mockResolvedValue(page([]));
    render(<PendingFollowUpView token="tok" />);
    expect(await screen.findByText('No hay presupuestos por seguir.')).toBeInTheDocument();
  });

  it('cargando y error con reintento', async () => {
    const user = userEvent.setup();
    mockedList.mockRejectedValueOnce(new Error('red'));
    render(<PendingFollowUpView token="tok" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos cargar los presupuestos por seguir.',
    );
    mockedList.mockResolvedValue(page([item()]));
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('row', { name: /Carolina Ruiz/ })).toBeInTheDocument();
  });

  it('un rol sin acceso (403) ve el aviso, no un error', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'Insufficient role'));
    render(<PendingFollowUpView token="tok" />);
    expect(await screen.findByText('Tu rol no tiene acceso a esta lista.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('dice si la lista es de toda la clínica o de la sede activa', async () => {
    mockedList.mockResolvedValue(page([item()]));
    mockedActive.mockReturnValue('loc-2');
    render(<PendingFollowUpView token="tok" />);
    expect(await screen.findByText('Presentados en Sede Norte')).toBeInTheDocument();
  });

  it('marcar rechazado desde la fila abre el modal y, al confirmarlo, recarga', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(page([item()])).mockResolvedValue(page([]));
    mockedReject.mockResolvedValue({ id: 'plan-a', status: 'REJECTED' } as never);
    render(<PendingFollowUpView token="tok" />);
    const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
    await user.click(within(row).getByRole('button', { name: 'Marcar rechazado: Carolina Ruiz' }));
    const dialog = await screen.findByRole('dialog', { name: 'Marcar como rechazado' });
    expect(within(dialog).getByText('Opción A: implante · Carolina Ruiz')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Quiere una segunda opinión' }));
    await user.click(within(dialog).getByRole('button', { name: 'Marcar rechazado' }));
    await waitFor(() =>
      expect(mockedReject).toHaveBeenCalledWith('tok', 'plan-a', { reason: 'SECOND_OPINION' }),
    );
    expect(await screen.findByText('No hay presupuestos por seguir.')).toBeInTheDocument();
  });
});
