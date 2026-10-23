import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnamnesisInboxView } from './anamnesis-inbox-view';
import { AnamnesisReviewView } from './anamnesis-review-view';
import { PatientAnamnesisSection } from './patient-anamnesis-section';
import { NetworkError } from '@/lib/api/api-error';
import {
  acceptAnamnesis,
  createAnamnesisRequest,
  getAnamnesisReview,
  listAnamnesisInbox,
  listPatientAnamnesisRequests,
  rejectAnamnesis,
  type AnamnesisReview,
  type AnamnesisSubmission,
} from '@/lib/anamnesis/anamnesis-api';

jest.mock('../../lib/anamnesis/anamnesis-api', () => ({
  ...jest.requireActual('../../lib/anamnesis/anamnesis-api'),
  listAnamnesisInbox: jest.fn(),
  getAnamnesisReview: jest.fn(),
  acceptAnamnesis: jest.fn(),
  rejectAnamnesis: jest.fn(),
  listPatientAnamnesisRequests: jest.fn(),
  createAnamnesisRequest: jest.fn(),
  revokeAnamnesisRequest: jest.fn(),
}));

const inbox = listAnamnesisInbox as jest.MockedFunction<typeof listAnamnesisInbox>;
const review = getAnamnesisReview as jest.MockedFunction<typeof getAnamnesisReview>;
const accept = acceptAnamnesis as jest.MockedFunction<typeof acceptAnamnesis>;
const reject = rejectAnamnesis as jest.MockedFunction<typeof rejectAnamnesis>;
const patientList = listPatientAnamnesisRequests as jest.MockedFunction<typeof listPatientAnamnesisRequests>;
const create = createAnamnesisRequest as jest.MockedFunction<typeof createAnamnesisRequest>;

function submission(overrides: Partial<AnamnesisSubmission> = {}): AnamnesisSubmission {
  return {
    id: 's1',
    patient: { id: 'p1', fullName: 'Natalia Vargas' },
    appointment: null,
    location: { id: 'l1', name: 'Sede principal' },
    status: 'SUBMITTED',
    expiresAt: '2026-10-30T15:00:00.000Z',
    createdAt: '2026-10-22T15:00:00.000Z',
    createdByName: 'Recepción',
    submittedAt: '2026-10-23T15:00:00.000Z',
    reviewedAt: null,
    reviewedByName: null,
    rejectReason: null,
    resultingVersionId: null,
    ...overrides,
  };
}

function reviewFixture(): AnamnesisReview {
  return {
    submission: submission(),
    questionnaireVersion: '2026-10-v1',
    answers: null,
    affirmativeCount: 1,
    currentVersion: { id: 'v1', version: 1, createdAt: '2025-01-01T00:00:00.000Z' },
    proposed: { allergies: [] } as AnamnesisReview['proposed'],
    proposedFlags: {
      hasCriticalAlert: true,
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
    } as AnamnesisReview['proposedFlags'],
    diff: {
      hasPreviousVersion: true,
      unchangedCount: 4,
      entries: [
        { section: 'ALLERGIES', label: 'Penicilina', change: 'ADDED', before: null, after: 'Medicamento · Moderada', affirmative: true },
        { section: 'CONDITIONS', label: 'Asma', change: 'CHANGED', before: 'No', after: 'Sí', affirmative: true },
      ],
    },
  };
}

beforeEach(() => jest.resetAllMocks());

describe('Bandeja «Anamnesis por revisar» (DX-099)', () => {
  it('vacía: «No hay anamnesis por revisar»', async () => {
    inbox.mockResolvedValue([]);
    render(<AnamnesisInboxView token="t" />);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    expect(await screen.findByText('No hay anamnesis por revisar')).toBeInTheDocument();
  });

  it('error de red con «Reintentar» y luego la fila con «Revisar»', async () => {
    inbox.mockRejectedValueOnce(new NetworkError(new TypeError('x'))).mockResolvedValueOnce([submission()]);
    render(<AnamnesisInboxView token="t" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('link', { name: 'Revisar la anamnesis de Natalia Vargas' })).toHaveAttribute(
      'href',
      '/anamnesis-por-revisar/s1',
    );
  });
});

describe('Revisión de la anamnesis (DX-099)', () => {
  it('pinta las alertas resultantes y las diferencias, y acepta', async () => {
    review.mockResolvedValue(reviewFixture());
    accept.mockResolvedValue(submission({ status: 'ACCEPTED' }));
    render(<AnamnesisReviewView token="t" submissionId="s1" canReview />);
    expect(await screen.findByRole('heading', { name: 'Anamnesis de Natalia Vargas' })).toBeInTheDocument();
    expect(screen.getByText('Alergia a penicilina')).toBeInTheDocument();
    const entries = screen.getAllByTestId('anamnesis-diff-entry');
    expect(entries[0]).toHaveTextContent('Nuevo');
    expect(entries[0]).toHaveTextContent('Penicilina');
    expect(entries[1]).toHaveTextContent('Cambiado');
    expect(screen.getByText('4 datos sin cambios.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(await screen.findByText('Anamnesis aceptada')).toBeInTheDocument();
    expect(accept).toHaveBeenCalledWith('t', 's1');
  });

  it('sin permiso de revisión (asistente o recepción) no hay «Aceptar» ni «Rechazar»', async () => {
    review.mockResolvedValue(reviewFixture());
    render(<AnamnesisReviewView token="t" submissionId="s1" canReview={false} />);
    await screen.findByRole('heading', { name: 'Anamnesis de Natalia Vargas' });
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Solo un odontólogo o un administrador puede aceptar o rechazar la anamnesis.'),
    ).toBeInTheDocument();
  });

  it('rechazar exige el motivo', async () => {
    review.mockResolvedValue(reviewFixture());
    reject.mockResolvedValue(submission({ status: 'REJECTED', rejectReason: 'No es del paciente' }));
    render(<AnamnesisReviewView token="t" submissionId="s1" canReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.submit(dialog.querySelector('form')!);
    expect(await screen.findByText('Escribe el motivo (al menos 3 caracteres).')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'No es del paciente' } });
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(reject).toHaveBeenCalledWith('t', 's1', 'No es del paciente'));
    expect(await screen.findByText('Anamnesis rechazada')).toBeInTheDocument();
  });
});

describe('Bloque de la ficha (DX-099)', () => {
  it('«Anamnesis pendiente de revisión» con «Revisar» para quien revisa, y «Enviar anamnesis»', async () => {
    patientList.mockResolvedValue([submission()]);
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview />);
    expect(await screen.findByText('Anamnesis pendiente de revisión')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar' })).toHaveAttribute('href', '/anamnesis-por-revisar/s1');
    expect(screen.getByRole('button', { name: 'Enviar anamnesis' })).toBeInTheDocument();
  });

  it('recepción no ve «Revisar»; enviar muestra el enlace y WhatsApp', async () => {
    patientList.mockResolvedValue([submission()]);
    create.mockResolvedValue({
      id: 's2',
      patientId: 'p1',
      appointmentId: null,
      url: 'http://demo.localhost:3001/anamnesis/abc',
      expiresAt: '2026-10-30T15:00:00.000Z',
      whatsapp: { phone: '573001234567', text: 'Hola' },
      whatsappUnavailableReason: null,
      consentRequired: false,
    });
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview={false} />);
    await screen.findByText('Anamnesis pendiente de revisión');
    expect(screen.queryByRole('link', { name: 'Revisar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar anamnesis' }));
    expect(await screen.findByDisplayValue('http://demo.localhost:3001/anamnesis/abc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir WhatsApp/ })).toHaveAttribute(
      'href',
      'https://wa.me/573001234567?text=Hola',
    );
  });
});
