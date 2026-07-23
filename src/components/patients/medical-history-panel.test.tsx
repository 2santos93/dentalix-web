import { render, screen, waitFor } from '@testing-library/react';
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
    render(<MedicalHistoryPanel token="tok" tenant={null} patientId="p1" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
  });

  it('shows an empty state when there is no anamnesis yet (null)', async () => {
    mockedGet.mockResolvedValue(null);
    render(<MedicalHistoryPanel token="tok" tenant={null} patientId="p1" />);
    expect(await screen.findByText(/no hay.*anamnesis|aún no/i)).toBeInTheDocument();
  });

  it('renders the latest anamnesis fields when present', async () => {
    mockedGet.mockResolvedValue(latest);
    render(<MedicalHistoryPanel token="tok" tenant={null} patientId="p1" />);

    expect(await screen.findByText('Penicilina')).toBeInTheDocument();
    expect(screen.getByText('Hipertensión')).toBeInTheDocument();
    expect(screen.getByText('Losartán')).toBeInTheDocument();
    expect(screen.getByText('Fumador')).toBeInTheDocument();
    expect(screen.getByText('Alergia severa')).toBeInTheDocument();
    expect(screen.getByText('Paciente colaborador')).toBeInTheDocument();
    expect(screen.getByText(/versión 2/i)).toBeInTheDocument();
  });

  it('renders the save-new-version form with accessible labels', async () => {
    mockedGet.mockResolvedValue(null);
    render(<MedicalHistoryPanel token="tok" tenant={null} patientId="p1" />);

    await screen.findByText(/no hay.*anamnesis|aún no/i);
    expect(screen.getByLabelText(/alergias/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/condiciones cr[oó]nicas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/medicamentos actuales/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/h[aá]bitos/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/alertas m[eé]dicas/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument();
  });

  it('submits the form calling saveMedicalHistory and shows the newly saved version', async () => {
    mockedGet.mockResolvedValue(null);
    const saved = { ...latest, version: 1, allergies: 'Ninguna' };
    mockedSave.mockResolvedValue(saved);

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" tenant={null} patientId="p1" />);
    await screen.findByText(/no hay.*anamnesis|aún no/i);

    await user.type(screen.getByLabelText(/alergias/i), 'Ninguna');
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    expect(mockedSave).toHaveBeenCalledWith('tok', 'p1', expect.objectContaining({ allergies: 'Ninguna' }), null);
    expect(await screen.findByText(/versión 1/i)).toBeInTheDocument();
  });

  it('shows an alert with the API error message when loading fails', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedGet.mockRejectedValue(new ApiError(500, 'Error del servidor'));

    render(<MedicalHistoryPanel token="tok" tenant={null} patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Error del servidor');
  });

  it('shows an alert with the API error message when saving fails', async () => {
    mockedGet.mockResolvedValue(null);
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedSave.mockRejectedValue(new ApiError(400, 'Datos inválidos'));

    const user = userEvent.setup();
    render(<MedicalHistoryPanel token="tok" tenant={null} patientId="p1" />);
    await screen.findByText(/no hay.*anamnesis|aún no/i);
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos');
  });
});
