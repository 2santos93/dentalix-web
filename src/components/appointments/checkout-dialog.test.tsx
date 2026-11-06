import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getCheckoutChecklist, type CheckoutChecklist } from '@/lib/appointments/checkout-checklist';
import { CheckoutDialog, checkoutCopy } from './checkout-dialog';

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
