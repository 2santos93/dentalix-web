import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArchiveLinksNotice, archiveLinksCopy } from './archive-links-notice';
import { getPatientLivePublicLinks, type LivePublicLinks } from '@/lib/patients/patients-api';

jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  getPatientLivePublicLinks: jest.fn(),
}));

const mockedCount = getPatientLivePublicLinks as jest.MockedFunction<
  typeof getPatientLivePublicLinks
>;

function links(overrides: Partial<LivePublicLinks> = {}): LivePublicLinks {
  const base = {
    slotOffers: 0,
    consentSignatures: 0,
    budgetSignatures: 0,
    signedPdfCopies: 0,
    anamnesis: 0,
    ...overrides,
  };
  return {
    ...base,
    total:
      base.slotOffers +
      base.consentSignatures +
      base.budgetSignatures +
      base.signedPdfCopies +
      base.anamnesis,
  };
}

beforeEach(() => jest.resetAllMocks());

test('mientras cuenta, lo anuncia como estado', async () => {
  mockedCount.mockReturnValue(new Promise(() => undefined));
  render(<ArchiveLinksNotice token="tok" patientId="p1" />);
  expect(screen.getByRole('status')).toHaveTextContent(archiveLinksCopy.loading);
  expect(mockedCount).toHaveBeenCalledWith('tok', 'p1');
});

test('avisa cuántos enlaces se anularán y de qué tipo', async () => {
  mockedCount.mockResolvedValue(
    links({ slotOffers: 1, budgetSignatures: 2, signedPdfCopies: 1, anamnesis: 2 }),
  );
  render(<ArchiveLinksNotice token="tok" patientId="p1" />);
  expect(await screen.findByText('Se anularán 6 enlaces enviados')).toBeInTheDocument();
  const list = screen.getByRole('list', { name: 'Enlaces que se anularán' });
  expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    '1 oferta de hueco',
    '2 presupuestos por aceptar',
    '1 copia de un documento firmado',
    '2 cuestionarios de salud',
  ]);
  expect(screen.getByText(archiveLinksCopy.explanation)).toBeInTheDocument();
});

test('singular: «Se anulará 1 enlace enviado»', async () => {
  mockedCount.mockResolvedValue(links({ consentSignatures: 1 }));
  render(<ArchiveLinksNotice token="tok" patientId="p1" />);
  expect(await screen.findByText('Se anulará 1 enlace enviado')).toBeInTheDocument();
  expect(screen.getByText('1 consentimiento por firmar')).toBeInTheDocument();
});

test('sin enlaces vivos lo dice en una línea, sin aviso', async () => {
  mockedCount.mockResolvedValue(links());
  render(<ArchiveLinksNotice token="tok" patientId="p1" />);
  expect(await screen.findByText(archiveLinksCopy.none)).toBeInTheDocument();
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

test('si no se pueden contar: error en su sitio con reintento, que vuelve a pedirlos', async () => {
  const user = userEvent.setup();
  mockedCount
    .mockRejectedValueOnce(new Error('red caída'))
    .mockResolvedValueOnce(links({ slotOffers: 2 }));
  render(<ArchiveLinksNotice token="tok" patientId="p1" />);
  expect(await screen.findByText(archiveLinksCopy.error)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Se anularán 2 enlaces enviados')).toBeInTheDocument();
  expect(mockedCount).toHaveBeenCalledTimes(2);
});
