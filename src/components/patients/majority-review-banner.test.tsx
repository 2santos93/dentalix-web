import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import {
  getMajorityReview,
  submitMajorityReview,
  type MajorityReviewView,
} from '@/lib/patients/majority-review-api';
import { STAMP_FORMATS, STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { MajorityReviewBanner, majorityBannerCopy as copy } from './majority-review-banner';
import { majorityReviewCopy } from './majority-review-dialog';

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn(), dismiss: jest.fn() } }));
jest.mock('../../lib/patients/majority-review-api', () => ({
  ...jest.requireActual('../../lib/patients/majority-review-api'),
  getMajorityReview: jest.fn(),
  submitMajorityReview: jest.fn(),
}));
const mockedGet = getMajorityReview as jest.MockedFunction<typeof getMajorityReview>;
const mockedPost = submitMajorityReview as jest.MockedFunction<typeof submitMajorityReview>;

const stamp = testStamp([STAMP_SEDES.caracas]);
const patient = { id: 'p1', fullName: 'Lucía Mora' };

const view = (over: Partial<MajorityReviewView> = {}): MajorityReviewView => ({
  status: 'PENDING',
  majorityDate: '2026-11-03',
  majorityAge: 18,
  decision: null,
  reviewedAt: null,
  reviewedByName: null,
  responsibles: [{ id: 'r1', name: 'Marta Mora', relationship: 'MOTHER', receivesNotices: true, isPayer: true }],
  ...over,
});

const title = copy.title(18, STAMP_FORMATS.caracas.civilDate('2026-11-03'));

describe('MajorityReviewBanner (DX-342)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPost.mockReset();
  });

  it('PENDING: «Cumplió 18 años el …» y, para recepción/ADMIN, «Revisar responsables»', async () => {
    mockedGet.mockResolvedValue(view());
    render(<MajorityReviewBanner token="tok" patient={patient} canReview stamp={stamp} />);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(title).toBe(
      `Cumplió 18 años el ${STAMP_FORMATS.caracas.civilDate('2026-11-03')}: revisa a quién van sus avisos y recibos`,
    );
    expect(screen.getByRole('button', { name: copy.action })).toBeInTheDocument();
  });

  it('los años salen de la mayoría de edad de la vista', async () => {
    mockedGet.mockResolvedValue(view({ majorityAge: 16, majorityDate: '2024-11-03' }));
    render(<MajorityReviewBanner token="tok" patient={patient} canReview stamp={stamp} />);
    expect(await screen.findByTestId('majority-review-banner')).toHaveTextContent('Cumplió 16 años');
  });

  it('otros roles ven el aviso sin la acción', async () => {
    mockedGet.mockResolvedValue(view());
    render(<MajorityReviewBanner token="tok" patient={patient} canReview={false} stamp={stamp} />);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(copy.bodyNoAction)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.action })).not.toBeInTheDocument();
  });

  it.each(['REVIEWED', 'NOT_APPLICABLE'] as const)('%s: no pinta nada', async (status) => {
    mockedGet.mockResolvedValue(view({ status }));
    const { container } = render(<MajorityReviewBanner token="tok" patient={patient} canReview stamp={stamp} />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('un 403 no pinta nada', async () => {
    mockedGet.mockRejectedValue(new ApiError(403, 'Prohibido'));
    const { container } = render(<MajorityReviewBanner token="tok" patient={patient} canReview={false} stamp={stamp} />);
    await waitFor(() => expect(mockedGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('un fallo deja el error con «Reintentar»', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(view());
    render(<MajorityReviewBanner token="tok" patient={patient} canReview stamp={stamp} />);
    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
  });

  it('tras revisar en el modal, el aviso desaparece', async () => {
    mockedGet.mockResolvedValue(view());
    mockedPost.mockResolvedValue(view({ status: 'REVIEWED', decision: 'PATIENT_SELF', reviewedAt: '2026-11-11T15:00:00.000Z' }));
    render(<MajorityReviewBanner token="tok" patient={patient} canReview stamp={stamp} />);
    await userEvent.click(await screen.findByRole('button', { name: copy.action }));
    await userEvent.click(await screen.findByRole('radio', { name: majorityReviewCopy.patientSelfTitle }));
    await userEvent.click(screen.getByRole('button', { name: majorityReviewCopy.submit }));
    await waitFor(() => expect(screen.queryByTestId('majority-review-banner')).not.toBeInTheDocument());
  });
});
