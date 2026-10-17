import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiscountPolicyManager } from './discount-policy-manager';
import { getDiscountPolicy, updateDiscountPolicy, type DiscountPolicy } from '@/lib/discounts/discounts-api';

jest.mock('../../lib/discounts/discounts-api', () => ({
  getDiscountPolicy: jest.fn(),
  updateDiscountPolicy: jest.fn(),
}));
const mockedGet = getDiscountPolicy as jest.MockedFunction<typeof getDiscountPolicy>;
const mockedUpdate = updateDiscountPolicy as jest.MockedFunction<typeof updateDiscountPolicy>;

const DEFAULT: DiscountPolicy = {
  maxPercentByRole: { ADMIN: 100, DENTIST: 10, ASSISTANT: 0, RECEPTION: 0 },
  reasonRequiredAbovePercent: 10,
  isDefault: true,
  updatedAt: null,
  updatedById: null,
};

describe('DiscountPolicyManager (DX-204)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedUpdate.mockReset();
  });

  it('sin permiso: el aviso, sin pedir nada a la API', () => {
    render(<DiscountPolicyManager token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia los topes de descuento.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('muestra el tope de cada rol y el umbral del motivo', async () => {
    mockedGet.mockResolvedValue(DEFAULT);
    render(<DiscountPolicyManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Tope de descuento por rol' });
    expect(within(table).getByText('Odontólogo')).toBeInTheDocument();
    expect(within(table).getByText('10 %')).toBeInTheDocument();
    expect(screen.getByText('Motivo obligatorio por encima del 10 %.')).toBeInTheDocument();
    expect(screen.getByText('Valores por defecto')).toBeInTheDocument();
  });

  it('edita los topes en un modal, valida 0..100 y guarda', async () => {
    mockedGet.mockResolvedValue(DEFAULT);
    mockedUpdate.mockResolvedValue({
      ...DEFAULT,
      maxPercentByRole: { ...DEFAULT.maxPercentByRole, DENTIST: 20 },
      isDefault: false,
      updatedAt: '2026-10-17T15:00:00.000Z',
    });
    render(<DiscountPolicyManager token="tok" allowed />);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar topes' }));
    const dialog = screen.getByRole('dialog');
    const dentist = within(dialog).getByLabelText('Tope de odontólogo (%)');
    await userEvent.clear(dentist);
    await userEvent.type(dentist, '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Escribe un número entero entre 0 y 100.')).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();

    await userEvent.clear(dentist);
    await userEvent.type(dentist, '20');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', {
        maxPercentByRole: { ADMIN: 100, DENTIST: 20, ASSISTANT: 0, RECEPTION: 0 },
        reasonRequiredAbovePercent: 10,
      }),
    );
    expect(await screen.findByText('20 %', { selector: 'td' })).toBeInTheDocument();
  });
});
