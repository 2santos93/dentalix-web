import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashSettingsForm } from './cash-settings-form';
import { getCashSettings, saveCashSettings } from '@/lib/cash-sessions/cash-sessions-api';

jest.mock('../../lib/cash-sessions/cash-sessions-api', () => ({
  ...jest.requireActual('../../lib/cash-sessions/cash-sessions-api'),
  getCashSettings: jest.fn(),
  saveCashSettings: jest.fn(),
}));
const mockedGet = getCashSettings as jest.MockedFunction<typeof getCashSettings>;
const mockedSave = saveCashSettings as jest.MockedFunction<typeof saveCashSettings>;

describe('CashSettingsForm (DX-027)', () => {
  beforeEach(() => jest.clearAllMocks());
  it('nace desactivado y cada interruptor se guarda al momento (sin botón «Guardar»)', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ requireOpenSession: false, blindClose: false });
    mockedSave.mockImplementation(async (_t, s) => s);
    render(<CashSettingsForm token="tok" allowed />);
    const require = await screen.findByRole('switch', { name: 'Exigir caja abierta' });
    expect(require).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    await user.click(require);
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { requireOpenSession: true, blindClose: false }),
    );
    expect(await screen.findByText('Ajustes de caja guardados.')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Arqueo ciego' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenLastCalledWith('tok', { requireOpenSession: true, blindClose: true }),
    );
  });

  it('si no se guarda, el interruptor vuelve a su sitio y lo dice', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ requireOpenSession: false, blindClose: false });
    mockedSave.mockRejectedValue(new Error('red'));
    render(<CashSettingsForm token="tok" allowed />);
    const blind = await screen.findByRole('switch', { name: 'Arqueo ciego' });
    await user.click(blind);
    expect(await screen.findByText('No pudimos guardar los ajustes de caja. Intenta de nuevo.')).toBeInTheDocument();
    expect(blind).not.toBeChecked();
  });

  it('recepción ve el aviso sin pedir nada', () => {
    render(<CashSettingsForm token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia los ajustes de caja.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('DX-395: en táctil cada fila es el objetivo (toda la fila es la etiqueta del interruptor)', async () => {
    mockedGet.mockResolvedValue({ requireOpenSession: false, blindClose: true });
    render(<CashSettingsForm token="tok" allowed />);
    for (const name of ['Exigir caja abierta', 'Arqueo ciego']) {
      const toggle = await screen.findByRole('switch', { name });
      const row = toggle.closest('label');
      expect(row).not.toBeNull();
      expect(row!.className).toContain('py-4');
    }
  });
});
