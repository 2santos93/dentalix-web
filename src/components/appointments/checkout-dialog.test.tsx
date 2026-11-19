import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getCheckoutChecklist, type CheckoutChecklist } from '@/lib/appointments/checkout-checklist';
import { CheckoutDialog, checkoutCopy } from './checkout-dialog';
import { checkoutRecallCopy } from './checkout-recall-offer';
import { ApiError } from '@/lib/api/client';
import { createDefaultPatientRecall, type PatientRecall } from '@/lib/recall/recall-api';
import { listLocations } from '@/lib/locations/locations-api';
import { caracasSede } from '@/lib/test/sede-clock';
import { updatePatient } from '@/lib/patients/patients-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { useEffectivePermissions } from '@/lib/auth/permissions';
import { checkoutContactCopy } from './checkout-contact-field';

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

// DX-202-bis: quien cobra (rol del token o PAYMENT_REGISTER de `GET /me`).
jest.mock('../../lib/auth/token-role', () => ({
  ...jest.requireActual('../../lib/auth/token-role'),
  getTokenRole: jest.fn(),
}));
jest.mock('../../lib/auth/permissions', () => ({
  ...jest.requireActual('../../lib/auth/permissions'),
  useEffectivePermissions: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  updatePatient: jest.fn(),
}));
const update = jest.mocked(updatePatient);
// El modal de cobro real tiene sus propias pruebas: aquí, lo que la salida le pasa y lo que hace al cobrar.
// (El de verdad es otro diálogo de Radix; este, fuera de la salida, queda bajo su `aria-hidden` y
// sin puntero: se pulsa con `fireEvent`.)
jest.mock('../payments/record-payment-modal', () => ({
  RecordPaymentModal: ({
    patientId,
    onRecorded,
    onOpenChange,
  }: {
    patientId: string;
    onRecorded: (notice: string) => void;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div role="dialog" aria-label="Registrar abono">
      <span>Cobro de {patientId}</span>
      <button type="button" onClick={() => onRecorded('Abono registrado: 120,00 USD.')}>
        Registrar abono
      </button>
      <button type="button" onClick={() => onOpenChange(false)}>
        Cerrar cobro
      </button>
    </div>
  ),
}));

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
  pending: [{ currency: 'USD', amount: 120 }],
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

beforeEach(() => {
  get.mockReset();
  update.mockReset();
  jest.mocked(getTokenRole).mockReturnValue('RECEPTION');
  jest.mocked(useEffectivePermissions).mockReturnValue([]);
  jest.mocked(listLocations).mockResolvedValue([caracasSede({ id: 'l1' })]);
});

describe('CheckoutDialog (DX-202)', () => {
  it('enseña cada punto con su estado y cómo resolverlo sin salir', async () => {
    get.mockResolvedValue(list());
    mount();
    expect(await screen.findByTestId('checkout-NEXT_VISIT')).toHaveAttribute('data-done', 'false');
    expect(screen.getByTestId('checkout-PHONE')).toHaveAttribute('data-done', 'true');
    // Solo la próxima visita se resuelve en la ficha; el cobro y el correo, aquí.
    const links = screen.getAllByRole('link', { name: /Abrir ficha/ });
    expect(links).toHaveLength(1);
    expect(screen.getByRole('button', { name: checkoutCopy.charge })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: checkoutContactCopy.add.email })).toBeInTheDocument();
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

  describe('DX-202-bis: el saldo de hoy y cobrar dentro de la salida', () => {
    it('lo pendiente hoy cuenta aunque no haya nada vencido, con el importe y su moneda', async () => {
      get.mockResolvedValue(list({ balance: { hasOverdue: false, overdueDays: null } }));
      mount();
      expect(await screen.findByTestId('checkout-PAYMENT')).toHaveAttribute('data-done', 'false');
      expect(screen.getByText(checkoutCopy.items.PAYMENT.pending)).toBeInTheDocument();
      expect(await screen.findByTestId('checkout-PAYMENT-detail')).toHaveTextContent(/Pendiente hoy: USD\s120,00/);
    });

    it('con algo vencido lo dice primero, y los días', async () => {
      get.mockResolvedValue(list());
      mount();
      expect(await screen.findByText(checkoutCopy.overdue)).toBeInTheDocument();
      expect(screen.getByTestId('checkout-PAYMENT-detail')).toHaveTextContent('Vencido hace 30 días');
    });

    it('sin vencido ni pendiente, el cobro está hecho', async () => {
      get.mockResolvedValue(list({ balance: { hasOverdue: false, overdueDays: null }, pending: [] }));
      mount();
      expect(await screen.findByTestId('checkout-PAYMENT')).toHaveAttribute('data-done', 'true');
      expect(screen.getByText(checkoutCopy.items.PAYMENT.done)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: checkoutCopy.charge })).toBeNull();
    });

    it('«Cobrar» abre el modal de abono del paciente; al registrar, relee solo ese punto y queda hecho', async () => {
      get.mockResolvedValueOnce(list());
      const { onOpenChange } = mount();
      let resolve: (value: CheckoutChecklist) => void = () => {};
      get.mockReturnValueOnce(new Promise<CheckoutChecklist>((r) => (resolve = r)));
      await userEvent.click(await screen.findByRole('button', { name: checkoutCopy.charge }));
      expect(await screen.findByText('Cobro de p1')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Registrar abono'));
      expect(screen.queryByText('Cobro de p1')).toBeNull();
      // Mientras relee, ese punto lo dice; los demás siguen a la vista.
      expect(screen.getByTestId('checkout-PAYMENT')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText(checkoutCopy.checking)).toBeInTheDocument();
      expect(screen.getByTestId('checkout-EMAIL')).not.toHaveAttribute('aria-busy');
      resolve(list({ balance: { hasOverdue: false, overdueDays: null }, pending: [] }));
      await waitFor(() => expect(screen.getByTestId('checkout-PAYMENT')).toHaveAttribute('data-done', 'true'));
      // Registrar el abono no completa la cita.
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it('si la relectura falla, el error y su reintento salen en ese punto', async () => {
      get.mockResolvedValueOnce(list());
      mount();
      get.mockRejectedValueOnce(new Error('red'));
      await userEvent.click(await screen.findByRole('button', { name: checkoutCopy.charge }));
      fireEvent.click(await screen.findByText('Registrar abono'));
      const row = screen.getByTestId('checkout-PAYMENT');
      expect(await within(row).findByRole('alert')).toHaveTextContent(checkoutCopy.refreshError);
      get.mockResolvedValue(list({ balance: { hasOverdue: false, overdueDays: null }, pending: [] }));
      await userEvent.click(within(row).getByRole('button', { name: checkoutCopy.retry }));
      await waitFor(() => expect(screen.getByTestId('checkout-PAYMENT')).toHaveAttribute('data-done', 'true'));
    });

    it('la asistente con PAYMENT_REGISTER (DX-090) también cobra', async () => {
      jest.mocked(getTokenRole).mockReturnValue('ASSISTANT');
      jest.mocked(useEffectivePermissions).mockReturnValue(['PAYMENT_REGISTER']);
      get.mockResolvedValue(list());
      mount();
      expect(await screen.findByRole('button', { name: checkoutCopy.charge })).toBeInTheDocument();
    });

    it('sin permiso de cobro no hay «Cobrar»: queda el enlace al estado de cuenta', async () => {
      jest.mocked(getTokenRole).mockReturnValue('DENTIST');
      get.mockResolvedValue(list());
      mount();
      await screen.findByTestId('checkout-PAYMENT');
      expect(screen.queryByRole('button', { name: checkoutCopy.charge })).toBeNull();
      expect(screen.getAllByRole('link', { name: /Abrir ficha/ })[1]).toHaveAttribute(
        'href',
        '/patients/p1?tab=account-statement',
      );
    });
  });

  describe('DX-202-bis: completar el contacto en línea', () => {
    it('añade el correo con la edición del paciente y el punto queda hecho', async () => {
      get.mockResolvedValueOnce(list());
      get.mockResolvedValue(list({ hasEmail: true }));
      update.mockResolvedValue({} as never);
      const { onComplete } = mount();
      await userEvent.click(await screen.findByRole('button', { name: checkoutContactCopy.add.email }));
      await userEvent.type(screen.getByLabelText(checkoutContactCopy.label.email), ' ana@correo.com ');
      await userEvent.click(screen.getByRole('button', { name: checkoutContactCopy.save }));
      expect(update).toHaveBeenCalledWith('tok', 'p1', { email: 'ana@correo.com' });
      await waitFor(() => expect(screen.getByTestId('checkout-EMAIL')).toHaveAttribute('data-done', 'true'));
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('Intro guarda el teléfono y no completa la cita', async () => {
      get.mockResolvedValue(list({ hasPhone: false }));
      update.mockResolvedValue({} as never);
      const { onComplete } = mount();
      await userEvent.click(await screen.findByRole('button', { name: checkoutContactCopy.add.phone }));
      await userEvent.type(screen.getByLabelText(checkoutContactCopy.label.phone), '+58 412 555 0101{Enter}');
      expect(update).toHaveBeenCalledWith('tok', 'p1', { phone: '+58 412 555 0101' });
      expect(onComplete).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByTestId('checkout-PHONE')).toHaveAttribute('data-done', 'true'));
    });

    it('valida como la ficha: vacío y correo mal escrito, junto al campo', async () => {
      get.mockResolvedValue(list());
      mount();
      await userEvent.click(await screen.findByRole('button', { name: checkoutContactCopy.add.email }));
      await userEvent.click(screen.getByRole('button', { name: checkoutContactCopy.save }));
      expect(screen.getByRole('alert')).toHaveTextContent(checkoutContactCopy.missing.email);
      await userEvent.type(screen.getByLabelText(checkoutContactCopy.label.email), 'ana@x');
      await userEvent.click(screen.getByRole('button', { name: checkoutContactCopy.save }));
      expect(screen.getByRole('alert')).toHaveTextContent(checkoutContactCopy.emailInvalid);
      expect(screen.getByLabelText(checkoutContactCopy.label.email)).toHaveAttribute('aria-invalid', 'true');
      expect(update).not.toHaveBeenCalled();
    });

    it('el rechazo de la API sale junto al campo con su mensaje y el punto sigue pendiente', async () => {
      get.mockResolvedValue(list({ hasPhone: false }));
      update.mockRejectedValue(new ApiError(400, 'Con WhatsApp como canal, escribe un móvil con su prefijo.'));
      mount();
      await userEvent.click(await screen.findByRole('button', { name: checkoutContactCopy.add.phone }));
      await userEvent.type(screen.getByLabelText(checkoutContactCopy.label.phone), '0212');
      await userEvent.click(screen.getByRole('button', { name: checkoutContactCopy.save }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Con WhatsApp como canal, escribe un móvil con su prefijo.');
      expect(screen.getByTestId('checkout-PHONE')).toHaveAttribute('data-done', 'false');
    });
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
    phoneReview: null,
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

  it('un 422 (la cita no vale) sale junto a los botones, con el mensaje de la API (escalón 4)', async () => {
    get.mockResolvedValue(list({ recallTypes: TYPES }));
    create.mockRejectedValue(new ApiError(422, 'La cita no es de este paciente o no está en curso.'));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: checkoutRecallCopy.schedule('Higiene', 6) }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La cita no es de este paciente o no está en curso.');
    expect(create).toHaveBeenCalledWith('tok', 'p1', 't-hyg', 'a1');
    expect(screen.getByTestId('checkout-NEXT_VISIT')).toHaveAttribute('data-done', 'false');
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
