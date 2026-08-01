import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedicalHistoryPanel } from './medical-history-panel';
import { getMedicalHistory, saveMedicalHistory } from '@/lib/patients/clinical-api';
import type { MedicalHistory, SafetyFlags } from '@/lib/patients/clinical-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching @/lib/patients/clinical-api's actual location (same
// convention as patient-form.test.tsx).
jest.mock('../../lib/patients/clinical-api', () => ({
  getMedicalHistory: jest.fn(),
  saveMedicalHistory: jest.fn(),
}));

const mockedGet = getMedicalHistory as jest.MockedFunction<typeof getMedicalHistory>;
const mockedSave = saveMedicalHistory as jest.MockedFunction<typeof saveMedicalHistory>;

const noFlags: SafetyFlags = {
  embarazo: false,
  anticoagulantes: false,
  bifosfonatos: false,
  diabetes: false,
  profilaxisAntibiotica: false,
  alergiaAnestesico: false,
  alergiaPenicilina: false,
  alergiaLatex: false,
};

function history(overrides: Partial<MedicalHistory> = {}): MedicalHistory {
  return {
    id: 'mh-1',
    tenantId: 't1',
    patientId: 'p1',
    version: 2,
    allergies: [
      {
        alergeno: 'Penicilina',
        tipo: 'MEDICAMENTO',
        severidad: 'ANAFILAXIA',
        reaccion: 'Edema',
        esAlerta: true,
      },
    ],
    conditions: [
      { codigo: 'HIPERTENSION', etiqueta: 'Hipertensión', estado: 'SI', esAlerta: false },
    ],
    medications: [{ nombre: 'Losartán', dosis: '50mg', esAlerta: false }],
    habits: { bruxismo: true },
    dentalHistory: { motivoConsulta: 'Dolor' },
    surgeries: [{ descripcion: 'Extracción de cordal' }],
    vitalSigns: { sistolica: 120, diastolica: 80 },
    familyHistory: 'Diabetes materna',
    notes: 'Paciente colaborador',
    safetyFlags: { ...noFlags, alergiaPenicilina: true },
    hasCriticalAlert: true,
    createdById: 'u1',
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

/** The read-only summary card (the form below repeats the same values in inputs). */
function summaryCard(): HTMLElement {
  return screen.getByText(/versión \d+/i).closest('div')!.parentElement as HTMLElement;
}

describe('MedicalHistoryPanel', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
  });

  it('shows a loading state while fetching', () => {
    mockedGet.mockReturnValue(new Promise(() => {}));
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('shows an empty state when there is no anamnesis yet (null)', async () => {
    mockedGet.mockResolvedValue(null);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    expect(await screen.findByText(/no hay.*anamnesis|aún no/i)).toBeInTheDocument();
  });

  it('renders the structured anamnesis (allergies, conditions, medications) instead of crashing on the objects', async () => {
    mockedGet.mockResolvedValue(history());
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    await screen.findByText(/versión 2/i);
    const card = summaryCard();

    // Allergy: allergen + type + severity + reaction, all from the object.
    expect(within(card).getByText('Penicilina')).toBeInTheDocument();
    expect(within(card).getByText(/Medicamento · Anafilaxia · Edema/)).toBeInTheDocument();
    expect(within(card).getByText('Hipertensión')).toBeInTheDocument();
    expect(within(card).getByText('Losartán')).toBeInTheDocument();
    expect(within(card).getByText('Diabetes materna')).toBeInTheDocument();
    // A raw "[object Object]" is exactly what the old string-based panel produced.
    expect(within(card).queryByText(/\[object Object\]/)).not.toBeInTheDocument();
  });

  it('flags the entries marked as alerts and the version-level critical alert', async () => {
    mockedGet.mockResolvedValue(history());
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    await screen.findByText(/versión 2/i);
    expect(screen.getByText(/alertas críticas/i)).toBeInTheDocument();
    // The penicillin allergy carries esAlerta: true.
    expect(within(summaryCard()).getAllByText(/^alerta$/i).length).toBeGreaterThan(0);
  });

  it('shows an empty section instead of a blank when there are no records of a kind', async () => {
    mockedGet.mockResolvedValue(history({ medications: [], conditions: [] }));
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    await screen.findByText(/versión 2/i);
    expect(within(summaryCard()).getAllByText(/sin registros/i).length).toBe(2);
  });

  it('pre-fills the form from the latest version (carry-forward)', async () => {
    mockedGet.mockResolvedValue(history());
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    await screen.findByText(/versión 2/i);

    expect(screen.getByLabelText(/^alergias 1$/i)).toHaveValue('Penicilina');
    expect(screen.getByLabelText(/^tipo de alergia 1$/i)).toHaveValue('MEDICAMENTO');
    expect(screen.getByLabelText(/^severidad 1$/i)).toHaveValue('ANAFILAXIA');
    expect(screen.getByLabelText(/^condiciones 1$/i)).toHaveValue('Hipertensión');
    expect(screen.getByLabelText(/^medicamentos 1$/i)).toHaveValue('Losartán');
    expect(screen.getByLabelText(/antecedentes familiares/i)).toHaveValue('Diabetes materna');
    expect(screen.getByLabelText(/^notas$/i)).toHaveValue('Paciente colaborador');
  });

  it('adds and removes rows', async () => {
    mockedGet.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/aún no/i);

    expect(screen.queryByLabelText(/^alergias 1$/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /agregar alergia/i }));
    await user.type(screen.getByLabelText(/^alergias 1$/i), 'Látex');
    expect(screen.getByLabelText(/^alergias 1$/i)).toHaveValue('Látex');

    await user.click(screen.getByRole('button', { name: /quitar látex/i }));
    expect(screen.queryByLabelText(/^alergias 1$/i)).not.toBeInTheDocument();
  });

  it('submits structured rows, deriving the required condition code from its label', async () => {
    mockedGet.mockResolvedValue(null);
    mockedSave.mockResolvedValue(history({ version: 1 }));
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/aún no/i);

    await user.click(screen.getByRole('button', { name: /agregar alergia/i }));
    await user.type(screen.getByLabelText(/^alergias 1$/i), 'Látex');
    await user.selectOptions(screen.getByLabelText(/^tipo de alergia 1$/i), 'MATERIAL');
    await user.selectOptions(screen.getByLabelText(/^severidad 1$/i), 'MODERADA');

    await user.click(screen.getByRole('button', { name: /agregar condición/i }));
    await user.type(screen.getByLabelText(/^condiciones 1$/i), 'Diabetes tipo 2');

    await user.click(screen.getByRole('button', { name: /registrar anamnesis/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const [, , input] = mockedSave.mock.calls[0];
    expect(input.allergies).toEqual([
      { alergeno: 'Látex', tipo: 'MATERIAL', severidad: 'MODERADA', esAlerta: false },
    ]);
    // `codigo` is required by the API; with no condition catalog yet it's a
    // slug of the label (accent-free, upper snake case).
    expect(input.conditions).toEqual([
      { codigo: 'DIABETES_TIPO_2', etiqueta: 'Diabetes tipo 2', estado: 'SI', esAlerta: false },
    ]);
  });

  it('drops rows the user added but never filled in', async () => {
    mockedGet.mockResolvedValue(null);
    mockedSave.mockResolvedValue(history({ version: 1 }));
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/aún no/i);

    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }));
    await user.type(screen.getByLabelText(/^medicamentos 1$/i), 'Ibuprofeno');
    // A second, abandoned row must not reach the API as an empty medication.
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }));

    await user.click(screen.getByRole('button', { name: /registrar anamnesis/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const [, , input] = mockedSave.mock.calls[0];
    expect(input.medications).toEqual([{ nombre: 'Ibuprofeno', esAlerta: false }]);
  });

  it('records pregnancy with its weeks, and clears the weeks when unchecked', async () => {
    mockedGet.mockResolvedValue(null);
    mockedSave.mockResolvedValue(history({ version: 1 }));
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/aún no/i);

    const weeks = screen.getByLabelText(/^semanas$/i);
    expect(weeks).toBeDisabled(); // no pregnancy -> no weeks

    await user.click(screen.getByLabelText(/^embarazo$/i));
    await user.type(weeks, '12');
    await user.click(screen.getByRole('button', { name: /registrar anamnesis/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const [, , input] = mockedSave.mock.calls[0];
    expect(input.embarazo).toBe(true);
    expect(input.semanasEmbarazo).toBe(12);
  });

  it('carries the sections this form does not edit into the new version, instead of wiping them', async () => {
    const current = history();
    mockedGet.mockResolvedValue(current);
    mockedSave.mockResolvedValue(history({ version: 3 }));
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);

    const notes = screen.getByLabelText(/^notas$/i);
    await user.clear(notes);
    await user.type(notes, 'Nota actualizada');
    await user.click(screen.getByRole('button', { name: /guardar nueva versión/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const [, , input] = mockedSave.mock.calls[0];
    // Each save is a full snapshot: hábitos / historia dental / cirugías /
    // signos vitales aren't editable here, so they must travel unchanged.
    expect(input.habits).toEqual(current.habits);
    expect(input.dentalHistory).toEqual(current.dentalHistory);
    expect(input.surgeries).toEqual(current.surgeries);
    expect(input.vitalSigns).toEqual(current.vitalSigns);
    // ...and the edited/untouched fields of this form too.
    expect(input.notes).toBe('Nota actualizada');
    expect(input.allergies).toHaveLength(1);
  });

  it('labels the action "Registrar anamnesis" on first visit and "Guardar nueva versión" once one exists', async () => {
    mockedGet.mockResolvedValue(null);
    const { unmount } = render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/aún no/i);
    expect(screen.getByRole('button', { name: /registrar anamnesis/i })).toBeInTheDocument();
    unmount();

    mockedGet.mockResolvedValue(history());
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);
    expect(screen.getByRole('button', { name: /guardar nueva versión/i })).toBeInTheDocument();
  });

  it('shows the newly saved version after submitting', async () => {
    mockedGet.mockResolvedValue(null);
    mockedSave.mockResolvedValue(history({ version: 1 }));
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/aún no/i);

    await user.type(screen.getByLabelText(/^notas$/i), 'Primera anamnesis');
    await user.click(screen.getByRole('button', { name: /registrar anamnesis/i }));

    expect(await screen.findByText(/versión 1/i)).toBeInTheDocument();
  });

  it('shows an alert with the API error message when loading fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor');
  });

  it('does not render the form when the initial load failed, so no version can be created from an unknown baseline', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByRole('alert');

    expect(screen.queryByRole('button', { name: /agregar alergia/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^notas$/i)).not.toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('offers a retry action on load error that re-fetches the latest version', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    mockedGet.mockResolvedValueOnce(history());

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    await screen.findByText(/versión 2/i);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/^alergias 1$/i)).toHaveValue('Penicilina');
  });

  it('shows an alert with the API error message when saving fails', async () => {
    mockedGet.mockResolvedValue(null);
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedSave.mockRejectedValue(new ApiError(400, 'Datos inválidos'));

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/aún no/i);

    await user.type(screen.getByLabelText(/^notas$/i), 'algo');
    await user.click(screen.getByRole('button', { name: /registrar anamnesis/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos');
  });

  it('does not append an identical version when nothing changed (dup guard)', async () => {
    mockedGet.mockResolvedValue(history());
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);

    // The form is seeded from the saved version, so submitting untouched must
    // be a no-op rather than appending a duplicate.
    await user.click(screen.getByRole('button', { name: /guardar nueva versión/i }));
    expect(mockedSave).not.toHaveBeenCalled();

    // An empty row left behind is still "unchanged" — it gets dropped on save.
    await user.click(screen.getByRole('button', { name: /agregar medicamento/i }));
    await user.click(screen.getByRole('button', { name: /guardar nueva versión/i }));
    expect(mockedSave).not.toHaveBeenCalled();
  });
});
