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
  it('nace desactivado y guarda «exigir caja abierta» y «arqueo ciego»', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ requireOpenSession: false, blindClose: false });
    mockedSave.mockImplementation(async (_t, s) => s);
    render(<CashSettingsForm token="tok" allowed />);
    const require = await screen.findByRole('switch', { name: 'Exigir caja abierta' });
    expect(require).toHaveAttribute('aria-checked', 'false');
    await user.click(require);
    await user.click(screen.getByRole('switch', { name: 'Arqueo ciego' }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { requireOpenSession: true, blindClose: true }),
    );
    expect(await screen.findByText('Ajustes de caja guardados.')).toBeInTheDocument();
  });

  it('recepción ve el aviso sin pedir nada', () => {
    render(<CashSettingsForm token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia los ajustes de caja.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('DX-395: a 390 px los interruptores y «Guardar» miden al menos 44 px', async () => {
    mockedGet.mockResolvedValue({ requireOpenSession: false, blindClose: true });
    render(<CashSettingsForm token="tok" allowed />);
    // jsdom no mide: se comprueba la altura táctil por debajo de sm.
    for (const name of ['Exigir caja abierta', 'Arqueo ciego']) {
      const toggle = await screen.findByRole('switch', { name });
      expect(toggle.className).toContain('max-sm:h-11');
      expect(toggle.className).toContain('max-sm:min-w-11');
    }
    expect(screen.getByRole('button', { name: 'Guardar' }).className).toContain('max-sm:h-11');
  });
});
