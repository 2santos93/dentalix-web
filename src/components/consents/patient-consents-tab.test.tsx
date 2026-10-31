import { render, screen, within } from '@testing-library/react';
import { PatientConsentsTab } from './patient-consents-tab';
import { listPatientConsents } from '@/lib/consents/consents-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/consents/consents-api', () => ({
  ...jest.requireActual('../../lib/consents/consents-api'),
  listPatientConsents: jest.fn(),
  listConsentTemplates: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  listPlans: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  ...jest.requireActual('../../lib/signature-requests/signature-requests-api'),
  listSignatureRequests: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede()]),
}));

const mockedList = listPatientConsents as jest.MockedFunction<typeof listPatientConsents>;

const consent = {
  id: 'c1',
  tenantId: 't1',
  patientId: 'p1',
  templateId: 'tpl-1',
  templateVersion: 2,
  treatmentPlanId: null,
  title: 'Consentimiento de exodoncia',
  signerType: 'GUARDIAN' as const,
  signerName: 'Marta Pérez',
  signerDocument: 'Documento A DOC-999',
  professionalName: 'Dra. Laura Gómez',
  contentHash: 'a'.repeat(64),
  signedAt: '2026-10-16T15:00:00.000Z',
  recordedById: 'u1',
  remote: null,
  professionalSignedAt: '2026-10-16T15:00:00.000Z',
  complete: true,
};

const remoteConsent = {
  ...consent,
  id: 'c2',
  signerType: 'PATIENT' as const,
  signerName: 'Ana Pérez',
  remote: {
    signatureRequestId: 'sr-1',
    channel: 'EMAIL' as const,
    destinationMasked: 'an***@example.com',
    sentAt: '2026-10-16T12:00:00.000Z',
    openedAt: '2026-10-16T13:00:00.000Z',
    verifiedAt: '2026-10-16T13:01:00.000Z',
    professionalUserId: 'u-dentist',
  },
  professionalSignedAt: null,
  complete: false,
};

const CLINICAL = { role: 'DENTIST' as const, userId: 'u-dentist' };

describe('PatientConsentsTab', () => {
  beforeEach(() => mockedList.mockReset());

  it('carga con esqueleto (estado de carga anunciado)', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PatientConsentsTab token="tok" patientId="p1" {...CLINICAL} />);
    expect(screen.getByRole('status', { name: /cargando consentimientos/i })).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('estado vacío que enseña qué hacer', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientConsentsTab token="tok" patientId="p1" {...CLINICAL} />);
    expect(
      await screen.findByText('Este paciente no tiene consentimientos firmados.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo consentimiento/i })).toBeInTheDocument();
  });

  it('error de carga con reintento (SectionError)', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedList.mockResolvedValueOnce([consent]);
    render(<PatientConsentsTab token="tok" patientId="p1" {...CLINICAL} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los consentimientos.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      (await screen.findAllByText('Consentimiento de exodoncia')).length,
    ).toBeGreaterThan(0);
  });

  it('lista firmante, profesional y un enlace a la vista imprimible; sin editar ni borrar', async () => {
    mockedList.mockResolvedValue([consent]);
    render(<PatientConsentsTab token="tok" patientId="p1" {...CLINICAL} />);

    const table = await screen.findByRole('table', { name: 'Consentimientos firmados' });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent('Marta Pérez (tutor/a)');
    expect(row).toHaveTextContent('Dra. Laura Gómez');
    expect(row).toHaveTextContent('Versión 2 de la plantilla');
    const link = within(row).getByRole('link', { name: /ver e imprimir/i });
    expect(link).toHaveAttribute('href', '/print/patients/p1/consents/c1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('button', { name: /editar|borrar|eliminar/i })).not.toBeInTheDocument();
  });

  it('«Nuevo consentimiento» abre el modal', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    render(<PatientConsentsTab token="tok" patientId="p1" {...CLINICAL} />);
    await user.click(await screen.findByRole('button', { name: /nuevo consentimiento/i }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo consentimiento' })).toBeInTheDocument();
  });

  it('DX-243: «Completo» o «Falta firma del profesional»; solo el profesional elegido ve «Firmar como profesional»', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([remoteConsent, consent]);
    render(<PatientConsentsTab token="tok" patientId="p1" {...CLINICAL} />);
    const table = await screen.findByRole('table', { name: 'Consentimientos firmados' });
    const [, remoteRow, onScreenRow] = within(table).getAllByRole('row');
    expect(remoteRow).toHaveTextContent('Falta firma del profesional');
    expect(remoteRow).toHaveTextContent('A distancia');
    expect(onScreenRow).toHaveTextContent('Completo');
    // Lo que falta de MI firma se anuncia arriba, con su botón…
    expect(screen.getByText('Falta tu firma como profesional')).toBeInTheDocument();
    // …y está en el «⋯» de su fila; la fila completa no lo ofrece.
    await user.click(within(onScreenRow).getByRole('button', { name: /^Acciones de/ }));
    expect(await screen.findByRole('menuitem', { name: /ver e imprimir/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /firmar como profesional/i })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(within(remoteRow).getByRole('button', { name: /^Acciones de/ }));
    await user.click(await screen.findByRole('menuitem', { name: /firmar como profesional/i }));
    expect(await screen.findByRole('dialog', { name: 'Firmar como profesional' })).toBeInTheDocument();
  });

  it('DX-243: otro profesional no ve el botón de firmar lo que no le enviaron', async () => {
    mockedList.mockResolvedValue([remoteConsent]);
    render(<PatientConsentsTab token="tok" patientId="p1" role="ADMIN" userId="u-admin" />);
    const table = await screen.findByRole('table', { name: 'Consentimientos firmados' });
    expect(within(table).queryByRole('button', { name: /firmar como profesional/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Falta tu firma como profesional')).not.toBeInTheDocument();
  });

  it('DX-243: el aviso «Falta tu firma» abre la firma del profesional', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([remoteConsent]);
    render(<PatientConsentsTab token="tok" patientId="p1" {...CLINICAL} />);
    await screen.findByRole('table', { name: 'Consentimientos firmados' });
    await user.click(screen.getByRole('button', { name: /firmar como profesional/i }));
    expect(await screen.findByRole('dialog', { name: 'Firmar como profesional' })).toBeInTheDocument();
  });

  it('DX-243: recepción ve solo la firma a distancia (no pide los documentos firmados)', async () => {
    render(<PatientConsentsTab token="tok" patientId="p1" role="RECEPTION" userId="u-rec" />);
    expect(await screen.findByRole('button', { name: /enviar a firmar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nuevo consentimiento/i })).not.toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });
});
