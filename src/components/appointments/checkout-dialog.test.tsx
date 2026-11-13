import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getCheckoutChecklist, type CheckoutChecklist } from '@/lib/appointments/checkout-checklist';
import { CheckoutDialog, checkoutCopy } from './checkout-dialog';
import { checkoutRecallCopy } from './checkout-recall-offer';
import { ApiError } from '@/lib/api/client';
import { createDefaultPatientRecall, type PatientRecall } from '@/lib/recall/recall-api';
import { listLocations } from '@/lib/locations/locations-api';
import { caracasSede } from '@/lib/test/sede-clock';

jest.mock('../../lib/recall/recall-api', () => ({
  ...jest.requireActual('../../lib/recall/recall-api'),
  createDefaultPatientRecall: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const create = jest.mocked(createDefaultPatientRecall);

jest.mock('../../lib/appointments/checkout-checklist', () => ({
  ...jest.requireActual('../../lib/appointments/checkout-checklist'),
  getCheckoutChecklist: jest.fn(),
}));
const get = jest.mocked(getCheckoutChecklist);

const list = (over: Partial<CheckoutChecklist> = {}): CheckoutChecklist => ({
  appointmentId: 'a1',
  patientId: 'p1',
  nextAppointmentStart: null,
  recallDueOn: null,
  hasPhone: true,
  hasEmail: false,
  remindersOptedOut: false,
  recallTypes: [],
  balance: { hasOverdue: true, overdueDays: 30 },
  ...over,
});

function mount(onComplete = jest.fn().mockResolvedValue(true), onOpenChange = jest.fn()) {
  render(
    <CheckoutDialog
      token="tok"
      appointmentId="a1"
      patientName="Ana Pérez"
      onOpenChange={onOpenChange}
      onComplete={onComplete}
    />,
  );
  return { onComplete, onOpenChange };
}

beforeEach(() => get.mockReset());

describe('CheckoutDialog (DX-202)', () => {
  it('enseña cada punto con su estado y un enlace a la ficha donde falta algo', async () => {
    get.mockResolvedValue(list());
    mount();
    expect(await screen.findByTestId('checkout-NEXT_VISIT')).toHaveAttribute('data-done', 'false');
    expect(screen.getByTestId('checkout-PHONE')).toHaveAttribute('data-done', 'true');
    const links = screen.getAllByRole('link', { name: /Abrir ficha/ });
    expect(links).toHaveLength(3);
    expect(links[1]).toHaveAttribute('href', '/patients/p1?tab=account-statement');
  });

  it('completar con pendientes no bloquea y dice qué faltó', async () => {
    get.mockResolvedValue(list());
    const { onComplete, onOpenChange } = mount();
    await userEvent.click(await screen.findByRole('button', { name: checkoutCopy.submitWithPending(3) }));
    expect(onComplete).toHaveBeenCalledWith(['NEXT_VISIT', 'PAYMENT', 'EMAIL']);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('quien no cobra no ve el saldo; todo al día se completa sin pendientes', async () => {
    get.mockResolvedValue(list({ balance: null, recallDueOn: '2027-01-01', hasEmail: true }));
    const { onComplete } = mount();
    await userEvent.click(await screen.findByRole('button', { name: checkoutCopy.submit }));
    expect(screen.queryByTestId('checkout-PAYMENT')).not.toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('se relee al volver a la pestaña y, si falla, ofrece reintentar', async () => {
    get.mockRejectedValueOnce(new Error('red'));
    mount();
    expect(await screen.findByText(checkoutCopy.loadError)).toBeInTheDocument();
    get.mockResolvedValue(list({ hasEmail: true }));
    fireEvent.focus(window);
    expect(await screen.findByTestId('checkout-EMAIL')).toHaveAttribute('data-done', 'true');
  });

  it('si la API rechaza completar, el diálogo sigue abierto', async () => {
    get.mockResolvedValue(list());
    const { onOpenChange } = mount(jest.fn().mockResolvedValue(false));
    await userEvent.click(await screen.findByRole('button', { name: checkoutCopy.submitWithPending(3) }));
    await waitFor(() => expect(screen.getByRole('button', { name: checkoutCopy.submitWithPending(3) })).toBeEnabled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText(checkoutCopy.completeError)).toBeInTheDocument();
  });

  describe('FE-108: no se completa sin la lista de comprobación', () => {
    it('mientras carga, el botón está desactivado y ocupado, y no completa', async () => {
      let resolve: (value: CheckoutChecklist) => void = () => {};
      get.mockReturnValue(new Promise<CheckoutChecklist>((r) => (resolve = r)));
      const { onComplete } = mount();
      const button = screen.getByRole('button', { name: checkoutCopy.loading });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByRole('button', { name: checkoutCopy.submit })).not.toBeInTheDocument();
      // Ni con Intro desde el diálogo: el envío nativo del formulario tampoco completa.
      fireEvent.submit(button.closest('form') as HTMLFormElement);
      expect(onComplete).not.toHaveBeenCalled();
      // Cancelar sigue disponible: la salida del diálogo no depende de la carga.
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
      resolve(list());
      await userEvent.click(await screen.findByRole('button', { name: checkoutCopy.submitWithPending(3) }));
      expect(onComplete).toHaveBeenCalledWith(['NEXT_VISIT', 'PAYMENT', 'EMAIL']);
    });

    it('si la carga falla, no hay botón de completar y «Reintentar» la vuelve a pedir', async () => {
      get.mockRejectedValueOnce(new Error('red'));
      const { onComplete } = mount();
      expect(await screen.findByText(checkoutCopy.loadError)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Completar/ })).not.toBeInTheDocument();
      fireEvent.submit(screen.getByRole('button', { name: 'Reintentar' }).closest('form') as HTMLFormElement);
      expect(onComplete).not.toHaveBeenCalled();

      get.mockResolvedValue(list());
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      await userEvent.click(await screen.findByRole('button', { name: checkoutCopy.submitWithPending(3) }));
      expect(onComplete).toHaveBeenCalledWith(['NEXT_VISIT', 'PAYMENT', 'EMAIL']);
    });

    it('un reintento que vuelve a fallar sigue bloqueando', async () => {
      get.mockRejectedValue(new Error('red'));
      const { onComplete } = mount();
      await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByText(checkoutCopy.loadError)).toBeInTheDocument();
      expect(get).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('button', { name: /Completar/ })).not.toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});

describe('DX-015-bis (D16): «Programar recall de <tipo>» en la salida', () => {
  const TYPES = [
    { id: 't-hyg', name: 'Higiene', defaultIntervalMonths: 6 },
    { id: 't-ctl', name: 'Control', defaultIntervalMonths: 12 },
    { id: 't-perio', name: 'Mantenimiento periodontal', defaultIntervalMonths: 3 },
  ];
  const recallFor = (typeId: string, name: string) => ({
    recalls: [
      {
        id: `r-${typeId}`,
        kind: null,
        recallTypeId: typeId,
        recallTypeName: name,
        intervalMonths: 6,
        dueAt: '2027-05-15',
        locationId: 'l1',
      } as unknown as PatientRecall,
    ],
    contacts: [],
    recallUpdates: [],
  });

  beforeEach(() => {
    create.mockReset();
    jest.mocked(listLocations).mockResolvedValue([caracasSede({ id: 'l1' })]);
  });

  it('ofrece los dos primeros tipos y «Otros…»; no se ofrece si el punto está hecho', async () => {
    get.mockResolvedValue(list({ recallTypes: TYPES }));
    mount();
    expect(await screen.findByRole('button', { name: checkoutRecallCopy.schedule('Higiene', 6) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: checkoutRecallCopy.schedule('Control', 12) })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: checkoutRecallCopy.schedule('Mantenimiento periodontal', 3) })).toBeNull();
    expect(screen.getByRole('button', { name: checkoutRecallCopy.moreLabel })).toBeInTheDocument();
  });

  it('programa con D15, marca el punto hecho con el vencimiento y se puede completar sin pendiente', async () => {
    get.mockResolvedValueOnce(list({ recallTypes: TYPES.slice(0, 1), hasEmail: true, balance: null }));
    get.mockResolvedValue(list({ recallTypes: [], recallDueOn: '2027-05-15', hasEmail: true, balance: null }));
    create.mockResolvedValue(recallFor('t-hyg', 'Higiene'));
    const { onComplete } = mount();
    await userEvent.click(await screen.findByRole('button', { name: checkoutRecallCopy.schedule('Higiene', 6) }));
    expect(create).toHaveBeenCalledWith('tok', 'p1', 't-hyg', 'a1');
    await waitFor(() => expect(screen.getByTestId('checkout-NEXT_VISIT')).toHaveAttribute('data-done', 'true'));
    expect(await screen.findByText(/Recall de Higiene: vence el 15\/05\/2027/)).toBeInTheDocument();
    expect(screen.queryByTestId('checkout-recall-offer')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: checkoutCopy.submit }));
    expect(onComplete).toHaveBeenCalledWith([]);
  });

  it('dice qué recall desactivó la exclusión (D9)', async () => {
    get.mockResolvedValue(list({ recallTypes: TYPES }));
    create.mockResolvedValue({
      ...recallFor('t-hyg', 'Higiene'),
      recallUpdates: [
        {
          recallId: 'r-old',
          recallTypeId: 't-perio',
          recallTypeName: 'Mantenimiento periodontal',
          dueAt: '2027-01-01',
          deactivated: true,
          replacedBy: { recallTypeId: 't-hyg', recallTypeName: 'Higiene' },
        },
      ],
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: checkoutRecallCopy.schedule('Higiene', 6) }));
    expect(
      await screen.findByText('Recall de Mantenimiento periodontal desactivado: lo sustituye Higiene.'),
    ).toBeInTheDocument();
  });

  it('un 409 (ya lo tenía) relee la lista de salida', async () => {
    get.mockResolvedValueOnce(list({ recallTypes: TYPES }));
    get.mockResolvedValue(list({ recallTypes: [], recallDueOn: '2027-01-01' }));
    create.mockRejectedValue(new ApiError(409, 'Ya tiene un recall de ese tipo.'));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: checkoutRecallCopy.schedule('Higiene', 6) }));
    await waitFor(() => expect(screen.getByTestId('checkout-NEXT_VISIT')).toHaveAttribute('data-done', 'true'));
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('otro error se dice junto a los botones y deja seguir', async () => {
    get.mockResolvedValue(list({ recallTypes: TYPES }));
    create.mockRejectedValue(new Error('red'));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: checkoutRecallCopy.schedule('Control', 12) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(checkoutRecallCopy.saveError);
    expect(screen.getByRole('button', { name: checkoutCopy.submitWithPending(3) })).toBeEnabled();
  });
});
