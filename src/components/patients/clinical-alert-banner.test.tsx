import { render, screen, waitFor } from '@testing-library/react';
import { ClinicalAlertBanner } from './clinical-alert-banner';
import { getMedicalHistory } from '@/lib/patients/clinical-api';
import type { MedicalHistory } from '@/lib/clinical/clinical-types';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform — use a relative path (same convention as the other tests).
jest.mock('../../lib/patients/clinical-api', () => ({
  getMedicalHistory: jest.fn(),
}));

const mockedGetMedicalHistory = getMedicalHistory as jest.MockedFunction<typeof getMedicalHistory>;

const alertHistory: MedicalHistory = {
  id: 'mh-1',
  tenantId: 't1',
  patientId: 'p1',
  version: 1,
  familyHistory: null,
  notes: null,
  allergies: [
    { alergeno: 'Penicilina', tipo: 'MEDICAMENTO', severidad: 'ANAFILAXIA', esAlerta: true },
  ],
  conditions: [],
  medications: [],
  habits: null,
  dentalHistory: null,
  surgeries: [],
  vitalSigns: null,
  safetyFlags: {
    embarazo: true,
    semanasEmbarazo: 12,
    anticoagulantes: false,
    bifosfonatos: false,
    diabetes: false,
    profilaxisAntibiotica: false,
    alergiaAnestesico: false,
    alergiaPenicilina: true,
    alergiaLatex: false,
  },
  hasCriticalAlert: true,
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as MedicalHistory;

describe('ClinicalAlertBanner', () => {
  beforeEach(() => {
    mockedGetMedicalHistory.mockReset();
  });

  it('renders the active safety flags and alertable allergies', async () => {
    mockedGetMedicalHistory.mockResolvedValue(alertHistory);

    render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Alertas médicas');
    expect(alert).toHaveTextContent('Embarazo');
    expect(alert).toHaveTextContent('12 semanas');
    expect(alert).toHaveTextContent('Alergia a penicilina');
    expect(alert).toHaveTextContent('Penicilina');
  });

  it('renders nothing when there is no history', async () => {
    mockedGetMedicalHistory.mockResolvedValue(null);

    const { container } = render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    await waitFor(() => expect(mockedGetMedicalHistory).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there is no critical alert', async () => {
    mockedGetMedicalHistory.mockResolvedValue({
      ...alertHistory,
      hasCriticalAlert: false,
    });

    const { container } = render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    await waitFor(() => expect(mockedGetMedicalHistory).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('fails soft (renders nothing) when the fetch throws', async () => {
    mockedGetMedicalHistory.mockRejectedValue(new Error('boom'));

    const { container } = render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    await waitFor(() => expect(mockedGetMedicalHistory).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
