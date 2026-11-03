import { render, screen, waitFor, within } from '@testing-library/react';
import { ConsentTemplatesManager } from './consent-templates-manager';
import { PatientConsentsTab } from './patient-consents-tab';
import { listConsentTemplates, listPatientConsents } from '@/lib/consents/consents-api';
import { listLocations } from '@/lib/locations/locations-api';
import { dateTimeIn, STAMP_SEDES } from '@/lib/test/stamp';

/**
 * DX-354b: plantillas y consentimientos no traen sede (REF): se pintan con la
 * sede de la pantalla. La misma entrada, dos pantallas: Caracas (`es-VE`, 12 h)
 * y Berlín (`de-DE`, 24 h).
 */
jest.mock('../../lib/consents/consents-api', () => ({
  ...jest.requireActual('../../lib/consents/consents-api'),
  listConsentTemplates: jest.fn(),
  listPatientConsents: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/treatment-plans-api'),
}));
jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  ...jest.requireActual('../../lib/signature-requests/signature-requests-api'),
  listSignatureRequests: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedTemplates = listConsentTemplates as jest.MockedFunction<typeof listConsentTemplates>;
const mockedConsents = listPatientConsents as jest.MockedFunction<typeof listPatientConsents>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const UPDATED = '2026-11-05T03:30:00.000Z';
const SIGNED = '2026-11-05T18:30:00.000Z';

const template = {
  id: 'tpl-1',
  tenantId: 't1',
  title: 'Exodoncia',
  body: 'Yo, {{paciente}}, autorizo.',
  active: true,
  version: 1,
  createdAt: UPDATED,
  updatedAt: UPDATED,
};

const consent = {
  id: 'c1',
  tenantId: 't1',
  patientId: 'p1',
  templateId: 'tpl-1',
  templateVersion: 2,
  title: 'Consentimiento de exodoncia',
  signerType: 'PATIENT' as const,
  signerName: 'Ana Pérez',
  professionalName: 'Dra. Laura Gómez',
  signedAt: SIGNED,
  remote: null,
  professionalSignedAt: SIGNED,
  complete: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockedTemplates.mockResolvedValue([template]);
  mockedConsents.mockResolvedValue([consent as never]);
});

describe.each([['caracas'], ['berlin']] as const)('con la pantalla en %s', (key) => {
  beforeEach(() => mockedLocations.mockResolvedValue([STAMP_SEDES[key]]));

  it('la plantilla muestra su última edición con el reloj de la sede', async () => {
    render(<ConsentTemplatesManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Plantillas de consentimiento' });
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent(dateTimeIn(key, UPDATED)));
  });

  it('el consentimiento firmado muestra su hora con el reloj de la sede y la anuncia en la fila', async () => {
    render(<PatientConsentsTab token="tok" patientId="p1" role="DENTIST" userId="u-dentist" />);
    const table = await screen.findByRole('table', { name: 'Consentimientos firmados' });
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent(dateTimeIn(key, SIGNED)));
    expect(screen.queryByText(/No se pudo saber el formato/)).not.toBeInTheDocument();
  });
});

it('Caracas y Berlín pintan la misma firma de forma distinta', () => {
  expect(dateTimeIn('caracas', SIGNED)).not.toBe(dateTimeIn('berlin', SIGNED));
});

it('sin formato de sede: «—» en la fecha, nombre de fila sin fecha y el aviso una vez', async () => {
  mockedLocations.mockRejectedValue(new Error('red'));
  render(<PatientConsentsTab token="tok" patientId="p1" role="DENTIST" userId="u-dentist" />);
  const table = await screen.findByRole('table', { name: 'Consentimientos firmados' });
  await waitFor(() => expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1));
  expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Sin dato');
  // El nombre accesible del menú de la fila no lleva «—» ni «del —».
  expect(screen.getByRole('button', { name: /Acciones de «Consentimiento de exodoncia»$/ })).toBeInTheDocument();
});
