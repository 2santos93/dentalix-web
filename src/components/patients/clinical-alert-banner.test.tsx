import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('distingue «todavía no hay anamnesis» de «consultado y sin alertas»', async () => {
    // No es el mismo hecho clínico: uno es una comprobación hecha, el otro es
    // una comprobación que nadie hizo. Quien va a inyectar necesita saber cuál
    // de los dos está leyendo.
    mockedGetMedicalHistory.mockResolvedValue(null);

    render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    expect(await screen.findByText(/sin anamnesis registrada/i)).toBeInTheDocument();
    expect(screen.queryByText(/sin alertas médicas registradas/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('affirms the absence when there is no critical alert', async () => {
    mockedGetMedicalHistory.mockResolvedValue({
      ...alertHistory,
      hasCriticalAlert: false,
    });

    render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    expect(await screen.findByText(/sin alertas médicas registradas/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing while the check is still in flight — no premature "sin alertas"', () => {
    mockedGetMedicalHistory.mockReturnValue(new Promise(() => {}));

    const { container } = render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a neutral "no pudimos comprobar" strip when the fetch throws — never silence', async () => {
    mockedGetMedicalHistory.mockRejectedValue(new Error('boom'));

    render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    const strip = await screen.findByRole('status');
    expect(strip).toHaveTextContent(/no pudimos comprobar las alertas médicas de este paciente/i);
    // No es una alerta médica: no interrumpe (`status`, no `alert`) y no se
    // confunde con la ausencia de alertas.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/sin alertas médicas registradas/i)).not.toBeInTheDocument();
  });

  it('"Reintentar" re-runs the fetch and shows the alerts once it succeeds', async () => {
    mockedGetMedicalHistory.mockRejectedValueOnce(new Error('boom'));
    mockedGetMedicalHistory.mockResolvedValueOnce(alertHistory);

    const user = userEvent.setup();
    render(<ClinicalAlertBanner token="tok" patientId="p1" />);

    await screen.findByRole('status');
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    await waitFor(() => expect(mockedGetMedicalHistory).toHaveBeenCalledTimes(2));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Alertas médicas');
    expect(screen.queryByText(/no pudimos comprobar/i)).not.toBeInTheDocument();
  });
});
