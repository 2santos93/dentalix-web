import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearSessionStore } from '@/lib/session/session-store';
import { NewConsentModal } from './new-consent-modal';
import {
  listConsentTemplates,
  previewPatientConsent,
  signPatientConsent,
} from '@/lib/consents/consents-api';
import { listPlans } from '@/lib/treatment-plans/treatment-plans-api';
import {
  getPatientResponsibles,
  type PatientResponsibles,
} from '@/lib/patients/responsible-parties-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { PLAN_WITHOUT_OPTIONS } from '../treatment-plans/plan-fixture';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { dateIn } from '@/lib/test/stamp';
import { regionalFormat } from '@/lib/format/regional-format';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/consents/consents-api', () => ({
  ...jest.requireActual('../../lib/consents/consents-api'),
  listConsentTemplates: jest.fn(),
  previewPatientConsent: jest.fn(),
  signPatientConsent: jest.fn(),
}));
jest.mock('../../lib/treatment-plans/treatment-plans-api', () => ({
  listPlans: jest.fn(),
}));
jest.mock('../../lib/patients/responsible-parties-api', () => ({
  ...jest.requireActual('../../lib/patients/responsible-parties-api'),
  getPatientResponsibles: jest.fn(),
}));

const mockedTemplates = listConsentTemplates as jest.MockedFunction<typeof listConsentTemplates>;
const mockedPreview = previewPatientConsent as jest.MockedFunction<typeof previewPatientConsent>;
const mockedSign = signPatientConsent as jest.MockedFunction<typeof signPatientConsent>;
const mockedPlans = listPlans as jest.MockedFunction<typeof listPlans>;
const mockedResponsibles = getPatientResponsibles as jest.MockedFunction<
  typeof getPatientResponsibles
>;

function responsibles(over: Partial<PatientResponsibles> = {}): PatientResponsibles {
  return {
    patientId: 'p1',
    minor: false,
    majorityAge: 18,
    parties: [],
    responsibleFor: [],
    noticeRecipient: {
      kind: 'PATIENT',
      name: 'Ana',
      email: null,
      minor: false,
      responsiblePartyId: null,
    },
    ...over,
  };
}

const mother = {
  id: 'r1',
  patientId: 'p1',
  kind: 'CONTACT' as const,
  responsiblePatient: null,
  fullName: 'Claudia Navarro',
  docType: 'NATIONAL_ID' as const,
  docTypeLabel: null,
  // Nombre visible que resuelve la API (R17): aquí, el nombre local de la clínica.
  docTypeName: 'ID local',
  docNumber: '52987654',
  email: 'claudia@example.com',
  phone: null,
  phoneInternational: null,
  relationship: 'MOTHER' as const,
  isPayer: true,
  receivesNotices: true,
  migratedFromGuardian: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

beforeAll(() => {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        setTransform: jest.fn(),
        clearRect: jest.fn(),
        beginPath: jest.fn(),
        moveTo: jest.fn(),
        lineTo: jest.fn(),
        stroke: jest.fn(),
      }) as unknown as CanvasRenderingContext2D,
  );
  jest
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockImplementation(() => 'data:image/png;base64,FIRMA');
  HTMLCanvasElement.prototype.setPointerCapture = jest.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = jest.fn();
});

function sign(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 50, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

const template = {
  id: 'tpl-1',
  tenantId: 't1',
  title: 'Consentimiento de exodoncia',
  body: 'Yo, {{paciente}}…',
  active: true,
  version: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const plan = {
  id: 'plan-1',
  tenantId: 't1',
  patientId: 'p1',
  status: 'ACCEPTED' as const,
  currency: 'USD',
  notes: null,
  createdById: null,
  ...PLAN_WITHOUT_OPTIONS,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};
const preview = {
  templateId: 'tpl-1',
  templateVersion: 3,
  title: 'Consentimiento de exodoncia',
  body: 'Yo, Ana Pérez (Documento nacional DOC-1), autorizo a Dra. Laura…',
  professionalName: 'Dra. Laura Gómez',
  previewedAt: '2026-10-16T21:58:00.000Z',
};

function renderModal(overrides: Partial<React.ComponentProps<typeof NewConsentModal>> = {}) {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    token: 'tok',
    patientId: 'p1',
    onSigned: jest.fn(),
    ...overrides,
  };
  render(<NewConsentModal {...props} />);
  return props;
}

async function chooseTemplate(user: ReturnType<typeof setupUser>, withPlan = false) {
  await user.selectOptions(await screen.findByLabelText('Plantilla'), 'tpl-1');
  if (withPlan) {
    await user.selectOptions(screen.getByLabelText(/plan de tratamiento/i), 'plan-1');
  }
}

/** Del paso 1 (ya elegido todo) a las firmas, pasando por la vista previa. */
async function continueToSignatures(user: ReturnType<typeof setupUser>, body = preview.body) {
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(await screen.findByText(body)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
}

async function goToSignatures(user: ReturnType<typeof setupUser>, withPlan = false) {
  await chooseTemplate(user, withPlan);
  await continueToSignatures(user);
}

describe('NewConsentModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([clinicLocation()]);
    mockedTemplates.mockResolvedValue([template]);
    mockedPlans.mockResolvedValue([plan, { ...plan, id: 'plan-x', status: 'CANCELLED' }]);
    mockedPreview.mockResolvedValue(preview);
    mockedSign.mockResolvedValue({ id: 'c1' } as never);
    mockedResponsibles.mockResolvedValue(responsibles());
  });

  it('DX-354b: el día del plan sale con el formato de la sede (es-VE, de-DE, en-US) y en su zona', async () => {
    const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
    // 2026-09-01T00:00Z es todavía el 31 de agosto en Caracas (UTC-4): el día es el de la sede, no el UTC.
    expect(dateIn('caracas', '2026-09-01T00:00:00.000Z')).toBe('31/08/2026');
    for (const [locale, hourCycle, timeZone] of [
      ['es-VE', 'h12', 'America/Caracas'],
      ['de-DE', 'h23', 'Europe/Berlin'],
      ['en-US', 'h12', 'America/New_York'],
    ] as const) {
      mockedLocations.mockResolvedValue([clinicLocation({ locale, hourCycle, timeZone })]);
      renderModal();
      const day = regionalFormat({ locale, hourCycle }).date(new Date('2026-09-01T00:00:00.000Z'), timeZone);
      expect(await screen.findByRole('option', { name: new RegExp(`· ${day.replace(/[./]/g, '\\$&')}$`) })).toBeInTheDocument();
      cleanup();
      clearSessionStore(); // FE-031: la caché de sesión no pasa a la vista siguiente
    }
  });

  it('DX-203: un menor viene con el firmante tutor precargado desde su responsable', async () => {
    const user = setupUser();
    mockedResponsibles.mockResolvedValue(responsibles({ minor: true, parties: [mother] }));
    renderModal();
    await chooseTemplate(user);
    // DX-060: quién firma se elige en el paso 1, para que la vista previa lo refleje.
    expect(await screen.findByRole('radio', { name: /tutor/i })).toBeChecked();
    expect(screen.getByLabelText('Nombre del tutor')).toHaveValue('Claudia Navarro');
    expect(screen.getByLabelText('Documento del tutor')).toHaveValue('ID local 52987654');
    expect(screen.getByLabelText('Relación con el paciente')).toHaveValue('MOTHER');
    expect(screen.getByText(/su responsable en la ficha/)).toBeInTheDocument();

    await continueToSignatures(user);
    expect(mockedPreview).toHaveBeenCalledWith('tok', 'p1', {
      templateId: 'tpl-1',
      signerType: 'GUARDIAN',
      guardianName: 'Claudia Navarro',
      guardianDocument: 'ID local 52987654',
      guardianRelationship: 'MOTHER',
    });
    sign(screen.getByRole('img', { name: 'Firma del tutor' }));
    sign(screen.getByRole('img', { name: /firma del profesional/i }));
    await user.click(screen.getByRole('button', { name: 'Firmar' }));
    expect(mockedSign).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({
        signerType: 'GUARDIAN',
        guardianName: 'Claudia Navarro',
        guardianDocument: 'ID local 52987654',
        guardianRelationship: 'MOTHER',
      }),
    );
  });

  it('DX-203: si es menor y se elige al paciente, avisa', async () => {
    const user = setupUser();
    mockedResponsibles.mockResolvedValue(responsibles({ minor: true, parties: [mother] }));
    renderModal();
    await chooseTemplate(user);
    await screen.findByLabelText('Nombre del tutor');
    await user.click(screen.getByRole('radio', { name: 'El paciente' }));
    expect(
      screen.getByText('El paciente es menor de 18 años: lo habitual es que firme su responsable.'),
    ).toBeInTheDocument();
  });

  it('DX-203: un adulto firma él mismo; al elegir tutor se precarga el responsable', async () => {
    const user = setupUser();
    mockedResponsibles.mockResolvedValue(responsibles({ parties: [mother] }));
    renderModal();
    await chooseTemplate(user);
    await waitFor(() => expect(mockedResponsibles).toHaveBeenCalled());
    expect(screen.getByRole('radio', { name: 'El paciente' })).toBeChecked();
    expect(screen.queryByText(/lo habitual es que firme/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /tutor/i }));
    expect(screen.getByLabelText('Nombre del tutor')).toHaveValue('Claudia Navarro');
    expect(screen.getByLabelText('Relación con el paciente')).toHaveValue('MOTHER');
  });

  it('firma en tres pasos: plantilla → vista previa resuelta → firmas', async () => {
    const user = setupUser();
    const props = renderModal();

    expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument();
    expect(mockedTemplates).toHaveBeenCalledWith('tok', { active: true });
    // Los planes cancelados no se ofrecen.
    await screen.findByRole('option', { name: /aceptado/i });
    expect(screen.queryByRole('option', { name: /cancelado/i })).not.toBeInTheDocument();

    await goToSignatures(user, true);
    expect(mockedPreview).toHaveBeenCalledWith('tok', 'p1', {
      templateId: 'tpl-1',
      treatmentPlanId: 'plan-1',
      signerType: 'PATIENT',
    });
    expect(screen.getByText('Paso 3 de 3')).toBeInTheDocument();

    const firmar = screen.getByRole('button', { name: 'Firmar' });
    expect(firmar).toBeDisabled();
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    expect(firmar).toBeDisabled();
    sign(screen.getByRole('img', { name: /firma del profesional · dra\. laura gómez/i }));
    expect(firmar).toBeEnabled();

    await user.click(firmar);

    expect(mockedSign).toHaveBeenCalledWith('tok', 'p1', {
      templateId: 'tpl-1',
      templateVersion: 3,
      // DX-058: la firma devuelve el instante de la vista previa: el texto
      // firmado lleva la fecha que se leyó, aunque se firme tras la medianoche.
      previewedAt: '2026-10-16T21:58:00.000Z',
      treatmentPlanId: 'plan-1',
      signerType: 'PATIENT',
      patientSignature: 'data:image/png;base64,FIRMA',
      professionalSignature: 'data:image/png;base64,FIRMA',
    });
    await waitFor(() => expect(props.onSigned).toHaveBeenCalledWith({ id: 'c1' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('sin firma del paciente «Firmar» sigue deshabilitado', async () => {
    const user = setupUser();
    renderModal();
    await goToSignatures(user);
    sign(screen.getByRole('img', { name: /firma del profesional/i }));
    expect(screen.getByRole('button', { name: 'Firmar' })).toBeDisabled();
  });

  it('DX-060: si firma un tutor, pide nombre, documento y relación antes de la vista previa, que abre con la cláusula', async () => {
    const user = setupUser();
    const clause =
      'Firma en representación del paciente: Marta Pérez, identificado(a) con Documento A DOC-999, otorga este consentimiento en nombre de Ana Pérez, como su tutor legal.';
    mockedPreview.mockResolvedValue({ ...preview, body: `${clause}\n\n${preview.body}` });
    renderModal();
    await chooseTemplate(user);
    await user.click(screen.getByRole('radio', { name: /tutor/i }));
    const continuar = screen.getByRole('button', { name: 'Continuar' });
    expect(continuar).toBeDisabled();
    await user.type(screen.getByLabelText('Nombre del tutor'), 'Marta Pérez');
    await user.type(screen.getByLabelText('Documento del tutor'), 'Documento A DOC-999');
    expect(continuar).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Relación con el paciente'), 'LEGAL_GUARDIAN');
    expect(continuar).toBeEnabled();

    await user.click(continuar);
    expect(await screen.findByText(/Firma en representación del paciente: Marta Pérez/)).toBeInTheDocument();
    expect(mockedPreview).toHaveBeenCalledWith('tok', 'p1', {
      templateId: 'tpl-1',
      signerType: 'GUARDIAN',
      guardianName: 'Marta Pérez',
      guardianDocument: 'Documento A DOC-999',
      guardianRelationship: 'LEGAL_GUARDIAN',
    });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const firmar = screen.getByRole('button', { name: 'Firmar' });
    sign(screen.getByRole('img', { name: 'Firma del tutor' }));
    sign(screen.getByRole('img', { name: /firma del profesional/i }));
    expect(firmar).toBeEnabled();
    await user.click(firmar);
    expect(mockedSign).toHaveBeenCalledWith(
      'tok',
      'p1',
      expect.objectContaining({
        signerType: 'GUARDIAN',
        guardianName: 'Marta Pérez',
        guardianDocument: 'Documento A DOC-999',
        guardianRelationship: 'LEGAL_GUARDIAN',
      }),
    );
  });

  it('DX-060: volver a cambiar quién firma descarta las firmas y pide otra vista previa', async () => {
    const user = setupUser();
    renderModal();
    await goToSignatures(user);
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    sign(screen.getByRole('img', { name: /firma del profesional/i }));
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    await user.click(screen.getByRole('button', { name: 'Atrás' }));

    await user.click(screen.getByRole('radio', { name: /tutor/i }));
    await user.type(screen.getByLabelText('Nombre del tutor'), 'Marta Pérez');
    await user.type(screen.getByLabelText('Documento del tutor'), 'DOC-999');
    await user.selectOptions(screen.getByLabelText('Relación con el paciente'), 'FATHER');
    await continueToSignatures(user);
    expect(mockedPreview).toHaveBeenLastCalledWith(
      'tok',
      'p1',
      expect.objectContaining({ signerType: 'GUARDIAN', guardianRelationship: 'FATHER' }),
    );
    // Las firmas de antes no pasan: hay que firmar otra vez.
    expect(screen.getByRole('button', { name: 'Firmar' })).toBeDisabled();
  });

  it('si la plantilla cambió (409) vuelve a la vista previa con el texto nuevo', async () => {
    const user = setupUser();
    mockedSign.mockRejectedValueOnce(new ApiError(409, 'La plantilla cambió desde la vista previa'));
    renderModal();
    await goToSignatures(user);
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    sign(screen.getByRole('img', { name: /firma del profesional/i }));
    mockedPreview.mockResolvedValueOnce({ ...preview, templateVersion: 4, body: 'Texto nuevo' });

    await user.click(screen.getByRole('button', { name: 'Firmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/la plantilla cambió/i);
    expect(await screen.findByText('Texto nuevo')).toBeInTheDocument();
    expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument();
  });

  it('un error al firmar se muestra en el modal, que sigue abierto', async () => {
    const user = setupUser();
    mockedSign.mockRejectedValueOnce(new ApiError(400, 'La firma del paciente debe ser una imagen PNG.'));
    const props = renderModal();
    await goToSignatures(user);
    sign(screen.getByRole('img', { name: 'Firma del paciente' }));
    sign(screen.getByRole('img', { name: /firma del profesional/i }));
    await user.click(screen.getByRole('button', { name: 'Firmar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/debe ser una imagen PNG/);
    expect(props.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('si las plantillas no cargan, el selector cae a un error con reintento', async () => {
    const user = setupUser();
    mockedTemplates.mockRejectedValueOnce(new Error('boom'));
    renderModal();
    expect(await screen.findByText('Plantillas no disponibles')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Plantilla')).toBeInTheDocument();
  });

  it('sin plantillas activas lo explica y no deja continuar', async () => {
    mockedTemplates.mockResolvedValueOnce([]);
    renderModal();
    expect(await screen.findByText(/no hay plantillas activas/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });
});
