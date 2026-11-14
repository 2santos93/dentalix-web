import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/client';
import {
  getMajorityReview,
  submitMajorityReview,
  MAJORITY_REVIEW_NOTE_MAX,
  type MajorityReviewView,
} from '@/lib/patients/majority-review-api';
import { STAMP_FORMATS, STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { MajorityReviewDialog, majorityReviewCopy as copy } from './majority-review-dialog';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() } }));
jest.mock('../../lib/patients/majority-review-api', () => ({
  ...jest.requireActual('../../lib/patients/majority-review-api'),
  getMajorityReview: jest.fn(),
  submitMajorityReview: jest.fn(),
}));
const mockedGet = getMajorityReview as jest.MockedFunction<typeof getMajorityReview>;
const mockedPost = submitMajorityReview as jest.MockedFunction<typeof submitMajorityReview>;

const stamp = testStamp([STAMP_SEDES.caracas]);

const view = (over: Partial<MajorityReviewView> = {}): MajorityReviewView => ({
  status: 'PENDING',
  majorityDate: '2026-11-03',
  majorityAge: 18,
  decision: null,
  reviewedAt: null,
  reviewedByName: null,
  responsibles: [
    { id: 'r1', name: 'Marta Mora', relationship: 'MOTHER', receivesNotices: true, isPayer: true },
    { id: 'r2', name: 'Pedro Mora', relationship: 'FATHER', receivesNotices: false, isPayer: false },
  ],
  ...over,
});

function renderDialog(props: Partial<React.ComponentProps<typeof MajorityReviewDialog>> = {}) {
  const onReviewed = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <MajorityReviewDialog
      open
      onOpenChange={onOpenChange}
      token="tok"
      patientId="p1"
      patientName="Lucía Mora"
      stamp={stamp}
      onReviewed={onReviewed}
      {...props}
    />,
  );
  return { onReviewed, onOpenChange };
}

describe('MajorityReviewDialog (DX-342)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
    (toast.success as jest.Mock).mockReset();
  });

  it('lista los responsables con parentesco, «Recibe avisos» y «Pagador», y explica las dos opciones', async () => {
    mockedGet.mockResolvedValue(view());
    renderDialog();
    const list = await screen.findByRole('list', { name: copy.responsiblesListLabel });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Marta Mora · Madre');
    expect(rows[0]).toHaveTextContent(copy.receivesNotices);
    expect(rows[0]).toHaveTextContent(copy.payer);
    expect(rows[1]).toHaveTextContent('Pedro Mora · Padre');
    expect(rows[1]).not.toHaveTextContent(copy.payer);
    expect(screen.getByRole('radio', { name: copy.patientSelfTitle })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: copy.keepTitle })).toBeInTheDocument();
    expect(screen.getByText(copy.patientSelfDescription)).toBeInTheDocument();
    expect(screen.getByText(copy.keepDescription)).toBeInTheDocument();
    // La fecha de mayoría de edad con el formato de la sede.
    expect(
      screen.getByText(copy.description('Lucía Mora', STAMP_FORMATS.caracas.civilDate('2026-11-03'))),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.editResponsibles })).toHaveAttribute(
      'href',
      '/patients/p1?tab=data#responsable-y-familia',
    );
  });

  it('sin elegir opción no envía y lo dice junto al grupo', async () => {
    mockedGet.mockResolvedValue(view());
    renderDialog();
    await screen.findByRole('radio', { name: copy.patientSelfTitle });
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText(copy.decisionRequired)).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it(`una nota de más de ${MAJORITY_REVIEW_NOTE_MAX} caracteres no se envía`, async () => {
    mockedGet.mockResolvedValue(view());
    renderDialog();
    await userEvent.click(await screen.findByRole('radio', { name: copy.patientSelfTitle }));
    const note = screen.getByLabelText(copy.note);
    await userEvent.click(note);
    await userEvent.paste('x'.repeat(MAJORITY_REVIEW_NOTE_MAX + 1));
    expect(screen.getByText(copy.counter(MAJORITY_REVIEW_NOTE_MAX + 1))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText(copy.noteTooLong)).toBeInTheDocument();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('guarda PATIENT_SELF con la nota, avisa con un toast y cierra', async () => {
    mockedGet.mockResolvedValue(view());
    const saved = view({ status: 'REVIEWED', decision: 'PATIENT_SELF', reviewedAt: '2026-11-11T15:00:00.000Z', reviewedByName: 'Rita' });
    mockedPost.mockResolvedValue(saved);
    const { onReviewed, onOpenChange } = renderDialog();
    await userEvent.click(await screen.findByRole('radio', { name: copy.patientSelfTitle }));
    await userEvent.type(screen.getByLabelText(copy.note), '  Lo habló con la madre  ');
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(mockedPost).toHaveBeenCalledWith('tok', 'p1', { decision: 'PATIENT_SELF', note: 'Lo habló con la madre' });
    expect(toast.success).toHaveBeenCalledWith(copy.saved('Lucía Mora'));
    expect(onReviewed).toHaveBeenCalledWith(saved);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    [409, 'El paciente aún es menor de edad.'],
    [422, 'El paciente no tiene responsables que revisar.'],
    [403, 'Solo recepción y administración revisan la mayoría de edad.'],
  ])('un %i muestra el mensaje en español de la API y no cierra', async (status, message) => {
    mockedGet.mockResolvedValue(view());
    mockedPost.mockRejectedValue(new ApiError(status, message));
    const { onReviewed, onOpenChange } = renderDialog();
    await userEvent.click(await screen.findByRole('radio', { name: copy.keepTitle }));
    await userEvent.click(screen.getByRole('button', { name: copy.submit }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onReviewed).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('ya revisado: dice quién y cuándo y deja marcada la decisión', async () => {
    const reviewedAt = '2026-11-05T14:30:00.000Z';
    mockedGet.mockResolvedValue(
      view({ status: 'REVIEWED', decision: 'KEEP_RESPONSIBLE', reviewedAt, reviewedByName: 'Rita Recepción' }),
    );
    renderDialog();
    const when = STAMP_FORMATS.caracas.dateTime(new Date(reviewedAt), 'America/Caracas');
    expect(await screen.findByTestId('majority-review-reviewed')).toHaveTextContent(
      copy.reviewedBy('Rita Recepción', when),
    );
    expect(screen.getByRole('radio', { name: copy.keepTitle })).toBeChecked();
  });

  it('si no carga, el error con «Reintentar» vuelve a leer', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(view());
    renderDialog();
    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.submit })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('radio', { name: copy.patientSelfTitle })).toBeInTheDocument();
  });
});
