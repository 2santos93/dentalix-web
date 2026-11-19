import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AnamnesisInboxView } from './anamnesis-inbox-view';
import { AnamnesisReviewView } from './anamnesis-review-view';
import { PatientAnamnesisSection } from './patient-anamnesis-section';
import { AnamnesisSendDialog } from './anamnesis-send-dialog';
import { AnamnesisLinkPanel } from './anamnesis-link-panel';
import { ApiError, NetworkError } from '@/lib/api/api-error';
import { WORK_QUEUES_CHANGED_EVENT } from '@/components/work-queues/work-queues-context';
import { listLocations } from '@/lib/locations/locations-api';
import { caracasSede } from '@/lib/test/sede-clock';
import {
  acceptAnamnesis,
  createAnamnesisRequest,
  getAnamnesisReview,
  listAnamnesisInbox,
  listPatientAnamnesisRequests,
  rejectAnamnesis,
  revokeAnamnesisRequest,
  type AnamnesisRequestCreated,
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

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const inbox = listAnamnesisInbox as jest.MockedFunction<typeof listAnamnesisInbox>;
const review = getAnamnesisReview as jest.MockedFunction<typeof getAnamnesisReview>;
const accept = acceptAnamnesis as jest.MockedFunction<typeof acceptAnamnesis>;
const reject = rejectAnamnesis as jest.MockedFunction<typeof rejectAnamnesis>;
const patientList = listPatientAnamnesisRequests as jest.MockedFunction<typeof listPatientAnamnesisRequests>;
const create = createAnamnesisRequest as jest.MockedFunction<typeof createAnamnesisRequest>;
const revoke = revokeAnamnesisRequest as jest.MockedFunction<typeof revokeAnamnesisRequest>;

function created(overrides: Partial<AnamnesisRequestCreated> = {}): AnamnesisRequestCreated {
  return {
    id: 's2',
    patientId: 'p1',
    appointmentId: null,
    url: 'http://demo.localhost:3001/anamnesis/abc',
    expiresAt: '2999-10-30T15:00:00.000Z',
    whatsapp: { phone: '584121234567', text: 'Hola' },
    whatsappUnavailableReason: null,
    consentRequired: false,
    ...overrides,
  };
}

function submission(overrides: Partial<AnamnesisSubmission> = {}): AnamnesisSubmission {
  return {
    id: 's1',
    patient: { id: 'p1', fullName: 'Natalia Vargas' },
    appointment: null,
    location: { id: 'l1', name: 'Sede principal' },
    status: 'SUBMITTED',
    expiresAt: '2026-10-30T15:00:00.000Z',
    createdAt: '2026-10-22T15:00:00.000Z',
    origin: 'STAFF',
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

beforeEach(() => {
  jest.resetAllMocks();
  // Las solicitudes de estas pruebas son de la sede `l1` (Caracas, 12 h).
  mockedLocations.mockResolvedValue([caracasSede({ id: 'l1' })]);
});

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
  it('«Anamnesis pendiente de revisión» con «Revisar» para quien revisa', async () => {
    patientList.mockResolvedValue([submission()]);
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview onSend={jest.fn()} />);
    expect(await screen.findByText('Anamnesis pendiente de revisión')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar' })).toHaveAttribute('href', '/anamnesis-por-revisar/s1');
    // Con anamnesis (o sin saber aún), no hay aviso: enviar vive en el menú «⋯».
    expect(screen.queryByRole('button', { name: 'Enviar anamnesis' })).not.toBeInTheDocument();
  });

  it('sin anamnesis: UN aviso con «Enviar anamnesis» y «Registrar en Historia clínica»', async () => {
    patientList.mockResolvedValue([]);
    const onSend = jest.fn();
    const onRegister = jest.fn();
    render(
      <PatientAnamnesisSection
        token="t"
        patientId="p1"
        canReview
        status="MISSING"
        onSend={onSend}
        onRegister={onRegister}
      />,
    );
    expect(screen.getByText('Sin anamnesis registrada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar anamnesis' }));
    expect(onSend).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar en Historia clínica' }));
    expect(onRegister).toHaveBeenCalled();
  });

  it('recepción (sin Historia clínica) no ve «Registrar»; con anamnesis y sin enlaces no pinta nada', async () => {
    patientList.mockResolvedValue([]);
    const { rerender, container } = render(
      <PatientAnamnesisSection token="t" patientId="p1" canReview={false} status="MISSING" onSend={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Enviar anamnesis' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar en Historia clínica' })).not.toBeInTheDocument();
    rerender(<PatientAnamnesisSection token="t" patientId="p1" canReview={false} status="CURRENT" onSend={jest.fn()} />);
    await waitFor(() => expect(patientList).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('un enlace más nuevo (esperando o anulado) no tapa la anamnesis que sigue por revisar', async () => {
    patientList.mockResolvedValue([
      submission({ id: 's3', status: 'EXPIRED', submittedAt: null }),
      submission({ id: 's2', status: 'PENDING_PATIENT', submittedAt: null }),
      submission({ id: 's1', status: 'SUBMITTED' }),
    ]);
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview onSend={jest.fn()} />);
    expect(await screen.findByText('Anamnesis pendiente de revisión')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revisar' })).toHaveAttribute('href', '/anamnesis-por-revisar/s1');
    // Y el último enlace sigue a la vista.
    expect(screen.getByText('Caducada o anulada')).toBeInTheDocument();
  });

  it('recepción no ve «Revisar»', async () => {
    patientList.mockResolvedValue([submission()]);
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview={false} onSend={jest.fn()} />);
    await screen.findByText('Anamnesis pendiente de revisión');
    expect(screen.queryByRole('link', { name: 'Revisar' })).not.toBeInTheDocument();
  });

  it('el diálogo «Enviar anamnesis» genera el enlace con un clic explícito y avisa a la ficha', async () => {
    create.mockResolvedValue({
      id: 's2',
      patientId: 'p1',
      appointmentId: null,
      url: 'http://demo.localhost:3001/anamnesis/abc',
      expiresAt: '2026-10-30T15:00:00.000Z',
      whatsapp: { phone: '584121234567', text: 'Hola' },
      whatsappUnavailableReason: null,
      consentRequired: false,
    });
    const onCreated = jest.fn();
    render(<AnamnesisSendDialog open onOpenChange={jest.fn()} token="t" patientId="p1" onCreated={onCreated} />);
    const dialog = screen.getByRole('dialog', { name: 'Anamnesis por enlace' });
    expect(create).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar anamnesis' }));
    expect(await screen.findByDisplayValue('http://demo.localhost:3001/anamnesis/abc')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir WhatsApp/ })).toHaveAttribute(
      'href',
      'https://wa.me/584121234567?text=Hola',
    );
    expect(onCreated).toHaveBeenCalled();
    // DX-298: en 12 h la hora termina en «a. m.»: sin un punto de más detrás.
    expect(screen.getByText(/^Sirve una sola vez y caduca el /)).not.toHaveTextContent('..');
  });
});

describe('DX-298 (FE-072): anular y regenerar se confirman', () => {
  it('«Anular enlace» abre un ConfirmDialog; Cancelar no llama a la API', async () => {
    patientList.mockResolvedValue([submission({ id: 's2', status: 'PENDING_PATIENT', submittedAt: null })]);
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview onSend={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Anular enlace' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Anular el enlace de anamnesis?' });
    expect(dialog).toHaveTextContent('No se puede deshacer');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mantener el enlace' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revoke).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Anular enlace' })).toBeInTheDocument();
  });

  it('confirmar anula, anuncia «Enlace anulado.» en una región status y le da el foco', async () => {
    patientList.mockResolvedValue([submission({ id: 's2', status: 'PENDING_PATIENT', submittedAt: null })]);
    revoke.mockResolvedValue(submission({ id: 's2', status: 'EXPIRED', submittedAt: null }));
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview onSend={jest.fn()} />);
    const status = await screen.findByTestId('anamnesis-revoke-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: 'Anular enlace' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Anular el enlace de anamnesis?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anular enlace' }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('t', 's2'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(status).toHaveTextContent('Enlace anulado.');
    expect(screen.getByText('Caducada o anulada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anular enlace' })).not.toBeInTheDocument();
    await waitFor(() => expect(status).toHaveFocus());
  });

  it('si anular falla, el error queda dentro del diálogo, que sigue abierto', async () => {
    patientList.mockResolvedValue([submission({ id: 's2', status: 'PENDING_PATIENT', submittedAt: null })]);
    revoke.mockRejectedValue(new NetworkError(new TypeError('x')));
    render(<PatientAnamnesisSection token="t" patientId="p1" canReview onSend={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Anular enlace' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Anular enlace' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('anamnesis-revoke-status')).toBeEmptyDOMElement();
  });

  it('«Enviar anamnesis» es secundario y el primer enlace no pide confirmación', async () => {
    create.mockResolvedValue(created());
    render(<AnamnesisLinkPanel token="t" patientId="p1" />);
    const send = screen.getByRole('button', { name: 'Enviar anamnesis' });
    // Secundario (superficie y borde), no el primario de la marca: la ficha y la cita ya tienen el suyo.
    expect(send).toHaveClass('bg-surface', 'border-border');
    expect(send).not.toHaveClass('bg-primary');
    fireEvent.click(send);
    expect(await screen.findByDisplayValue('http://demo.localhost:3001/anamnesis/abc')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('«Generar otro enlace» con uno vivo abre un ConfirmDialog; Cancelar no llama a la API y Confirmar sí', async () => {
    create
      .mockResolvedValueOnce(created())
      .mockResolvedValueOnce(created({ id: 's3', url: 'http://demo.localhost:3001/anamnesis/def' }));
    render(<AnamnesisLinkPanel token="t" patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar anamnesis' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Generar otro enlace' }));
    let dialog = await screen.findByRole('dialog', { name: '¿Generar otro enlace?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mantener este enlace' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(create).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Generar otro enlace' }));
    dialog = await screen.findByRole('dialog', { name: '¿Generar otro enlace?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generar otro enlace' }));
    expect(await screen.findByDisplayValue('http://demo.localhost:3001/anamnesis/def')).toBeInTheDocument();
    expect(create).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Enlace nuevo listo; el anterior quedó anulado.')).toHaveAttribute('role', 'status');
  });

  it('con el enlace ya caducado, «Generar otro enlace» no pide confirmación', async () => {
    create.mockResolvedValue(created({ expiresAt: '2000-01-01T00:00:00.000Z' }));
    render(<AnamnesisLinkPanel token="t" patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar anamnesis' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Generar otro enlace' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('WhatsApp deshabilitado: aria-describedby solo si la API dio el motivo', async () => {
    create.mockResolvedValueOnce(created({ whatsapp: null, whatsappUnavailableReason: null }));
    const { unmount } = render(<AnamnesisLinkPanel token="t" patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar anamnesis' }));
    const off = await screen.findByRole('button', { name: /Abrir WhatsApp/ });
    expect(off).toBeDisabled();
    expect(off).not.toHaveAttribute('aria-describedby');
    unmount();

    create.mockResolvedValueOnce(created({ whatsapp: null, whatsappUnavailableReason: 'El paciente no tiene móvil.' }));
    render(<AnamnesisLinkPanel token="t" patientId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar anamnesis' }));
    expect(await screen.findByRole('button', { name: /Abrir WhatsApp/ })).toHaveAccessibleDescription(
      'El paciente no tiene móvil.',
    );
  });
});

describe('DX-298 (FE-072): la revisión lleva el foco al resultado y relee ante un 409', () => {
  it('«Aceptar»: foco en el bloque de resultado y la bandeja relee', async () => {
    review.mockResolvedValue(reviewFixture());
    accept.mockResolvedValue(submission({ status: 'ACCEPTED' }));
    const changed = jest.fn();
    window.addEventListener(WORK_QUEUES_CHANGED_EVENT, changed);
    try {
      render(<AnamnesisReviewView token="t" submissionId="s1" canReview />);
      fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }));
      const outcome = await screen.findByTestId('anamnesis-review-outcome');
      expect(outcome).toHaveTextContent('Anamnesis aceptada');
      await waitFor(() => expect(outcome).toHaveFocus());
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(WORK_QUEUES_CHANGED_EVENT, changed);
    }
  });

  it('«Rechazar»: al cerrar el diálogo, el foco va al resultado y no a <body>', async () => {
    review.mockResolvedValue(reviewFixture());
    reject.mockResolvedValue(submission({ status: 'REJECTED', rejectReason: 'No es del paciente' }));
    render(<AnamnesisReviewView token="t" submissionId="s1" canReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'No es del paciente' } });
    fireEvent.submit(dialog.querySelector('form')!);
    const outcome = await screen.findByTestId('anamnesis-review-outcome');
    expect(outcome).toHaveTextContent('Anamnesis rechazada');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(outcome).toHaveFocus());
  });

  it('un 409 al aceptar relee la revisión: aviso, quién la revisó y ningún botón de acción', async () => {
    const reviewed = reviewFixture();
    reviewed.submission = submission({
      status: 'ACCEPTED',
      reviewedByName: 'Dra. Ruiz',
      reviewedAt: '2026-10-23T16:00:00.000Z',
    });
    review.mockResolvedValueOnce(reviewFixture()).mockResolvedValueOnce(reviewed);
    accept.mockRejectedValue(new ApiError(409, 'Esta anamnesis ya fue revisada.'));
    render(<AnamnesisReviewView token="t" submissionId="s1" canReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }));
    const outcome = await screen.findByTestId('anamnesis-review-outcome');
    expect(outcome).toHaveTextContent('Esta anamnesis ya no está por revisar');
    expect(outcome).toHaveTextContent('Esta anamnesis ya fue revisada.');
    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
    expect(await within(outcome).findByText(/Aceptada por Dra\. Ruiz/)).toBeInTheDocument();
    for (const name of ['Aceptar', 'Ajustar y aceptar', 'Rechazar']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    await waitFor(() => expect(outcome).toHaveFocus());
  });

  it('un 409 al rechazar cierra el diálogo y relee', async () => {
    const reviewed = reviewFixture();
    reviewed.submission = submission({ status: 'REJECTED', rejectReason: 'Duplicada' });
    review.mockResolvedValueOnce(reviewFixture()).mockResolvedValueOnce(reviewed);
    reject.mockRejectedValue(new ApiError(409, 'Esta anamnesis ya fue revisada.'));
    render(<AnamnesisReviewView token="t" submissionId="s1" canReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: 'No es del paciente' } });
    fireEvent.submit(dialog.querySelector('form')!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Duplicada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument();
  });

  it('si tras el 409 sigue por revisar, vuelven los botones con el mensaje como error', async () => {
    review.mockResolvedValue(reviewFixture());
    accept.mockRejectedValue(new ApiError(409, 'La versión de la historia cambió: vuelve a intentarlo.'));
    render(<AnamnesisReviewView token="t" submissionId="s1" canReview />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Aceptar' })).toBeInTheDocument();
    expect(screen.getByText('La versión de la historia cambió: vuelve a intentarlo.')).toBeInTheDocument();
  });

  it('«Anamnesis por revisar» es el volver de PageHeader', async () => {
    review.mockResolvedValue(reviewFixture());
    render(<AnamnesisReviewView token="t" submissionId="s1" canReview />);
    expect(screen.getByRole('link', { name: 'Anamnesis por revisar' })).toHaveAttribute('href', '/anamnesis-por-revisar');
    await screen.findByRole('heading', { name: 'Anamnesis de Natalia Vargas' });
    expect(screen.getByRole('link', { name: 'Anamnesis por revisar' })).toHaveAttribute('href', '/anamnesis-por-revisar');
  });
});
