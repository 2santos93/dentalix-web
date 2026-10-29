import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientCreateWizard } from './patient-create-wizard';
import { createPatient, type Patient } from '@/lib/patients/patients-api';
import { getPrivacyPolicies } from '@/lib/data-consents/data-consents-api';
import { getDocumentTypeNames } from '@/lib/patients/document-type-names-api';
import { policiesFixture, policyFixture } from '@/lib/test/data-consents';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform (only real `import`/`require` specifiers are) — use a relative
// path here, matching @/lib/patients/patients-api's actual location.
jest.mock('../../lib/patients/patients-api', () => ({
  createPatient: jest.fn(),
}));

jest.mock('../../lib/patients/document-type-names-api', () => ({
  getDocumentTypeNames: jest.fn(),
}));

jest.mock('../../lib/data-consents/data-consents-api', () => ({
  ...jest.requireActual('../../lib/data-consents/data-consents-api'),
  getPrivacyPolicies: jest.fn(),
}));

const mockedCreatePatient = createPatient as jest.MockedFunction<typeof createPatient>;
const mockedGetNames = getDocumentTypeNames as jest.MockedFunction<typeof getDocumentTypeNames>;
const mockedGetPolicies = getPrivacyPolicies as jest.MockedFunction<typeof getPrivacyPolicies>;

const CREATED: Patient = {
  id: 'p1',
  tenantId: 't1',
  firstName: 'Ana',
  lastName: 'García',
  docType: 'NATIONAL_ID',
  docNumber: '123',
  birthDate: null,
  sex: 'UNSPECIFIED',
  phone: null,
  email: null,
  address: null,
  notes: null,
  createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function fillBasicsAndGoToConsent(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
  await user.type(screen.getByLabelText(/apellido/i), 'García');
  await user.selectOptions(screen.getByLabelText(/tipo de documento/i), 'NATIONAL_ID');
  await goToStep(user, 4);
}

async function goToStep(user: ReturnType<typeof userEvent.setup>, times: number) {
  for (let i = 0; i < times; i += 1) {
    await user.click(screen.getByRole('button', { name: /siguiente/i }));
  }
}

describe('PatientCreateWizard', () => {
  beforeEach(() => {
    mockedCreatePatient.mockReset();
    mockedGetPolicies.mockReset();
    mockedGetPolicies.mockResolvedValue(policiesFixture());
    mockedGetNames.mockReset();
    mockedGetNames.mockResolvedValue({
      NATIONAL_ID: null,
      PASSPORT: null,
      RESIDENCE_PERMIT: null,
      TAX_ID: null,
      OTHER: null,
    });
  });

  it('renders the wizard steps and the basic-info fields on step 1', () => {
    render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
    expect(screen.getByText('Datos')).toBeInTheDocument();
    expect(screen.getByText('Antecedentes')).toBeInTheDocument();
    expect(screen.getByText('Alergias y medicamentos')).toBeInTheDocument();
    expect(screen.getByText('Hábitos')).toBeInTheDocument();
    expect(screen.getByText('Autorización de datos')).toBeInTheDocument();
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/apellido/i)).toBeInTheDocument();
  });

  it('blocks advancing past step 1 without nombre/apellido and shows a validation message', async () => {
    const user = userEvent.setup();
    render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
    await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
    await user.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(
      await screen.findByText('Nombre, apellido y tipo de documento son obligatorios para continuar.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/apellido/i)).toHaveFocus();
    // still on step 1 — the basic-info fields are still visible.
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/número de documento/i)).toBeInTheDocument();
  });

  it('creates a patient with the assembled medical history and consent after completing the wizard', async () => {
    const user = userEvent.setup();
    mockedCreatePatient.mockResolvedValue(CREATED);

    render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);

    await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
    await user.type(screen.getByLabelText(/apellido/i), 'García');
    await user.selectOptions(screen.getByLabelText(/tipo de documento/i), 'NATIONAL_ID');
    await user.type(screen.getByLabelText(/número de documento/i), '123');
    await goToStep(user, 1); // -> Antecedentes
    await goToStep(user, 1); // -> Alergias y medicamentos

    await user.click(screen.getByRole('button', { name: /agregar alergia/i }));

    await goToStep(user, 1); // -> Hábitos
    await goToStep(user, 1); // -> Autorización de datos

    await user.click(await screen.findByRole('checkbox', { name: /datos personales/i }));
    await user.click(screen.getByRole('checkbox', { name: /datos sensibles de salud/i }));
    await user.click(screen.getByRole('button', { name: /guardar/i }));

    expect(mockedCreatePatient).toHaveBeenCalledTimes(1);
    const [, input] = mockedCreatePatient.mock.calls[0];
    expect(input).toMatchObject({
      firstName: 'Ana',
      lastName: 'García',
      docType: 'NATIONAL_ID',
      sex: 'UNSPECIFIED',
      docNumber: '123',
      dataConsents: {
        policyVersionId: 'pol-1',
        decisions: [
          { scope: 'GENERAL', granted: true },
          { scope: 'SENSITIVE_HEALTH', granted: true },
        ],
      },
    });
    expect(input.medicalHistory?.allergies).toHaveLength(1);
    // El booleano deprecado ya no se manda.
    expect(input).not.toHaveProperty('dataConsentAccepted');
  });

  describe('tipo de documento genérico (DX-327)', () => {
    it('the type has no default and is required', async () => {
      const user = userEvent.setup();
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      const select = screen.getByLabelText(/tipo de documento/i) as HTMLSelectElement;
      expect(select).toHaveValue('');
      expect(select).toBeRequired();
      expect(select.options[0]).toHaveTextContent('Elige el tipo');

      await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
      await user.type(screen.getByLabelText(/apellido/i), 'García');
      await user.click(screen.getByRole('button', { name: /siguiente/i }));

      expect(
        screen.getByText('Nombre, apellido y tipo de documento son obligatorios para continuar.'),
      ).toBeInTheDocument();
      const fieldError = screen.getByText('Elige el tipo de documento.');
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select.getAttribute('aria-describedby')).toContain(fieldError.closest('[id]')?.id);
      expect(select).toHaveFocus();
      // Sigue en el paso 1.
      expect(screen.getByLabelText(/número de documento/i)).toBeInTheDocument();

      await user.selectOptions(select, 'PASSPORT');
      expect(screen.queryByText('Elige el tipo de documento.')).not.toBeInTheDocument();
    });

    it('offers the five generic types in order', () => {
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      const select = screen.getByLabelText(/tipo de documento/i) as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
        ['', 'Elige el tipo'],
        ['NATIONAL_ID', 'Documento nacional'],
        ['PASSPORT', 'Pasaporte'],
        ['RESIDENCE_PERMIT', 'Permiso de residencia'],
        ['TAX_ID', 'Identificación fiscal'],
        ['OTHER', 'Otro documento'],
      ]);
    });

    it('creates with the chosen generic type', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue(CREATED);
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory={false} />);
      await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
      await user.type(screen.getByLabelText(/apellido/i), 'García');
      await user.selectOptions(screen.getByLabelText(/tipo de documento/i), 'RESIDENCE_PERMIT');
      await goToStep(user, 1);
      await user.click(screen.getByRole('button', { name: /guardar/i }));
      expect(mockedCreatePatient.mock.calls[0][1]).toMatchObject({ docType: 'RESIDENCE_PERMIT' });
    });

    it("the options show the clinic's local names, and the generic ones if loading them fails", async () => {
      mockedGetNames.mockResolvedValue({
        NATIONAL_ID: 'ID local',
        PASSPORT: null,
        RESIDENCE_PERMIT: null,
        TAX_ID: 'Documento A',
        OTHER: null,
      });
      const { unmount } = render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      expect(await screen.findByRole('option', { name: 'ID local' })).toHaveValue('NATIONAL_ID');
      expect(screen.getByRole('option', { name: 'Documento A' })).toHaveValue('TAX_ID');
      expect(screen.getByRole('option', { name: 'Pasaporte' })).toHaveValue('PASSPORT');
      expect(mockedGetNames).toHaveBeenCalledWith('tok');
      unmount();

      mockedGetNames.mockRejectedValue(new Error('down'));
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      await screen.findByRole('option', { name: 'Documento nacional' });
      expect(screen.getByLabelText(/tipo de documento/i)).toBeEnabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('sends the number as typed', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue(CREATED);
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory={false} />);
      await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
      await user.type(screen.getByLabelText(/apellido/i), 'García');
      await user.selectOptions(screen.getByLabelText(/tipo de documento/i), 'NATIONAL_ID');
      await user.type(screen.getByLabelText(/número de documento/i), 'V-12.345.678');
      await goToStep(user, 1);
      await user.click(screen.getByRole('button', { name: /guardar/i }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mockedCreatePatient.mock.calls[0][1]).toMatchObject({
        docType: 'NATIONAL_ID',
        docNumber: 'V-12.345.678',
      });
    });
  });

  describe('paso de autorización de datos (DX-037)', () => {
    it('muestra el texto de la política vigente con las tres casillas sin marcar', async () => {
      const user = userEvent.setup();
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      await fillBasicsAndGoToConsent(user);
      expect(
        await screen.findByRole('region', { name: /texto completo de la política/i }),
      ).toHaveTextContent(policyFixture().policyText);
      const boxes = screen.getAllByRole('checkbox');
      expect(boxes).toHaveLength(3);
      for (const box of boxes) expect(box).not.toBeChecked();
    });

    it('sin ninguna casilla marcada no envía autorización', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue(CREATED);
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      await fillBasicsAndGoToConsent(user);
      await screen.findAllByRole('checkbox');
      await user.click(screen.getByRole('button', { name: /guardar/i }));
      const [, input] = mockedCreatePatient.mock.calls[0];
      expect(input).not.toHaveProperty('dataConsents');
      expect(input).not.toHaveProperty('dataConsentAccepted');
    });

    it('solo MARKETING marcado envía solo MARKETING', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue(CREATED);
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      await fillBasicsAndGoToConsent(user);
      await user.click(
        await screen.findByRole('checkbox', { name: /comunicaciones comerciales/i }),
      );
      await user.click(screen.getByRole('button', { name: /guardar/i }));
      expect(mockedCreatePatient.mock.calls[0][1].dataConsents).toEqual({
        policyVersionId: 'pol-1',
        decisions: [{ scope: 'MARKETING', granted: true }],
      });
    });

    it('sin política publicada lo explica y deja crear el paciente sin autorización', async () => {
      const user = userEvent.setup();
      mockedGetPolicies.mockResolvedValue(policiesFixture(null));
      mockedCreatePatient.mockResolvedValue(CREATED);
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      await fillBasicsAndGoToConsent(user);
      expect(await screen.findByText(/aún no ha publicado su política/i)).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /guardar/i }));
      expect(mockedCreatePatient.mock.calls[0][1]).not.toHaveProperty('dataConsents');
    });

    it('si la política no carga, ofrece reintentar', async () => {
      const user = userEvent.setup();
      mockedGetPolicies.mockRejectedValueOnce(new Error('red'));
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory />);
      await fillBasicsAndGoToConsent(user);
      expect(await screen.findByText(/no pudimos cargar la política/i)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /reintentar/i }));
      expect(await screen.findAllByRole('checkbox')).toHaveLength(3);
    });
  });

  // SEC-005: recepción no escribe historia clínica, así que el alta no le
  // enseña los pasos de anamnesis ni envía `medicalHistory`.
  describe('sin permiso de historia clínica (recepción)', () => {
    it('no muestra los pasos de anamnesis', () => {
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory={false} />);
      expect(screen.getByText('Datos')).toBeInTheDocument();
      expect(screen.getByText('Autorización de datos')).toBeInTheDocument();
      expect(screen.queryByText('Antecedentes')).not.toBeInTheDocument();
      expect(screen.queryByText('Alergias y medicamentos')).not.toBeInTheDocument();
      expect(screen.queryByText('Hábitos')).not.toBeInTheDocument();
    });

    it('pasa de Datos a Autorización de datos y crea el paciente sin medicalHistory', async () => {
      const user = userEvent.setup();
      mockedCreatePatient.mockResolvedValue({ id: 'p2' } as Awaited<
        ReturnType<typeof createPatient>
      >);
      render(<PatientCreateWizard token="tok" canWriteClinicalHistory={false} />);

      await user.type(screen.getByLabelText(/^nombre/i), 'Ana');
      await user.type(screen.getByLabelText(/apellido/i), 'García');
      await user.selectOptions(screen.getByLabelText(/tipo de documento/i), 'OTHER');
      await goToStep(user, 1); // -> Autorización de datos

      expect(screen.queryByText(/resumen de la historia clínica/i)).not.toBeInTheDocument();
      expect(screen.getByText(/la completará el equipo clínico/i)).toBeInTheDocument();
      await user.click(await screen.findByRole('checkbox', { name: /datos personales/i }));
      await user.click(screen.getByRole('button', { name: /guardar/i }));

      expect(mockedCreatePatient).toHaveBeenCalledTimes(1);
      const [, input] = mockedCreatePatient.mock.calls[0];
      expect(input).toMatchObject({
        firstName: 'Ana',
        dataConsents: { decisions: [{ scope: 'GENERAL', granted: true }] },
      });
      expect(input).not.toHaveProperty('medicalHistory');
    });
  });
});
