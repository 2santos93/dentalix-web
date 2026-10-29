import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrescriptionSettingsForm } from './prescription-settings-form';
import {
  getPrescriptionSettings,
  savePrescriptionSettings,
  PRESCRIPTION_VALIDITY_DAYS_MESSAGE,
  type PrescriptionSettings,
} from '@/lib/prescriptions/prescriptions-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/prescriptions/prescriptions-api', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescriptions-api'),
  getPrescriptionSettings: jest.fn(),
  savePrescriptionSettings: jest.fn(),
}));
const mockedGet = getPrescriptionSettings as jest.MockedFunction<typeof getPrescriptionSettings>;
const mockedSave = savePrescriptionSettings as jest.MockedFunction<typeof savePrescriptionSettings>;

const API_SETTINGS: PrescriptionSettings = {
  printQuantityInWords: true,
  requireClinicalRecordNumber: false,
  validityDays: 30,
};

async function renderLoaded(settings: PrescriptionSettings = API_SETTINGS) {
  mockedGet.mockResolvedValue(settings);
  const user = userEvent.setup();
  render(<PrescriptionSettingsForm token="tok" />);
  await screen.findByRole('switch', { name: 'Cantidad en letras' });
  return user;
}

const save = () => screen.getByRole('button', { name: 'Guardar' });
const validity = () => screen.getByRole('textbox', { name: 'Validez (días)' });

describe('PrescriptionSettingsForm (DX-324)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the two switches and the validity with the API values', async () => {
    await renderLoaded();
    expect(mockedGet).toHaveBeenCalledWith('tok');
    const words = screen.getByRole('switch', { name: 'Cantidad en letras' });
    expect(words).toHaveAttribute('aria-checked', 'true');
    expect(words).toHaveAccessibleDescription(
      'Cada medicamento lleva también la cantidad escrita, p. ej. «21 (veintiuno) cápsulas».',
    );
    const record = screen.getByRole('switch', { name: 'Exigir el nº de historia clínica' });
    expect(record).toHaveAttribute('aria-checked', 'false');
    expect(record).toHaveAccessibleDescription(
      'No se emite la receta si el paciente no tiene documento registrado; la receta lo imprime como nº de historia clínica.',
    );
    expect(validity()).toHaveValue('30');
    expect(validity()).toHaveAttribute('inputmode', 'numeric');
    expect(validity()).toHaveAccessibleDescription('Desde la fecha de inicio. Una clínica nueva empieza con 30 días.');
  });

  it('save is disabled until something changes', async () => {
    const user = await renderLoaded();
    expect(save()).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    expect(save()).toBeEnabled();
    // Volver al valor de la API lo deja otra vez sin cambios.
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    expect(save()).toBeDisabled();
    await user.clear(validity());
    await user.type(validity(), '30');
    expect(save()).toBeDisabled();
    await user.type(validity(), '1');
    expect(save()).toBeEnabled();
  });

  it('saves exactly { printQuantityInWords, requireClinicalRecordNumber, validityDays } and announces «Ajustes de la receta guardados.»', async () => {
    const user = await renderLoaded();
    const saved = { printQuantityInWords: false, requireClinicalRecordNumber: true, validityDays: 10 };
    mockedSave.mockResolvedValue(saved);
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    await user.click(screen.getByRole('switch', { name: 'Exigir el nº de historia clínica' }));
    await user.clear(validity());
    await user.type(validity(), '10');
    await user.click(save());
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', saved));
    expect(Object.keys(mockedSave.mock.calls[0][1]).sort()).toEqual([
      'printQuantityInWords',
      'requireClinicalRecordNumber',
      'validityDays',
    ]);
    expect(await screen.findByRole('status')).toHaveTextContent('Ajustes de la receta guardados.');
    // Lo guardado es la nueva base: sin cambios otra vez.
    expect(save()).toBeDisabled();
    expect(validity()).toHaveValue('10');
  });

  it('after a save, focus goes to the saved notice, not to <body> (Guardar is disabled)', async () => {
    const user = await renderLoaded();
    mockedSave.mockImplementation(async (_t, s) => s);
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    await user.click(save());
    const notice = await screen.findByText('Ajustes de la receta guardados.');
    await waitFor(() => expect(notice).toHaveFocus());
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveAttribute('tabindex', '-1');
    expect(save()).toBeDisabled();
    expect(document.body).not.toHaveFocus();
  });

  it.each([
    ['the words switch', (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }))],
    ['the record switch', (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByRole('switch', { name: 'Exigir el nº de historia clínica' }))],
    ['the validity', (user: ReturnType<typeof userEvent.setup>) => user.type(validity(), '0')],
  ])('editing %s again clears the saved notice', async (_name, edit) => {
    const user = await renderLoaded();
    mockedSave.mockImplementation(async (_t, s) => s);
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    await user.click(save());
    expect(await screen.findByText('Ajustes de la receta guardados.')).toBeInTheDocument();
    await edit(user);
    expect(screen.queryByText('Ajustes de la receta guardados.')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it.each([1, 365])('validity %i saves (M4)', async (days) => {
    const user = await renderLoaded();
    mockedSave.mockImplementation(async (_t, s) => s);
    await user.clear(validity());
    await user.type(validity(), String(days));
    await user.click(save());
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { ...API_SETTINGS, validityDays: days }),
    );
    expect(screen.queryByText(PRESCRIPTION_VALIDITY_DAYS_MESSAGE)).not.toBeInTheDocument();
  });

  it.each(['0', '366', '2.5', ''])(
    'validity «%s» shows PRESCRIPTION_VALIDITY_DAYS_MESSAGE and does not call the API',
    async (typed) => {
      const user = await renderLoaded();
      await user.clear(validity());
      if (typed) await user.type(validity(), typed);
      await user.click(save());
      const error = await screen.findByText(PRESCRIPTION_VALIDITY_DAYS_MESSAGE);
      expect(error).toHaveTextContent(
        'La validez de la receta tiene que ser un número entero de días entre 1 y 365.',
      );
      expect(validity()).toHaveAttribute('aria-invalid', 'true');
      expect(validity()).toHaveAccessibleDescription(PRESCRIPTION_VALIDITY_DAYS_MESSAGE);
      expect(error.closest('[role="alert"]')).not.toBeNull();
      // El foco va al campo que hay que corregir, no se queda en «Guardar».
      expect(validity()).toHaveFocus();
      expect(mockedSave).not.toHaveBeenCalled();
    },
  );

  it('a 400 from the API shows its message in an InlineError', async () => {
    const user = await renderLoaded();
    mockedSave.mockRejectedValueOnce(new ApiError(400, PRESCRIPTION_VALIDITY_DAYS_MESSAGE));
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    await user.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(PRESCRIPTION_VALIDITY_DAYS_MESSAGE);
  });

  it('a 400 with the class-validator array shows its Spanish messages', async () => {
    const user = await renderLoaded();
    const msg = 'Indica sí o no en «cantidad en letras».';
    mockedSave.mockRejectedValueOnce(new ApiError(400, 'Bad Request', { messages: [msg] }));
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    await user.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(msg);
  });

  it('a 403 from the API shows its message', async () => {
    const user = await renderLoaded();
    const msg = 'Solo un administrador puede cambiar los ajustes de la receta.';
    mockedSave.mockRejectedValueOnce(new ApiError(403, msg));
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    await user.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(msg);
  });

  it('a 5xx on save shows the screen message, never the server text', async () => {
    const user = await renderLoaded();
    mockedSave.mockRejectedValueOnce(new ApiError(500, 'Internal server error'));
    await user.click(screen.getByRole('switch', { name: 'Cantidad en letras' }));
    await user.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos guardar los ajustes de la receta. Intenta de nuevo.',
    );
  });

  it('load failure is a SectionError with retry that reloads', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(API_SETTINGS);
    const user = userEvent.setup();
    render(<PrescriptionSettingsForm token="tok" />);
    expect(await screen.findByText('No pudimos cargar los ajustes de la receta.')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('switch', { name: 'Cantidad en letras' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('a 404 on load (API without the route) says what did not load', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'Not Found'));
    render(<PrescriptionSettingsForm token="tok" />);
    expect(await screen.findByText('No pudimos cargar los ajustes de la receta.')).toBeInTheDocument();
  });

  it('exactly one primary button', async () => {
    await renderLoaded();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(save()).toHaveAttribute('type', 'submit');
  });
});
