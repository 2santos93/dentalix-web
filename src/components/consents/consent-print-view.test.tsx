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
    signerDocument: 'ID local DOC-1020',
    professionalName: 'Dra. Laura Gómez',
    patientSignature: 'data:image/png;base64,AAA',
    professionalSignature: 'data:image/png;base64,BBB',
    contentHash: 'f'.repeat(64),
    signedAt: '2026-10-16T15:00:00.000Z',
    recordedById: 'u1',
    remote: null,
    professionalSignedAt: '2026-10-16T15:00:00.000Z',
    complete: true,
    remoteIpAddress: null,
    clinic: { name: 'Clínica Sonrisas', logoUrl: 'https://cdn.example.com/logo.png' },
    patient: { id: 'p1', firstName: 'Ana', lastName: 'Pérez', docType: 'NATIONAL_ID', docTypeLabel: null, docTypeName: 'ID local', docNumber: 'DOC-1020' },
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
    expect(screen.getByText('Paciente · ID local DOC-1020')).toBeInTheDocument();
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
        consent={consentFixture({ signerType: 'GUARDIAN', signerName: 'Marta', signerDocument: 'Documento A DOC-9' })}
      />,
    );
    expect(screen.getByText('Tutor/a · Documento A DOC-9')).toBeInTheDocument();
  });

  it('prints the docTypeName of the DTO, or the generic name when it is missing', () => {
    const { rerender } = render(<ConsentDocument consent={consentFixture()} />);
    const header = () => screen.getByText('Documento').closest('div') as HTMLElement;
    expect(header()).toHaveTextContent('ID local DOC-1020');

    // API anterior en el hueco del despliegue: sin `docTypeName`, el genérico.
    rerender(
      <ConsentDocument
        consent={consentFixture({
          patient: { id: 'p1', firstName: 'Ana', lastName: 'Pérez', docType: 'RESIDENCE_PERMIT', docNumber: 'DOC-1020' } as never,
        })}
      />,
    );
    expect(header()).toHaveTextContent('Permiso de residencia DOC-1020');
    expect(header()).not.toHaveTextContent('RESIDENCE_PERMIT');
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

describe('ConsentDocument firmado a distancia (DX-243)', () => {
  const remote = {
    signatureRequestId: 'sr-1',
    channel: 'EMAIL' as const,
    destinationMasked: 'an***@example.com',
    sentAt: '2026-10-16T12:00:00.000Z',
    openedAt: '2026-10-16T13:00:00.000Z',
    verifiedAt: '2026-10-16T13:01:00.000Z',
    professionalUserId: 'u2',
  };

  it('sin la firma del profesional: lo dice, no pinta su firma y muestra las evidencias', () => {
    render(
      <ConsentDocument
        consent={consentFixture({
          remote,
          professionalSignature: null,
          professionalSignedAt: null,
          complete: false,
          remoteIpAddress: '203.0.113.7',
        })}
      />,
    );
    expect(screen.queryByRole('img', { name: 'Firma de Dra. Laura Gómez' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Pendiente de la firma del profesional').length).toBeGreaterThan(0);
    expect(screen.getByText(/Falta la firma del profesional/)).toBeInTheDocument();
    const evidence = screen.getByRole('region', { name: 'Firma a distancia (evidencias)' });
    expect(within(evidence).getByText('Enviado por email a an***@example.com')).toBeInTheDocument();
    expect(within(evidence).getByText('203.0.113.7')).toBeInTheDocument();
  });

  it('completo: las dos firmas y sin aviso', () => {
    render(<ConsentDocument consent={consentFixture({ remote, remoteIpAddress: '203.0.113.7' })} />);
    expect(screen.getByRole('img', { name: 'Firma de Dra. Laura Gómez' })).toBeInTheDocument();
    expect(screen.queryByText(/Falta la firma del profesional/)).not.toBeInTheDocument();
  });

  it('firmado por el responsable: las evidencias lo dicen con su nombre, no «por el paciente»', () => {
    render(
      <ConsentDocument
        consent={consentFixture({
          remote,
          signerType: 'GUARDIAN',
          signerName: 'Claudia Navarro',
          professionalSignature: null,
          professionalSignedAt: null,
          complete: false,
          remoteIpAddress: '203.0.113.7',
        })}
      />,
    );
    const evidence = screen.getByRole('region', { name: 'Firma a distancia (evidencias)' });
    expect(within(evidence).getByText(/^Firmado por el responsable \(Claudia Navarro\)/)).toBeInTheDocument();
    expect(within(evidence).getByText(/^IP de quien firmó/)).toBeInTheDocument();
    expect(screen.queryByText(/por el paciente/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/^Firmado a distancia por el responsable \(Claudia Navarro\)\. Falta la firma del profesional/),
    ).toBeInTheDocument();
  });
});
