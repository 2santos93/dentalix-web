import { render, screen, waitFor } from '@testing-library/react';
import { CertificateSettingsForm } from './certificate-settings-form';
import { getCertificateSettings, saveCertificateSettings } from '@/lib/certificates/certificates-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/certificates/certificates-api', () => ({
  ...jest.requireActual('../../lib/certificates/certificates-api'),
  getCertificateSettings: jest.fn(),
  saveCertificateSettings: jest.fn(),
}));
const mockedGet = getCertificateSettings as jest.MockedFunction<typeof getCertificateSettings>;
const mockedSave = saveCertificateSettings as jest.MockedFunction<typeof saveCertificateSettings>;

const maxDays = () => screen.getByRole('textbox', { name: 'Máximo de días de reposo' });
const diagnosis = () => screen.getByRole('checkbox', { name: 'Imprimir el diagnóstico en el reposo' });

async function renderLoaded() {
  mockedGet.mockResolvedValue({ restMaxDays: 30, restPrintDiagnosis: false });
  const user = setupUser();
  render(<CertificateSettingsForm token="tok" />);
  await screen.findByRole('textbox', { name: 'Máximo de días de reposo' });
  return user;
}

describe('CertificateSettingsForm (DX-306)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pinta los valores de la API, sin barra de guardado hasta que algo cambia', async () => {
    const user = await renderLoaded();
    expect(maxDays()).toHaveValue('30');
    expect(maxDays()).toHaveAttribute('inputmode', 'numeric');
    expect(diagnosis()).not.toBeChecked();
    expect(diagnosis()).toHaveAccessibleDescription(/El justificante de asistencia nunca lo lleva/);
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
    await user.click(diagnosis());
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('valida el máximo (1–365) junto al campo y no envía', async () => {
    const user = await renderLoaded();
    await user.clear(maxDays());
    await user.type(maxDays(), '400');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe un número entero de días entre 1 y 365.')).toBeInTheDocument();
    expect(maxDays()).toHaveAttribute('aria-invalid', 'true');
    expect(maxDays()).toHaveFocus();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('guarda y lo confirma', async () => {
    const user = await renderLoaded();
    mockedSave.mockResolvedValue({ restMaxDays: 7, restPrintDiagnosis: true });
    await user.clear(maxDays());
    await user.type(maxDays(), '7');
    await user.click(diagnosis());
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { restMaxDays: 7, restPrintDiagnosis: true }));
    expect(await screen.findByText('Ajustes de los certificados guardados.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('fallo de carga: escalón 1 con reintento', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'x')).mockResolvedValueOnce({ restMaxDays: 30, restPrintDiagnosis: false });
    render(<CertificateSettingsForm token="tok" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los ajustes de los certificados.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('textbox', { name: 'Máximo de días de reposo' })).toBeInTheDocument();
  });
});
