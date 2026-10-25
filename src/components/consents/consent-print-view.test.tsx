import { render, screen, within } from '@testing-library/react';
import { ConsentPrintView } from './consent-print-view';
import { ConsentDocument } from './consent-document';
import { getPatientConsent, type PatientConsentDocument } from '@/lib/consents/consents-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/consents/consents-api', () => ({
  ...jest.requireActual('../../lib/consents/consents-api'),
  getPatientConsent: jest.fn(),
}));

const mockedGet = getPatientConsent as jest.MockedFunction<typeof getPatientConsent>;

function consentFixture(overrides: Partial<PatientConsentDocument> = {}): PatientConsentDocument {
  return {
    id: 'c1',
    tenantId: 't1',
    patientId: 'p1',
    templateId: 'tpl-1',
    templateVersion: 1,
    treatmentPlanId: null,
    title: 'Consentimiento de exodoncia',
    body: 'Yo, Ana Pérez, autorizo.\n\nFecha: 16 de octubre de 2026.',
    signerType: 'PATIENT',
    signerName: 'Ana Pérez',
    signerDocument: 'CC 1020',
    professionalName: 'Dra. Laura Gómez',
    patientSignature: 'data:image/png;base64,AAA',
    professionalSignature: 'data:image/png;base64,BBB',
    contentHash: 'f'.repeat(64),
    signedAt: '2026-10-16T15:00:00.000Z',
    recordedById: 'u1',
    clinic: { name: 'Clínica Sonrisas', logoUrl: 'https://cdn.example.com/logo.png' },
    patient: { id: 'p1', firstName: 'Ana', lastName: 'Pérez', docType: 'CC', docNumber: '1020' },
    integrityOk: true,
    ...overrides,
  };
}

describe('ConsentDocument', () => {
  it('pinta logo y nombre de la clínica, texto, ambas firmas, fecha y huella', () => {
    render(<ConsentDocument consent={consentFixture()} />);
    const header = screen.getByTestId('consent-header');
    expect(within(header).getByRole('img', { name: 'Clínica Sonrisas' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/logo.png',
    );
    expect(within(header).getByRole('img', { name: 'Clínica Sonrisas' })).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(within(header).getByRole('heading', { name: 'Consentimiento de exodoncia' })).toBeInTheDocument();
    expect(screen.getByText(/Yo, Ana Pérez, autorizo\./)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Firma de Ana Pérez' })).toHaveAttribute(
      'src',
      'data:image/png;base64,AAA',
    );
    expect(screen.getByRole('img', { name: 'Firma de Dra. Laura Gómez' })).toHaveAttribute(
      'src',
      'data:image/png;base64,BBB',
    );
    expect(screen.getByText('Paciente · CC 1020')).toBeInTheDocument();
    expect(screen.getByText('f'.repeat(64))).toBeInTheDocument();
    expect(screen.queryByText(/pudo alterarse/)).not.toBeInTheDocument();
    // Raíz con la clase que pide A4 al imprimir (globals.css: @page consent).
    expect(document.querySelector('.consent-print-root')).toBeInTheDocument();
  });

  it('avisa si la huella no coincide', () => {
    render(<ConsentDocument consent={consentFixture({ integrityOk: false })} />);
    expect(screen.getByText(/pudo alterarse fuera de Dentalix/)).toBeInTheDocument();
  });

  it('nombra al tutor cuando firma un tutor', () => {
    render(
      <ConsentDocument
        consent={consentFixture({ signerType: 'GUARDIAN', signerName: 'Marta', signerDocument: 'CC 9' })}
      />,
    );
    expect(screen.getByText('Tutor/a · CC 9')).toBeInTheDocument();
  });
});

describe('ConsentPrintView', () => {
  const print = jest.fn();
  beforeEach(() => {
    mockedGet.mockReset();
    print.mockReset();
    window.print = print;
  });

  it('carga el documento y abre el diálogo de impresión una vez', async () => {
    mockedGet.mockResolvedValue(consentFixture());
    render(<ConsentPrintView token="tok" patientId="p1" consentId="c1" />);
    expect(await screen.findByTestId('consent-header')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok', 'p1', 'c1');
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /volver a la ficha/i })).toHaveAttribute(
      'href',
      '/patients/p1?tab=consents',
    );
  });

  it('sin permiso no pide nada y lo explica', () => {
    render(<ConsentPrintView token="tok" patientId="p1" consentId="c1" allowed={false} />);
    expect(screen.getByText(/tu rol no tiene acceso/i)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('404 es un aviso sin reintento; otro error, SectionError con reintento', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(404, 'Consentimiento no encontrado'));
    const { unmount } = render(<ConsentPrintView token="tok" patientId="p1" consentId="c1" />);
    expect(await screen.findByText('No encontramos este consentimiento.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    unmount();

    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    render(<ConsentPrintView token="tok" patientId="p1" consentId="c1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar el consentimiento.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
