import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { LicenseWarningSettingSection } from './license-warning-setting';
import {
  getClinicalEntrySettings,
  updateClinicalEntrySettings,
} from '@/lib/patients/clinical-api';
import { notifyError } from '@/components/errors/notify';

jest.mock('../../lib/patients/clinical-api', () => ({
  ...jest.requireActual('../../lib/patients/clinical-api'),
  getClinicalEntrySettings: jest.fn(),
  updateClinicalEntrySettings: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));
const mockedGet = getClinicalEntrySettings as jest.MockedFunction<typeof getClinicalEntrySettings>;
const mockedSave = updateClinicalEntrySettings as jest.MockedFunction<typeof updateClinicalEntrySettings>;

describe('LicenseWarningSettingSection (DX-540)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
    (toast.success as jest.Mock).mockClear();
    (notifyError as jest.Mock).mockClear();
  });

  it('sin permiso: lo explica y no pide nada', () => {
    render(<LicenseWarningSettingSection token="tok" allowed={false} />);
    expect(screen.getByText(/solo administración cambia este aviso/i)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('ADMIN lo activa con el interruptor: se aplica al momento y lo confirma', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ warnMissingProfessionalLicense: false });
    mockedSave.mockResolvedValue({ warnMissingProfessionalLicense: true });
    render(<LicenseWarningSettingSection token="tok" allowed />);

    const toggle = await screen.findByRole('switch', {
      name: /avisar al firmar una evolución sin registro profesional/i,
    });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/no impide guardar/i);
    await user.click(toggle);

    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { warnMissingProfessionalLicense: true }),
    );
    await waitFor(() => expect(toggle).toBeChecked());
    expect(toast.success).toHaveBeenCalledWith('Aviso de registro profesional activado.');
  });

  it('si no se puede guardar: vuelve a su valor y avisa con reintento', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ warnMissingProfessionalLicense: true });
    mockedSave.mockRejectedValue(new Error('x'));
    render(<LicenseWarningSettingSection token="tok" allowed />);
    const toggle = await screen.findByRole('switch');
    await user.click(toggle);
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(toggle).toBeChecked();
    expect((notifyError as jest.Mock).mock.calls[0][1]).toEqual({ onRetry: expect.any(Function) });
  });

  it('si no carga, error en su sitio con reintento', async () => {
    const user = userEvent.setup();
    mockedGet
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ warnMissingProfessionalLicense: true });
    render(<LicenseWarningSettingSection token="tok" allowed />);
    await user.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('switch')).toBeChecked();
  });
});
