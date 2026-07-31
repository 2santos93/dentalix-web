import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MedicalHistoryPanel } from './medical-history-panel';
import { getMedicalHistory, saveMedicalHistory } from '@/lib/patients/clinical-api';

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

const latest = {
  id: 'mh-1',
  tenantId: 't1',
  patientId: 'p1',
  version: 2,
  allergies: 'Penicilina',
  chronicConditions: 'Hipertensión',
  currentMedications: 'Losartán',
  habits: 'Fumador',
  medicalAlerts: 'Alergia severa',
  notes: 'Paciente colaborador',
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

  it('shows an empty state when there is no anamnesis yet (null)', async () => {
    mockedGet.mockResolvedValue(null);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    expect(await screen.findByText(/no hay.*anamnesis|aún no/i)).toBeInTheDocument();
  });

  it('renders the latest anamnesis fields when present', async () => {
    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    const versionLabel = await screen.findByText(/versión 2/i);
    // Scope to the read-only summary card: the form below is now
    // pre-filled (carry-forward fix) with the same values, so an
    // unscoped `getByText` would match both the <dd> and the <textarea>.
    const summaryCard = versionLabel.closest('div') as HTMLElement;

    expect(within(summaryCard).getByText('Penicilina')).toBeInTheDocument();
    expect(within(summaryCard).getByText('Hipertensión')).toBeInTheDocument();
    expect(within(summaryCard).getByText('Losartán')).toBeInTheDocument();
    expect(within(summaryCard).getByText('Fumador')).toBeInTheDocument();
    expect(within(summaryCard).getByText('Alergia severa')).toBeInTheDocument();
    expect(within(summaryCard).getByText('Paciente colaborador')).toBeInTheDocument();
    expect(versionLabel).toBeInTheDocument();
  });

  it('pre-fills the save-new-version form from the latest version (carry-forward)', async () => {
    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    // Wait for the fetched version to render before asserting on the form,
    // which is synced from it in the same load effect.
    await screen.findByText(/versión 2/i);

    expect(screen.getByLabelText(/alergias/i)).toHaveValue('Penicilina');
    expect(screen.getByLabelText(/condiciones cr[oó]nicas/i)).toHaveValue('Hipertensión');
    expect(screen.getByLabelText(/medicamentos actuales/i)).toHaveValue('Losartán');
    expect(screen.getByLabelText(/h[aá]bitos/i)).toHaveValue('Fumador');
    expect(screen.getByLabelText(/alertas m[eé]dicas/i)).toHaveValue('Alergia severa');
    expect(screen.getByLabelText(/notas/i)).toHaveValue('Paciente colaborador');
  });

  it('carries forward an untouched field on save, preventing it from being wiped', async () => {
    mockedGet.mockResolvedValue(latest);
    const saved = { ...latest, version: 3, notes: 'Nota actualizada' };
    mockedSave.mockResolvedValue(saved);

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);

    // Only touch "notes" — allergies etc. must still be submitted because
    // the form was pre-filled from `latest`, not left empty.
    const notesField = screen.getByLabelText(/notas/i);
    await user.clear(notesField);
    await user.type(notesField, 'Nota actualizada');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    expect(mockedSave).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({
        allergies: 'Penicilina',
        chronicConditions: 'Hipertensión',
        currentMedications: 'Losartán',
        habits: 'Fumador',
        medicalAlerts: 'Alergia severa',
        notes: 'Nota actualizada',
      }),
    );
  });

  it('renders the save-new-version form with accessible labels', async () => {
    mockedGet.mockResolvedValue(null);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);

    await screen.findByText(/no hay.*anamnesis|aún no/i);
    expect(screen.getByLabelText(/alergias/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/condiciones cr[oó]nicas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/medicamentos actuales/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/h[aá]bitos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/alertas m[eé]dicas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /registrar anamnesis/i })).toBeInTheDocument();
  });

  it('labels the action "Registrar anamnesis" on first visit and "Guardar nueva versión" once one exists', async () => {
    mockedGet.mockResolvedValue(null);
    const { unmount } = render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/no hay.*anamnesis|aún no/i);
    expect(screen.getByRole('button', { name: /registrar anamnesis/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /guardar nueva versión/i }),
    ).not.toBeInTheDocument();
    unmount();

    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);
    expect(screen.getByRole('button', { name: /guardar nueva versión/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /registrar anamnesis/i }),
    ).not.toBeInTheDocument();
  });

  it('submits the form calling saveMedicalHistory and shows the newly saved version', async () => {
    mockedGet.mockResolvedValue(null);
    const saved = { ...latest, version: 1, allergies: 'Ninguna' };
    mockedSave.mockResolvedValue(saved);

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/no hay.*anamnesis|aún no/i);

    await user.type(screen.getByLabelText(/alergias/i), 'Ninguna');
    await user.click(screen.getByRole('button', { name: /registrar anamnesis/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    expect(mockedSave).toHaveBeenCalledWith('tok', 'p1', expect.objectContaining({ allergies: 'Ninguna' }));
    expect(await screen.findByText(/versión 1/i)).toBeInTheDocument();
  });

  it('shows an alert with the API error message when loading fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor');
  });

  it('does not render the save-new-version form when the initial load failed, so no version can be created from an unknown baseline', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByRole('alert');

    // No editable fields, no submit button — there's nothing to save from
    // (we don't have a trustworthy baseline to carry forward), so the form
    // that would silently null out allergies/medicalAlerts/etc. on save
    // must not be rendered at all.
    expect(screen.queryByLabelText(/alergias/i)).not.toBeInTheDocument();
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
    // Once the retry succeeds we have a trustworthy baseline again, so the
    // form (pre-filled, carry-forward) is back.
    expect(screen.getByLabelText(/alergias/i)).toHaveValue('Penicilina');
  });

  it('shows an alert with the API error message when saving fails', async () => {
    mockedGet.mockResolvedValue(null);
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedSave.mockRejectedValue(new ApiError(400, 'Datos inválidos'));

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/no hay.*anamnesis|aún no/i);
    // Type something so the form differs from the (empty) baseline — an
    // all-empty anamnesis is now a no-op (dup guard), so the save only fires
    // when there's real content to persist.
    await user.type(screen.getByLabelText(/alergias/i), 'Penicilina');
    await user.click(screen.getByRole('button', { name: /registrar anamnesis/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos');
  });

  it('does not save an unchanged version — the save button is disabled until the form changes (dup guard)', async () => {
    mockedGet.mockResolvedValue(latest);
    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" patientId="p1" />);
    await screen.findByText(/versión 2/i);

    // Form equals the latest saved version → saving would duplicate it, so the
    // button is disabled.
    const save = screen.getByRole('button', { name: /guardar/i });
    expect(save).toBeDisabled();

    // A real change re-enables it, and no save fired for the unchanged state.
    await user.type(screen.getByLabelText(/alergias/i), ' (actualizado)');
    expect(screen.getByRole('button', { name: /guardar/i })).toBeEnabled();
    expect(mockedSave).not.toHaveBeenCalled();
  });
});
