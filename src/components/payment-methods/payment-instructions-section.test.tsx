import { render, screen, waitFor, within } from '@testing-library/react';
import { PaymentInstructionsSection } from './payment-instructions-section';
import {
  deletePaymentMethodInstructions,
  listPaymentMethodInstructions,
  savePaymentMethodInstructions,
  type ClinicPaymentMethod,
  type PaymentMethodInstruction,
} from '@/lib/payments/payment-methods-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/payments/payment-methods-api', () => ({
  ...jest.requireActual('../../lib/payments/payment-methods-api'),
  listPaymentMethodInstructions: jest.fn(),
  savePaymentMethodInstructions: jest.fn(),
  deletePaymentMethodInstructions: jest.fn(),
}));
jest.mock('../../lib/locations/use-locations-state', () => ({
  useLocationsState: () => ({
    status: 'ready',
    activeLocationId: null,
    retry: jest.fn(),
    locations: [
      { id: 'loc-1', name: 'Sede Chacao', isActive: true },
      { id: 'loc-2', name: 'Sede Valencia', isActive: true },
    ],
  }),
}));

const mockedList = listPaymentMethodInstructions as jest.MockedFunction<typeof listPaymentMethodInstructions>;
const mockedSave = savePaymentMethodInstructions as jest.MockedFunction<typeof savePaymentMethodInstructions>;
const mockedDelete = deletePaymentMethodInstructions as jest.MockedFunction<typeof deletePaymentMethodInstructions>;

function method(over: Partial<ClinicPaymentMethod>): ClinicPaymentMethod {
  return {
    id: 'pm-x',
    name: 'Medio',
    kind: 'DIGITAL',
    active: true,
    requiresReference: true,
    proofPolicy: 'OPTIONAL',
    allowInPaymentLink: true,
    gatewayFeePercent: null,
    legacyMethod: null,
    adjustments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function instruction(over: Partial<PaymentMethodInstruction>): PaymentMethodInstruction {
  return {
    id: 'pmi-1',
    paymentMethodId: 'pm-mobile',
    locationId: null,
    holderName: 'Clínica Demo C.A.',
    holderId: 'J-12345678-9',
    bankName: 'Banco Demo',
    accountNumber: null,
    phone: '0414-5550101',
    email: null,
    note: null,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  };
}

const mobile = method({ id: 'pm-mobile', name: 'Pago móvil' });
const transfer = method({ id: 'pm-transfer', name: 'Transferencia', kind: 'TRANSFER' });

beforeEach(() => {
  jest.clearAllMocks();
  mockedList.mockImplementation(async (_t, id) => (id === 'pm-mobile' ? [instruction({})] : []));
});

describe('PaymentInstructionsSection (DX-569)', () => {
  it('lista los datos por medio y ámbito, y avisa del medio permitido sin datos', async () => {
    render(<PaymentInstructionsSection token="tok" methods={[mobile, transfer]} canEdit />);
    const table = await screen.findByRole('table', { name: 'Datos para pagar' });
    const row = within(table).getByText('Pago móvil').closest('tr') as HTMLElement;
    expect(within(row).getByText('Toda la clínica')).toBeInTheDocument();
    expect(row).toHaveTextContent('Titular: Clínica Demo C.A. · Identificación del titular: J-12345678-9');
    expect(row).toHaveTextContent('Teléfono: 0414-5550101');
    expect(screen.getByTestId('payment-instructions-missing')).toHaveTextContent(
      '«Transferencia»: no se mostrará en el enlace hasta que tenga datos para pagar.',
    );
  });

  it('añade datos para una sede: sin ningún dato no se envía; luego guarda solo lo escrito', async () => {
    const user = setupUser();
    mockedSave.mockResolvedValue(instruction({ id: 'pmi-2', locationId: 'loc-1', holderName: 'Ana Pérez' }));
    render(<PaymentInstructionsSection token="tok" methods={[mobile]} canEdit />);
    await screen.findByRole('table', { name: 'Datos para pagar' });
    await user.click(screen.getByRole('button', { name: 'Añadir datos para pagar' }));
    const dialog = await screen.findByRole('dialog');
    // «Toda la clínica» ya tiene datos: solo quedan las sedes.
    const scope = within(dialog).getByLabelText('Para');
    expect(within(scope).getAllByRole('option').map((o) => o.textContent)).toEqual(['Sede Chacao', 'Sede Valencia']);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar datos' }));
    expect(await within(dialog).findByText('Escribe al menos un dato para pagar.')).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Titular'), 'Ana Pérez');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar datos' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', 'pm-mobile', {
        locationId: 'loc-1',
        holderName: 'Ana Pérez',
        holderId: null,
        bankName: null,
        accountNumber: null,
        phone: null,
        email: null,
        note: null,
      }),
    );
    expect(await screen.findByText('Sede Chacao')).toBeInTheDocument();
  });

  it('las etiquetas son neutras: ningún banco, documento ni país', async () => {
    const user = setupUser();
    render(<PaymentInstructionsSection token="tok" methods={[transfer]} canEdit />);
    await screen.findByText('Ningún medio tiene datos para pagar.');
    await user.click(screen.getByRole('button', { name: 'Añadir datos para pagar' }));
    const dialog = await screen.findByRole('dialog');
    const labels = Array.from(dialog.querySelectorAll('label')).map((l) => l.textContent);
    expect(labels).toEqual([
      'Medio de pago',
      'Para',
      'Titular',
      'Identificación del titular',
      'Banco o entidad',
      'Número de cuenta',
      'Teléfono',
      'Correo',
      'Nota para el paciente',
    ]);
  });

  it('un error de la API se ve en el formulario', async () => {
    const user = setupUser();
    mockedSave.mockRejectedValue(new ApiError(400, 'Los datos no pueden llevar saltos de línea.'));
    render(<PaymentInstructionsSection token="tok" methods={[transfer]} canEdit />);
    await screen.findByText('Ningún medio tiene datos para pagar.');
    await user.click(screen.getByRole('button', { name: 'Añadir datos para pagar' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Número de cuenta'), '0102-0000-00-0000000000');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar datos' }));
    expect(await within(dialog).findByText('Los datos no pueden llevar saltos de línea.')).toBeInTheDocument();
  });

  it('elimina unos datos tras confirmarlo', async () => {
    const user = setupUser();
    mockedDelete.mockResolvedValue(undefined);
    render(<PaymentInstructionsSection token="tok" methods={[mobile]} canEdit />);
    await screen.findByRole('table', { name: 'Datos para pagar' });
    await user.click(screen.getByRole('button', { name: /Acciones de Pago móvil/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'pm-mobile', 'pmi-1'));
    expect(await screen.findByText('Ningún medio tiene datos para pagar.')).toBeInTheDocument();
  });

  it('sin escritura: se ven, sin añadir ni acciones', async () => {
    render(<PaymentInstructionsSection token="tok" methods={[mobile]} canEdit={false} />);
    await screen.findByRole('table', { name: 'Datos para pagar' });
    expect(screen.queryByRole('button', { name: 'Añadir datos para pagar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });

  it('si no cargan: error de sección con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<PaymentInstructionsSection token="tok" methods={[mobile]} canEdit />);
    expect(await screen.findByText(/No pudimos cargar los datos para pagar|boom/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('table', { name: 'Datos para pagar' })).toBeInTheDocument();
  });
});
