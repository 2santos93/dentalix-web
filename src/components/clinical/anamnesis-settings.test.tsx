import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnamnesisSettingsSection } from './anamnesis-settings';
import { getAnamnesisSettings, saveAnamnesisSettings } from '@/lib/clinical/medical-alerts';

jest.mock('../../lib/clinical/medical-alerts', () => ({
  ...jest.requireActual('../../lib/clinical/medical-alerts'),
  getAnamnesisSettings: jest.fn(),
  saveAnamnesisSettings: jest.fn(),
}));
const mockedGet = getAnamnesisSettings as jest.MockedFunction<typeof getAnamnesisSettings>;
const mockedSave = saveAnamnesisSettings as jest.MockedFunction<typeof saveAnamnesisSettings>;

describe('AnamnesisSettingsSection (DX-247)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
  });

  it('sin permiso: lo explica y no pide nada', () => {
    render(<AnamnesisSettingsSection token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia la vigencia de la anamnesis.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('ADMIN la cambia en un modal y se ve al cerrar', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ anamnesisValidityMonths: 12 });
    mockedSave.mockResolvedValue({ anamnesisValidityMonths: 6 });
    render(<AnamnesisSettingsSection token="tok" allowed />);
    expect(await screen.findByTestId('anamnesis-validity')).toHaveTextContent('12 meses');
    // El valor de fábrica lleva el chip neutro «Por defecto» (SettingRow, B6).
    expect(screen.getByText('Por defecto')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cambiar' }));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(screen.getByLabelText('Meses de vigencia'), '6');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { anamnesisValidityMonths: 6 }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByTestId('anamnesis-validity')).toHaveTextContent('6 meses');
    expect(screen.queryByText('Por defecto')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Vigencia de la anamnesis guardada.');
  });

  it('si no carga, error de sección con reintento', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ anamnesisValidityMonths: 18 });
    render(<AnamnesisSettingsSection token="tok" allowed />);
    await user.click(await screen.findByRole('button', { name: /reintentar/i }));
    expect(await screen.findByTestId('anamnesis-validity')).toHaveTextContent('18 meses');
  });
});
