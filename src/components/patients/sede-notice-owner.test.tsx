import { render, screen, waitFor } from '@testing-library/react';
import { PatientAnamnesisSection } from '@/components/anamnesis/patient-anamnesis-section';
import { AnamnesisReviewLine } from '@/components/clinical/anamnesis-review-line';
import { PatientCommunicationSection } from './patient-communication-section';
import { SedeNoticeOwner } from '@/components/locations/sede-stamp-note';
import { listPatientAnamnesisRequests, type AnamnesisSubmission } from '@/lib/anamnesis/anamnesis-api';
import { getPatientCommunication, getPatientOptOutWarnings } from '@/lib/patients/communication-api';
import type { PatientMedicalAlerts } from '@/lib/clinical/medical-alerts';
import { listLocations } from '@/lib/locations/locations-api';
import { STAMP_SEDES } from '@/lib/test/stamp';

jest.mock('../../lib/anamnesis/anamnesis-api', () => ({
  ...jest.requireActual('../../lib/anamnesis/anamnesis-api'),
  listPatientAnamnesisRequests: jest.fn(),
}));
jest.mock('../../lib/patients/communication-api', () => ({
  ...jest.requireActual('../../lib/patients/communication-api'),
  getPatientCommunication: jest.fn(),
  getPatientOptOutWarnings: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedLocations = listLocations as jest.Mock;
const alerts = {
  hasCriticalAlert: false,
  requiresPremedication: false,
  anamnesisStatus: 'EXPIRED',
  alerts: [],
  anamnesisReviewedAt: '2025-08-01T12:00:00.000Z',
  validityMonths: 12,
  anamnesisExpiresOn: '2026-08-01',
  today: '2026-10-20',
  timeZone: 'America/Caracas',
  lastReview: { kind: 'UPDATED', at: '2025-08-01T12:00:00.000Z', byName: 'Dra. Ruiz' },
} as PatientMedicalAlerts;

const submission = (sedeId: string): AnamnesisSubmission =>
  ({
    id: 's1',
    patient: { id: 'p1', fullName: 'Ana' },
    appointment: null,
    location: { id: sedeId, name: 'Sede' },
    status: 'PENDING_PATIENT',
    expiresAt: '2026-11-12T15:00:00.000Z',
    createdAt: '2026-11-01T15:00:00.000Z',
    createdByName: 'R',
    submittedAt: null,
    reviewedAt: null,
    reviewedByName: null,
    rejectReason: null,
    resultingVersionId: null,
  }) as AnamnesisSubmission;

function Ficha() {
  return (
    <SedeNoticeOwner token="tok">
      <PatientAnamnesisSection
        token="tok"
        patientId="p1"
        canReview
        onSend={jest.fn()}
        reviewLine={<AnamnesisReviewLine token="tok" patientId="p1" alerts={alerts} failed={false} onReload={jest.fn()} canConfirm />}
      />
      <PatientCommunicationSection token="tok" patientId="p1" canEdit={false} />
    </SedeNoticeOwner>
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  window.localStorage.clear();
  (getPatientCommunication as jest.Mock).mockResolvedValue({
    patientId: 'p1',
    contactChannel: 'EMAIL',
    clinicDefaultChannel: 'EMAIL',
    phone: null,
    phoneE164: null,
    phoneStatus: 'MISSING',
    phoneAmbiguous: false,
    phoneInternational: null,
    phoneCountry: null,
    email: null,
    whatsappOptIn: null,
    reminderOptOut: null,
    recipient: { kind: 'PATIENT', name: 'Ana', email: null, minor: false, responsiblePartyId: null },
  });
  (getPatientOptOutWarnings as jest.Mock).mockResolvedValue([]);
});

it('con la lista de sedes rota, la ficha muestra exactamente UN aviso con Reintentar', async () => {
  mockedLocations.mockRejectedValue(new Error('red'));
  (listPatientAnamnesisRequests as jest.Mock).mockResolvedValue([submission(STAMP_SEDES.caracas.id)]);
  render(<Ficha />);
  await screen.findByTestId('anamnesis-review');
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(1));
  expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1);
});

it('el aviso de una fila sigue saliendo en su sección aunque la pantalla esté bien', async () => {
  mockedLocations.mockResolvedValue([STAMP_SEDES.caracas]);
  (listPatientAnamnesisRequests as jest.Mock).mockResolvedValue([submission('sede-fantasma')]);
  render(<Ficha />);
  await screen.findByText('Enlace enviado; caduca el —.');
  await waitFor(() => expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1));
});
