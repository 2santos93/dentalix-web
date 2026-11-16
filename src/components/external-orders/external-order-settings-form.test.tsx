import { render, screen, waitFor } from '@testing-library/react';
import { ExternalOrderSettingsForm } from './external-order-settings-form';
import { getExternalOrderSettings, saveExternalOrderSettings } from '@/lib/external-orders/external-orders-api';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  getExternalOrderSettings: jest.fn(),
  saveExternalOrderSettings: jest.fn(),
}));

const LABEL = 'Días para considerar vencida una orden sin resultado';

describe('ExternalOrderSettingsForm (DX-572)', () => {
  beforeEach(() => {
    jest.mocked(getExternalOrderSettings).mockReset().mockResolvedValue({ overdueDays: 15 });
    jest.mocked(saveExternalOrderSettings).mockReset();
  });

  it('carga el plazo y guarda uno válido; fuera de 1–365 no se envía', async () => {
    const user = setupUser();
    jest.mocked(saveExternalOrderSettings).mockResolvedValue({ overdueDays: 30 });
    render(<ExternalOrderSettingsForm token="tok" />);
    const input = await screen.findByLabelText(LABEL, { exact: true });
    expect(input).toHaveValue('15');
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '400');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe un número entero de días entre 1 y 365.')).toBeInTheDocument();
    expect(saveExternalOrderSettings).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, '30');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveExternalOrderSettings).toHaveBeenCalledWith('tok', { overdueDays: 30 }));
    expect(await screen.findByText('Plazo de las órdenes guardado.')).toBeInTheDocument();
  });
});
