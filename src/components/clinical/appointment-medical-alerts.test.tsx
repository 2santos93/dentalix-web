import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AppointmentMedicalAlerts,
  PatientMedicalAlertsNotice,
} from './appointment-medical-alerts';
import { getPatientMedicalAlerts, type PatientMedicalAlerts } from '@/lib/clinical/medical-alerts';

jest.mock('../../lib/clinical/medical-alerts', () => ({
  ...jest.requireActual('../../lib/clinical/medical-alerts'),
  getPatientMedicalAlerts: jest.fn(),
}));
const mockedGet = getPatientMedicalAlerts as jest.MockedFunction<typeof getPatientMedicalAlerts>;

const premedicated: PatientMedicalAlerts = {
  hasCriticalAlert: true,
  requiresPremedication: true,
  anamnesisStatus: 'CURRENT',
  alerts: ['profilaxisAntibiotica'],
  anamnesisReviewedAt: '2026-09-01T12:00:00.000Z',
  validityMonths: 12,
  anamnesisExpiresOn: '2027-09-01',
  today: '2026-10-20',
  timeZone: 'America/Bogota',
  lastReview: { kind: 'UPDATED', at: '2026-09-01T12:00:00.000Z', byName: 'Dra. Ruiz' },
};

describe('AppointmentMedicalAlerts (DX-247)', () => {
  it('«Requiere premedicación» destacado y las alertas del paciente', () => {
    render(<AppointmentMedicalAlerts flags={premedicated} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Requiere premedicación');
    expect(screen.getByText('Requiere profilaxis antibiótica')).toBeInTheDocument();
  });

  it('sin anamnesis lo dice, en vez de callar', () => {
    render(
      <AppointmentMedicalAlerts
        flags={{ ...premedicated, hasCriticalAlert: false, requiresPremedication: false, alerts: [], anamnesisStatus: 'MISSING' }}
      />,
    );
    expect(screen.getByText('Sin anamnesis')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('al día y sin alertas no pinta nada', () => {
    const { container } = render(
      <AppointmentMedicalAlerts
        flags={{ ...premedicated, hasCriticalAlert: false, requiresPremedication: false, alerts: [] }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PatientMedicalAlertsNotice (DX-247)', () => {
  beforeEach(() => mockedGet.mockReset());

  it('pide las banderas del paciente y avisa de la premedicación', async () => {
    mockedGet.mockResolvedValue(premedicated);
    render(<PatientMedicalAlertsNotice token="tok" patientId="p1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Requiere premedicación');
    expect(mockedGet).toHaveBeenCalledWith('tok', 'p1');
  });

  it('si falla, lo dice y reintenta', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new Error('caída')).mockResolvedValueOnce(premedicated);
    render(<PatientMedicalAlertsNotice token="tok" patientId="p1" />);
    expect(await screen.findByText('Alertas sin comprobar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Requiere premedicación'));
  });
});
