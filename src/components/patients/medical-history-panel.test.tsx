import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedicalHistoryPanel } from './medical-history-panel';
import { getMedicalHistory, saveMedicalHistory } from '@/lib/patients/clinical-api';
import type { MedicalHistory } from '@/lib/clinical/clinical-types';

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

const latest: MedicalHistory = {
  id: 'mh-1',
  tenantId: 't1',
  patientId: 'p1',
  version: 2,
  allergies: [
    { alergeno: 'Penicilina', tipo: 'MEDICAMENTO', severidad: 'MODERADA', esAlerta: true },
  ],
  conditions: [],
  medications: [],
  habits: null,
  dentalHistory: null,
  surgeries: [],
  vitalSigns: null,
  familyHistory: 'Sin antecedentes relevantes',
  notes: 'Paciente colaborador',
  safetyFlags: {
    embarazo: false,
    anticoagulantes: false,
    bifosfonatos: false,
    diabetes: false,
    profilaxisAntibiotica: false,
    alergiaAnestesico: false,
    alergiaPenicilina: true,
    alergiaLatex: false,
  },
  hasCriticalAlert: true,
  createdById: 'u1',
  createdAt: '2026-01-02T00:00:00.000Z',
};

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

  it('shows an empty state when there is no anamnesis yet (null), with an empty structured form to create one', async () => {
    mockedGet.mockResolvedValue(null);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    expect(await screen.findByText(/no hay.*anamnesis|aún no/i)).toBeInTheDocument();
    // The structured editors render even with nothing to carry forward yet.
    expect(screen.getByRole('button', { name: /agregar alergia/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toHaveValue('');
  });

  it('loads the latest version into the structured allergy editor (carry-forward)', async () => {
    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    await screen.findByText(/versión 2/i);
    expect(screen.getByDisplayValue('Penicilina')).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toHaveValue('Paciente colaborador');
  });

  it('adds a new allergy and saves the whole carried-forward value (append-only)', async () => {
    mockedGet.mockResolvedValue(latest);
    mockedSave.mockResolvedValue({ ...latest, version: 3 });

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);
    screen.getByDisplayValue('Penicilina');

    await user.click(screen.getByRole('button', { name: /agregar alergia/i }));
    const allergenInputs = screen.getAllByLabelText(/alérgeno/i);
    expect(allergenInputs).toHaveLength(2);
    await user.type(allergenInputs[1], 'Látex');

    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const [token, patientId, input] = mockedSave.mock.calls[0];
    expect(token).toBe('tok');
    expect(patientId).toBe('p1');
    expect(input.allergies).toHaveLength(2);
    expect(input.allergies?.[0].alergeno).toBe('Penicilina');
    expect(input.allergies?.[1].alergeno).toBe('Látex');
    // Untouched fields from the baseline are still sent, not dropped.
    expect(input.notes).toBe('Paciente colaborador');
    expect(input.familyHistory).toBe('Sin antecedentes relevantes');

    expect(await screen.findByText(/versión 3/i)).toBeInTheDocument();
  });

  it('carries forward embarazo/semanasEmbarazo across versions (safety flag, not just for display)', async () => {
    const pregnant: MedicalHistory = {
      ...latest,
      safetyFlags: { ...latest.safetyFlags, embarazo: true, semanasEmbarazo: 20 },
    };
    mockedGet.mockResolvedValue(pregnant);
    mockedSave.mockResolvedValue({ ...pregnant, version: 3 });

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);

    expect(screen.getByLabelText('Embarazo')).toBeChecked();
    expect(screen.getByLabelText(/semanas de embarazo/i)).toHaveValue(20);

    // An unrelated edit (adding an allergy) must not drop the safety flag.
    await user.click(screen.getByRole('button', { name: /agregar alergia/i }));
    const allergenInputs = screen.getAllByLabelText(/alérgeno/i);
    await user.type(allergenInputs[1], 'Látex');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const [, , input] = mockedSave.mock.calls[0];
    expect(input.embarazo).toBe(true);
    expect(input.semanasEmbarazo).toBe(20);
  });

  it('shows an alert with the API error message when loading fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor');
  });

  it('does not render the structured form when the initial load failed, so no version can be created from an unknown baseline', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByRole('alert');

    expect(screen.queryByRole('button', { name: /agregar alergia/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /guardar/i })).not.toBeInTheDocument();
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('offers a retry action on load error that re-fetches the latest version', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    mockedGet.mockResolvedValueOnce(latest);

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    await screen.findByText(/versión 2/i);
    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(screen.getByDisplayValue('Penicilina')).toBeInTheDocument();
  });

  it('shows an alert with the API error message when saving fails', async () => {
    mockedGet.mockResolvedValue(null);
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedSave.mockRejectedValue(new ApiError(400, 'Datos inválidos'));

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/no hay.*anamnesis|aún no/i);
    // Add real content so the form differs from the (empty) baseline — an
    // all-empty first-visit form is now a no-op (dup guard), so the save only
    // fires when there's something to persist.
    await user.type(screen.getByLabelText(/notas/i), 'Primera visita');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos');
  });

  it('does not save an unchanged version — the save button is disabled until the form changes (dup guard)', async () => {
    mockedGet.mockResolvedValue(latest);
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);

    // Form equals the latest saved version (carried forward on load) → saving
    // would create an identical duplicate version, so the button is disabled.
    const save = screen.getByRole('button', { name: /guardar/i });
    expect(save).toBeDisabled();

    // A real change re-enables it, and no save fired for the unchanged state.
    await user.type(screen.getByLabelText(/notas/i), ' (actualizado)');
    expect(screen.getByRole('button', { name: /guardar/i })).toBeEnabled();
    expect(mockedSave).not.toHaveBeenCalled();
  });
});
