import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MajorityAgeSettingsSection } from './majority-age-settings';
import { getPatientSettings, savePatientSettings } from '@/lib/patients/patient-settings-api';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../../lib/patients/patient-settings-api', () => ({
  ...jest.requireActual('../../lib/patients/patient-settings-api'),
  getPatientSettings: jest.fn(),
  savePatientSettings: jest.fn(),
}));
const mockedGet = getPatientSettings as jest.MockedFunction<typeof getPatientSettings>;
const mockedSave = savePatientSettings as jest.MockedFunction<typeof savePatientSettings>;

const API_MESSAGE = 'La mayoría de edad tiene que ser un número entero de años entre 14 y 21.';

describe('MajorityAgeSettingsSection (DX-328)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
  });

  it('majority age settings shows the value, saves the chosen age and shows the API message on 400', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ majorityAge: 18 });
    mockedSave.mockResolvedValueOnce({ majorityAge: 16 });
    render(<MajorityAgeSettingsSection token="tok" allowed />);
    expect(await screen.findByTestId('majority-age')).toHaveTextContent('18 años');

    await user.click(screen.getByRole('button', { name: 'Cambiar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cambiar la mayoría de edad' });
    await user.selectOptions(screen.getByLabelText('Edad'), '16 años');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { majorityAge: 16 }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByTestId('majority-age')).toHaveTextContent('16 años');
    expect(screen.getByRole('status')).toHaveTextContent('Mayoría de edad guardada.');

    mockedSave.mockRejectedValueOnce(new ApiError(400, API_MESSAGE));
    await user.click(screen.getByRole('button', { name: 'Cambiar' }));
    await screen.findByRole('dialog');
    await user.selectOptions(screen.getByLabelText('Edad'), '21 años');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(API_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('majority-age')).toHaveTextContent('16 años');
  });

  it('non-admin sees the locked state', () => {
    render(<MajorityAgeSettingsSection token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia la mayoría de edad.')).toBeInTheDocument();
    expect(
      screen.getByText('La ficha de cada paciente dice si es menor y a quién van sus avisos.'),
    ).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('a 404 from an older API shows the section error with retry', async () => {
    const user = userEvent.setup();
    mockedGet
      .mockRejectedValueOnce(new ApiError(404, 'Cannot GET /patients/settings'))
      .mockResolvedValueOnce({ majorityAge: 18 });
    render(<MajorityAgeSettingsSection token="tok" allowed />);
    expect(await screen.findByText('No pudimos cargar la mayoría de edad.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByTestId('majority-age')).toHaveTextContent('18 años');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
