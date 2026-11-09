import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FollowUpScopeMarker, PendingFollowUpView } from './pending-follow-up-view';
import {
  listPendingFollowUp,
  rejectPlan,
  type PendingFollowUpItem,
} from '@/lib/treatment-plans/plan-options-api';
import { listLocations } from '@/lib/locations/locations-api';
import { getActiveLocationId } from '@/lib/locations/location-store';
import { fetchClinicName } from '@/lib/clinic-branding';
import { ApiError } from '@/lib/api/client';
import { clinicLocation } from '@/lib/test/locations';
import { dateIn, STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('../../lib/treatment-plans/plan-options-api', () => ({
  listPendingFollowUp: jest.fn(),
  rejectPlan: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/locations/location-store', () => ({
  getActiveLocationId: jest.fn(),
  onLocationChange: jest.fn(() => () => undefined),
}));
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
    patientPhone: '412 111 2222',
    patientWhatsApp: '584121112222',
    optionGroupId: 'plan-a',
    optionLabel: 'Opción A: implante',
    presentedAt: '2026-10-07T15:00:00.000Z',
    presentedLocationId: 'loc-1',
    quoteValidUntil: null,
    quoteExpired: false,
    daysSincePresented: 9,
    currency: 'USD',
    total: 5300000,
    itemCount: 2,
    ...overrides,
  };
}

function page(items: PendingFollowUpItem[], total = items.length) {
  return { items, total, page: 1, pageSize: 20 };
}

// Normaliza los espacios duros de Intl (es: "150.000,50 USD" lleva U+00A0).
function money(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ');
}

describe('PendingFollowUpView (DX-040)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedReject.mockReset();
    mockedLocations.mockResolvedValue([
      clinicLocation({ id: 'loc-1', name: 'Sede principal' }),
      clinicLocation({ id: 'loc-2', name: 'Sede Norte' }),
    ]);
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
    await waitFor(() => expect(money(row.textContent)).toContain(money('USD 5.300.000,00')));
    expect(within(row).getByText('hace 9 días')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Llamar a Carolina Ruiz: 412 111 2222' })).toHaveAttribute(
      'href',
      'tel:4121112222',
    );
    const whatsapp = within(row).getByRole('link', { name: /^WhatsApp a Carolina Ruiz/ });
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/584121112222\?text=Hola%20Carolina/);
    await waitFor(() => expect(whatsapp.getAttribute('href')).toContain('Cl%C3%ADnica%20Demo'));
    expect(screen.getByText('1 presupuesto')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { olderThanDays: 7, page: 1 });
  });

  describe('DX-379: la validez de la fila', () => {
    const until = STAMP_FORMATS.caracas.civilDate('2026-11-06');

    it('vencido: chip «Vencido · valía hasta el …» en la fila (y en la tarjeta del teléfono)', async () => {
      mockedList.mockResolvedValue(page([item({ quoteValidUntil: '2026-11-06', quoteExpired: true })]));
      render(<PendingFollowUpView token="tok" />);
      const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
      await waitFor(() => expect(within(row).getByTestId('quote-expired')).toHaveTextContent(`Vencido · valía hasta el ${until}`));
      expect(within(row).queryByTestId('quote-valid-until')).not.toBeInTheDocument();
      expect(screen.getAllByTestId('quote-expired').length).toBeGreaterThanOrEqual(1);
    });

    it('vigente: «Válido hasta el …», sin chip', async () => {
      mockedList.mockResolvedValue(page([item({ quoteValidUntil: '2026-11-06', quoteExpired: false })]));
      render(<PendingFollowUpView token="tok" />);
      const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
      await waitFor(() =>
        expect(within(row).getByTestId('quote-valid-until')).toHaveTextContent(`Válido hasta el ${until}`),
      );
      expect(screen.queryByTestId('quote-expired')).not.toBeInTheDocument();
    });

    it('sin fechas (presentado antes de DX-379): nada', async () => {
      mockedList.mockResolvedValue(page([item()]));
      render(<PendingFollowUpView token="tok" />);
      await screen.findByRole('row', { name: /Carolina Ruiz/ });
      expect(screen.queryByTestId('quote-expired')).not.toBeInTheDocument();
      expect(screen.queryByTestId('quote-valid-until')).not.toBeInTheDocument();
    });
  });

  it('alcance: «Todas las sedes» sin restricción, «Mis sedes» con claim acotado (DX-089)', async () => {
    mockedList.mockResolvedValue(page([item()]));
    // El alcance va en la cabecera de la página (UX v2), no dentro de la vista.
    const { unmount } = render(<FollowUpScopeMarker token="tok" />);
    expect(await screen.findByText('Todas las sedes')).toBeInTheDocument();
    unmount();
    const b64 = (v: string) => btoa(v).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const restricted = `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify({ sub: 'u1', loc: ['loc-1'] }))}.firma`;
    render(<FollowUpScopeMarker token={restricted} />);
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
    render(<FollowUpScopeMarker token="tok" />);
    expect(await screen.findByText('Presentados en Sede Norte')).toBeInTheDocument();
  });

  it('marcar rechazado desde la fila abre el modal y, al confirmarlo, recarga', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValueOnce(page([item()])).mockResolvedValue(page([]));
    mockedReject.mockResolvedValue({ id: 'plan-a', status: 'REJECTED' } as never);
    render(<PendingFollowUpView token="tok" />);
    const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
    // «Marcar rechazado» vive en el «⋯» de la fila (UX v2).
    await user.click(within(row).getByRole('button', { name: 'Acciones de Carolina Ruiz' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Marcar rechazado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Marcar como rechazado' });
    expect(within(dialog).getByText('Opción A: implante · Carolina Ruiz')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Quiere una segunda opinión' }));
    await user.click(within(dialog).getByRole('button', { name: 'Marcar rechazado' }));
    await waitFor(() =>
      expect(mockedReject).toHaveBeenCalledWith('tok', 'plan-a', { reason: 'SECOND_OPINION' }),
    );
    expect(await screen.findByText('No hay presupuestos por seguir.')).toBeInTheDocument();
  });

  describe('D2: una fila por conversación (opciones A/B agrupadas)', () => {
    const optionA = item();
    const optionB = item({
      planId: 'plan-b',
      optionLabel: 'Opción B: puente',
      total: 3450000,
      presentedAt: '2026-10-08T15:00:00.000Z',
      daysSincePresented: 8,
    });
    const other = item({
      planId: 'plan-x',
      optionGroupId: null,
      optionLabel: null,
      patientId: 'pat-2',
      patientName: 'Mateo Díaz',
      total: 800000,
    });

    it('las opciones del mismo grupo van en UNA fila: rango, opciones anidadas y un solo WhatsApp', async () => {
      // La API ya pagina por grupo: `total` cuenta conversaciones (2), no opciones (3).
      mockedList.mockResolvedValue(page([optionA, optionB, other], 2));
      render(<PendingFollowUpView token="tok" />);
      const rows = await screen.findAllByRole('row', { name: /Carolina Ruiz/ });
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(within(row).getByText('2 opciones')).toBeInTheDocument();
      const nested = within(row).getByRole('list', { name: 'Opciones presentadas a Carolina Ruiz' });
      await waitFor(() =>
        expect(within(nested).getAllByRole('listitem').map((li) => money(li.textContent))).toEqual([
          money('Opción A: implante · USD 5.300.000,00'),
          money('Opción B: puente · USD 3.450.000,00'),
        ]),
      );
      expect(money(row.textContent)).toContain(money('USD 3.450.000,00 – USD 5.300.000,00'));
      // La antigüedad es la de la opción más antigua.
      expect(within(row).getByText('hace 9 días')).toBeInTheDocument();
      expect(within(row).getAllByRole('link', { name: /WhatsApp a Carolina Ruiz/ })).toHaveLength(1);
      expect(screen.getByRole('row', { name: /Mateo Díaz/ })).toBeInTheDocument();
      expect(screen.getByText('2 presupuestos')).toBeInTheDocument();
    });

    it('«Marcar rechazadas las 2 opciones» rechaza cada opción con el mismo motivo', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValueOnce(page([optionA, optionB], 1)).mockResolvedValue(page([]));
      mockedReject.mockResolvedValue({ id: 'x', status: 'REJECTED' } as never);
      render(<PendingFollowUpView token="tok" />);
      const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
      await user.click(within(row).getByRole('button', { name: 'Acciones de Carolina Ruiz' }));
      // También se puede descartar una sola opción.
      expect(
        await screen.findByRole('menuitem', { name: 'Marcar rechazada: Opción B: puente' }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('menuitem', { name: 'Marcar rechazadas las 2 opciones' }));
      const dialog = await screen.findByRole('dialog', { name: 'Marcar como rechazado' });
      expect(within(dialog).getByText('Las 2 opciones · Carolina Ruiz')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('radio', { name: 'Precio' }));
      await user.click(within(dialog).getByRole('button', { name: 'Marcar rechazado' }));
      await waitFor(() => expect(mockedReject).toHaveBeenCalledTimes(2));
      expect(mockedReject).toHaveBeenNthCalledWith(1, 'tok', 'plan-a', { reason: 'PRICE' });
      expect(mockedReject).toHaveBeenNthCalledWith(2, 'tok', 'plan-b', { reason: 'PRICE' });
      expect(await screen.findByText('2 opciones marcadas como rechazadas.')).toBeInTheDocument();
    });

    it('si falla a medias, lo dice y el reintento no repite la opción ya rechazada', async () => {
      const user = userEvent.setup();
      mockedList.mockResolvedValue(page([optionA, optionB], 1));
      mockedReject
        .mockResolvedValueOnce({ id: 'plan-a', status: 'REJECTED' } as never)
        .mockRejectedValueOnce(new Error('red'))
        .mockResolvedValueOnce({ id: 'plan-b', status: 'REJECTED' } as never);
      render(<PendingFollowUpView token="tok" />);
      const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
      await user.click(within(row).getByRole('button', { name: 'Acciones de Carolina Ruiz' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Marcar rechazadas las 2 opciones' }));
      const dialog = await screen.findByRole('dialog', { name: 'Marcar como rechazado' });
      await user.click(within(dialog).getByRole('radio', { name: 'Precio' }));
      await user.click(within(dialog).getByRole('button', { name: 'Marcar rechazado' }));
      expect(await within(dialog).findByText(/Se marcaron 1 de 2 opciones/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Marcar rechazado' }));
      await waitFor(() => expect(mockedReject).toHaveBeenCalledTimes(3));
      expect(mockedReject).toHaveBeenLastCalledWith('tok', 'plan-b', { reason: 'PRICE' });
    });
  });
});

describe('PendingFollowUpView: cada fila con la sede donde se presentó (DX-354b, E1)', () => {
  // 02:30Z: en Caracas todavía es el 7 de octubre; en Berlín ya es el 7 (04:30) y en Miami el 6.
  const presentedAt = '2026-10-07T02:30:00.000Z';

  beforeEach(() => {
    mockedList.mockReset();
    mockedActive.mockReturnValue(null);
    mockedClinic.mockResolvedValue('Clínica Demo');
    mockedLocations.mockResolvedValue([
      STAMP_SEDES.caracas,
      STAMP_SEDES.berlin,
      STAMP_SEDES.miami,
    ]);
  });

  it('DX-354b (T26-ter): cada opción anidada de un presupuesto lleva el importe con el formato de SU sede', async () => {
    mockedList.mockResolvedValue(
      page([
        item({
          planId: 'o1',
          optionGroupId: 'g1',
          optionLabel: 'Opción A',
          patientName: 'Carolina Ruiz',
          presentedAt: '2026-10-01T15:00:00.000Z',
          presentedLocationId: STAMP_SEDES.caracas.id,
          total: 1234.5,
          currency: 'USD',
        }),
        item({
          planId: 'o2',
          optionGroupId: 'g1',
          optionLabel: 'Opción B',
          patientName: 'Carolina Ruiz',
          presentedAt: '2026-10-02T15:00:00.000Z',
          presentedLocationId: STAMP_SEDES.berlin.id,
          total: 1234.5,
          currency: 'EUR',
        }),
      ]),
    );
    render(<PendingFollowUpView token="tok" />);
    const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
    await waitFor(() => expect(money(row.textContent)).toContain(money('Opción A · USD 1.234,50')));
    // La opción B es de Berlín: su línea va con el formato de Berlín, no con el de la sede de la opción más antigua.
    expect(money(row.textContent)).toContain(money('Opción B · 1.234,50 EUR'));
  });

  it('la fecha, el importe y el mensaje de WhatsApp de cada fila usan el reloj y el formato de SU sede', async () => {
    mockedList.mockResolvedValue(
      page([
        item({
          planId: 'a',
          optionGroupId: 'a',
          patientName: 'Carolina Ruiz',
          presentedAt,
          presentedLocationId: STAMP_SEDES.caracas.id,
          total: 1234.5,
          currency: 'USD',
        }),
        item({
          planId: 'b',
          optionGroupId: 'b',
          patientName: 'Jonas Weber',
          presentedAt,
          presentedLocationId: STAMP_SEDES.berlin.id,
          total: 1234.5,
          currency: 'EUR',
        }),
        item({
          planId: 'c',
          optionGroupId: 'c',
          patientName: 'Mia Torres',
          presentedAt,
          presentedLocationId: STAMP_SEDES.miami.id,
          total: 1234.5,
          currency: 'USD',
        }),
      ]),
    );
    render(<PendingFollowUpView token="tok" />);
    const caracas = await screen.findByRole('row', { name: /Carolina Ruiz/ });
    const berlin = screen.getByRole('row', { name: /Jonas Weber/ });
    const miami = screen.getByRole('row', { name: /Mia Torres/ });
    const day = (sede: 'caracas' | 'berlin' | 'miami') => dateIn(sede, presentedAt);
    expect(day('caracas')).not.toBe(day('miami'));
    await waitFor(() => expect(caracas).toHaveTextContent(day('caracas')));
    expect(berlin).toHaveTextContent(day('berlin'));
    expect(miami).toHaveTextContent(day('miami'));
    expect(money(caracas.textContent)).toContain(money('USD 1.234,50'));
    expect(money(berlin.textContent)).toContain(money('1.234,50 EUR'));
    expect(money(miami.textContent)).toContain(money('USD 1,234.50'));
    // El mensaje de WhatsApp lleva el día de la sede de la fila.
    const href = (row: HTMLElement) => decodeURIComponent(within(row).getByRole('link', { name: /WhatsApp a/ }).getAttribute('href') ?? '');
    expect(href(caracas)).toContain(`presentamos el ${day('caracas')}.`);
    expect(href(miami)).toContain(`presentamos el ${day('miami')}.`);
  });

  it('una sede desconocida: fecha e importe «—», WhatsApp deshabilitado (nunca «—» en el mensaje) y un solo aviso', async () => {
    mockedList.mockResolvedValue(
      page([
        item({ planId: 'a', optionGroupId: 'a', patientName: 'Carolina Ruiz', presentedLocationId: 'sede-borrada' }),
        item({ planId: 'b', optionGroupId: 'b', patientName: 'Jonas Weber', presentedLocationId: 'sede-borrada' }),
      ]),
    );
    render(<PendingFollowUpView token="tok" />);
    const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
    expect(await screen.findAllByText(/No se pudo saber el formato regional o el reloj de la sede/)).toHaveLength(1);
    expect(within(row).queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    const blocked = within(row).getByRole('button', { name: /WhatsApp a Carolina Ruiz: no disponible/ });
    expect(blocked).toBeDisabled();
    expect(row).not.toHaveTextContent('2026');
  });

  it('mientras las sedes cargan: «—» sin aviso', async () => {
    mockedLocations.mockReturnValue(new Promise(() => undefined));
    mockedList.mockResolvedValue(page([item({ presentedLocationId: STAMP_SEDES.berlin.id })]));
    render(<PendingFollowUpView token="tok" />);
    const row = await screen.findByRole('row', { name: /Carolina Ruiz/ });
    expect(row).not.toHaveTextContent('2026');
    expect(screen.queryByText(/No se pudo saber el formato regional/)).not.toBeInTheDocument();
  });
});
