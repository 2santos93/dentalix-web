import { render, screen, waitFor, within } from '@testing-library/react';
import { AnamnesisInboxView } from './anamnesis-inbox-view';
import { AnamnesisReviewView } from './anamnesis-review-view';
import { PatientAnamnesisSection } from './patient-anamnesis-section';
import {
  getAnamnesisReview,
  listAnamnesisInbox,
  listPatientAnamnesisRequests,
  type AnamnesisReview,
  type AnamnesisSubmission,
} from '@/lib/anamnesis/anamnesis-api';
import { listLocations } from '@/lib/locations/locations-api';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { dateTimeIn, STAMP_SEDES } from '@/lib/test/stamp';

/**
 * DX-354b: cada solicitud se pinta con el reloj de SU sede (`location.id`),
 * no con el de la pantalla (Caracas, 12 h). Fechas calculadas con
 * `regionalFormat`, no cadenas a ojo.
 */
jest.mock('../../lib/anamnesis/anamnesis-api', () => ({
  ...jest.requireActual('../../lib/anamnesis/anamnesis-api'),
  listAnamnesisInbox: jest.fn(),
  getAnamnesisReview: jest.fn(),
  listPatientAnamnesisRequests: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const inbox = listAnamnesisInbox as jest.MockedFunction<typeof listAnamnesisInbox>;
const review = getAnamnesisReview as jest.MockedFunction<typeof getAnamnesisReview>;
const patientList = listPatientAnamnesisRequests as jest.MockedFunction<typeof listPatientAnamnesisRequests>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const { caracas, berlin, miami } = STAMP_SEDES;
// 23:30 en Caracas del 4 de noviembre, 04:30 en Berlín y 22:30 en Miami (EST) ya el 4.
const SUBMITTED = '2026-11-05T03:30:00.000Z';
const APPOINTMENT = '2026-11-06T18:30:00.000Z';

function submission(id: string, place: { id: string; name: string }, overrides: Partial<AnamnesisSubmission> = {}) {
  return {
    id,
    patient: { id: `p-${id}`, fullName: `Paciente ${id}` },
    appointment: { id: `a-${id}`, start: APPOINTMENT, end: APPOINTMENT } as unknown as AnamnesisSubmission['appointment'],
    location: place,
    status: 'SUBMITTED',
    expiresAt: '2026-11-12T15:00:00.000Z',
    createdAt: '2026-11-01T15:00:00.000Z',
    createdByName: 'Recepción',
    submittedAt: SUBMITTED,
    reviewedAt: null,
    reviewedByName: null,
    rejectReason: null,
    resultingVersionId: null,
    ...overrides,
  } as AnamnesisSubmission;
}

const rowOf = (name: string) => screen.getByRole('link', { name: new RegExp(name) }).closest('tr') as HTMLElement;

beforeEach(() => {
  jest.resetAllMocks();
  window.localStorage.clear();
  mockedLocations.mockResolvedValue([caracas, berlin, miami]);
});
afterEach(() => setActiveLocationId(null));

describe('Bandeja de anamnesis con cada sede', () => {
  it('cada fila lleva la hora de su sede en «Todas las sedes», con la pantalla en Caracas', async () => {
    inbox.mockResolvedValue([
      submission('c', { id: caracas.id, name: caracas.name }),
      submission('b', { id: berlin.id, name: berlin.name }),
      submission('m', { id: miami.id, name: miami.name }),
    ]);
    render(<AnamnesisInboxView token="t" />);
    await screen.findByRole('table');
    await waitFor(() => expect(rowOf('Paciente c')).toHaveTextContent(dateTimeIn('caracas', SUBMITTED)));
    expect(rowOf('Paciente c')).toHaveTextContent(dateTimeIn('caracas', APPOINTMENT));
    expect(rowOf('Paciente b')).toHaveTextContent(dateTimeIn('berlin', SUBMITTED));
    expect(rowOf('Paciente b')).toHaveTextContent(dateTimeIn('berlin', APPOINTMENT));
    expect(rowOf('Paciente m')).toHaveTextContent(dateTimeIn('miami', SUBMITTED));
    // Berlín (24 h) y Caracas (12 h) no se parecen: la misma entrada, dos salidas.
    expect(dateTimeIn('berlin', SUBMITTED)).not.toBe(dateTimeIn('caracas', SUBMITTED));
    expect(rowOf('Paciente b')).not.toHaveTextContent(dateTimeIn('caracas', SUBMITTED));
    expect(screen.queryByText(/No se pudo saber el formato/)).not.toBeInTheDocument();
  });

  it('una fila con sede desconocida dice «—» y el aviso sale UNA vez', async () => {
    inbox.mockResolvedValue([
      submission('g', { id: 'fantasma', name: 'Fantasma' }),
      submission('h', { id: 'fantasma-2', name: 'Otra' }),
      submission('c', { id: caracas.id, name: caracas.name }),
    ]);
    render(<AnamnesisInboxView token="t" />);
    await screen.findByRole('table');
    await waitFor(() => expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1));
    const ghost = within(rowOf('Paciente g'));
    expect(ghost.getAllByText('Sin dato').length).toBeGreaterThanOrEqual(2);
    expect(rowOf('Paciente g')).not.toHaveTextContent(dateTimeIn('caracas', SUBMITTED));
    expect(rowOf('Paciente c')).toHaveTextContent(dateTimeIn('caracas', SUBMITTED));
  });

  it('en el teléfono, una fecha sin formato no pinta «—» en la línea 2 (mobileCell null)', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    inbox.mockResolvedValue([submission('g', { id: 'fantasma', name: 'Fantasma' })]);
    render(<AnamnesisInboxView token="t" />);
    const list = await screen.findByRole('list', { name: /Anamnesis enviadas/ });
    await waitFor(() => expect(screen.getByText(/No se pudo saber el formato regional/)).toBeInTheDocument());
    expect(within(list).queryByText('—')).not.toBeInTheDocument();
    window.matchMedia = original;
  });
});

describe('Revisión de la anamnesis con cada sede', () => {
  function reviewOf(place: { id: string; name: string }): AnamnesisReview {
    return {
      submission: submission('r', place),
      questionnaireVersion: 'v1',
      answers: null,
      affirmativeCount: 0,
      currentVersion: { id: 'v1', version: 1, createdAt: SUBMITTED },
      proposed: { allergies: [] } as AnamnesisReview['proposed'],
      proposedFlags: null,
      diff: { hasPreviousVersion: true, unchangedCount: 0, entries: [] },
    } as unknown as AnamnesisReview;
  }

  it('la solicitud de Berlín se lee en la hora de Berlín; la versión de la historia, con la sede de la pantalla', async () => {
    review.mockResolvedValue(reviewOf({ id: berlin.id, name: berlin.name }));
    render(<AnamnesisReviewView token="t" submissionId="r" canReview />);
    await screen.findByRole('heading', { name: 'Anamnesis de Paciente r' });
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`Enviada por el paciente el ${dateTimeIn('berlin', SUBMITTED)}`))).toBeInTheDocument(),
    );
    expect(screen.getByText(`Para la cita del ${dateTimeIn('berlin', APPOINTMENT)}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`del ${dateTimeIn('caracas', SUBMITTED)}`))).toBeInTheDocument();
  });

  it('la misma solicitud en Caracas sale en 12 h', async () => {
    review.mockResolvedValue(reviewOf({ id: caracas.id, name: caracas.name }));
    render(<AnamnesisReviewView token="t" submissionId="r" canReview />);
    expect(
      await screen.findByText(new RegExp(`Enviada por el paciente el ${dateTimeIn('caracas', SUBMITTED)}`)),
    ).toBeInTheDocument();
    expect(screen.getByText(`Para la cita del ${dateTimeIn('caracas', APPOINTMENT)}`)).toBeInTheDocument();
  });

  it('una sede desconocida deja «—» dentro de la frase (no la omite) y avisa una vez', async () => {
    review.mockResolvedValue(reviewOf({ id: 'fantasma', name: 'Fantasma' }));
    render(<AnamnesisReviewView token="t" submissionId="r" canReview />);
    expect(await screen.findByText('Enviada por el paciente el — · Fantasma')).toBeInTheDocument();
    expect(screen.getByText('Para la cita del —')).toBeInTheDocument();
    expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1);
  });
});

describe('Bloque de la ficha con cada sede', () => {
  it('la anamnesis recibida y el enlace enviado usan la sede de cada solicitud', async () => {
    patientList.mockResolvedValue([
      submission('b', { id: berlin.id, name: berlin.name }),
      submission('w', { id: miami.id, name: miami.name }, { status: 'PENDING_PATIENT', submittedAt: null }),
    ]);
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview onSend={jest.fn()} />);
    expect(
      await screen.findByText(`Recibida el ${dateTimeIn('berlin', SUBMITTED)}. La historia clínica no cambia hasta que un odontólogo la acepte.`),
    ).toBeInTheDocument();
    // `visible` solo suma el último enlace si no hay anamnesis por revisar al principio; el de Miami va en segundo lugar.
    expect(screen.queryByText(/Enlace enviado/)).not.toBeInTheDocument();
  });

  it('un enlace esperando a otro paciente con sede desconocida: «—» y un solo aviso', async () => {
    patientList.mockResolvedValue([
      submission('w', { id: 'fantasma', name: 'Fantasma' }, { status: 'PENDING_PATIENT', submittedAt: null }),
    ]);
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview onSend={jest.fn()} />);
    expect(await screen.findByText('Enlace enviado; caduca el —.')).toBeInTheDocument();
    expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1);
  });

  it('un enlace de Miami caduca con el reloj de Miami (12 h, en-US)', async () => {
    patientList.mockResolvedValue([
      submission('w', { id: miami.id, name: miami.name }, { status: 'PENDING_PATIENT', submittedAt: null }),
    ]);
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview onSend={jest.fn()} />);
    expect(
      await screen.findByText(`Enlace enviado; caduca el ${dateTimeIn('miami', '2026-11-12T15:00:00.000Z')}.`),
    ).toBeInTheDocument();
  });
});
