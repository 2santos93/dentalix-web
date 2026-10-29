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
};

describe('PatientConsentsTab', () => {
  beforeEach(() => mockedList.mockReset());

  it('carga con esqueleto (estado de carga anunciado)', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    const { container } = render(<PatientConsentsTab token="tok" patientId="p1" />);
    expect(screen.getByRole('status', { name: /cargando consentimientos/i })).toBeInTheDocument();
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('estado vacío que enseña qué hacer', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientConsentsTab token="tok" patientId="p1" />);
    expect(
      await screen.findByText('Este paciente no tiene consentimientos firmados.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nuevo consentimiento/i })).toBeInTheDocument();
  });

  it('error de carga con reintento (SectionError)', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedList.mockResolvedValueOnce([consent]);
    render(<PatientConsentsTab token="tok" patientId="p1" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los consentimientos.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      (await screen.findAllByText('Consentimiento de exodoncia')).length,
    ).toBeGreaterThan(0);
  });

  it('lista firmante, profesional y un enlace a la vista imprimible; sin editar ni borrar', async () => {
    mockedList.mockResolvedValue([consent]);
    render(<PatientConsentsTab token="tok" patientId="p1" />);

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
    render(<PatientConsentsTab token="tok" patientId="p1" />);
    await user.click(await screen.findByRole('button', { name: /nuevo consentimiento/i }));
    expect(await screen.findByRole('dialog', { name: 'Nuevo consentimiento' })).toBeInTheDocument();
  });
});
