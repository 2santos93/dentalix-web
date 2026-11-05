import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditPolicyForm } from './credit-policy-form';
import { getCreditPolicy, saveCreditPolicy } from '@/lib/patient-credit/patient-credit-api';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../lib/patient-credit/patient-credit-api', () => ({
  ...jest.requireActual('../../lib/patient-credit/patient-credit-api'),
  getCreditPolicy: jest.fn(),
  saveCreditPolicy: jest.fn(),
}));
const mockedGet = jest.mocked(getCreditPolicy);
const mockedSave = jest.mocked(saveCreditPolicy);
const bar = () => screen.queryByRole('region', { name: 'Cambios sin guardar' });

beforeEach(() => jest.clearAllMocks());

describe('Ajustes › Caja › Saldo a favor: tope de recepción (DX-432)', () => {
  it('el campo dice que el tope es por día y en cada moneda, y qué significa 0', async () => {
    mockedGet.mockResolvedValue({ receptionMaxAmount: 150000.5 });
    render(<CreditPolicyForm token="tok" />);
    const field = await screen.findByLabelText('Tope de recepción por día (en cada moneda)');
    expect(field).toHaveValue('150000,5');
    expect(field).toHaveAccessibleDescription(/0 = recepción no puede traspasar ni devolver; el administrador siempre puede/);
    expect(bar()).not.toBeInTheDocument();
  });

  it('guardar manda el número leído con la regla del importe; la barra desaparece y avisa', async () => {
    mockedGet.mockResolvedValue({ receptionMaxAmount: 0 });
    mockedSave.mockResolvedValue({ receptionMaxAmount: 25000.5 });
    const user = userEvent.setup();
    render(<CreditPolicyForm token="tok" />);
    const field = await screen.findByLabelText('Tope de recepción por día (en cada moneda)');
    await user.clear(field);
    await user.type(field, '25.000,50');
    expect(bar()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar el tope de recepción' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', 25000.5));
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('Tope de recepción guardado.');
  });

  it('0 es un valor válido (recepción no mueve saldo)', async () => {
    mockedGet.mockResolvedValue({ receptionMaxAmount: 500 });
    mockedSave.mockResolvedValue({ receptionMaxAmount: 0 });
    const user = userEvent.setup();
    render(<CreditPolicyForm token="tok" />);
    const field = await screen.findByLabelText('Tope de recepción por día (en cada moneda)');
    await user.clear(field);
    await user.type(field, '0');
    await user.click(screen.getByRole('button', { name: 'Guardar el tope de recepción' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', 0));
  });

  it('un texto ambiguo no se envía y el campo dice por qué', async () => {
    mockedGet.mockResolvedValue({ receptionMaxAmount: 0 });
    const user = userEvent.setup();
    render(<CreditPolicyForm token="tok" />);
    const field = await screen.findByLabelText('Tope de recepción por día (en cada moneda)');
    await user.clear(field);
    await user.type(field, '1.50.0');
    await user.click(screen.getByRole('button', { name: 'Guardar el tope de recepción' }));
    expect(await screen.findByText(/No sabemos leer/)).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('un 403 de la API se dice dentro de la barra, sin perder lo escrito', async () => {
    mockedGet.mockResolvedValue({ receptionMaxAmount: 0 });
    mockedSave.mockRejectedValue(new ApiError(403, 'Forbidden', { messages: ['Solo la administración cambia el tope de saldo a favor de recepción.'] }));
    const user = userEvent.setup();
    render(<CreditPolicyForm token="tok" />);
    const field = await screen.findByLabelText('Tope de recepción por día (en cada moneda)');
    await user.clear(field);
    await user.type(field, '10');
    await user.click(screen.getByRole('button', { name: 'Guardar el tope de recepción' }));
    expect(await screen.findByText(/Solo la administración cambia el tope/)).toBeInTheDocument();
    expect(field).toHaveValue('10');
  });

  it('error al cargar: escalón 1 con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ receptionMaxAmount: 7 });
    const user = userEvent.setup();
    render(<CreditPolicyForm token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Tope de recepción por día (en cada moneda)')).toHaveValue('7');
  });
});
