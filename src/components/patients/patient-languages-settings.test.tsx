import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientLanguagesSettingsSection } from './patient-languages-settings';
import { getPatientLanguages, savePatientLanguages } from '@/lib/patients/patient-languages';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../../lib/patients/patient-languages', () => ({
  ...jest.requireActual('../../lib/patients/patient-languages'),
  getPatientLanguages: jest.fn(),
  savePatientLanguages: jest.fn(),
}));
const mockedGet = getPatientLanguages as jest.MockedFunction<typeof getPatientLanguages>;
const mockedSave = savePatientLanguages as jest.MockedFunction<typeof savePatientLanguages>;

describe('PatientLanguagesSettingsSection (DX-497)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
  });

  it('una clínica nueva: solo el idioma de la clínica, sin «Quitar»', async () => {
    mockedGet.mockResolvedValue({ languages: ['es'], clinicLanguage: 'es' });
    render(<PatientLanguagesSettingsSection token="tok" allowed />);
    const list = await screen.findByTestId('patient-languages');
    expect(within(list).getByText('Español (es)')).toBeInTheDocument();
    expect(within(list).getByText('Idioma de la clínica')).toBeInTheDocument();
    expect(within(list).queryByRole('button')).not.toBeInTheDocument();
  });

  it('el ADMIN añade English (en) y Català (ca)', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ languages: ['es'], clinicLanguage: 'es' });
    mockedSave
      .mockResolvedValueOnce({ languages: ['es', 'en'], clinicLanguage: 'es' })
      .mockResolvedValueOnce({ languages: ['es', 'en', 'ca'], clinicLanguage: 'es' });
    render(<PatientLanguagesSettingsSection token="tok" allowed />);

    await user.click(await screen.findByRole('button', { name: 'Añadir idioma' }));
    let dialog = await screen.findByRole('dialog', { name: 'Añadir un idioma' });
    await user.type(within(dialog).getByLabelText('Código del idioma'), 'EN');
    expect(within(dialog).getByText('Se verá como: English (en)')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', ['es', 'en']));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('English (en) añadido.');

    await user.click(screen.getByRole('button', { name: 'Añadir idioma' }));
    dialog = await screen.findByRole('dialog', { name: 'Añadir un idioma' });
    await user.type(within(dialog).getByLabelText('Código del idioma'), 'ca');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(mockedSave).toHaveBeenLastCalledWith('tok', ['es', 'en', 'ca']));
    const list = screen.getByTestId('patient-languages');
    expect(within(list).getByText('Català (ca)')).toBeInTheDocument();
    // Sin traducción del catálogo: el aviso lo dice.
    expect(within(list).getByText('Sin traducción: le llega en el idioma de la clínica.')).toBeInTheDocument();
  });

  it('un código no válido o repetido no se envía', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ languages: ['es', 'en'], clinicLanguage: 'es' });
    render(<PatientLanguagesSettingsSection token="tok" allowed />);
    await user.click(await screen.findByRole('button', { name: 'Añadir idioma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Añadir un idioma' });
    const field = within(dialog).getByLabelText('Código del idioma');
    await user.type(field, 'inglés');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));
    expect(within(dialog).getByText(/no es un idioma válido/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'en');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));
    expect(within(dialog).getByText('Ese idioma ya está en la lista.')).toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('quitar un idioma avisa de que los pacientes lo conservan', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ languages: ['es', 'en', 'ca'], clinicLanguage: 'es' });
    mockedSave.mockResolvedValue({ languages: ['es', 'en'], clinicLanguage: 'es' });
    render(<PatientLanguagesSettingsSection token="tok" allowed />);
    await user.click(await screen.findByRole('button', { name: 'Quitar Català (ca)' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Quitar Català (ca)?' });
    expect(dialog).toHaveTextContent('Los pacientes que lo tienen lo conservan');
    await user.click(within(dialog).getByRole('button', { name: 'Quitar idioma' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', ['es', 'en']));
    await waitFor(() => expect(screen.queryByText('Català (ca)')).not.toBeInTheDocument());
  });

  it('un error al guardar se muestra en el diálogo', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ languages: ['es'], clinicLanguage: 'es' });
    mockedSave.mockRejectedValue(new ApiError(500, 'boom'));
    render(<PatientLanguagesSettingsSection token="tok" allowed />);
    await user.click(await screen.findByRole('button', { name: 'Añadir idioma' }));
    const dialog = await screen.findByRole('dialog', { name: 'Añadir un idioma' });
    await user.type(within(dialog).getByLabelText('Código del idioma'), 'en');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir' }));
    expect(await within(dialog).findByText('No pudimos guardar los idiomas. Intenta de nuevo.')).toBeInTheDocument();
  });

  it('sin permiso no carga nada y explica quién lo cambia', () => {
    render(<PatientLanguagesSettingsSection token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia los idiomas de los pacientes.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
